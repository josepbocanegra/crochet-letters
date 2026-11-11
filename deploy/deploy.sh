#!/usr/bin/env bash
# Idempotent deploy of crochet-letters (a Vite SPA) to an nginx host.
#
#   ./deploy/deploy.sh                # tests + build + rsync + nginx reload
#   SKIP_BUILD=1 ./deploy/deploy.sh   # push an existing dist/ only
#
# Everything host-specific lives in deploy.env, which is git-ignored:
#
#   cp deploy/deploy.env.example deploy/deploy.env   # then edit it
#
# The same names exported in the environment win over the file.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="${REPO:-$(cd "$HERE/.." && pwd)}"

# shellcheck disable=SC1091
[[ -f "$HERE/deploy.env" ]] && . "$HERE/deploy.env"

: "${CT_HOST:?no CT_HOST — copy deploy/deploy.env.example to deploy/deploy.env and fill it in}"
CT_USER="${CT_USER:-root}"
KEY="${KEY:-$HOME/.ssh/id_rsa}"
WEBROOT="${WEBROOT:-/var/www/crochet-letters}"
SITE="${SITE:-crochet-letters}"
SERVER_NAME="${SERVER_NAME:-_}"
TARGET="$CT_USER@$CT_HOST"
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i "$KEY")
SCP=(scp -q -o BatchMode=yes -o StrictHostKeyChecking=accept-new -i "$KEY")

log() { printf '\n=== %s ===\n' "$*"; }

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  log "Tests"
  ( cd "$REPO" && npm test )
  log "Build"
  ( cd "$REPO" && npm ci --no-audit --no-fund && npm run build )
fi

[[ -f "$REPO/dist/index.html" ]] || { echo "FAIL: $REPO/dist/index.html not found" >&2; exit 1; }

log "Packages on $TARGET"
"${SSH[@]}" "$TARGET" "set -e
  need=''
  command -v nginx >/dev/null || need=\"\$need nginx\"
  command -v rsync >/dev/null || need=\"\$need rsync\"
  if [ -n \"\$need\" ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq \$need
  fi
  mkdir -p '$WEBROOT'
  nginx -v 2>&1; rsync --version | head -1"

log "Sync dist/ -> $WEBROOT"
rsync -az --delete -e "${SSH[*]}" "$REPO/dist/" "$TARGET:$WEBROOT/"

log "Install vhost"
rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT
sed -e "s|__SERVER_NAME__|$SERVER_NAME|g" -e "s|__WEBROOT__|$WEBROOT|g" \
  "$HERE/nginx-site.conf" > "$rendered"
"${SCP[@]}" "$rendered" "$TARGET:/etc/nginx/sites-available/$SITE"
"${SSH[@]}" "$TARGET" "set -e
  ln -sf /etc/nginx/sites-available/$SITE /etc/nginx/sites-enabled/$SITE
  rm -f /etc/nginx/sites-enabled/default
  nginx -t"

log "Reload nginx"
"${SSH[@]}" "$TARGET" 'systemctl enable --now nginx >/dev/null 2>&1; systemctl reload nginx; systemctl is-active nginx'

log "Verify over HTTP"
code=$(curl -s -o /dev/null -w '%{http_code}' "http://$CT_HOST/")
echo "GET http://$CT_HOST/ -> $code"
[[ "$code" == "200" ]] || { echo "FAIL: HTTP $code" >&2; exit 1; }

log "OK: http://$CT_HOST/ is serving crochet-letters"
