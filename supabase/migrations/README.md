# Migrations

Number files in order (`0029_name.sql`) and keep each safe to run twice.

**Grants are part of the migration.** From 30 October 2026 Supabase no longer grants Data API access to new tables in `public`.
Every table or view a migration creates must also be granted in the same file, for example:

    grant select, insert, update, delete on public.your_table to authenticated;

The portal reads and writes through the server connection as the `authenticated` role (row level security decides the rows), so
`authenticated` is the grant that matters. Only add `anon` or `service_role` grants for a table that really is called through the
Data API by those roles; nothing in the portal needs them today.

`node scripts/check-grants.mjs` (part of `npm run db:test`) fails when a migration creates a table or view that is never granted.
