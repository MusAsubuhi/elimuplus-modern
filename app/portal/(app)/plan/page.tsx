import Link from 'next/link';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { audit } from '@/lib/audit';
import { FOCUS, GOAL_STATUS, SOURCE_LABEL, suggestionsFor } from '@/lib/improvement';
import { Badge, Card, PageHeader, ProgressBar, Stat, inputCls, statusTone, submitCls } from '@/components/ui';
import { d, daysFromToday, iso } from '@/lib/format';
import { addGoal, addNote, answerSuggestion, createPlan, setPlanStatus, updateGoal } from '../../plan-actions';

const KIND = { update: 'Update', reviewer_note: 'Note from reviewer', review: 'Review' } as Record<string, string>;

export default async function ImprovementPlan({ searchParams }: { searchParams: Promise<{ person?: string; plan?: string }> }) {
  const me = await requireMe('participant', 'facilitator', 'master', 'founder');
  const sp = await searchParams;
  const target = sp.person && /^[0-9a-f-]{36}$/.test(sp.person) ? sp.person : me.id;
  const own = target === me.id;
  const back = own ? '/portal/plan' : `/portal/plan?person=${target}`;

  const data = await asUser(me.id, async (q) => {
    const who = (await q('select id, full_name, display_name from people where id=$1', [target]))[0] ?? null;
    const plans = await q('select * from improvement_plans where person_id=$1 order by (status=\'active\') desc, created_at desc', [target]);
    const current = plans.find((p) => p.id === sp.plan) ?? plans[0] ?? null;
    const goals = current ? await q('select * from improvement_goals where plan_id=$1 order by accepted desc, created_at', [current.id]) : [];
    const checkins = current ? await q('select c.*, p.display_name author from improvement_checkins c join people p on p.id=c.author_id where c.plan_id=$1 order by c.created_at desc limit 40', [current.id]) : [];
    const reviewer = current?.reviewer_id ? (await q('select display_name from people where id=$1', [current.reviewer_id]))[0]?.display_name ?? null : null;
    const suggestions = own && !current ? await suggestionsFor(q, me.id) : [];
    // people whose plans I can read (supervisees, people who named me, or everyone for founders)
    const others = own ? await q(
      `select pl.id, pl.title, pl.status, pl.review_on, pe.display_name, pe.id person_id,
         (select coalesce(round(avg(progress)),0)::int from improvement_goals g where g.plan_id=pl.id and g.accepted) progress,
         (select count(*)::int from improvement_goals g where g.plan_id=pl.id and not g.accepted) pending
       from improvement_plans pl join people pe on pe.id=pl.person_id where pl.person_id<>$1 and pl.status='active' order by pe.display_name`, [me.id]) : [];
    return { who, plans, current, goals, checkins, reviewer, suggestions, others };
  });
  if (!own && data.who && me.roles.includes('founder')) await audit(me.id, 'read improvement plan', 'improvement_plans');
  const { who, plans, current, goals, checkins, reviewer, suggestions, others } = data;
  if (!who) return <Card title="Not found">That person could not be found.</Card>;

  const accepted = goals.filter((g) => g.accepted);
  const pending = goals.filter((g) => !g.accepted);
  const avg = accepted.length ? Math.round(accepted.reduce((a, g) => a + g.progress, 0) / accepted.length) : 0;
  const doneN = accepted.filter((g) => g.status === 'done').length;
  const left = current?.review_on ? daysFromToday(current.review_on) : null;
  const ownsCurrent = !!current && current.person_id === me.id;
  const canWrite = !!current && current.status === 'active';

  return (
    <>
      <PageHeader image="/images/trainer-hero.jpg" title={own ? 'My improvement plan' : `${who.display_name}’s improvement plan`}
        subtitle="A few honest goals, small steps, and someone who reads how it is going. It belongs to the person who writes it.">
        {!own && <Link href="/portal/plan" className="rounded-lg border border-white/50 px-4 py-2 text-sm font-bold text-white">← Back to my plan</Link>}
      </PageHeader>

      {!current && (
        <Card title={own ? 'Start your plan' : `Start a plan with ${who.display_name}`} subtitle={own ? 'Pick what matters most right now. You can change it any time.' : 'Anything you add as a goal will reach them as a suggestion they can accept.'}>
          <form action={createPlan} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="person" value={target} />
            <label className="text-sm font-semibold md:col-span-2">What is this plan about?
              <input name="title" required maxLength={120} placeholder="For example: Teaching the cost section well" className={`${inputCls} mt-1 font-normal`} /></label>
            <label className="text-sm font-semibold">Main area
              <select name="focus" className={`${inputCls} mt-1 font-normal`}>{Object.entries(FOCUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="text-sm font-semibold">Look back together on
              <input type="date" name="review_on" className={`${inputCls} mt-1 font-normal`} /></label>
            <label className="text-sm font-semibold md:col-span-2">Where am I now, in my own words?
              <textarea name="summary" rows={3} className={`${inputCls} mt-1 font-normal`} placeholder="What is going well, and what I want to get better at." /></label>
            {suggestions.length > 0 && (
              <fieldset className="md:col-span-2 rounded-lg border border-teal-100 p-3">
                <legend className="px-1 text-sm font-bold text-teal">Ideas taken from your own progress in the portal</legend>
                <p className="mb-2 text-xs text-slate-500">Tick any you want as goals. You can add others after.</p>
                {suggestions.map((g) => (
                  <label key={g.title} className="flex items-start gap-2 py-1 text-sm">
                    <input type="checkbox" name="pick" value={JSON.stringify(g)} className="mt-1" />
                    <span><b>{g.title}</b><br /><span className="text-xs text-slate-500">{g.why}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="md:col-span-2"><button className={submitCls}>Start the plan</button></div>
          </form>
        </Card>
      )}

      {current && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Overall progress" value={`${avg}%`} sub={`${doneN} of ${accepted.length} goals done`} tone={avg >= 70 ? 'green' : 'gold'} />
            <Stat label="Status" value={<Badge tone={statusTone(current.status)}>{current.status}</Badge>} sub={`${FOCUS[current.focus]} · started ${d(current.starts_on)}`} />
            <Stat label="Look back" value={current.review_on ? d(current.review_on) : 'Not set'} sub={left === null ? undefined : left >= 0 ? `in ${left} day${left === 1 ? '' : 's'}` : `${-left} days ago`} tone={left !== null && left < 0 && current.status === 'active' ? 'red' : 'teal'} />
            <Stat label="Reads my plan" value={reviewer ?? 'No one yet'} sub={reviewer ? 'Can comment and suggest goals' : 'Ask a founder to assign a supervisor'} tone={reviewer ? 'teal' : 'red'} />
          </div>

          {plans.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-2 text-sm">
              {plans.map((p) => <Link key={p.id} href={`${back}${back.includes('?') ? '&' : '?'}plan=${p.id}`} className={`rounded-full border px-3 py-1 ${p.id === current.id ? 'border-teal bg-teal text-white' : 'border-teal-100 bg-white text-teal'}`}>{p.title} · {p.status}</Link>)}
            </div>
          )}

          <Card title={current.title} subtitle={`Started by ${current.origin === 'self' ? 'the owner' : current.origin === 'reviewer' ? 'a reviewer' : current.origin}`}
            action={ownsCurrent && <form action={setPlanStatus} className="flex gap-2"><input type="hidden" name="plan" value={current.id} /><input type="hidden" name="back" value={back} />
              {current.status === 'active' ? <><button name="status" value="completed" className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-white">Mark complete</button><button name="status" value="closed" className="rounded-lg border border-teal-100 px-3 py-1.5 text-xs font-bold text-teal">Close</button></>
                : <button name="status" value="active" className="rounded-lg border border-teal-100 px-3 py-1.5 text-xs font-bold text-teal">Reopen</button>}</form>}>
            {current.summary && <p className="mb-4 whitespace-pre-line text-sm text-slate-700">{current.summary}</p>}
            <ul className="space-y-4">
              {accepted.map((g) => (
                <li key={g.id} className="rounded-lg border border-teal-100 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-teal">{g.title}</b>
                    <span className="flex items-center gap-2"><Badge tone={statusTone(g.status === 'in_progress' ? 'scheduled' : g.status)}>{GOAL_STATUS[g.status]}</Badge>{g.due_on && <span className="text-xs text-slate-500">by {d(g.due_on)}</span>}</span>
                  </div>
                  {g.why && <p className="mt-1 text-sm text-slate-600"><b>Why:</b> {g.why}</p>}
                  {g.measure && <p className="text-sm text-slate-600"><b>How I will know:</b> {g.measure}</p>}
                  {g.source_kind && g.source_kind !== 'own' && <p className="mt-1 text-xs text-slate-500">{SOURCE_LABEL[g.source_kind]}</p>}
                  <div className="mt-2"><ProgressBar value={g.progress} tone={g.progress >= 100 ? 'green' : 'gold'} /><div className="mt-0.5 text-xs text-slate-500">{g.progress}%</div></div>
                  {ownsCurrent && canWrite && (
                    <form action={updateGoal} className="mt-3 grid gap-2 sm:grid-cols-[110px_1fr_auto]">
                      <input type="hidden" name="goal" value={g.id} /><input type="hidden" name="plan" value={current.id} /><input type="hidden" name="back" value={back} />
                      <input type="number" name="progress" min={0} max={100} defaultValue={g.progress} aria-label="Progress percent" className={inputCls} />
                      <input name="note" placeholder="What happened? One honest line." className={inputCls} />
                      <button className={submitCls}>Save</button>
                    </form>
                  )}
                </li>
              ))}
              {!accepted.length && <li className="text-sm text-slate-500">No goals yet. Add the first one below.</li>}
            </ul>
          </Card>

          {pending.length > 0 && (
            <Card className="mt-4" title={ownsCurrent ? 'Suggested for you' : 'Suggestions waiting for them to accept'} subtitle={ownsCurrent ? 'Take what helps. Nothing is added unless you accept it.' : undefined}>
              <ul className="space-y-3">
                {pending.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-gold-100 p-3 text-sm">
                    <span><b>{g.title}</b>{g.why && <><br /><span className="text-slate-600">{g.why}</span></>}</span>
                    {ownsCurrent ? (
                      <form action={answerSuggestion} className="flex gap-2"><input type="hidden" name="goal" value={g.id} /><input type="hidden" name="back" value={back} />
                        <button name="decision" value="accept" className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-white">Add to my plan</button>
                        <button name="decision" value="decline" className="rounded-lg border border-teal-100 bg-white px-3 py-1.5 text-xs font-bold text-teal">Not now</button></form>
                    ) : <Badge tone="gold">waiting</Badge>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {canWrite && (
            <Card className="mt-4" title={ownsCurrent ? 'Add a goal' : 'Suggest a goal'} subtitle={ownsCurrent ? 'Small and specific beats big and vague.' : 'They decide whether to take it on.'}>
              <form action={addGoal} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="plan" value={current.id} /><input type="hidden" name="back" value={back} />{!ownsCurrent && <input type="hidden" name="suggest" value="1" />}
                <label className="text-sm font-semibold md:col-span-2">Goal<input name="title" required maxLength={160} className={`${inputCls} mt-1 font-normal`} /></label>
                <label className="text-sm font-semibold">Why it matters<input name="why" className={`${inputCls} mt-1 font-normal`} /></label>
                <label className="text-sm font-semibold">How we will know<input name="measure" className={`${inputCls} mt-1 font-normal`} /></label>
                <label className="text-sm font-semibold">Aim to finish by<input type="date" name="due_on" className={`${inputCls} mt-1 font-normal`} /></label>
                <div className="flex items-end"><button className={submitCls}>{ownsCurrent ? 'Add goal' : 'Send suggestion'}</button></div>
              </form>
            </Card>
          )}

          <Card className="mt-4" title="Conversation">
            {!ownsCurrent && canWrite && (
              <form action={addNote} className="mb-4 grid gap-2">
                <input type="hidden" name="plan" value={current.id} /><input type="hidden" name="back" value={back} />
                <textarea name="body" rows={3} required className={inputCls} placeholder="Say what you noticed. Start with what is working." />
                <div className="flex gap-2"><button name="kind" value="reviewer_note" className={submitCls}>Add note</button><button name="kind" value="review" className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal">Record a review</button></div>
              </form>
            )}
            <ol className="space-y-3">
              {checkins.map((c) => (
                <li key={c.id} className={`rounded-lg border p-3 text-sm ${c.kind === 'update' ? 'border-teal-100 bg-white' : 'border-gold bg-gold-100'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span><b className="text-teal">{c.author}</b> · {KIND[c.kind]}{c.progress != null ? ` · ${c.progress}%` : ''}</span><span>{d(c.created_at)}</span></div>
                  <p className="mt-1 whitespace-pre-line">{c.body}</p>
                </li>
              ))}
              {!checkins.length && <li className="text-sm text-slate-500">Updates and notes will appear here.</li>}
            </ol>
          </Card>
        </>
      )}

      {own && others.length > 0 && (
        <Card className="mt-8" title="Plans I can read" subtitle="People you supervise, or who named you to read their plan.">
          <ul className="divide-y divide-teal-100">
            {others.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <span><b className="text-teal">{o.display_name}</b> · {o.title}{o.pending ? <> · <Badge tone="gold">{o.pending} suggestion{o.pending === 1 ? '' : 's'} waiting</Badge></> : null}</span>
                <span className="flex items-center gap-3"><span className="w-28"><ProgressBar value={o.progress} /></span><span className="text-xs text-slate-500">{o.progress}%{o.review_on ? ` · look back ${d(o.review_on)}` : ''}</span>
                  <Link href={`/portal/plan?person=${o.person_id}`} className="font-bold text-teal underline">Open</Link></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
