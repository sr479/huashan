#!/bin/sh
# 从已发布的版本标签部署；shared 模式沿用已有反向代理。
set -eu
version=${1:-}
mode=${2:-}
prebuilt=${3:-}
if ! printf '%s\n' "$version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  printf '用法：sh deploy/release.sh v1.0.0 shared|standalone\n'
  exit 1
fi
case "$mode" in shared|standalone) ;; *) printf '必须明确选择 shared 或 standalone 模式。\n'; exit 1 ;; esac
case "$prebuilt" in ''|--prebuilt) ;; *) printf '第三个参数仅支持 --prebuilt。\n'; exit 1 ;; esac
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
command -v flock >/dev/null 2>&1 || { printf '需要 Linux flock 命令。\n'; exit 1; }
exec 9>.git/huashanjie-deploy.lock
flock -n 9 || { printf '另一个部署正在进行。\n'; exit 1; }
[ -f .env ] || { printf '请先运行 sh deploy/configure.sh。\n'; exit 1; }
if [ -n "$(git status --porcelain)" ]; then
  printf '代码目录有未提交修改，请先处理；不会覆盖本地修改。\n'
  exit 1
fi
compose() {
  if [ "$mode" = shared ]; then
    docker compose -f compose.yaml -f deploy/compose.shared.yaml "$@"
  else
    docker compose -f compose.yaml "$@"
  fi
}
docker compose version
git fetch --prune --tags origin
target=$(git rev-parse --verify "refs/tags/$version^{commit}")
previous=$(git rev-parse HEAD)
export APP_IMAGE_TAG="$version"
if [ "$prebuilt" = --prebuilt ]; then
  revision=$(docker image inspect "huashanjie:$version" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')
  [ "$revision" = "$target" ] || { printf '预构建镜像与版本标签不匹配，停止部署。\n'; exit 1; }
fi
compose config --quiet
if [ -n "$(compose ps --status running --quiet app)" ]; then
  printf '备份正在运行的花山节数据库与实拍。\n'
  compose exec -T app npm run backup
fi
git switch --detach "$target"
printf '构建版本 %s，之前的代码版本为 %s。\n' "$version" "$previous"
if [ "$prebuilt" != --prebuilt ]; then
  compose build --pull --build-arg "VCS_REF=$target" app
fi
if [ "$mode" = shared ]; then
  compose up -d --no-build --wait --wait-timeout 120 app
else
  compose up -d --no-build --wait --wait-timeout 120
fi
compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
umask 077
config_tmp=$(mktemp .env.image.XXXXXX)
awk -v tag="$version" '!/^APP_IMAGE_TAG=/ { print } END { print "APP_IMAGE_TAG=" tag }' .env > "$config_tmp"
chmod 600 "$config_tmp"
mv "$config_tmp" .env
printf '版本 %s 的容器健康检查通过。请继续核对 HTTPS、后台登录和完整租赁流程。\n' "$version"
