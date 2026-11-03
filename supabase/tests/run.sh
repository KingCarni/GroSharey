#!/usr/bin/env bash
# Runs the GroSharey migrations plus the subscription/entitlement regression suite against a
# throwaway PostgreSQL container. Requires Docker; no Supabase project is touched.
#
#   bash supabase/tests/run.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
container="grosharey-pgtest-$$"
image="postgres:15-alpine"

cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> starting $image"
docker run -d --name "$container" -e POSTGRES_PASSWORD=postgres "$image" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$container" pg_isready -U postgres >/dev/null

psql_run() {
  docker exec -i -e PGPASSWORD=postgres "$container" \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres -q -f - < "$1"
}

echo "==> platform stubs"
psql_run "$here/00_platform_stubs.sql"

echo "==> migrations"
for migration in "$repo"/supabase/migrations/*.sql; do
  name="$(basename "$migration")"
  # pg_cron/pg_net are Supabase-managed extensions and are not available in plain PostgreSQL.
  if [[ "$name" == *receipt_processor_cron* ]]; then
    echo "    skip $name (pg_cron/pg_net not available locally)"
    continue
  fi
  # BASELINE=1 stops before the QA hardening migration, to demonstrate that the suite
  # actually catches the defects it was written for.
  if [[ "${BASELINE:-0}" == "1" && "$name" == *subscription_entitlement_hardening* ]]; then
    echo "    skip $name (BASELINE=1)"
    continue
  fi
  echo "    apply $name"
  psql_run "$migration"
done

echo "==> client grants"
psql_run "$here/01_platform_grants.sql"

echo "==> entitlement regression suite"
psql_run "${SUITE:-$here/02_subscription_entitlements.sql}"

echo "==> OK"
