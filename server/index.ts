import { resolve } from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import express from 'express';
import { createStore } from './store.js';
import { createApp } from './app.js';

const production = process.env.NODE_ENV === 'production';
const password = process.env.ADMIN_PASSWORD || '';
if (password.length < 12 || /请(运行|替换)/.test(password))
  throw new Error('请先执行 npm run setup，配置至少 12 位的 ADMIN_PASSWORD。');
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || '127.0.0.1';
const origins = (process.env.APP_ORIGIN || `http://127.0.0.1:${port},http://localhost:${port}`)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (production && !process.env.APP_ORIGIN) throw new Error('生产环境必须明确设置 APP_ORIGIN。');
const store = createStore({
  path: resolve(process.env.DATABASE_PATH || './data/huashanjie.sqlite'),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: password,
  seedDemo: process.env.SEED_DEMO === 'true',
});
const app = createApp({
  store,
  uploadDir: resolve(process.env.UPLOAD_DIR || './data/uploads'),
  origins,
  production,
  secureCookie: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
});
const server = createHttpServer(app);
let vite: Awaited<ReturnType<(typeof import('vite'))['createServer']>> | undefined;
if (!production) {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  const client = resolve('dist/client');
  app.use(express.static(client, { index: false, maxAge: '1h' }));
  app.get(/.*/, (_req, res) => res.sendFile(resolve(client, 'index.html')));
}
server.listen(port, host, () =>
  console.log(
    `花山节已启动：http://${host}:${port}\n管理后台：http://${host}:${port}/admin\n管理员账号及密码读取 .env 配置。`,
  ),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  await vite?.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.close();
  clearTimeout(timeout);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
