import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createStore } from '../server/store.js';
import { createApp } from '../server/app.js';

const root = fileURLToPath(new URL('../miniapp/', import.meta.url));
const require = createRequire(import.meta.url);
const view = require('../miniapp/utils/view.js');
const domain = require('../miniapp/utils/domain.js');

test('小程序按北京时间选日期，计租及跨月清洗提示与后台一致', () => {
  assert.equal(view.todayInChina(new Date('2026-12-31T16:01:00Z')), '2027-01-01');
  assert.equal(view.rentalDays('2027-02-06', '2027-02-12'), 7);
  assert.equal(view.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(view.validDate('2027-02-29'), false);
  assert.equal(view.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(view.validateRange('2027-02-06', '2027-02-12', '2027-02-01'), '');
  assert.match(view.validateRange('2027-01-31', '2027-02-12', '2027-02-01'), /早于今天/);
  assert.match(view.validateRange('2027-02-06', '2027-02-05', '2027-02-01'), /早于取衣/);
  assert.match(view.validateRange('2027-02-06', '2027-05-07', '2027-02-01'), /90/);
  assert.match(view.validateRange('2028-02-02', '2028-02-02', '2027-02-01'), /一年/);
  const cells = view.calendarCells(
    [
      { date: '2027-02-01', status: 'available', canStart: true },
      { date: '2027-02-02', status: 'cleaning', canStart: false },
    ],
    '2027-02',
    '2027-02-01',
    '2027-02-01',
    '2027-02-01',
  );
  assert.equal(cells.length, 2);
  assert.equal(cells[0].selected, true);
  assert.equal(cells[1].disabled, true);
  assert.equal(cells[1].label, '清洗');
});

test('小程序体验版和正式版拒绝本地/IP入口，不携带管理凭据', () => {
  const config = { apiBaseUrl: 'http://127.0.0.1:3000', allowLocalDevelopment: true };
  assert.equal(domain.resolveBase(config, 'develop'), config.apiBaseUrl);
  for (const environment of ['trial', 'release']) {
    for (const apiBaseUrl of [
      'http://127.0.0.1:3000',
      'https://192.0.2.1:8443',
      'http://example.com',
      'https://example.invalid',
      'https://admin:secret@example.com',
      'https://example.com/path',
      'https://example.com:8443',
    ]) {
      assert.throws(() => domain.resolveBase({ ...config, apiBaseUrl }, environment));
    }
    assert.equal(
      domain.resolveBase({ apiBaseUrl: 'https://example.com/' }, environment),
      'https://example.com',
    );
  }
  assert.equal(
    domain.imageUrl('https://example.com', '/uploads/abcd-1234.webp'),
    'https://example.com/uploads/abcd-1234.webp',
  );
  assert.equal(domain.imageUrl('https://example.com', 'https://other.example/photo.jpg'), '');
  assert.equal(domain.imageUrl('https://example.com', '/uploads/../../.env'), '');
  assert.throws(
    () =>
      view.bookingInput(
        { guestName: '测试', phone: '13900000000' },
        'id',
        '2027-02-06',
        '2027-02-06',
        '2027-02-01',
        false,
      ),
    /勾选/,
  );
});

// 运行原生小程序 Page 和 wx.request 适配器，不用浏览器实现冒充微信运行时。
function nativeHarness(base: string, requestLog: { path: string; header: object }[]) {
  let app: any;
  let definition: any;
  const navigations: string[] = [];
  let networkFailure = false;
  const wx = {
    getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' } }),
    request(options: any) {
      requestLog.push({ path: new URL(options.url).pathname, header: options.header });
      if (networkFailure) {
        options.fail({});
        return;
      }
      void fetch(options.url, {
        method: options.method,
        headers: options.header,
        ...(options.method === 'POST' ? { body: JSON.stringify(options.data) } : {}),
      })
        .then(async (response) =>
          options.success({ statusCode: response.status, data: await response.json() }),
        )
        .catch(options.fail);
    },
    redirectTo: (options: any) => navigations.push(options.url),
    navigateTo: (options: any) => navigations.push(options.url),
    showToast() {},
    hideShareMenu() {},
    stopPullDownRefresh() {},
  };
  const cache = new Map<string, any>();
  function load(filename: string): any {
    const path = filename.endsWith('.js') ? filename : filename + '.js';
    if (path === resolve(root, 'config.js'))
      return { apiBaseUrl: base, allowLocalDevelopment: true };
    if (cache.has(path)) return cache.get(path);
    const module = { exports: {} };
    cache.set(path, module.exports);
    runInNewContext(
      readFileSync(path, 'utf8'),
      {
        module,
        exports: module.exports,
        wx,
        App(value: any) {
          app = value;
        },
        Page(value: any) {
          definition = value;
        },
        getApp: () => app,
        require: (name: string) => load(resolve(dirname(path), name)),
      },
      { filename: path },
    );
    cache.set(path, module.exports);
    return module.exports;
  }
  load(resolve(root, 'app.js'));
  return {
    app,
    navigations,
    api: load(resolve(root, 'utils/api.js')),
    failNetwork() {
      networkFailure = true;
    },
    page(name: string): any {
      load(resolve(root, 'pages', name, 'index.js'));
      const page = {
        ...definition,
        data: JSON.parse(JSON.stringify(definition.data)),
        setData(values: object) {
          Object.assign(this.data, values);
        },
      };
      return page;
    },
  };
}

test('小程序真实 API 联调：无登录浏览、预约防连点、后台确认后查询回执', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'hs-miniapp-'));
  const store = createStore({
    path: ':memory:',
    adminUsername: 'admin',
    adminPassword: 'Miniapp-Test-Only',
    seedDemo: true,
    now: () => new Date('2026-10-21T04:00:00Z'),
  });
  const app = createApp({
    store,
    uploadDir: dir,
    origins: ['http://localhost:3000'],
    production: true,
    secureCookie: false,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const requests: { path: string; header: object }[] = [];
  const native = nativeHarness(base, requests);
  try {
    const catalog = await native.api.catalog('2026-10-21', '2026-10-21');
    assert.equal(catalog.garments.length, 6);
    assert.equal(JSON.stringify(catalog).includes('13800000000'), false);
    const garment = catalog.garments.find((g: any) => g.sku === 'MZ-006');
    const calendar = await native.api.calendar(garment.id, '2026-10');
    assert.equal(calendar.days.length, 31);
    const booking = native.page('booking');
    booking.data = {
      ...booking.data,
      id: garment.id,
      start: '2026-10-21',
      end: '2026-10-21',
      today: '2026-10-21',
    };
    await booking.load();
    booking.changeConsent({ detail: { value: ['agree'] } });
    const event = {
      detail: { value: { guestName: '小程序测试', phone: '13900000000', note: '仅自动测试' } },
    };
    await Promise.all([booking.submit(event), booking.submit(event)]);
    assert.equal(requests.filter((r) => r.path === '/api/bookings').length, 1);
    assert.equal(store.listBookings().length, 4);
    assert.equal(booking.data.createdOrderNo.startsWith('HS20261021'), true);
    assert.equal(native.navigations.at(-1), '/pages/receipt/index');
    const created = native.app.globalData.receipt;
    assert.equal(created.status, 'pending');
    assert.equal(created.rentalTotal, garment.dailyPrice);
    assert.equal(created.source, 'online');
    store.updateBooking(created.id, 'confirm');
    const receipt = native.page('receipt');
    receipt.onLoad();
    assert.equal(native.app.globalData.receipt, null);
    assert.equal(receipt.data.booking.maskedPhone, '139****0000');
    await receipt.refresh();
    assert.equal(receipt.data.booking.status, 'confirmed');
    assert.equal(receipt.data.booking.statusText, '已确认 · 待取衣');
    await assert.rejects(
      native.api.lookup({ orderNo: created.orderNo, phone: '13700000000' }),
      /未找到/,
    );
    assert.equal((await fetch(base + '/api/admin/bookings')).status, 401);
    for (const request of requests) {
      assert.equal(
        'Cookie' in request.header ||
          'Origin' in request.header ||
          'Authorization' in request.header,
        false,
      );
      assert.equal(request.path.includes('/api/admin'), false);
    }
    native.failNetwork();
    await assert.rejects(native.api.book(event.detail.value), /暂未确认操作结果/);
    assert.equal(requests.filter((r) => r.path === '/api/bookings').length, 2);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('门店调整价格后，小程序展示新金额并要求重新确认，不直接提交旧价预约', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'hs-miniapp-price-'));
  const store = createStore({
    path: ':memory:',
    adminUsername: 'admin',
    adminPassword: 'Miniapp-Price-Test',
    seedDemo: true,
    now: () => new Date('2026-10-21T04:00:00Z'),
  });
  const server = createApp({ store, uploadDir: dir, origins: [], production: false }).listen(
    0,
    '127.0.0.1',
  );
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const requests: { path: string; header: object }[] = [];
  const native = nativeHarness(`http://127.0.0.1:${address.port}`, requests);
  try {
    const garment = store
      .catalog('2026-10-21', '2026-10-21')
      .garments.find((g) => g.sku === 'MZ-006')!;
    const page = native.page('booking');
    page.data = {
      ...page.data,
      id: garment.id,
      start: '2026-10-21',
      end: '2026-10-21',
      today: '2026-10-21',
    };
    await page.load();
    page.changeConsent({ detail: { value: ['agree'] } });
    store.updateGarment(garment.id, { ...garment, dailyPrice: garment.dailyPrice + 500 });
    await page.submit({ detail: { value: { guestName: '价格测试', phone: '13900000000' } } });
    assert.match(page.data.error, /更新了价格/);
    assert.equal(page.data.garment.dailyPrice, garment.dailyPrice + 500);
    assert.equal(page.data.consent, false);
    assert.equal(
      requests.some((r) => r.path === '/api/bookings'),
      false,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('小程序页面及事件完整，只有公开服装页支持分享', () => {
  const app = JSON.parse(readFileSync(resolve(root, 'app.json'), 'utf8'));
  for (const page of app.pages) {
    for (const extension of ['.js', '.json', '.wxml', '.wxss'])
      assert.equal(existsSync(resolve(root, page + extension)), true, page + extension);
    const source = readFileSync(resolve(root, page + '.js'), 'utf8');
    const template = readFileSync(resolve(root, page + '.wxml'), 'utf8');
    for (const event of template.matchAll(/bind(?:tap|change|input|submit)="([A-Za-z]+)"/g)) {
      assert.match(source, new RegExp(`\\b${event[1]}\\s*\\(`), `${page}: ${event[1]}`);
    }
    assert.equal(/wx\.(login|getPhoneNumber|requestPayment|getUserProfile)/.test(source), false);
    if (!page.includes('/home/') && !page.includes('/detail/'))
      assert.equal(source.includes('onShareAppMessage'), false);
    JSON.parse(readFileSync(resolve(root, page + '.json'), 'utf8'));
  }
});
