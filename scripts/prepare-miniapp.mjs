import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const name of ['config.js', 'project.config.json']) {
  const destination = fileURLToPath(new URL(`../miniapp/${name}`, import.meta.url));
  const example = destination.replace(/(\.[^.]+)$/, '.example$1');
  if (!existsSync(destination)) copyFileSync(example, destination);
}
console.log('小程序本地配置已准备好，已有配置保持不变。请在微信开发者工具中导入 miniapp 目录。');
