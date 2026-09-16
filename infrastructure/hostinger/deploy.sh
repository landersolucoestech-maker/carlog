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
  nginx -t
  systemctl reload nginx
fi

echo "Car Log deployed from dev at commit $local_head"
