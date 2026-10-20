#!/usr/bin/env bash
set -e
PORT=${PORT:-3100}
env -u DATABASE_URL npx next start -p $PORT > /tmp/e2e-book-server.log 2>&1 &
SERVER=$!
trap "kill $SERVER 2>/dev/null" EXIT
for i in $(seq 1 40); do curl -sf http://localhost:$PORT/portal/login >/dev/null && break; sleep 1; done
BASE=http://localhost:$PORT node scripts/e2e-book.mjs
