#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

branch="$(git branch --show-current)"
if [[ "$branch" != "dev" ]]; then
  echo "Deployment is only allowed from dev. Current branch: $branch" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before deployment." >&2
  exit 1
fi

git fetch --prune origin
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse origin/dev)"
if [[ "$local_head" != "$remote_head" ]]; then
  git pull --ff-only origin dev
fi

local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse origin/dev)"
if [[ "$local_head" != "$remote_head" ]]; then
  echo "HEAD must match origin/dev before deployment." >&2
  exit 1
fi

if [[ ! -f .env.production ]]; then
  echo ".env.production is required on the Hostinger VPS and must never be committed." >&2
  exit 1
fi

set -a
source .env.production
set +a

for name in ADMIN_URL API_URL NEXT_PUBLIC_API_URL CARLOG_TLS_CERT_NAME; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required production environment variable: $name" >&2
    exit 1
  fi
done

for url_name in ADMIN_URL API_URL NEXT_PUBLIC_API_URL; do
  value="${!url_name}"
  if [[ "$value" =~ carlogconnection[.]com ]]; then
    echo "$url_name uses the deprecated hostname and is not allowed." >&2
    exit 1
  fi
done

host_from_url() {
  local value="$1"
  value="${value#*://}"
  value="${value%%/*}"
  value="${value%%:*}"
  if [[ ! "$value" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "Invalid hostname derived from URL: $1" >&2
    exit 1
  fi
  printf '%s' "$value"
}

admin_host="$(host_from_url "$ADMIN_URL")"
api_host="$(host_from_url "$API_URL")"
if [[ ! "$CARLOG_TLS_CERT_NAME" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "CARLOG_TLS_CERT_NAME contains unsupported characters." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker with the Compose plugin is required on the Hostinger VPS." >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME=carlog-os

"$ROOT_DIR/infrastructure/hostinger/apply-migrations.sh"

docker compose -f infrastructure/docker/compose.production.yml build --pull
docker compose -f infrastructure/docker/compose.production.yml up -d --remove-orphans

for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:4000/health >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "API health check failed after deployment." >&2
    docker compose -f infrastructure/docker/compose.production.yml ps
    exit 1
  fi
  sleep 2
done

curl --fail --silent http://127.0.0.1:3001/ >/dev/null

if command -v nginx >/dev/null 2>&1; then
  privilege=()
  if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
    if ! command -v sudo >/dev/null 2>&1; then
      echo "Nginx is installed but root privileges or sudo are required to update its configuration." >&2
      exit 1
    fi
    privilege=(sudo)
  fi

  cert_dir="/etc/letsencrypt/live/$CARLOG_TLS_CERT_NAME"
  if [[ ! -f "$cert_dir/fullchain.pem" || ! -f "$cert_dir/privkey.pem" ]]; then
    echo "TLS certificate is missing for CARLOG_TLS_CERT_NAME=$CARLOG_TLS_CERT_NAME." >&2
    exit 1
  fi

  rendered_config="$(mktemp)"
  trap 'rm -f "$rendered_config"' EXIT
  sed \
    -e "s/__ADMIN_HOST__/$admin_host/g" \
    -e "s/__API_HOST__/$api_host/g" \
    -e "s/__TLS_CERT_NAME__/$CARLOG_TLS_CERT_NAME/g" \
    infrastructure/nginx/carlog-os.conf > "$rendered_config"

  if [[ -d /etc/nginx/sites-available ]]; then
    "${privilege[@]}" install -m 0644 "$rendered_config" /etc/nginx/sites-available/carlog-os.conf
    "${privilege[@]}" ln -sfn /etc/nginx/sites-available/carlog-os.conf /etc/nginx/sites-enabled/carlog-os.conf
  else
    "${privilege[@]}" install -m 0644 "$rendered_config" /etc/nginx/conf.d/carlog-os.conf
  fi

  "${privilege[@]}" nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    "${privilege[@]}" systemctl reload nginx
  else
    "${privilege[@]}" nginx -s reload
  fi
fi

echo "Car Log OS deployed from dev at commit $local_head"
