#!/bin/sh
# 仅在服务器代码目录内创建新的生产配置，绝不覆盖已有 .env。
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ -e .env ]; then
  printf '已有 .env，保留原配置；如需修改请手动编辑。\n'
  exit 1
fi
command -v openssl >/dev/null 2>&1 || { printf '缺少 openssl，无法生成随机密码。\n'; exit 1; }
umask 077
set -C
{
  printf 'DOMAIN=huashanjie.top\nADMIN_USERNAME=admin\nADMIN_PASSWORD='
  openssl rand -hex 24
  printf 'APP_BIND_PORT=3300\n'
} > .env
printf '已创建仅当前用户可读写的 .env，生成了新的生产管理员密码。\n'
printf '请在服务器本地查看并保存密码，不要将 .env 提交到 GitHub。\n'
