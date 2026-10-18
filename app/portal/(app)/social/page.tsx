import { asAdmin } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { Badge, Card, PageHeader, inputCls, submitCls } from '@/components/ui';
import { ANGLES, PLATFORMS, angleLabel } from '@/lib/social';
import { submitIdea, editMyIdea, saveDrafts, sendForApproval, approveIdea, returnIdea } from '../../social-actions';

export const dynamic = 'force-dynamic';
const ghost = 'rounded-lg border border-teal px-3 py-1.5 text-xs font-bold text-teal';
const TONE: Record<string, string> = { idea: 'grey', pending: 'gold', approved: 'green', posted: 'teal', returned: 'red' };
const LABEL: Record<string, string> = { idea: 'In the bank', pending: 'Awaiting approval', approved: 'Approved, ready to post', posted: 'Posted', returned: 'Returned to author' };

export default async function Social() {
  const me = await requireFeature('social');
  const isFounder = me.roles.includes('founder');
  const ideas = await asAdmin((q) => q(
    `select i.*, p.full_name author, (select coalesce(json_agg(a.person_id),'[]') from social_approvals a where a.idea_id=i.id) approvals
     from social_ideas i left join people p on p.id=i.author_id
     ${isFounder ? '' : 'where i.author_id = $1 or i.status = \'posted\''}
     order by i.created_at desc limit 100`, isFounder ? [] : [me.id]));
  const credit = (i: any) => [`Idea by ${String(i.author ?? 'the Elimu+ team').split(' ')[0]}, Elimu+`, i.partner_name ? `In partnership with ${i.partner_name}` : ''].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader title="Social ideas" subtitle="Our content is built by the whole team. Share a real idea; the founders turn it into posts, both approve, and you are credited." />
      <Card title="Not sure what to share? Examples of the four angles" subtitle="Write as much as you like, in your own words, in English or Swahili. Length does not matter: the founders adapt it for WhatsApp, Facebook, Instagram and LinkedIn." className="mb-6">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            ['Actionable', 'Here is how', 'Idea: How to work out your break-even before you sell anything.', 'Post: "Before you stock up, answer three questions. What does one item cost you to make or buy? What will you sell it for? What do you spend every month whether you sell or not? Divide the monthly cost by what is left on each item and you know how many you must sell just to break even. Try it for your own business this week."'],
            ['Analytical', 'Here is a breakdown', 'Idea: What our first adult cohort showed at 60 days (use only figures we have confirmed).', 'Post: "Of ten women in our first adult cohort, eight businesses were confirmed operating at 60 days. Early signals, not proof, and here is how we check them: we visit, call and ask at 30, 60 and 90 days."'],
            ['Aspirational', 'Yes, you can', 'Idea: A mistake I made when I started, and what it taught me.', 'Post: "[One real moment from you: what you tried, what went wrong, what you changed.] If you are starting small, you are in good company."'],
            ['Anthropological', 'Here is why', 'Idea: Why every Elimu+ lesson is built around one real omena seller in Likoni.', 'Post: "We do not teach with invented examples. When we learn pricing, we price her omena. When we map competition, we map her stall first. Real places teach better than case studies from somewhere else."'],
          ].map(([name, tag, idea, post]) => (
            <div key={name} className="rounded-lg border border-teal-100 p-3 text-sm">
              <p><b className="text-teal">{name}</b> <span className="text-xs text-slate-500">{tag}</span></p>
              <p className="mt-1 text-slate-700">{idea}</p>
              <p className="mt-2 italic text-slate-600">{post}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-600">These are only starting points. The best ideas come from something that really happened to you this week: a visit, a question a participant asked, a number that surprised you.</p>
      </Card>
      <Card title="Share an idea" subtitle="Start from something real: a visit, a person, a lesson, a number, a place. It should still be true and useful in two years." className="mb-6">
        <form action={submitIdea} className="space-y-3">
          <input name="title" required placeholder="The idea in one line, e.g. What Mwanahamisi taught us about pricing omena" className={inputCls} />
          <div className="grid gap-2 sm:grid-cols-2">
            {ANGLES.map((a, n) => (
              <label key={a.key} className="flex gap-2 rounded-lg border border-teal-100 p-3 text-sm">
                <input type="radio" name="angle" value={a.key} required defaultChecked={n === 0} className="mt-1" />
                <span><b className="text-teal">{a.label}</b><br /><span className="text-xs text-slate-600">{a.hint}</span></span>
              </label>
            ))}
          </div>
          <textarea name="material" required rows={5} placeholder="The real material: what happened, who said what, the number, the lesson. Write as much as you like; we adapt it for each platform." className={inputCls} />
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="partner_name" placeholder="Partner organisation (optional)" className={inputCls} />
            <input name="partner_logo_url" placeholder="Partner logo address, https:// (optional)" className={inputCls} />
            <input name="image_url" placeholder="Picture address, https:// (optional)" className={inputCls} />
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="consent" className="mt-1" /> Nobody is named, quoted or shown in a photo without their consent, and anyone under 18 has guardian consent.</label>
          <button className={submitCls}>Add to the bank</button>
        </form>
      </Card>

      {ideas.length === 0 && <p className="text-sm text-slate-500">No ideas yet. Be the first.</p>}
      {ideas.map((i: any) => {
        const d = i.drafts ?? {};
        const approved: string[] = i.approvals ?? [];
        const iApproved = approved.includes(me.id);
        return (
          <Card key={i.id} title={i.title} className="mb-4" action={<div className="flex gap-2"><Badge tone="grey">{angleLabel(i.angle)}</Badge><Badge tone={TONE[i.status]}>{LABEL[i.status]}</Badge></div>}>
            <p className="text-xs text-slate-500">By {i.author ?? 'the team'}{i.partner_name ? ` · with ${i.partner_name}` : ''} · {new Date(i.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' })}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{i.material}</p>
            {i.return_note && <p className="mt-2 rounded-lg bg-[#FFF3EF] p-2 text-sm text-[#C8553D]">Founders asked: {i.return_note}</p>}
            {i.author_id === me.id && (i.status === 'idea' || i.status === 'returned') && (
              <details className="mt-3 rounded-lg border border-teal-100 p-3">
                <summary className="cursor-pointer text-sm font-bold text-teal">Edit my idea</summary>
                <form action={editMyIdea} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={i.id} />
                  <input name="title" required defaultValue={i.title} className={inputCls} />
                  <select name="angle" defaultValue={i.angle} className={inputCls}>{ANGLES.map((a) => <option key={a.key} value={a.key}>{a.label}: {a.hint}</option>)}</select>
                  <textarea name="material" required rows={5} defaultValue={i.material} className={inputCls} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input name="partner_name" defaultValue={i.partner_name ?? ''} placeholder="Partner organisation" className={inputCls} />
                    <input name="partner_logo_url" defaultValue={i.partner_logo_url ?? ''} placeholder="Partner logo address" className={inputCls} />
                    <input name="image_url" defaultValue={i.image_url ?? ''} placeholder="Picture address" className={inputCls} />
                  </div>
                  <button className={submitCls}>Save my changes</button>
                </form>
              </details>
            )}
            {isFounder ? (
              <>
                <form action={saveDrafts} className="mt-4 space-y-3 border-t border-teal-50 pt-4">
                  <input type="hidden" name="id" value={i.id} />
                  {PLATFORMS.map((p) => (
                    <label key={p.key} className="block text-sm font-bold text-teal">{p.label} <span className="font-normal text-xs text-slate-500">{p.hint}</span>
                      <textarea name={p.key} rows={4} defaultValue={d[p.key] ?? ''} className={`${inputCls} mt-1 font-normal`} />
                    </label>
                  ))}
                  <div className="grid gap-3 sm:grid-cols-4">
                    <label className="text-xs font-bold text-teal">Post on<input type="date" name="scheduled_for" defaultValue={i.scheduled_for ? new Date(i.scheduled_for).toISOString().slice(0, 10) : ''} className={`${inputCls} mt-1 font-normal`} /></label>
                    <label className="text-xs font-bold text-teal">Pillar<select name="pillar" defaultValue={i.pillar ?? ''} className={`${inputCls} mt-1 font-normal`}><option value="">None</option><option>Real businesses</option><option>Follow-through</option><option>Community</option><option>Partners</option><option>Behind the build</option></select></label>
                    <input name="image_url" defaultValue={i.image_url ?? ''} placeholder="Picture address" className={`${inputCls} self-end`} />
                    <input name="partner_name" defaultValue={i.partner_name ?? ''} placeholder="Partner organisation" className={`${inputCls} self-end`} />
                  </div>
                  <input name="partner_logo_url" defaultValue={i.partner_logo_url ?? ''} placeholder="Partner logo address" className={inputCls} />
                  <p className="text-xs text-slate-600">Add this credit at the end of each post: <b>{credit(i)}</b></p>
                  <button className={submitCls}>Save drafts</button>
                </form>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {i.status !== 'pending' && i.status !== 'approved' && i.status !== 'posted' && <form action={sendForApproval}><input type="hidden" name="id" value={i.id} /><button className={ghost}>Send for approval</button></form>}
                  {i.status === 'pending' && <>
                    <span className="text-xs text-slate-600">Approvals: {approved.length} of 2</span>
                    {!iApproved && <form action={approveIdea}><input type="hidden" name="id" value={i.id} /><button className={submitCls}>Approve</button></form>}
                    {iApproved && <Badge tone="green">You approved</Badge>}
                    <form action={returnIdea} className="flex gap-2"><input type="hidden" name="id" value={i.id} /><input name="note" placeholder="What is missing?" className={`${inputCls} w-56`} /><button className={ghost}>Return to author</button></form>
                  </>}
                  {(i.status === 'approved' || i.status === 'posted') && <a href="/portal/social/calendar" className={ghost}>Open in the calendar to post it</a>}
                </div>
              </>
            ) : (
              i.status === 'posted' && <p className="mt-2 text-xs text-slate-500">Posted {i.posted_at ? new Date(i.posted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' }) : ''}. {credit(i)}</p>
            )}
          </Card>
        );
      })}
    </>
  );
}
