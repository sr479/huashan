import express from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AppError, type Store } from './store.js';
import { addDays, validDate } from '../shared/utils.js';

const text = (max: number) => z.string().trim().max(max);
const date = z.string().refine(validDate, '日期格式不正确');
const bookingSchema = z.object({
  garmentId: z.string().uuid(),
  guestName: text(40).min(1, '请填写称呼'),
  phone: z.string().regex(/^1[3-9]\d{9}$/, '请填写有效的中国大陆手机号'),
  startDate: date,
  endDate: date,
  note: text(500).default(''),
});
const imagePath = z.string().regex(/^\/uploads\/[a-f0-9-]+\.(jpg|png|webp)$/);
const garmentSchema = z.object({
  sku: text(40)
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, '服装编号只支持字母、数字、横线和下划线'),
  name: text(80).min(1),
  category: text(30).min(1),
  size: text(30).min(1),
  measurements: text(500).default(''),
  description: text(2000).default(''),
  accessories: z.array(text(50).min(1)).max(30),
  images: z.array(imagePath).max(8),
  dailyPrice: z.number().int().min(1).max(10000000),
  deposit: z.number().int().min(0).max(100000000),
  listed: z.boolean(),
  tone: z.enum(['indigo', 'red', 'sage', 'silver', 'ochre', 'teal']),
});
const settingsSchema = z.object({
  storeName: text(40).min(1),
  phone: text(40),
  wechat: text(80),
  address: text(200),
  hours: text(120),
  introduction: text(300),
  notice: text(500),
  cleaningDays: z.number().int().min(0).max(14),
  returnTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  rentalRules: text(3000),
  icp: text(80),
});
interface AppOptions {
  store: Store;
  uploadDir: string;
  origins: string[];
  production?: boolean;
  secureCookie?: boolean;
  trustProxy?: boolean;
}
export function createApp(options: AppOptions) {
  const app = express(),
    { store } = options;
  app.disable('x-powered-by');
  if (options.trustProxy) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: options.production
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              upgradeInsecureRequests: options.secureCookie ? [] : null,
            },
          }
        : false,
      strictTransportSecurity: options.secureCookie ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '8mb' }));
  const limits = new Map<string, { count: number; reset: number }>();
  function rateLimit(name: string, maximum: number, windowMs: number): express.RequestHandler {
    return (req, res, next) => {
      const key = name + ':' + req.ip,
        current = Date.now();
      if (limits.size > 5000)
        for (const [key, item] of limits) if (item.reset < current) limits.delete(key);
      let item = limits.get(key);
      if (!item || item.reset < current) {
        item = { count: 0, reset: current + windowMs };
        limits.set(key, item);
      }
      if (++item.count > maximum) {
        res.setHeader('Retry-After', String(Math.ceil((item.reset - current) / 1000)));
        res.status(429).json({ error: '操作过于频繁，请稍后再试' });
        return;
      }
      next();
    };
  }
  const cookieToken = (req: express.Request) =>
    req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('hs_session='))
      ?.slice('hs_session='.length) || '';
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!req.is('application/json')) {
        res.status(415).json({ error: '请使用 JSON 请求' });
        return;
      }
      const origin = req.get('origin');
      if ((origin && !options.origins.includes(origin)) || (!origin && cookieToken(req))) {
        res.status(403).json({ error: '请求来源校验失败，请刷新页面重试' });
        return;
      }
    }
    next();
  });
  const admin: express.RequestHandler = (req, res, next) => {
    const session = store.session(cookieToken(req));
    if (!session) {
      res.status(401).json({ error: '请先登录管理后台' });
      return;
    }
    res.locals.admin = session;
    next();
  };
  const route =
    (fn: (req: express.Request, res: express.Response) => unknown): express.RequestHandler =>
    (req, res, next) => {
      try {
        fn(req, res);
      } catch (error) {
        next(error);
      }
    };
  app.get('/api/health', (_req, res) => res.json({ ok: true, name: '花山节' }));
  app.get(
    '/api/catalog',
    route((req, res) =>
      res.json(
        store.catalog(
          String(req.query.start || store.today()),
          String(req.query.end || req.query.start || store.today()),
        ),
      ),
    ),
  );
  app.get(
    '/api/garments/:id/calendar',
    route((req, res) =>
      res.json({
        days: store.calendar(
          String(req.params.id),
          String(req.query.month || store.today().slice(0, 7)),
        ),
      }),
    ),
  );
  app.post(
    '/api/bookings',
    rateLimit('booking', 30, 3600000),
    route((req, res) => res.status(201).json(store.createBooking(bookingSchema.parse(req.body)))),
  );
  app.post(
    '/api/bookings/lookup',
    rateLimit('lookup', 15, 900000),
    route((req, res) => {
      const input = z
        .object({ orderNo: text(40).min(10), phone: z.string().regex(/^1[3-9]\d{9}$/) })
        .parse(req.body);
      res.json(store.lookup(input.orderNo, input.phone));
    }),
  );
  app.post(
    '/api/bookings/cancel',
    rateLimit('cancel', 15, 900000),
    route((req, res) => {
      const input = z
        .object({ orderNo: text(40).min(10), phone: z.string().regex(/^1[3-9]\d{9}$/) })
        .parse(req.body);
      res.json(store.customerCancel(input.orderNo, input.phone));
    }),
  );
  app.post(
    '/api/admin/login',
    rateLimit('login', 10, 900000),
    route((req, res) => {
      const input = z
        .object({ username: text(60).min(1), password: z.string().min(1).max(200) })
        .parse(req.body);
      const token = store.authenticate(input.username, input.password);
      res.cookie('hs_session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: Boolean(options.secureCookie),
        maxAge: 8 * 3600000,
        path: '/api',
      });
      res.json({ username: input.username });
    }),
  );
  app.get('/api/admin/session', admin, (_req, res) => res.json(res.locals.admin));
  app.post(
    '/api/admin/logout',
    admin,
    route((req, res) => {
      store.logout(cookieToken(req));
      res.clearCookie('hs_session', {
        httpOnly: true,
        sameSite: 'strict',
        secure: Boolean(options.secureCookie),
        path: '/api',
      });
      res.json({ ok: true });
    }),
  );
  app.use('/api/admin', admin);
  app.get(
    '/api/admin/dashboard',
    route((_req, res) => res.json(store.dashboard())),
  );
  app.get(
    '/api/admin/garments',
    route((_req, res) => res.json({ garments: store.inventory() })),
  );
  app.get(
    '/api/admin/schedule',
    route((req, res) => {
      const start = date.parse(req.query.start || store.today());
      const count = z.coerce
        .number()
        .int()
        .refine((n) => n === 7 || n === 14)
        .parse(req.query.days || 7);
      if (start < addDays(store.today(), -365) || start > addDays(store.today(), 365))
        throw new AppError(400, '请选择前后一年内的排期');
      const dates = Array.from({ length: count }, (_, i) => addDays(start, i));
      const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
      const rows = store.inventory().map((garment) => {
        const days = months.flatMap((month) => store.calendar(garment.id, month, true));
        return { garment, days: dates.map((date) => days.find((day) => day.date === date)!) };
      });
      res.json({ dates, rows });
    }),
  );
  app.post(
    '/api/admin/garments',
    route((req, res) => res.status(201).json(store.addGarment(garmentSchema.parse(req.body)))),
  );
  app.put(
    '/api/admin/garments/:id',
    route((req, res) =>
      res.json(store.updateGarment(String(req.params.id), garmentSchema.parse(req.body))),
    ),
  );
  app.post(
    '/api/admin/garments/:id/action',
    route((req, res) => {
      const input = z
        .object({
          action: z.enum(['clean', 'maintain', 'release', 'cleaning-date']),
          until: date.optional(),
        })
        .parse(req.body);
      res.json(store.garmentAction(String(req.params.id), input.action, input.until));
    }),
  );
  app.get(
    '/api/admin/bookings',
    route((_req, res) => res.json({ bookings: store.listBookings() })),
  );
  app.get(
    '/api/admin/bookings/:id',
    route((req, res) => res.json(store.getBooking(String(req.params.id)))),
  );
  app.post(
    '/api/admin/bookings',
    route((req, res) =>
      res.status(201).json(store.createBooking(bookingSchema.parse(req.body), 'store')),
    ),
  );
  app.post(
    '/api/admin/bookings/:id/action',
    route((req, res) => {
      const input = z
        .object({
          action: z.enum(['confirm', 'cancel', 'pickup', 'return', 'complete', 'extend']),
          endDate: date.optional(),
          reason: text(500).optional(),
          inspection: text(1000).optional(),
          accessoriesChecked: z.boolean().optional(),
        })
        .parse(req.body);
      res.json(store.updateBooking(String(req.params.id), input.action, input));
    }),
  );
  app.post(
    '/api/admin/bookings/:id/payments',
    route((req, res) => {
      const input = z
        .object({
          kind: z.enum(['rent', 'rent_refund', 'deposit', 'deposit_refund', 'deposit_deduction']),
          amount: z.number().int().positive().max(100000000),
          method: z.enum(['微信', '支付宝', '现金', '银行转账', '其他']),
          note: text(500).default(''),
        })
        .parse(req.body);
      res.status(201).json(store.recordPayment(String(req.params.id), input));
    }),
  );
  app.get(
    '/api/admin/settings',
    route((_req, res) => res.json(store.getSettings())),
  );
  app.put(
    '/api/admin/settings',
    route((req, res) => res.json(store.updateSettings(settingsSchema.parse(req.body)))),
  );
  app.get(
    '/api/admin/finance',
    route((_req, res) => res.json(store.finance())),
  );
  app.get(
    '/api/admin/audit',
    route((_req, res) => res.json({ entries: store.audit() })),
  );
  mkdirSync(options.uploadDir, { recursive: true });
  app.post(
    '/api/admin/uploads',
    rateLimit('upload', 50, 3600000),
    route((req, res) => {
      const input = z.object({ data: z.string().max(7500000) }).parse(req.body);
      const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(input.data);
      if (!match) throw new AppError(400, '仅支持 JPG、PNG、WebP 实拍图片');
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.length > 5 * 1024 * 1024 || bytes.length < 12)
        throw new AppError(400, '图片需小于 5 MB，且为有效图片');
      const format = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
        ? 'jpeg'
        : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'png'
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : '';
      if (format !== match[1]) throw new AppError(400, '图片内容与格式不符');
      const filename = randomUUID() + '.' + (format === 'jpeg' ? 'jpg' : format);
      writeFileSync(resolve(options.uploadDir, filename), bytes, { mode: 0o644, flag: 'wx' });
      res.status(201).json({ url: '/uploads/' + filename });
    }),
  );
  app.use(
    '/uploads',
    express.static(options.uploadDir, { dotfiles: 'deny', maxAge: '7d', index: false }),
  );
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues[0]?.message || '请检查输入内容' });
        return;
      }
      if (error instanceof AppError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        res.status(400).json({ error: '请求内容格式不正确' });
        return;
      }
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed: garments.sku')
      ) {
        res.status(409).json({ error: '该服装编号已存在，请换一个独立编号' });
        return;
      }
      if (typeof error === 'object' && error && 'status' in error && error.status === 413) {
        res.status(413).json({ error: '上传内容过大，请使用小于 5 MB 的图片' });
        return;
      }
      console.error('请求处理失败', error instanceof Error ? error.message : 'unknown');
      res.status(500).json({ error: '服务暂时不可用，请稍后再试' });
    },
  );
  return app;
}
