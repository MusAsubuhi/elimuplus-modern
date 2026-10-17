#!/bin/sh
# Starts a fresh demo server (state lives in memory), runs the impact end-to-end test, stops the server.
cd "$(dirname "$0")/.."
PORT=${PORT:-3100}
FORMS_WEBHOOK_SECRET=test-secret env -u DATABASE_URL npx next start -p $PORT > /tmp/e2e-impact-server.log 2>&1 &
sleep 7
BASE=http://localhost:$PORT node scripts/e2e-impact.mjs
code=$?
kill $(ps -eo pid,args | grep "next-server" | grep -v grep | awk '{print $1}') 2>/dev/null
exit $code
