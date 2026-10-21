#!/bin/sh
# 只读检查：不会安装软件、修改配置、重启服务或更改防火墙。
set -eu
printf '\n系统与架构\n'
uname -m
cat /etc/os-release
printf '\n可用内存\n'
free -m
printf '\n磁盘空间\n'
df -h /
printf '\n监听端口\n'
ss -lnt
printf '\n容器运行环境\n'
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version || true
  if docker info >/dev/null 2>&1; then
    docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
  else
    printf '当前账号无法访问 Docker，请由有权限的账号补查容器状态。\n'
  fi
else
  printf '尚未安装 Docker。\n'
fi
printf '\n反向代理\n'
for service in nginx caddy apache2; do
  if command -v systemctl >/dev/null 2>&1; then
    printf '%s: ' "$service"
    systemctl is-active "$service" || true
  fi
done
