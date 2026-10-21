import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, AppError, type GarmentInput, type Store } from '../server/store';
import {
  addDays,
  rentalDays,
  todayInChina,
  validDate,
  returnDeadlinePassed,
} from '../shared/utils';

const adminPassword = 'TestOnly-NotARealPassword-2026';
const garmentInput: GarmentInput = {
  sku: 'TEST-001',
  name: '测试苗装',
  category: '节庆盛装',
  size: 'M',
  measurements: '腰围可调节',
  description: '测试服装',
  accessories: ['上衣', '裙装', '头饰'],
  images: [],
  dailyPrice: 12800,
  deposit: 50000,
  listed: true,
  tone: 'indigo',
};
function fixture(path = ':memory:', seedDemo = false) {
  let clock = new Date('2026-10-21T04:00:00Z');
  const store = createStore({
    path,
    adminUsername: 'testadmin',
    adminPassword,
    seedDemo,
    now: () => clock,
  });
  return {
    store,
    advance: (days: number) => {
      clock = new Date(clock.valueOf() + days * 86400000);
    },
    setTime: (value: string) => {
      clock = new Date(value);
    },
    close: () => store.close(),
  };
}
const input = (id: string, start = '2026-10-21', end = start) => ({
  garmentId: id,
  guestName: '测试顾客',
  phone: '13800000000',
  startDate: start,
  endDate: end,
  note: '',
});
function receive(store: Store, id: string) {
  store.updateBooking(id, 'confirm');
  const b = store.getBooking(id);
  store.recordPayment(id, { kind: 'rent', amount: b.rentalTotal, method: '现金', note: '' });
  if (b.depositRequired)
    store.recordPayment(id, {
      kind: 'deposit',
      amount: b.depositRequired,
      method: '现金',
      note: '',
    });
  return store.updateBooking(id, 'pickup');
}
function rejects(fn: () => unknown, pattern: RegExp) {
  assert.throws(fn, (e) => e instanceof AppError && pattern.test(e.message));
}

