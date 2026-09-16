#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/supabase/migrations"

command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 1; }

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
create table if not exists public.carlog_schema_migrations (
  filename text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
SQL

while IFS= read -r migration; do
  filename="$(basename "$migration")"
  checksum="$(sha256sum "$migration" | awk '{print $1}')"
  existing="$(psql "$DATABASE_URL" -Atqc "select checksum from public.carlog_schema_migrations where filename = '$filename'")"
  if [[ -n "$existing" ]]; then
    if [[ "$existing" != "$checksum" ]]; then
      echo "Applied migration changed: $filename" >&2
      exit 1
    fi
    echo "Migration already applied: $filename"
    continue
  fi
  echo "Applying migration: $filename"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "insert into public.carlog_schema_migrations(filename,checksum) values ('$filename','$checksum')"
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sort)
