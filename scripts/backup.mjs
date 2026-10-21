import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, cpSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';

const source = resolve(process.env.DATABASE_PATH || './data/huashanjie.sqlite');
if (!existsSync(source)) throw new Error('数据库尚不存在，请先启动网站。');
const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const folder = resolve(process.env.BACKUP_DIR || './data/backups', timestamp);
mkdirSync(folder, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(source);
try {
  db.prepare('VACUUM INTO ?').run(join(folder, 'huashanjie.sqlite'));
  const uploads = resolve(process.env.UPLOAD_DIR || './data/uploads');
  if (existsSync(uploads))
    cpSync(uploads, join(folder, 'uploads'), { recursive: true, errorOnExist: true });
  console.log(`备份完成：${folder}`);
  console.log('包含数据库与服装实拍。请将备份另存到不同磁盘或对象存储。');
} catch (error) {
  rmSync(folder, { recursive: true, force: true });
  throw error;
} finally {
  db.close();
}