test('自然日计费、跨月和北京时间日期计算', () => {
  assert.equal(rentalDays('2026-10-21', '2026-10-21'), 1);
  assert.equal(rentalDays('2026-10-31', '2026-11-02'), 3);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(todayInChina(new Date('2026-10-20T16:05:00Z')), '2026-10-21');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(
    returnDeadlinePassed('2026-10-21', '18:00', new Date('2026-10-21T10:00:00Z')),
    false,
  );
  assert.equal(returnDeadlinePassed('2026-10-21', '18:00', new Date('2026-10-21T10:00:01Z')), true);
});
test('待确认不锁库存，确认事务防止重复预约，并包含清洗缓冲', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      a = f.store.createBooking(input(g.id)),
      b = f.store.createBooking(input(g.id));
    assert.equal(f.store.catalog('2026-10-21', '2026-10-21').garments[0].available, true);
    f.store.updateBooking(a.id, 'confirm');
    rejects(() => f.store.updateBooking(b.id, 'confirm'), /冲突/);
    rejects(() => f.store.createBooking(input(g.id, '2026-10-22')), /清洗/);
    assert.equal(f.store.createBooking(input(g.id, '2026-10-23')).status, 'pending');
    assert.equal(f.store.getBooking(a.id).rentalTotal, 12800);
  } finally {
    f.close();
  }
});
test('数据库独立连接确认时重新检查，不接受旧的空档判断', () => {
  const dir = mkdtempSync(join(tmpdir(), 'huashan-conflict-')),
    path = join(dir, 'test.sqlite'),
    a = fixture(path);
  let b: ReturnType<typeof fixture> | undefined;
  try {
    const g = a.store.addGarment(garmentInput),
      one = a.store.createBooking(input(g.id)),
      two = a.store.createBooking(input(g.id));
    b = fixture(path);
    a.store.updateBooking(one.id, 'confirm');
    rejects(() => b!.store.updateBooking(two.id, 'confirm'), /冲突/);
    assert.equal(b.store.getBooking(two.id).status, 'pending');
  } finally {
    b?.close();
    a.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('取衣必须先确认并收足租金、押金；不能重复取衣', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      b = f.store.createBooking(input(g.id));
    rejects(() => f.store.updateBooking(b.id, 'pickup'), /确认/);
    f.store.updateBooking(b.id, 'confirm');
    rejects(() => f.store.updateBooking(b.id, 'pickup'), /足额/);
    f.store.recordPayment(b.id, { kind: 'rent', amount: 12800, method: '微信', note: '' });
    rejects(() => f.store.updateBooking(b.id, 'pickup'), /押金/);
    f.store.recordPayment(b.id, { kind: 'deposit', amount: 50000, method: '现金', note: '' });
    assert.equal(f.store.updateBooking(b.id, 'pickup').status, 'rented');
    assert.equal(f.store.getGarment(g.id).state, 'rented');
    rejects(() => f.store.updateBooking(b.id, 'pickup'), /确认/);
  } finally {
    f.close();
  }
});
test('归还须验收，逾期未清洗保持锁定；完成清洗才恢复取衣', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      b = f.store.createBooking(input(g.id));
    receive(f.store, b.id);
    rejects(() => f.store.updateBooking(b.id, 'return'), /核对/);
    f.store.updateBooking(b.id, 'return', { accessoriesChecked: true, inspection: '配饰齐全' });
    assert.equal(f.store.getGarment(g.id).state, 'cleaning');
    assert.equal(f.store.catalog('2026-10-21', '2026-10-21').garments[0].available, false);
    f.advance(3);
    assert.equal(f.store.catalog('2026-10-24', '2026-10-24').garments[0].available, false);
    f.store.garmentAction(g.id, 'clean');
    assert.equal(f.store.catalog('2026-10-24', '2026-10-24').garments[0].available, true);
  } finally {
    f.close();
  }
});
test('预计还衣时间到期后不会自动回库，逾期出租阻止后续预约', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      b = f.store.createBooking(input(g.id));
    receive(f.store, b.id);
    f.advance(2);
    assert.equal(f.store.getGarment(g.id).state, 'rented');
    assert.equal(f.store.dashboard().counts.overdue, 1);
    assert.equal(f.store.catalog('2026-10-27', '2026-10-27').garments[0].available, false);
    rejects(() => f.store.createBooking(input(g.id, '2026-10-27')), /出租/);
  } finally {
    f.close();
  }
});
test('超过北京时间还衣截止时间即逾期，实际归还或续租前锁定后续档期', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      b = f.store.createBooking(input(g.id));
    receive(f.store, b.id);
    f.setTime('2026-10-21T09:59:00Z');
    assert.equal(f.store.getBooking(b.id).overdue, false);
    assert.equal(f.store.catalog('2026-10-25', '2026-10-25').garments[0].available, true);
    f.setTime('2026-10-21T10:01:00Z');
    assert.equal(f.store.getBooking(b.id).overdue, true);
    assert.equal(f.store.dashboard().counts.overdue, 1);
    const catalog = f.store.catalog('2026-10-25', '2026-10-25').garments[0];
    assert.equal(catalog.overdue, true);
    assert.equal(catalog.available, false);
    assert.equal(catalog.nextAvailable, null);
    rejects(() => f.store.createBooking(input(g.id, '2026-10-25')), /出租/);
    assert.equal(f.store.updateBooking(b.id, 'extend', { endDate: '2026-10-22' }).overdue, false);
    assert.equal(f.store.dashboard().counts.overdue, 0);
    assert.equal(f.store.catalog('2026-10-25', '2026-10-25').garments[0].available, true);
  } finally {
    f.close();
  }
});
test('当日归还截止时间已过时禁止过期租期，仍允许次日及以后归还的申请', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput);
    f.setTime('2026-10-21T10:01:00Z');
    rejects(() => f.store.createBooking(input(g.id)), /归还时间已过/);
    const catalog = f.store.catalog('2026-10-21', '2026-10-21').garments[0];
    assert.equal(catalog.available, false);
    assert.equal(catalog.nextAvailable, '2026-10-22');
    assert.equal(
      f.store.calendar(g.id, '2026-10').find((day) => day.date === '2026-10-21')?.canStart,
      false,
    );
    assert.equal(f.store.createBooking(input(g.id, '2026-10-21', '2026-10-22')).status, 'pending');
  } finally {
    f.close();
  }
});
test('续租检查后续预约，并保持订单创建时的价格快照', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      a = f.store.createBooking(input(g.id)),
      b = f.store.createBooking(input(g.id, '2026-10-24'));
    receive(f.store, a.id);
    f.store.updateBooking(b.id, 'confirm');
    f.store.updateGarment(g.id, { ...garmentInput, dailyPrice: 20000 });
    const updated = f.store.updateBooking(a.id, 'extend', { endDate: '2026-10-22' });
    assert.equal(updated.rentalTotal, 25600);
    assert.equal(updated.dailyPrice, 12800);
    rejects(() => f.store.updateBooking(a.id, 'extend', { endDate: '2026-10-23' }), /冲突/);
    assert.equal(f.store.getBooking(a.id).endDate, '2026-10-22');
  } finally {
    f.close();
  }
});
test('押金与租金独立记账，禁止超收、超退，扣款须说明，余额归零才结算', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      b = f.store.createBooking(input(g.id));
    receive(f.store, b.id);
    rejects(
      () => f.store.recordPayment(b.id, { kind: 'deposit', amount: 1, method: '微信', note: '' }),
      /超过/,
    );
    f.store.updateBooking(b.id, 'return', { accessoriesChecked: true });
    rejects(() => f.store.updateBooking(b.id, 'complete'), /押金/);
    rejects(
      () =>
        f.store.recordPayment(b.id, {
          kind: 'deposit_deduction',
          amount: 5000,
          method: '其他',
          note: '',
        }),
      /说明/,
    );
    f.store.recordPayment(b.id, {
      kind: 'deposit_deduction',
      amount: 5000,
      method: '其他',
      note: '头饰损坏，已与顾客确认',
    });
    rejects(
      () =>
        f.store.recordPayment(b.id, {
          kind: 'deposit_refund',
          amount: 50000,
          method: '现金',
          note: '退款',
        }),
      /超过/,
    );
    f.store.recordPayment(b.id, {
      kind: 'deposit_refund',
      amount: 45000,
      method: '现金',
      note: '剩余押金原路退还',
    });
    assert.equal(f.store.getBooking(b.id).depositBalance, 0);
    assert.equal(f.store.dashboard().money.depositHeld, 0);
    assert.equal(f.store.dashboard().money.monthRevenue, 17800);
    assert.equal(f.store.updateBooking(b.id, 'complete').status, 'completed');
    assert.equal(f.store.getGarment(g.id).state, 'cleaning');
  } finally {
    f.close();
  }
});
test('取消只释放对应预约，不会把正在清洗的服装改成在店', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      a = f.store.createBooking(input(g.id)),
      later = f.store.createBooking(input(g.id, '2026-10-25'));
    receive(f.store, a.id);
    f.store.updateBooking(a.id, 'return', { accessoriesChecked: true });
    f.store.updateBooking(later.id, 'confirm');
    f.store.updateBooking(later.id, 'cancel', { reason: '顾客调整行程' });
    assert.equal(f.store.getGarment(g.id).state, 'cleaning');
    assert.equal(f.store.getBooking(later.id).status, 'cancelled');
  } finally {
    f.close();
  }
});
test('公开档期不泄露顾客，顾客查询需同时匹配预约编号和手机', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput),
      b = f.store.createBooking(input(g.id));
    f.store.updateBooking(b.id, 'confirm');
    const catalog = JSON.stringify(f.store.catalog('2026-10-21', '2026-10-21')),
      calendar = JSON.stringify(f.store.calendar(g.id, '2026-10'));
    assert.equal(catalog.includes(b.phone), false);
    assert.equal(calendar.includes(b.guestName), false);
    assert.equal(f.store.lookup(b.orderNo, b.phone).id, b.id);
    rejects(() => f.store.lookup(b.orderNo, '13900000000'), /未找到/);
    rejects(() => f.store.customerCancel(b.orderNo, b.phone), /店主已处理/);
  } finally {
    f.close();
  }
});
test('不允许无效日期、过长租期或维护中预约，编号不重复', () => {
  const f = fixture();
  try {
    const g = f.store.addGarment(garmentInput);
    rejects(() => f.store.createBooking(input(g.id, '2026-10-20')), /早于/);
    rejects(() => f.store.createBooking(input(g.id, '2026-02-30')), /有效/);
    rejects(() => f.store.createBooking(input(g.id, '2026-10-21', '2027-02-01')), /90/);
    f.store.garmentAction(g.id, 'maintain');
    rejects(() => f.store.createBooking(input(g.id)), /维护/);
    f.store.garmentAction(g.id, 'release');
    assert.equal(f.store.createBooking(input(g.id)).status, 'pending');
    assert.throws(() => f.store.addGarment(garmentInput), /UNIQUE/);
  } finally {
    f.close();
  }
});
test('数据重启持久化，示例不会重复导入，密码变更会使旧会话失效', () => {
  const dir = mkdtempSync(join(tmpdir(), 'huashan-persist-')),
    path = join(dir, 'test.sqlite');
  let f = fixture(path, true);
  try {
    const count = f.store.inventory().length,
      token = f.store.authenticate('testadmin', adminPassword);
    f.store.updateSettings({ ...f.store.getSettings(), address: '测试门店地址' });
    f.close();
    f = fixture(path, true);
    assert.equal(f.store.inventory().length, count);
    assert.equal(f.store.getSettings().address, '测试门店地址');
    assert.ok(f.store.session(token));
    f.close();
    const rotated = createStore({
      path,
      adminUsername: 'testadmin',
      adminPassword: 'New-Test-Password-2026',
      seedDemo: false,
    });
    assert.equal(rotated.session(token), null);
    rotated.close();
    f = fixture(':memory:');
  } finally {
    f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
