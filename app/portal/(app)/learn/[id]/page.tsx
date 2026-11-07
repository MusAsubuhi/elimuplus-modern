import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, submitCls } from '@/components/ui';
import PdfReader from '@/components/pdf-reader';
import { KIND_LABEL, TOPICS, embedUrl, type Resource } from '@/lib/learning';
import { d } from '@/lib/format';
import { setCompletion } from '../../../learn-actions';

export default async function LearnItem({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireMe();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [r, done] = await asUser(me.id, async (q) => [
    ((await q('select * from learning_resources where id=$1', [id]))[0] ?? null) as Resource | null,
    (await q('select 1 from learning_completions where resource_id=$1 and person_id=$2', [id, me.id])).length > 0,
  ]);
  if (!r) notFound();
  const embed = r.url ? embedUrl(r.url) : null;
  return (
    <div>
      <p className="mb-3 text-sm"><Link href="/portal/learn" className="font-bold text-teal underline">← Learning center</Link></p>
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-teal">{r.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Badge tone="grey">{KIND_LABEL[r.kind]}</Badge><Badge tone="blue">{TOPICS[r.topic] ?? r.topic}</Badge>
          {r.required && <Badge tone="gold">Required{r.due_on ? ` by ${d(r.due_on)}` : ''}</Badge>}
          {r.status !== 'published' && <Badge tone="red">{r.status}: founders only</Badge>}
        </div>
        {r.description && <p className="mt-2 max-w-3xl text-sm text-slate-700">{r.description}</p>}
      </div>
      {r.kind === 'pdf' ? (
        <PdfReader src={`/portal/learn/file/${r.id}`} id={r.id} title={r.title} watermark={`${me.displayName} · Elimu+`} initialDone={done} required={r.required} />
      ) : (
        <Card>
          {embed ? <div className="aspect-video w-full overflow-hidden rounded-lg bg-black"><iframe src={embed} title={r.title} className="h-full w-full" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /></div>
            : <p className="text-sm text-slate-700">This opens on another website, in a new tab.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a href={r.url!} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-gold px-4 py-2 text-sm font-bold text-teal">{embed ? 'Open in a new tab' : 'Open the link'}</a>
            <form action={setCompletion} className="flex items-center gap-2">
              <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={`/portal/learn/${r.id}`} />
              {done ? <><Badge tone="green">Done ✓</Badge><button name="done" value="no" className="text-xs text-slate-500 underline">Undo</button></>
                : <button name="done" value="yes" className={submitCls}>{r.kind === 'video' ? 'I have watched this' : 'I have read this'}</button>}
            </form>
          </div>
        </Card>
      )}
    </div>
  );
}
