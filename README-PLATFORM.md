# Elimu+ platform (branch `platform`)

A Next.js portal that lives beside the existing static site. `npm run sync-static` copies the static pages, css, js and images into `public/`, so every current URL keeps working while `/portal` and `/verify/<certificate>` are served by the app.

## Run it
```
npm install
npm run dev      # http://localhost:3000/portal  (demo mode, in-memory database, no setup)
npm run db:test  # runs migrations + seed in PGlite and checks 129 who-can-see-what rules
```

## Demo mode vs real mode
* **No `DATABASE_URL`**: demo mode. The real migrations and seed run in an in-process Postgres (PGlite) with the same row level security, and you pick a persona on the login page. Data resets on restart. Safe for previews.
* **With `DATABASE_URL`** (+ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`): the app talks to Supabase Postgres, sign-in is phone + PIN (or email) through Supabase Auth, and the demo login is disabled. Apply `supabase/migrations/*.sql` in order. Do NOT load `supabase/seed.sql` into production; it is synthetic.

## Environment variables (real mode)
* `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: as above.
* `SUPABASE_SERVICE_ROLE_KEY`: server only, used solely to create and reset sign-ins through Supabase's Auth admin API (`src/lib/supabase-admin.ts`). Set it in Vercel's environment settings. Never prefix it with `NEXT_PUBLIC_` and never commit it.
* `npm run test:auth` unit-tests the sign-in provisioning with fakes; `npm run db:test` checks the who-can-see-what rules.

## Where things are
* `supabase/migrations`: schema, row level security (the actual enforcement), partner aggregate functions.
* `app/portal/(app)`: pages per role. `app/portal/actions.ts`: every write, each running under the signed-in person's rules.
* `src/lib/pathway.ts`: tier eligibility and maintenance rules from the Facilitator Certification Pathway.
* `scripts/test-rls.mjs`: permission tests. Run after any policy change.

## Not built yet
Online payments, SMS/email invitations, AI canvas review, bulk roster upload, PDF report generation, forums and competitions. The schema leaves room for each.
