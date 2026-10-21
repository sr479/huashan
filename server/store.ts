import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  addDays,
  rentalDays,
  todayInChina,
  validDate,
  money,
  paymentLabels,
  returnDeadlinePassed,
} from '../shared/utils.js';
import type {
  Garment,
  Booking,
  BookingStatus,
  Payment,
  PaymentKind,
  Settings,
  CalendarDay,
  DayStatus,
  Dashboard,
  Audit,
} from '../shared/types.js';

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (message: string, status = 400): never => {
  throw new AppError(status, message);
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function passwordHash(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function passwordMatches(password: string, stored: string): boolean {
  const [salt, value] = stored.split(':');
  const candidate = scryptSync(password, salt || 'invalid', 64);
  const expected = Buffer.from(value || '', 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
interface Options {
  path: string;
  adminUsername: string;
  adminPassword: string;
  seedDemo?: boolean;
  now?: () => Date;
}
export interface BookingInput {
  garmentId: string;
  guestName: string;
  phone: string;
  startDate: string;
  endDate: string;
  note: string;
}
export type GarmentInput = Pick<
  Garment,
  | 'sku'
  | 'name'
  | 'category'
  | 'size'
  | 'measurements'
  | 'description'
  | 'accessories'
  | 'images'
  | 'dailyPrice'
  | 'deposit'
  | 'listed'
  | 'tone'
>;
interface Block {
  start: string;
  end: string;
  status: DayStatus;
}
type DbRow = Record<string, unknown>;
const defaults: Settings = {
  storeName: '花山节',
  phone: '',
  wechat: '',
  address: '',
  hours: '',
  introduction: '穿上苗族盛装，共赴花山节之约。',
  notice: '到店取还。提交预约后由店主确认，请以确认后的预约安排为准。',
  cleaningDays: 1,
  returnTime: '18:00',
  rentalRules:
    '租金按自然日计算，取衣日和还衣日均计费。\n租金与押金分别收取，归还验收后结算押金。\n请爱护刺绣、头饰及配件，勿自行水洗；续租须提前联系门店。\n如需取消、调整时间或处理损坏，请与门店协商。',
  icp: '',
};

export function createStore(options: Options) {
  if (options.path !== ':memory:') mkdirSync(dirname(options.path), { recursive: true });
  const db = new DatabaseSync(options.path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id = 1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admins (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, passwordHash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (tokenHash TEXT PRIMARY KEY, adminId INTEGER NOT NULL REFERENCES admins(id), expiresAt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS garments (
      id TEXT PRIMARY KEY, sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
      size TEXT NOT NULL, measurements TEXT NOT NULL, description TEXT NOT NULL, accessories TEXT NOT NULL,
      images TEXT NOT NULL, dailyPrice INTEGER NOT NULL CHECK(dailyPrice >= 0), deposit INTEGER NOT NULL CHECK(deposit >= 0),
      state TEXT NOT NULL CHECK(state IN ('available','rented','cleaning','maintenance')),
      listed INTEGER NOT NULL DEFAULT 1, tone TEXT NOT NULL, cleaningUntil TEXT, demo INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY, orderNo TEXT UNIQUE NOT NULL, garmentId TEXT NOT NULL REFERENCES garments(id),
      guestName TEXT NOT NULL, phone TEXT NOT NULL, startDate TEXT NOT NULL, endDate TEXT NOT NULL,
      note TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','confirmed','rented','returned','completed','cancelled')),
      dailyPrice INTEGER NOT NULL, rentalTotal INTEGER NOT NULL, depositRequired INTEGER NOT NULL,
      cleaningDays INTEGER NOT NULL, source TEXT NOT NULL, createdAt TEXT NOT NULL, pickedAt TEXT, returnedAt TEXT,
      inspection TEXT NOT NULL DEFAULT '', cancellationReason TEXT NOT NULL DEFAULT '', demo INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS booking_schedule ON bookings(garmentId,status,startDate,endDate);
    CREATE UNIQUE INDEX IF NOT EXISTS only_one_rented ON bookings(garmentId) WHERE status='rented';
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, bookingId TEXT NOT NULL REFERENCES bookings(id), kind TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK(amount > 0), method TEXT NOT NULL, note TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS payment_booking ON payments(bookingId);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, createdAt TEXT NOT NULL);
    PRAGMA user_version = 1;
  `);
  const now = () => (options.now ? options.now() : new Date());
  const timestamp = () => now().toISOString();
  const today = () => todayInChina(now());
  const one = (sql: string, ...params: (string | number | null)[]) =>
    db.prepare(sql).get(...params) as DbRow | undefined;
  const all = (sql: string, ...params: (string | number | null)[]) =>
    db.prepare(sql).all(...params) as DbRow[];
  const audit = (action: string, target: string, detail = '') =>
    db
      .prepare('INSERT INTO audit(action,target,detail,createdAt) VALUES(?,?,?,?)')
      .run(action, target, detail, timestamp());
  function transaction<T>(fn: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  if (!one('SELECT id FROM settings WHERE id=1'))
    db.prepare('INSERT INTO settings(id,value) VALUES(1,?)').run(JSON.stringify(defaults));
  const existingAdmin = one('SELECT * FROM admins WHERE id=1');
  if (!existingAdmin)
    db.prepare('INSERT INTO admins(id,username,passwordHash) VALUES(1,?,?)').run(
      options.adminUsername,
      passwordHash(options.adminPassword),
    );
  else if (
    existingAdmin.username !== options.adminUsername ||
    !passwordMatches(options.adminPassword, String(existingAdmin.passwordHash))
  ) {
    transaction(() => {
      db.prepare('UPDATE admins SET username=?,passwordHash=? WHERE id=1').run(
        options.adminUsername,
        passwordHash(options.adminPassword),
      );
      db.prepare('DELETE FROM sessions').run();
    });
  }
  const getSettings = () =>
    JSON.parse(String(one('SELECT value FROM settings WHERE id=1')!.value)) as Settings;
  function garment(row: DbRow): Garment {
    return {
      ...row,
      accessories: JSON.parse(String(row.accessories)),
      images: JSON.parse(String(row.images)),
      listed: Boolean(row.listed),
      demo: Boolean(row.demo),
    } as unknown as Garment;
  }
  function getGarment(id: string): Garment {
    const row = one('SELECT * FROM garments WHERE id=?', id);
    if (!row) return fail('找不到这套服装', 404);
    return garment(row);
  }
  function payments(id: string): Payment[] {
    return all(
      'SELECT * FROM payments WHERE bookingId=? ORDER BY createdAt,id',
      id,
    ) as unknown as Payment[];
  }
  function booking(row: DbRow, includePayments = false): Booking {
    const items = payments(String(row.id));
    const sum = (kind: PaymentKind) =>
      items.filter((p) => p.kind === kind).reduce((n, p) => n + p.amount, 0);
    return {
      ...row,
      demo: Boolean(row.demo),
      rentPaid: sum('rent') - sum('rent_refund'),
      overdue:
        row.status === 'rented' &&
        returnDeadlinePassed(String(row.endDate), getSettings().returnTime, now()),
      depositBalance: sum('deposit') - sum('deposit_refund') - sum('deposit_deduction'),
      depositDeducted: sum('deposit_deduction'),
      ...(includePayments ? { payments: items } : {}),
    } as unknown as Booking;
  }
  const bookingSQL =
    'SELECT b.*,g.name AS garmentName,g.sku FROM bookings b JOIN garments g ON g.id=b.garmentId';
  function getBooking(id: string): Booking {
    const row = one(`${bookingSQL} WHERE b.id=?`, id);
    if (!row) return fail('找不到这笔预约', 404);
    return booking(row, true);
  }
  function listBookings(): Booking[] {
    return all(`${bookingSQL} ORDER BY b.createdAt DESC,b.id`).map((row) => booking(row));
  }
  function blocksFor(g: Garment, exclude = ''): Block[] {
    const blocks: Block[] = [];
    const { returnTime } = getSettings();
    const active = all(
      "SELECT * FROM bookings WHERE garmentId=? AND id!=? AND status IN ('confirmed','rented')",
      g.id,
      exclude,
    );
    for (const b of active) {
      const overdue =
        b.status === 'rented' && returnDeadlinePassed(String(b.endDate), returnTime, now());
      blocks.push({
        start: String(b.startDate),
        end: overdue ? '9999-12-31' : String(b.endDate),
        status: b.status === 'rented' ? 'rented' : 'reserved',
      });
      if (!overdue && Number(b.cleaningDays) > 0)
        blocks.push({
          start: addDays(String(b.endDate), 1),
          end: addDays(String(b.endDate), Number(b.cleaningDays)),
          status: 'cleaning',
        });
    }
    if (g.state === 'maintenance')
      blocks.push({ start: '0001-01-01', end: '9999-12-31', status: 'maintenance' });
    if (g.state === 'cleaning')
      blocks.push({
        start: today(),
        end: !g.cleaningUntil || g.cleaningUntil < today() ? '9999-12-31' : g.cleaningUntil,
        status: 'cleaning',
      });
    if (
      g.state === 'rented' &&
      !active.some((b) => b.status === 'rented') &&
      (!exclude ||
        !one(
          "SELECT id FROM bookings WHERE id=? AND garmentId=? AND status='rented'",
          exclude,
          g.id,
        ))
    )
      blocks.push({ start: today(), end: '9999-12-31', status: 'rented' });
    return blocks;
  }
  function checkAvailability(
    blocks: Block[],
    start: string,
    end: string,
    cleaningDays: number,
    returnTime = getSettings().returnTime,
  ) {
    if (returnDeadlinePassed(end, returnTime, now()))
      return { available: false, reason: '约定归还时间已过，请选择新的还衣日期' };
    const blockedEnd = addDays(end, cleaningDays);
    const clash = blocks.find((b) => b.start <= blockedEnd && b.end >= start);
    return {
      available: !clash,
      reason: clash
        ? {
            rented: '与出租时段冲突',
            reserved: '与已确认预约冲突',
            cleaning: '该时段需要清洗或清洗尚未完成',
            maintenance: '服装正在维护',
            available: '',
          }[clash.status]
        : '',
    };
  }
  function availability(
    g: Garment,
    start: string,
    end: string,
    cleaningDays = getSettings().cleaningDays,
    exclude = '',
  ) {
    return checkAvailability(blocksFor(g, exclude), start, end, cleaningDays);
  }
  function decorate(g: Garment, start = today(), end = start): Garment {
    const blocks = blocksFor(g),
      settings = getSettings();
    const result = checkAvailability(
      blocks,
      start,
      end,
      settings.cleaningDays,
      settings.returnTime,
    );
    const active = one("SELECT endDate FROM bookings WHERE garmentId=? AND status='rented'", g.id);
    let nextAvailable: string | null = null;
    for (let offset = 0; offset <= 365; offset++) {
      const day = addDays(today(), offset);
      if (
        checkAvailability(blocks, day, day, settings.cleaningDays, settings.returnTime).available
      ) {
        nextAvailable = day;
        break;
      }
    }
    const currentStatus =
      blocks.find((b) => b.start <= today() && b.end >= today())?.status || 'available';
    return {
      ...g,
      currentStatus,
      expectedReturn: active ? String(active.endDate) : null,
      overdue: !!active && returnDeadlinePassed(String(active.endDate), settings.returnTime, now()),
      nextAvailable,
      available: result.available,
      unavailableReason: result.reason,
      activeOrders: Number(
        one(
          "SELECT COUNT(*) AS count FROM bookings WHERE garmentId=? AND status IN ('pending','confirmed','rented')",
          g.id,
        )!.count,
      ),
    };
  }
  function dateRange(start: string, end: string, allowPast = false) {
    if (!validDate(start) || !validDate(end) || end < start) fail('请选择有效的取还日期');
    if (!allowPast && start < today()) fail('取衣日期不能早于今天');
    if (rentalDays(start, end) > 90) fail('单笔租期最多 90 天，请联系门店安排更长租期');
    if (start > addDays(today(), 365) || end > addDays(today(), 455))
      fail('目前支持预约未来一年内的档期');
  }
  function addGarment(input: GarmentInput, demo = false): Garment {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO garments(id,sku,name,category,size,measurements,description,accessories,images,dailyPrice,deposit,state,listed,tone,cleaningUntil,demo,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,'available',?,?,NULL,?,?)`,
    ).run(
      id,
      input.sku,
      input.name,
      input.category,
      input.size,
      input.measurements,
      input.description,
      JSON.stringify(input.accessories),
      JSON.stringify(input.images),
      input.dailyPrice,
      input.deposit,
      Number(input.listed),
      input.tone,
      Number(demo),
      timestamp(),
    );
    audit('新增服装', id, input.sku);
    return getGarment(id);
  }
  function createBooking(
    input: BookingInput,
    source: 'online' | 'store' = 'online',
    demo = false,
  ): Booking {
    return transaction(() => {
      dateRange(input.startDate, input.endDate);
      const g = getGarment(input.garmentId),
        settings = getSettings();
      if (!g.listed) fail('这套服装暂未开放预约');
      const result = availability(g, input.startDate, input.endDate, settings.cleaningDays);
      if (!result.available) fail(result.reason + '，请换一个日期', 409);
      const id = randomUUID(),
        orderNo = 'HS' + today().replaceAll('-', '') + randomBytes(5).toString('hex').toUpperCase();
      db.prepare(
        `INSERT INTO bookings(id,orderNo,garmentId,guestName,phone,startDate,endDate,note,status,dailyPrice,rentalTotal,depositRequired,cleaningDays,source,createdAt,demo) VALUES(?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,?)`,
      ).run(
        id,
        orderNo,
        g.id,
        input.guestName,
        input.phone,
        input.startDate,
        input.endDate,
        input.note,
        g.dailyPrice,
        g.dailyPrice * rentalDays(input.startDate, input.endDate),
        g.deposit,
        settings.cleaningDays,
        source,
        timestamp(),
        Number(demo),
      );
      audit(source === 'online' ? '顾客提交预约' : '录入门店预约', id, orderNo);
      return getBooking(id);
    });
  }
  function updateBooking(
    id: string,
    action: string,
    input: {
      endDate?: string;
      reason?: string;
      inspection?: string;
      accessoriesChecked?: boolean;
    } = {},
  ): Booking {
    return transaction(() => {
      const b = getBooking(id),
        g = getGarment(b.garmentId);
      if (action === 'confirm') {
        if (b.status !== 'pending') fail('只有待确认的预约可以确认', 409);
        dateRange(b.startDate, b.endDate);
        const result = availability(g, b.startDate, b.endDate, b.cleaningDays, id);
        if (!result.available) fail('无法确认：' + result.reason, 409);
        db.prepare("UPDATE bookings SET status='confirmed' WHERE id=?").run(id);
      } else if (action === 'cancel') {
        if (!['pending', 'confirmed'].includes(b.status)) fail('只有尚未取衣的订单可以取消', 409);
        if (!input.reason?.trim()) fail('请填写取消原因');
        db.prepare("UPDATE bookings SET status='cancelled',cancellationReason=? WHERE id=?").run(
          input.reason || '',
          id,
        );
      } else if (action === 'pickup') {
        if (b.status !== 'confirmed') fail('请先确认预约', 409);
        if (b.startDate > today() || b.endDate < today())
          fail('请在预约租期内登记取衣；提前取衣请先调整预约');
        if (g.state !== 'available') fail('服装尚未在店待租，请先完成上一笔归还或清洗', 409);
        if (b.rentPaid < b.rentalTotal || b.depositBalance < b.depositRequired)
          fail('请先登记足额租金和押金');
        const result = availability(g, today(), b.endDate, b.cleaningDays, id);
        if (!result.available) fail(result.reason, 409);
        db.prepare("UPDATE bookings SET status='rented',pickedAt=? WHERE id=?").run(
          timestamp(),
          id,
        );
        db.prepare("UPDATE garments SET state='rented',cleaningUntil=NULL WHERE id=?").run(g.id);
      } else if (action === 'return') {
        if (b.status !== 'rented') fail('只有出租中的订单可以登记归还', 409);
        if (!input.accessoriesChecked) fail('请先核对服装和全部配饰');
        db.prepare(
          "UPDATE bookings SET status='returned',returnedAt=?,inspection=? WHERE id=?",
        ).run(timestamp(), input.inspection || '服装及配饰已核对', id);
        db.prepare("UPDATE garments SET state='cleaning',cleaningUntil=? WHERE id=?").run(
          addDays(today(), b.cleaningDays),
          g.id,
        );
      } else if (action === 'complete') {
        if (b.status !== 'returned') fail('归还验收后才能完成结算', 409);
        if (b.depositBalance !== 0) fail('请先退还或结算剩余押金');
        if (b.rentPaid < b.rentalTotal) fail('请先结清租金');
        db.prepare("UPDATE bookings SET status='completed' WHERE id=?").run(id);
      } else if (action === 'extend') {
        if (!['confirmed', 'rented'].includes(b.status)) fail('该订单目前不能调整租期', 409);
        const end = input.endDate || '';
        dateRange(b.startDate, end, true);
        if (end <= b.endDate || end < today())
          fail('新的还衣日期需要晚于原还衣日期，且不能早于今天');
        const result = availability(g, b.startDate, end, b.cleaningDays, id);
        if (!result.available) fail('续租冲突：' + result.reason, 409);
        db.prepare('UPDATE bookings SET endDate=?,rentalTotal=? WHERE id=?').run(
          end,
          rentalDays(b.startDate, end) * b.dailyPrice,
          id,
        );
      } else fail('不支持的订单操作');
      audit(
        {
          confirm: '确认预约',
          cancel: '取消预约',
          pickup: '登记取衣',
          return: '归还验收',
          complete: '完成结算',
          extend: '延长租期',
        }[action] || action,
        id,
        b.orderNo +
          (input.reason || input.inspection || input.endDate
            ? ' · ' + (input.reason || input.inspection || input.endDate)
            : ''),
      );
      return getBooking(id);
    });
  }
  function recordPayment(
    id: string,
    input: { kind: PaymentKind; amount: number; method: string; note: string },
  ): Booking {
    return transaction(() => {
      const b = getBooking(id),
        { kind, amount, method, note } = input;
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000)
        fail('金额必须大于 0，且最多 100 万元');
      if (kind === 'rent' || kind === 'deposit') {
        if (!['confirmed', 'rented', 'returned'].includes(b.status))
          fail('请先确认预约后再登记收款');
        const remaining =
          kind === 'rent' ? b.rentalTotal - b.rentPaid : b.depositRequired - b.depositBalance;
        if (amount > remaining) fail('登记金额超过应收余额');
      } else {
        if (!['returned', 'completed', 'cancelled'].includes(b.status))
          fail('归还验收或取消订单后才能退款或扣款');
        if (!note.trim()) fail('请填写退款或扣款说明');
        if (amount > (kind === 'rent_refund' ? b.rentPaid : b.depositBalance))
          fail('金额超过可退还或可扣除余额');
      }
      db.prepare(
        'INSERT INTO payments(id,bookingId,kind,amount,method,note,createdAt) VALUES(?,?,?,?,?,?,?)',
      ).run(randomUUID(), id, kind, amount, method, note, timestamp());
      audit(
        '登记资金流水',
        id,
        `${b.orderNo} · ${paymentLabels[kind]} ¥${money(amount)} · ${method}${note ? ' · ' + note : ''}`,
      );
      return getBooking(id);
    });
  }
  function seed() {
    if (!options.seedDemo || Number(one('SELECT COUNT(*) AS count FROM garments')!.count) > 0)
      return;
    const samples = [
      [
        'MZ-001',
        '靛蓝刺绣盛装',
        '节庆盛装',
        'M',
        12800,
        50000,
        'indigo',
        '精致刺绣与层叠裙摆，适合节庆、旅拍与纪念照。',
      ],
      [
        'MZ-002',
        '朱红节庆套装',
        '节庆盛装',
        'L',
        16800,
        60000,
        'red',
        '鲜明的朱红配色，让节日的每一个瞬间都更出彩。',
      ],
      [
        'MZ-003',
        '素雅日常苗装',
        '日常苗装',
        'S',
        9800,
        30000,
        'sage',
        '轻巧舒适的日常款式，适合慢慢逛街、漫步山间。',
      ],
      [
        'MZ-004',
        '银纹靛蓝套装',
        '节庆盛装',
        'M',
        15800,
        50000,
        'silver',
        '以靛蓝衬托银色纹样，适合记录庄重而温柔的时刻。',
      ],
      [
        'MZ-005',
        '山花童趣苗装',
        '儿童服饰',
        '儿童',
        6800,
        20000,
        'ochre',
        '轻盈的童装示例，实际尺码请预约前与门店核对。',
      ],
      [
        'MZ-006',
        '青黛简约苗装',
        '日常苗装',
        'L',
        10800,
        30000,
        'teal',
        '简洁的线条和细腻的装饰，适合轻松自在的日常体验。',
      ],
    ] as const;
    const items = samples.map(
      ([sku, name, category, size, dailyPrice, deposit, tone, description]) =>
        addGarment(
          {
            sku,
            name,
            category,
            size,
            dailyPrice,
            deposit,
            tone,
            description: description + '\n此为示例服装，请在管理后台替换为真实服装及实拍。',
            measurements: '示例尺寸：腰围可调节；实际尺寸请到店试穿确认。',
            accessories: ['上衣', '裙装', '腰带', '头饰'],
            images: [],
            listed: true,
          },
          true,
        ),
    );
    db.prepare("UPDATE garments SET state='cleaning',cleaningUntil=? WHERE id=?").run(
      today(),
      items[2].id,
    );
    const insertSeedBooking = (g: Garment, status: BookingStatus, start: string, end: string) => {
      const id = randomUUID(),
        total = g.dailyPrice * rentalDays(start, end);
      db.prepare(
        `INSERT INTO bookings(id,orderNo,garmentId,guestName,phone,startDate,endDate,note,status,dailyPrice,rentalTotal,depositRequired,cleaningDays,source,createdAt,pickedAt,demo) VALUES(?,?,?,'示例顾客','13800000000',?,?,'示例订单，仅供体验',?,?,?,?,1,'store',?,?,1)`,
      ).run(
        id,
        'DEMO' + randomBytes(5).toString('hex').toUpperCase(),
        g.id,
        start,
        end,
        status,
        g.dailyPrice,
        total,
        g.deposit,
        timestamp(),
        status === 'rented' ? timestamp() : null,
      );
      if (status === 'rented') {
        db.prepare("UPDATE garments SET state='rented' WHERE id=?").run(g.id);
        for (const [kind, amount] of [
          ['rent', total],
          ['deposit', g.deposit],
        ] as const)
          db.prepare(
            "INSERT INTO payments(id,bookingId,kind,amount,method,note,createdAt) VALUES(?,?,?,?, '其他','示例收款',?)",
          ).run(randomUUID(), id, kind, amount, timestamp());
      }
    };
    insertSeedBooking(items[0], 'rented', addDays(today(), -1), addDays(today(), 2));
    insertSeedBooking(items[1], 'confirmed', addDays(today(), 3), addDays(today(), 4));
    insertSeedBooking(items[3], 'pending', addDays(today(), 1), addDays(today(), 2));
  }
  seed();
  return {
    db,
    today,
    getSettings,
    getGarment,
    getBooking,
    listBookings,
    createBooking,
    updateBooking,
    recordPayment,
    dateRange,
    close: () => db.close(),
    authenticate(username: string, password: string): string {
      const a = one('SELECT * FROM admins WHERE username=?', username);
      const matches = passwordMatches(
        password,
        a ? String(a.passwordHash) : 'invalid:' + '0'.repeat(128),
      );
      if (!a || !matches) return fail('账号或密码不正确', 401);
      const token = randomBytes(32).toString('base64url');
      db.prepare('DELETE FROM sessions WHERE expiresAt<=?').run(timestamp());
      db.prepare('INSERT INTO sessions(tokenHash,adminId,expiresAt) VALUES(?,?,?)').run(
        hash(token),
        Number(a.id),
        new Date(now().valueOf() + 8 * 3600000).toISOString(),
      );
      audit('管理员登录', String(a.id), String(a.username));
      return token;
    },
    session(token: string) {
      const row = one(
        'SELECT a.username FROM sessions s JOIN admins a ON a.id=s.adminId WHERE s.tokenHash=? AND s.expiresAt>?',
        hash(token),
        timestamp(),
      );
      return row ? { username: String(row.username) } : null;
    },
    logout(token: string) {
      db.prepare('DELETE FROM sessions WHERE tokenHash=?').run(hash(token));
    },
    catalog(start: string, end: string) {
      dateRange(start, end);
      return {
        garments: all('SELECT * FROM garments WHERE listed=1 ORDER BY createdAt,sku').map((row) =>
          decorate(garment(row), start, end),
        ),
        settings: getSettings(),
        today: today(),
      };
    },
    inventory: () =>
      all('SELECT * FROM garments ORDER BY sku').map((row) => decorate(garment(row))),
    addGarment: (input: GarmentInput) => transaction(() => addGarment(input)),
    updateGarment(id: string, input: GarmentInput) {
      return transaction(() => {
        getGarment(id);
        db.prepare(
          `UPDATE garments SET sku=?,name=?,category=?,size=?,measurements=?,description=?,accessories=?,images=?,dailyPrice=?,deposit=?,listed=?,tone=?,demo=0 WHERE id=?`,
        ).run(
          input.sku,
          input.name,
          input.category,
          input.size,
          input.measurements,
          input.description,
          JSON.stringify(input.accessories),
          JSON.stringify(input.images),
          input.dailyPrice,
          input.deposit,
          Number(input.listed),
          input.tone,
          id,
        );
        audit('修改服装', id, input.sku);
        return decorate(getGarment(id));
      });
    },
    garmentAction(id: string, action: string, until?: string) {
      return transaction(() => {
        const g = getGarment(id);
        if (action === 'clean') {
          if (g.state !== 'cleaning') fail('这套服装当前不在清洗中', 409);
          db.prepare("UPDATE garments SET state='available',cleaningUntil=NULL WHERE id=?").run(id);
        } else if (action === 'maintain') {
          if (g.state !== 'available') fail('请先完成归还及清洗后再登记维护', 409);
          if (
            one(
              "SELECT id FROM bookings WHERE garmentId=? AND status='confirmed' AND endDate>=?",
              id,
              today(),
            )
          )
            fail('存在已确认预约，请先联系顾客调整或取消后再维护', 409);
          db.prepare("UPDATE garments SET state='maintenance',cleaningUntil=NULL WHERE id=?").run(
            id,
          );
        } else if (action === 'release') {
          if (g.state !== 'maintenance') fail('服装当前不在维护中', 409);
          db.prepare("UPDATE garments SET state='available' WHERE id=?").run(id);
        } else if (action === 'cleaning-date') {
          if (g.state !== 'cleaning' || !until || !validDate(until) || until < today())
            fail('请选择有效的预计清洗完成日期');
          db.prepare('UPDATE garments SET cleaningUntil=? WHERE id=?').run(until || '', id);
        } else fail('不支持的服装操作');
        audit(
          {
            clean: '完成清洗与检查',
            maintain: '服装进入维护',
            release: '完成维护',
            'cleaning-date': '调整清洗排期',
          }[action] || action,
          id,
          g.sku + (until ? ' · ' + until : ''),
        );
        return decorate(getGarment(id));
      });
    },
    calendar(id: string, month: string, admin = false): CalendarDay[] {
      const g = getGarment(id);
      if (!admin && !g.listed) fail('这套服装暂未展示', 404);
      if (!/^\d{4}-\d{2}$/.test(month) || !validDate(month + '-01')) fail('月份不正确');
      const blocks = blocksFor(g),
        settings = getSettings(),
        days: CalendarDay[] = [];
      for (let i = 0; i < 31; i++) {
        const date = addDays(month + '-01', i);
        if (!date.startsWith(month)) break;
        const status = blocks.find((b) => b.start <= date && b.end >= date)?.status || 'available';
        days.push({
          date,
          status,
          canStart:
            date >= today() &&
            checkAvailability(blocks, date, date, settings.cleaningDays, settings.returnTime)
              .available,
        });
      }
      return days;
    },
    lookup(orderNo: string, phone: string) {
      const row = one(
        `${bookingSQL} WHERE b.orderNo=? AND b.phone=?`,
        orderNo.toUpperCase(),
        phone,
      );
      if (!row) return fail('未找到预约，请核对预约编号和手机号', 404);
      return booking(row, true);
    },
    customerCancel(orderNo: string, phone: string) {
      const row = one(
        'SELECT id,status FROM bookings WHERE orderNo=? AND phone=?',
        orderNo.toUpperCase(),
        phone,
      );
      if (!row) return fail('未找到这笔预约', 404);
      if (row.status !== 'pending') fail('店主已处理该预约，请联系门店协商取消');
      return updateBooking(String(row.id), 'cancel', { reason: '顾客主动取消预约申请' });
    },
    updateSettings(input: Settings) {
      db.prepare('UPDATE settings SET value=? WHERE id=1').run(JSON.stringify(input));
      audit('修改门店设置', 'store', '更新门店资料及租赁规则');
      return getSettings();
    },
    dashboard(): Dashboard {
      const orders = listBookings(),
        garments = all('SELECT * FROM garments').map((row) => garment(row));
      const month = today().slice(0, 7);
      const monthRevenue = Number(
        one(
          `SELECT COALESCE(SUM(CASE WHEN kind IN ('rent','deposit_deduction') THEN amount WHEN kind='rent_refund' THEN -amount ELSE 0 END),0) AS amount FROM payments WHERE createdAt>=?`,
          new Date(month + '-01T00:00:00+08:00').toISOString(),
        )!.amount,
      );
      return {
        today: today(),
        counts: {
          pending: orders.filter((b) => b.status === 'pending').length,
          rented: orders.filter((b) => b.status === 'rented').length,
          cleaning: garments.filter((g) => g.state === 'cleaning').length,
          overdue: orders.filter((b) => b.overdue).length,
          pickupToday: orders.filter((b) => b.status === 'confirmed' && b.startDate === today())
            .length,
          returnToday: orders.filter((b) => b.status === 'rented' && b.endDate === today()).length,
        },
        money: { monthRevenue, depositHeld: orders.reduce((n, b) => n + b.depositBalance, 0) },
        bookings: orders,
        cleaning: garments.filter((g) => g.state === 'cleaning'),
      };
    },
    finance() {
      return {
        payments: all(
          'SELECT p.*,b.orderNo,b.guestName,g.name AS garmentName FROM payments p JOIN bookings b ON b.id=p.bookingId JOIN garments g ON g.id=b.garmentId ORDER BY p.createdAt DESC,p.id',
        ),
        totals: this.dashboard().money,
      };
    },
    audit: () => all('SELECT * FROM audit ORDER BY id DESC LIMIT 100') as unknown as Audit[],
  };
}
export type Store = ReturnType<typeof createStore>;
