#!/usr/bin/env bash
# All-in-one demo container entrypoint: start PostgreSQL, migrate, seed once,
# boot the API, then serve the web app in the foreground.
set -euo pipefail

echo "[demo] starting PostgreSQL…"
mkdir -p /run/postgresql && chown postgres:postgres /run/postgresql
service postgresql start

su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='mep'\" | grep -q 1" \
  || su postgres -c "psql -c \"CREATE USER mep WITH PASSWORD 'mep' CREATEDB\""
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='my_event_planner'\" | grep -q 1" \
  || su postgres -c "createdb -O mep my_event_planner"

cd /app/apps/api
echo "[demo] applying migrations…"
npx prisma migrate deploy

USERS=$(su postgres -c "psql -tAc 'SELECT count(*) FROM users' my_event_planner" 2>/dev/null || echo "0")
if [ "${SEED_DEMO:-true}" = "true" ] && [ "$USERS" = "0" ]; then
  echo "[demo] seeding demo dataset…"
  pnpm seed
fi

echo "[demo] starting API on :4000…"
# The all-in-one demo runs the API in development mode on purpose: the
# production fail-fast gate (assertProductionConfig) correctly refuses
# localhost origins, insecure cookies and console mail — which is exactly
# what a local evaluation deployment is. Real deployments must run
# NODE_ENV=production with proper values (see docs/DEPLOYMENT.md).
NODE_ENV=development node dist/main.js &

echo "[demo] starting web on :${PORT:-3000}…"
cd /app/apps/web/.next/standalone/apps/web
exec node server.js
