import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  const password = randomBytes(18).toString('base64url');
  writeFileSync(
    '.env',
    `HOST=127.0.0.1\nPORT=3000\nAPP_ORIGIN=http://127.0.0.1:3000,http://localhost:3000\nADMIN_USERNAME=admin\nADMIN_PASSWORD=${password}\nDATABASE_PATH=./data/huashanjie.sqlite\nUPLOAD_DIR=./data/uploads\nSEED_DEMO=true\nCOOKIE_SECURE=false\nTRUST_PROXY=false\n`,
    { mode: 0o600, flag: 'wx' },
  );
  console.log('已生成 .env。本地管理员账号和随机密码保存在该文件，请妥善保存。');
} else console.log('.env 已存在，保留现有配置。');
mkdirSync('data/uploads', { recursive: true });
console.log('准备完成。运行 npm run dev，然后访问 http://127.0.0.1:3000。');
