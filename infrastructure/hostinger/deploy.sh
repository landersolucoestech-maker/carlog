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

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker with the Compose plugin is required on the Hostinger VPS." >&2
  exit 1
fi

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

curl --fail --silent http://127.0.0.1:3000/ >/dev/null
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

  if [[ ! -f /etc/letsencrypt/live/carlogconnection.com/fullchain.pem || ! -f /etc/letsencrypt/live/carlogconnection.com/privkey.pem ]]; then
    echo "TLS certificate for carlogconnection.com is missing. Provision Let's Encrypt before enabling the HTTPS proxy." >&2
    exit 1
  fi

  if [[ -d /etc/nginx/sites-available ]]; then
    "${privilege[@]}" install -m 0644 infrastructure/nginx/carlog.conf /etc/nginx/sites-available/carlog.conf
    "${privilege[@]}" ln -sfn /etc/nginx/sites-available/carlog.conf /etc/nginx/sites-enabled/carlog.conf
  else
    "${privilege[@]}" install -m 0644 infrastructure/nginx/carlog.conf /etc/nginx/conf.d/carlog.conf
  fi

  "${privilege[@]}" nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    "${privilege[@]}" systemctl reload nginx
  else
    "${privilege[@]}" nginx -s reload
  fi
fi

echo "Car Log deployed from dev at commit $local_head"
