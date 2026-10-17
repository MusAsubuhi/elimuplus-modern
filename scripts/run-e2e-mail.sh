#!/bin/sh
cd "$(dirname "$0")/.."
RESEND_API_KEY=test-key RESEND_API_URL=http://localhost:3199/emails env -u DATABASE_URL npx next start -p 3100 > /tmp/e2e-mail-server.log 2>&1 &
sleep 7
node scripts/e2e-mail.mjs
code=$?
kill $(ps -eo pid,args | grep "next-server" | grep -v grep | awk '{print $1}') 2>/dev/null
exit $code
