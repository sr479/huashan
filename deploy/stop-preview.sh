#!/bin/sh
# 供独立 systemd 定时任务调用；到期停止测试应用并撤下专用入口，保留测试数据。
set -eu
[ "$(id -u)" = 0 ] || { printf '请以 root 身份关闭服务器测试环境。\n'; exit 1; }
cd /opt/huashanjie-preview
docker compose --env-file .env -f compose.yaml stop app
link=/etc/nginx/sites-enabled/huashanjie-preview
if [ -L "$link" ] && [ "$(readlink -f "$link")" = /etc/nginx/sites-available/huashanjie-preview ]; then
  unlink "$link"
  /usr/sbin/nginx -t
  /usr/bin/systemctl reload nginx
fi
printf '临时测试入口已关闭，测试数据库与实拍仍保留。\n'
