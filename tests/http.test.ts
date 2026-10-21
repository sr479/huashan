import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app';
import { createStore } from '../server/store';

test('HTTP：鉴权、CSRF、公开信息、并发确认、上传格式及退出会话', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'huashan-http-'));
  const store = createStore({
    path: ':memory:',
    adminUsername: 'admin',
    adminPassword: 'HTTP-Test-Only-Password',
    seedDemo: true,
    now: () => new Date('2026-10-21T04:00:00Z'),
  });
  const origins = ['http://localhost:4000'];
  const app = createApp({ store, uploadDir: dir, origins, production: true, secureCookie: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  let cookie = '';
  async function request(
    path: string,
    method = 'GET',
    body?: unknown,
    withAuth = true,
    origin: string | false = origins[0],
  ) {
    return fetch(base + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(withAuth && cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  try {
    assert.equal((await request('/api/admin/bookings')).status, 401);
    assert.equal(
      (await request('/api/admin/login', 'POST', { username: 'admin', password: 'incorrect' }))
        .status,
      401,
    );
    const login = await request('/api/admin/login', 'POST', {
      username: 'admin',
      password: 'HTTP-Test-Only-Password',
    });
    assert.equal(login.status, 200);
    assert.ok(login.headers.get('set-cookie')?.includes('HttpOnly'));
    cookie = login.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await request('/api/admin/session')).status, 200);
    const cat = await request('/api/catalog?start=2026-10-21&end=2026-10-21');
    assert.ok(cat.headers.get('content-security-policy'));
    assert.equal(cat.headers.get('cache-control'), 'no-store');
    const catalog = await cat.json();
    assert.equal(JSON.stringify(catalog).includes('13800000000'), false);
    const g = catalog.garments.find((g: { sku: string }) => g.sku === 'MZ-006');
    const payload = {
      garmentId: g.id,
      guestName: 'HTTP 测试顾客',
      phone: '13900000000',
      startDate: '2026-10-21',
      endDate: '2026-10-21',
      note: '',
    };
    const a = await request('/api/bookings', 'POST', payload, false),
      b = await request('/api/bookings', 'POST', payload, false);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    const ba = await a.json(),
      bb = await b.json();
    const results = await Promise.all([
      request(`/api/admin/bookings/${ba.id}/action`, 'POST', { action: 'confirm' }),
      request(`/api/admin/bookings/${bb.id}/action`, 'POST', { action: 'confirm' }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (
        await request(
          '/api/admin/settings',
          'PUT',
          store.getSettings(),
          true,
          'https://evil.example',
        )
      ).status,
      403,
    );
    assert.equal(
      (await request('/api/admin/settings', 'PUT', store.getSettings(), true, false)).status,
      403,
    );
    const schedule = await request('/api/admin/schedule?start=2026-10-28&days=14');
    const scheduleData = await schedule.json();
    assert.equal(scheduleData.dates.at(-1), '2026-11-10');
    assert.ok(
      scheduleData.rows.every(
        (row: { days: unknown[] }) => row.days.length === 14 && row.days.every(Boolean),
      ),
    );
    assert.equal(
      (await request('/api/admin/uploads', 'POST', { data: 'data:image/svg+xml;base64,PHN2Zz4=' }))
        .status,
      400,
    );
    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
    const upload = await request('/api/admin/uploads', 'POST', {
      data: 'data:image/png;base64,' + png,
    });
    assert.equal(upload.status, 201);
    const { url } = await upload.json();
    const photo = await request(url);
    assert.equal(photo.status, 200);
    assert.match(photo.headers.get('content-type') || '', /image\/png/);
    assert.equal(
      (
        await request(
          '/api/bookings/lookup',
          'POST',
          { orderNo: ba.orderNo, phone: '13700000000' },
          false,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          '/api/bookings/lookup',
          'POST',
          { orderNo: ba.orderNo, phone: payload.phone },
          false,
        )
      ).status,
      200,
    );
    assert.equal((await request('/api/admin/logout', 'POST', {})).status, 200);
    assert.equal((await request('/api/admin/dashboard')).status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
