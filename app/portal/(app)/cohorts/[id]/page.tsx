import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, ImgBand, PageHeader, Stat, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { BarCard, PieCard } from '@/components/charts';
import { d, daysFromToday, iso, pct } from '@/lib/format';
import { markAttendance, recordVisit, saveSessionLog, toggleUnlock } from '../../../actions';
import { enrolRoster, publishDaySummary } from '../../../partner-actions';
import { issueParticipantCertificates } from '../../../cert-actions';

export default async function CohortPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ session?: string }> }) {
  const me = await requireMe('facilitator', 'founder');
  const { id } = await params;
  const sp = await searchParams;
  const data = await asUser(me.id, async (q) => {
    const c = (await q('select c.*, o.name org_name from cohorts c join organisations o on o.id=c.organisation_id where c.id=$1', [id]))[0];
    if (!c) return null;
    const [roster, sessions, boxes, unlocks, answers, att, sched, logs, team, forms, expected, summaries, rates, certs] = await Promise.all([
      q(`select e.id, e.track, e.status, e.has_business_at_entry, p.display_name, p.full_name, p.birth_year,
           (select count(distinct a.box_number) from canvas_answers a join canvases cv on cv.id=a.canvas_id where cv.enrolment_id=e.id)::int boxes
         from enrolments e join people p on p.id=e.person_id where e.cohort_id=$1 order by p.display_name`, [id]),
      q('select * from sessions where cohort_id=$1 order by day_number', [id]),
      q('select number, name_en from canvas_boxes order by number'),
      q('select box_number from canvas_unlocks where cohort_id=$1', [id]),
      q(`select a.box_number, count(distinct cv.enrolment_id)::int n from canvas_answers a join canvases cv on cv.id=a.canvas_id
         join enrolments e on e.id=cv.enrolment_id where e.cohort_id=$1 group by a.box_number`, [id]),
      q(`select s.id session_id, s.day_number, count(*) filter (where a.present)::int present, count(*)::int total
         from sessions s left join attendance a on a.session_id=s.id where s.cohort_id=$1 group by s.id, s.day_number order by s.day_number`, [id]),
      q(`select sc.*, p.display_name, e.id enrolment_id from followup_schedule sc join enrolments e on e.id=sc.enrolment_id
         join people p on p.id=e.person_id where e.cohort_id=$1 order by sc.due_date, p.display_name`, [id]),
      q(`select l.*, s.day_number, p.display_name author from session_logs l join sessions s on s.id=l.session_id join people p on p.id=l.author_id where s.cohort_id=$1 order by s.day_number`, [id]),
      q(`select p.display_name, cf.role from cohort_facilitators cf join people p on p.id=cf.person_id where cf.cohort_id=$1`, [id]),
      q(`select id, stage, participant_name, visited_on, business_status, urgent, sales_range, stock_value_kes, answers from followup_forms where cohort_id=$1 order by visited_on desc, created_at desc`, [id]),
      q("select id, full_name, phone, status from cohort_roster where cohort_id=$1 order by created_at", [id]),
      q('select * from day_summaries where cohort_id=$1', [id]),
      q('select e.id, count(*) filter (where a.present)::int p, count(a.id)::int t from enrolments e left join attendance a on a.enrolment_id=e.id where e.cohort_id=$1 group by e.id', [id]),
      q('select enrolment_id, number, share_token from participant_certificates where cohort_id=$1', [id]),
    ]);
    const chosen = sp.session ?? sessions[0]?.id;
    const present = chosen ? await q('select enrolment_id from attendance where session_id=$1 and present', [chosen]) : [];
    return { rates, certs, expected, summaries, c, roster, sessions, boxes, unlocked: new Set(unlocks.map((u) => u.box_number)), answers, att, sched, logs, team, forms, chosen, present: new Set(present.map((p) => p.enrolment_id)) };
  });
  if (!data) notFound();
  const { rates, certs, expected, summaries, c, roster, sessions, boxes, unlocked, answers, att, sched, logs, team, forms, chosen, present } = data;
  const boxBars = boxes.map((b) => ({ box: String(b.number), name: b.name_en, filled: answers.find((a) => a.box_number === b.number)?.n ?? 0 }));
  const attBars = att.map((a) => ({ day: `Day ${a.day_number}`, rate: pct(a.present, a.total) }));
  const statusPie = ['enrolled', 'completed', 'dropped'].map((s) => ({ name: s, value: roster.filter((r) => r.status === s).length })).filter((x) => x.value);
  const today = new Date();
  const open = sched.filter((s) => s.status === 'scheduled');
  const overdue = open.filter((s) => new Date(s.due_date) < today);
  const sess = sessions.find((s) => s.id === chosen);
  const log = logs.find((l) => l.session_id === chosen);
  return (
    <>
      <PageHeader image="/images/programme-youth-session.jpg" title={c.name} subtitle={`${c.org_name} · ${c.format === '12-day' ? '12-Day' : '5-Day'} · ${c.language === 'sw' ? 'Kiswahili' : 'English'} · ${d(c.start_date)} to ${d(c.end_date)} · ${c.venue ?? ''}`}>
        <Link href={`/portal/cohorts/${id}/outcomes`} className="rounded-lg bg-gold px-3 py-1 text-xs font-bold text-teal">Outcomes</Link>
        {team.map((t) => <span key={t.display_name} className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold">{t.display_name} · {t.role}</span>)}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Enrolled" value={roster.length} sub={`${roster.filter((r) => r.track === 'starter').length} on the Starter Track`} />
        <Stat tone="green" label="Average attendance" value={`${att.length ? Math.round(att.reduce((s, a) => s + pct(a.present, a.total), 0) / att.length) : 0}%`} />
        <Stat tone="gold" label="Canvas boxes unlocked" value={`${unlocked.size}/12`} />
        <Stat tone={overdue.length ? 'red' : 'teal'} label="Follow-ups overdue" value={overdue.length} sub={`${open.length} open`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Who has filled each canvas box" subtitle="Spot where the room is stuck" className="lg:col-span-2">
          <BarCard data={boxBars} x="box" height={240} bars={[{ key: 'filled', label: 'Participants who answered', color: '#0D3B3B' }]} />
        </Card>
        <Card title="Participants by status"><PieCard data={statusPie} height={240} /></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Attendance by day" subtitle="% present"><BarCard data={attBars} x="day" height={200} bars={[{ key: 'rate', label: '% present', color: '#2E8B7A' }]} /></Card>
        <Card title="Unlock canvas boxes" subtitle="Open a box when you have taught it" className="lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            {boxes.map((b) => (
              <form key={b.number} action={toggleUnlock}>
                <input type="hidden" name="cohort" value={id} /><input type="hidden" name="box" value={b.number} />
                <button title={b.name_en} className={`h-11 w-11 rounded-lg text-sm font-bold ${unlocked.has(b.number) ? 'bg-teal text-white' : 'border border-slate-300 bg-white text-slate-400'}`}>{b.number}</button>
              </form>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Filled box counts are above; the matching box opens for every participant in this cohort.</p>
        </Card>
      </div>

      {expected.some((r) => r.status === 'expected') && (
        <Card title="Waiting on the partner's list" subtitle={`${expected.filter((r) => r.status === 'expected').length} people the partner loaded before the training`} className="mt-4">
          <p className="mb-3 text-sm text-slate-600">{expected.filter((r) => r.status === 'expected').map((r) => r.full_name).slice(0, 12).join(', ')}{expected.filter((r) => r.status === 'expected').length > 12 ? '…' : ''}</p>
          <form action={enrolRoster}><input type="hidden" name="cohort" value={id} /><button className={submitCls}>Enrol everyone on the list</button></form>
        </Card>
      )}

      <Card title="Roster" className="mt-4" subtitle="Names are visible to trainers of this cohort only">
        <Table head={['Participant', 'Track', 'Status', 'Boxes filled', 'Business at entry']}
          rows={roster.map((r) => [
            <div key="n"><Link href={`/portal/cohorts/${id}/participants/${r.id}`} className="font-bold text-teal underline">{r.display_name}</Link>{r.birth_year && new Date().getFullYear() - r.birth_year < 18 ? <span className="ml-2"><Badge tone="gold">under 18</Badge></span> : null}</div>,
            <Badge key="t" tone={r.track === 'starter' ? 'gold' : 'teal'}>{r.track}</Badge>,
            <Badge key="s" tone={statusTone(r.status)}>{r.status}</Badge>,
            <div key="b" className="flex items-center gap-2"><div className="h-2 w-24 rounded bg-teal-50"><div className="h-2 rounded bg-teal" style={{ width: `${pct(r.boxes, 12)}%` }} /></div><span className="text-xs">{r.boxes}/12</span></div>,
            r.has_business_at_entry ? 'Yes' : 'No',
          ])} />
      </Card>

      {(() => {
        const isFounder = me.roles.includes('founder');
        const rows = roster.map((r) => {
          const rt = rates.find((x) => x.id === r.id);
          const pctAtt = rt && rt.t ? Math.round((rt.p / rt.t) * 100) : null;
          const cert = certs.find((x) => x.enrolment_id === r.id);
          const eligible = r.status !== 'dropped' && (pctAtt === null || pctAtt >= 80);
          return { r, pctAtt, cert, eligible };
        });
        const pending = rows.filter((x) => !x.cert);
        const ended = sessions.length > 0 && sessions.every((s) => s.session_date && new Date(s.session_date) <= new Date());
        return (
          <Card title="Certificates of completion" className="mt-4" subtitle={certs.length ? `${certs.length} issued` : 'Not issued yet. Participants should leave with one, so do this soon after the last day.'}
            action={certs.length ? <a href={`/portal/cohorts/${id}/certificates`} className="rounded-lg bg-gold px-3 py-1 text-xs font-bold text-teal">Print certificates</a> : undefined}>
            {ended && !certs.length && <p className="mb-3 rounded-lg bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-600">Training has finished and no certificates have been issued yet.</p>}
            {isFounder && pending.length > 0 ? (
              <form action={issueParticipantCertificates}>
                <input type="hidden" name="cohort" value={id} />
                <div className="grid gap-1 text-sm sm:grid-cols-2">
                  {pending.map(({ r, pctAtt, eligible }) => (
                    <label key={r.id} className="flex items-center gap-2"><input type="checkbox" name="enrol" value={r.id} defaultChecked={eligible} />{r.display_name}
                      <span className="text-xs text-slate-500">{pctAtt === null ? 'no attendance recorded' : `${pctAtt}% attended`}{r.status === 'dropped' ? ' · left the programme' : ''}</span></label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">Ticked means they left or did not drop out and attended at least 80% of the days. Untick anyone who should not receive one.</p>
                <button className={`${submitCls} mt-3`}>Issue certificates to the ticked participants</button>
              </form>
            ) : !isFounder && pending.length > 0 ? <p className="text-sm text-slate-600">{pending.length} participants are waiting for a certificate. A founder issues them after reviewing attendance.</p> : null}
            {certs.length > 0 && <p className="mt-3 text-xs text-slate-500">Each participant also sees their certificate on their own page.</p>}
          </Card>
        );
      })()}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Attendance and session note" subtitle="Choose a day">
          <div className="mb-3 flex flex-wrap gap-2">
            {sessions.map((s) => (
              <a key={s.id} href={`/portal/cohorts/${id}?session=${s.id}`} className={`rounded-full px-3 py-1 text-sm font-bold ${s.id === chosen ? 'bg-teal text-white' : 'border border-teal-100 bg-white text-teal'}`}>Day {s.day_number}</a>
            ))}
            {!sessions.length && <span className="text-sm text-slate-500">No sessions scheduled yet.</span>}
          </div>
          {sess && (
            <>
              <p className="mb-2 text-sm text-slate-600">{sess.topic} · {d(sess.session_date)}</p>
              <form action={markAttendance} className="mb-5 rounded-lg bg-mist p-3">
                <input type="hidden" name="cohort" value={id} /><input type="hidden" name="session" value={sess.id} />
                <div className="grid grid-cols-2 gap-1 text-sm">
                  {roster.map((r) => (
                    <label key={r.id} className="flex items-center gap-2"><input type="checkbox" name="present" value={r.id} defaultChecked={present.has(r.id)} />{r.display_name}</label>
                  ))}
                </div>
                <button className={`${submitCls} mt-3`}>Save attendance</button>
              </form>
              {(() => {
                const sm = summaries.find((x) => x.session_id === sess.id);
                return (
                  <form action={publishDaySummary} className="mb-5 space-y-2 rounded-lg border border-teal-100 p-3 text-sm">
                    <input type="hidden" name="cohort" value={id} /><input type="hidden" name="session" value={sess.id} />
                    <p className="font-bold">Summary for the partner {sm ? <span className="ml-1 text-xs font-normal text-green-700">published {d(sm.published_at)}</span> : null}</p>
                    <textarea name="covered" rows={2} defaultValue={sm?.covered ?? ''} placeholder="What we covered today, in plain words" className={inputCls} />
                    <textarea name="note" rows={2} defaultValue={sm?.note_for_partner ?? ''} placeholder="Anything the partner should know or do (optional)" className={inputCls} />
                    <button className={submitCls}>{sm ? 'Update summary' : 'Publish summary'}</button>
                    <p className="text-xs text-slate-500">Counts and the names of who came and who did not are taken from the attendance above. Save attendance first.</p>
                  </form>
                );
              })()}
              <form action={saveSessionLog} className="space-y-3">
                <input type="hidden" name="cohort" value={id} /><input type="hidden" name="session" value={sess.id} />
                <fieldset className="rounded-lg border border-teal-100 p-3 text-sm">
                  <legend className="px-1 text-xs font-bold uppercase text-slate-500">Non-negotiables</legend>
                  {[['canvas_order', 'Sections taught in canvas order'], ['cost_types_order', 'Cost types in order: sunk, fixed, variable'], ['canvas_completion_checked', 'Canvas completion checked before release'], ['followup_dates_confirmed', 'Follow-up dates confirmed (final day)'], ['certificates_ready', 'Certificates flagged for founders to issue (final day)']].map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2"><input type="checkbox" name={k} defaultChecked={!!log?.checks?.[k]} />{label}</label>
                  ))}
                </fieldset>
                <label className="block text-sm font-bold">Session flow (1 to 5)
                  <select name="flow" defaultValue={log?.flow_rating ?? ''} className={inputCls}><option value="">—</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
                <label className="block text-sm font-bold">Hardest concepts<textarea name="hardest" rows={2} defaultValue={log?.hardest_concepts ?? ''} className={inputCls} /></label>
                <label className="block text-sm font-bold">What went well<textarea name="well" rows={2} defaultValue={log?.went_well ?? ''} className={inputCls} /></label>
                <label className="block text-sm font-bold">What to improve<textarea name="improve" rows={2} defaultValue={log?.to_improve ?? ''} className={inputCls} /></label>
                <label className="block text-sm font-bold">Notable quotes (anonymise names)<textarea name="quotes" rows={2} defaultValue={log?.notable_quotes ?? ''} className={inputCls} /></label>
                <button className={submitCls}>Save session note</button>
                <p className="text-xs text-slate-500">Session notes are private to trainers, master trainers and founders. Participants and partners never see them.</p>
              </form>
            </>
          )}
        </Card>

        <Card title="Follow-up visits" subtitle="30, 60 and 90 days. Three tries in seven days, then mark unreachable.">
          <div className="space-y-3">
            {sched.map((s) => {
              const late = s.status === 'scheduled' && daysFromToday(s.due_date) < 0;
              return (
                <details key={s.id} className="rounded-lg border border-teal-100 bg-white p-3" open={late}>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-bold text-teal">{s.display_name} · {s.visit}-day</span>
                    <span className="flex items-center gap-2"><span className="text-xs text-slate-500">{d(s.due_date)} · attempts {s.attempts}</span>
                      <Badge tone={late ? 'red' : statusTone(s.status)}>{late ? `overdue ${-daysFromToday(s.due_date)}d` : s.status}</Badge></span>
                  </summary>
                  {s.status === 'scheduled' && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <form action={recordVisit} className="space-y-2 rounded-lg bg-mist p-3 text-sm">
                        <input type="hidden" name="schedule" value={s.id} /><input type="hidden" name="reached" value="yes" /><input type="hidden" name="back" value={`/portal/cohorts/${id}`} />
                        <b>Reached</b>
                        <label className="flex gap-2"><input type="checkbox" name="operating" defaultChecked />Still operating</label>
                        <label className="flex gap-2"><input type="checkbox" name="sold14" />Made a sale in the last 14 days</label>
                        <label className="flex gap-2"><input type="checkbox" name="breakeven" />Knows their break-even</label>
                        <label className="flex gap-2"><input type="checkbox" name="metric" />Tracks a key number</label>
                        <select name="income" className={inputCls}><option value="">Income vs before</option><option value="higher">Higher</option><option value="same">Same</option><option value="lower">Lower</option></select>
                        <select name="confidence" className={inputCls}><option value="">Confidence 1 to 5</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
                        <textarea name="notes" rows={2} placeholder="Notes" className={inputCls} />
                        <button className={submitCls}>Save visit</button>
                      </form>
                      <form action={recordVisit} className="space-y-2 rounded-lg bg-mist p-3 text-sm">
                        <input type="hidden" name="schedule" value={s.id} /><input type="hidden" name="reached" value="no" /><input type="hidden" name="back" value={`/portal/cohorts/${id}`} />
                        <b>Could not reach</b><p className="text-xs text-slate-500">After the third failed attempt this becomes unreachable and counts against reach rate, not survival.</p>
                        <button className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal">Log failed attempt</button>
                      </form>
                    </div>
                  )}
                </details>
              );
            })}
            {!sched.length && <p className="text-sm text-slate-500">The 30/60/90 schedule is created when the cohort finishes.</p>}
          </div>
        </Card>
        {forms.length > 0 && (
          <Card title="Follow-up forms received" subtitle="Day 30, 60 and 90 visits sent from the Google Form. Open one to read the full answers.">
            <div className="space-y-2">
              {forms.map((f) => (
                <details key={f.id} className="rounded-lg border border-teal-100 bg-white p-3" open={f.urgent}>
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-bold text-teal">{f.participant_name} · Day {f.stage}</span>
                    <span className="flex items-center gap-2"><span className="text-xs text-slate-500">{d(f.visited_on)}</span>
                      {f.urgent && <Badge tone="red">urgent</Badge>}
                      {f.business_status && <Badge tone={f.business_status === 'growing' || f.business_status === 'stable' ? 'green' : 'red'}>{f.business_status}</Badge>}</span>
                  </summary>
                  <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    {Object.entries(f.answers as Record<string, unknown>).filter(([k, v]) => !k.startsWith('_') && String(v ?? '').trim()).map(([k, v]) => (
                      <div key={k} className="contents"><dt className="font-bold text-slate-600">{k.replace(/_/g, ' ')}</dt><dd className="whitespace-pre-wrap">{String(v)}</dd></div>
                    ))}
                  </dl>
                </details>
              ))}
            </div>
          </Card>
        )}
      </div>
      <ImgBand src="/images/home-facilitator.jpg" className="mt-6 h-40" caption="Start. Start small. Start to finish." />
    </>
  );
}
