import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { sequenceOn } from '@/lib/newsletter';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import { saveLetter, deleteLetter, moveLetter, testLetter, toggleSequence } from '../../ops-actions';

export const dynamic = 'force-dynamic';
const ghost = 'rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal';

export default async function Letters() {
  const me = await requireMe('founder');
  const letters = await asUser(me.id, (q) => q('select * from newsletter_letters order by position, created_at'));
  const on = await sequenceOn();
  return (
    <>
      <PageHeader title="Weekly letters" subtitle="Each new subscriber receives these one a week, in this order, starting a week after their welcome email." />
      <Card title="Sequence" className="mb-6">
        <p className="text-sm text-slate-700">Status: <b>{on ? 'ON' : 'OFF'}</b>. {letters.length} letter{letters.length === 1 ? '' : 's'}. After the last letter a subscriber stops receiving the sequence, so keep adding. The sequence skips any day a Brevo campaign goes out.</p>
        <form action={toggleSequence} className="mt-3"><button className={ghost}>{on ? 'Switch weekly letters off' : 'Switch weekly letters on'}</button></form>
      </Card>
      {letters.map((l: any, i: number) => (
        <Card key={l.id} title={`Letter ${i + 1}`} className="mb-4" action={<Badge tone="grey">{`week ${i + 1}`}</Badge>}>
          <form action={saveLetter} className="space-y-3">
            <input type="hidden" name="id" value={l.id} />
            <input name="subject" defaultValue={l.subject} required className={inputCls} />
            <textarea name="body" defaultValue={l.body} required rows={9} className={inputCls} />
            <div className="flex flex-wrap gap-2">
              <button className={submitCls}>Save</button>
              <button formAction={testLetter} className={ghost}>Send me a test</button>
              <button formAction={moveLetter} name="dir" value="up" disabled={i === 0} className={`${ghost} disabled:opacity-40`}>Move earlier</button>
              <button formAction={moveLetter} name="dir" value="down" disabled={i === letters.length - 1} className={`${ghost} disabled:opacity-40`}>Move later</button>
              <button formAction={deleteLetter} className="rounded-lg border border-[#C8553D] px-3 py-1.5 text-xs font-bold text-[#C8553D]">Delete</button>
            </div>
          </form>
        </Card>
      ))}
      <Card title="Add a letter" subtitle="It goes at the end of the sequence. Leave a blank line between paragraphs.">
        <form action={saveLetter} className="space-y-3">
          <input name="subject" required placeholder="Subject" className={inputCls} />
          <textarea name="body" required rows={8} placeholder="Write the letter here" className={inputCls} />
          <div className="flex gap-2"><button className={submitCls}>Add letter</button><button formAction={testLetter} className={ghost}>Send me a test</button></div>
        </form>
      </Card>
    </>
  );
}
