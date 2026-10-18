import { asAdmin } from '@/lib/db';
import { requireFeature, featureLevel } from '@/lib/access';
import { sequenceOn } from '@/lib/newsletter';
import { Badge, Card, PageHeader, inputCls, submitCls , ViewOnly } from '@/components/ui';
import { saveLetter, deleteLetter, moveLetter, testLetter, toggleSequence } from '../../ops-actions';

export const dynamic = 'force-dynamic';
const ghost = 'rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal';

export default async function Letters() {
  const me = await requireFeature('newsletter');
  const view = (await featureLevel(me, 'newsletter')) !== 'edit';
  const letters = await asAdmin((q) => q('select * from newsletter_letters order by position, created_at'));
  const on = await sequenceOn();
  return (
    <>
      <PageHeader title="Weekly letters" subtitle="Each new subscriber receives these one a week, in this order, starting a week after their welcome email." />
      <ViewOnly view={view}>
      <Card title="Sequence" className="mb-6">
        <p className="text-sm text-slate-700">Status: <b>{on ? 'ON' : 'OFF'}</b>. {letters.length} letter{letters.length === 1 ? '' : 's'}. After the last letter a subscriber stops receiving the sequence, so keep adding. The sequence skips any day a Brevo campaign goes out.</p>
        <form action={toggleSequence} className="mt-3"><input type="hidden" name="back" value="/portal/newsletter" /><button className={ghost}>{on ? 'Switch weekly letters off' : 'Switch weekly letters on'}</button></form>
      </Card>
      <Card title="How to format a letter" subtitle="Write plain text; these little codes turn into pictures, buttons and links, the same look as the Brevo newsletter." className="mb-6">
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#F5FAF8] p-3 text-xs leading-relaxed text-slate-700">{`A blank line starts a new paragraph.

## A section heading

![Caption under the picture](https://elimuplus.com/images/home-canvas-hands.jpg)
   (a picture on its own; the first one at the top becomes the banner)

Words in **bold** and a [live link](https://elimuplus.com/calculator.html).

- A bullet point
- Another bullet point

[button: Register your organisation](https://elimuplus.com/join.html)
[button2: Become a trainer](https://elimuplus.com/trainer.html)
   (buttons on neighbouring lines sit side by side; use [gold: ...] for a gold one)

stat: 8 of 10 | businesses confirmed operating
stat: 5 of 10 | women reporting rising income
   (up to three number cards in a row)

> Box title
> A line of text inside the dark box
> [gold: Button inside the box](https://elimuplus.com/calculator.html)`}</pre>
        <p className="mt-3 text-xs text-slate-600">Pictures must be public web addresses. Anything already on the website works, for example https://elimuplus.com/images/ followed by home-canvas-hands.jpg, home-follow-up-visit.jpg, programme-mwanahamisi.jpg, programme-adult-session.jpg, partner-church-hall.jpg or trainer-coaching.jpg. Links back to elimuplus.com are tagged automatically so you can see the clicks in analytics. The test button shows exactly how it will look.</p>
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
      </ViewOnly>
    </>
  );
}
