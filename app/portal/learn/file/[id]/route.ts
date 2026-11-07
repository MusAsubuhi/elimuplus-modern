import { getMe } from '@/lib/session';
import { asUser } from '@/lib/db';
import { loadBytes } from '@/lib/learning';

export const dynamic = 'force-dynamic';

/**
 * The PDF bytes for the in-portal reader. The row is read as the signed-in person, so the database decides whether they may see it.
 * There is no public link to the file: it can only be fetched from here, with a valid sign-in.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return new Response('Please sign in.', { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response('Not found.', { status: 404 });
  const row = (await asUser(me.id, (q) => q("select storage_path from learning_resources where id=$1 and kind='pdf'", [id])).catch(() => []))[0];
  if (!row?.storage_path) return new Response('Not found.', { status: 404 });
  const bytes = await loadBytes(row.storage_path);
  if (!bytes) return new Response('Not found.', { status: 404 });
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    },
  });
}
