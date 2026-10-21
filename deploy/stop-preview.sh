#!/bin/sh
# 供独立 systemd 定时任务调用；到期停止测试应用并撤下专用入口，保留测试数据。
set -eu
[ "$(id -u)" = 0 ] || { printf '请以 root 身份关闭服务器测试环境。\n'; exit 1; }
cd /opt/huashanjie-preview
status=0
docker compose --env-file .env -f compose.yaml stop app || status=1
link=/etc/nginx/sites-enabled/huashanjie-preview
if [ -L "$link" ] && [ "$(readlink -f "$link")" = /etc/nginx/sites-available/huashanjie-preview ]; then
  unlink "$link"
  if /usr/sbin/nginx -t; then
    /usr/bin/systemctl reload nginx || status=1
  else
    status=1
  fi
fi
[ "$status" = 0 ] || { printf '关闭测试环境时出现错误，请核对容器和专用 Nginx 入口。\n'; exit "$status"; }
printf '临时测试入口已关闭，测试数据库与实拍仍保留。\n'
