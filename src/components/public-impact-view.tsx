import Link from 'next/link';
import { Band, BeforeAfter, C, Dial, HBars, InfographicStyles, Journey, PeopleGrid, Panel, Ring, Soon, Split, Steps, Tile, fmt } from '@/components/infographics';
import { addDays, monthYear, pctOf, phaseOf, rollup, type PubCohort } from '@/lib/public-impact';
import { orgTypeLabel } from '@/lib/options';
import { todayNairobi } from '@/lib/book';

export const cohortName = (c: PubCohort) => `Cohort ${c.seq}`;
export const cohortPlace = (c: PubCohort) => [c.orgName ?? orgTypeLabel(c.orgType), c.county ? `${c.county} County` : null].filter(Boolean).join(' · ');
const AGE: Record<string, string> = { under_18: 'Under 18', '18_24': '18 to 24', '25_34': '25 to 34', '35_plus': '35 and over' };

function TopBar() {
  return (
    <div className="bg-[#0D3B3B]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
        <a href="https://elimuplus.com" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo-elimu-white.png" alt="Elimu+" className="h-8 w-auto" />
        </a>
        <a href="https://elimuplus.com" className="text-xs font-bold uppercase tracking-widest text-[#D4A843]">elimuplus.com</a>
      </div>
    </div>
  );
}

function Hero({ kicker, title, lead, children }: { kicker: string; title: string; lead: string; children: React.ReactNode }) {
  return (
    <header className="relative overflow-hidden bg-[#0D3B3B] text-white">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#2E8B7A]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 left-10 h-80 w-80 rounded-full bg-[#D4A843]/20 blur-3xl" />
      <div className="relative mx-auto max-w-5xl px-5 pb-14 pt-12 sm:pt-16">
        <div className="text-xs font-black uppercase tracking-[.3em] text-[#D4A843]">{kicker}</div>
        <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.05] sm:text-6xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-teal-50/90">{lead}</p>
        <div className="mt-9 grid gap-4 sm:grid-cols-3">{children}</div>
      </div>
    </header>
  );
}

/** The graphics for a set of cohorts: everything together on /impact, one cohort on its own page. */
function Sections({ list, one }: { list: PubCohort[]; one?: PubCohort }) {
  const r = rollup(list);
  const where = one ? 'this cohort' : 'all our cohorts';
  const done = r.finishedCompleted;
  const notDone = Math.max(0, r.finishedEnrolled - r.finishedCompleted);
  const per = r.enrolled > 60 ? Math.ceil(r.enrolled / 60) : 1;
  const stages = ['30', '60', '90'];
  const withData = stages.filter((s) => r.adult[s].n > 0);
  const lastAdult = [...withData].pop();
  const operatingPts = [
    { label: 'Day 0', value: r.baseline && r.baseline.n ? pctOf(r.baseline.operating, r.baseline.n) : null },
    ...stages.map((s) => ({ label: `Day ${s}`, value: r.adult[s].sold14Known ? pctOf(r.adult[s].sold14, r.adult[s].sold14Known) : null })),
  ];
  const recordsPts = [
    { label: 'Day 0', value: r.baseline && r.baseline.n ? pctOf(r.baseline.recordsDaily, r.baseline.n) : null },
    ...stages.map((s) => ({ label: `Day ${s}`, value: r.adult[s].n ? pctOf(r.adult[s].recordsDaily, r.adult[s].n) : null })),
  ];
  const youthStage = [...stages].reverse().find((s) => r.youth[s].n > 0);
  const gMax = r.female + r.male;
  const ages = Object.entries(r.age).filter(([k]) => AGE[k]).sort((a, b) => Object.keys(AGE).indexOf(a[0]) - Object.keys(AGE).indexOf(b[0]));
  return (
    <>
      <Band kicker="Who took part" title={one ? `${fmt(r.enrolled)} people in this cohort` : `${fmt(r.enrolled)} people have joined an Elimu+ training`} lead="Every figure is a person who showed up, learned and worked on their own idea. We show numbers only, never names.">
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3"><Panel title="Where everyone is today">
            <PeopleGrid per={per} parts={[
              { n: done, color: C.green, label: 'completed the training' },
              { n: r.inTraining, color: C.gold, label: 'in training now' },
              ...(notDone ? [{ n: notDone, color: C.grey, label: 'did not complete' }] : []),
            ]} />
          </Panel></div>
          <div className="space-y-6 lg:col-span-2">
            {gMax > 0 && <Panel title="Women and men"><Split parts={[{ label: 'Women', value: r.female, color: C.clay }, { label: 'Men', value: r.male, color: C.teal }]} /></Panel>}
            {ages.length > 0 && <Panel title="Age groups"><HBars rows={ages.map(([k, v]) => ({ label: AGE[k], value: v }))} color={C.blue} /></Panel>}
          </div>
        </div>
      </Band>

      <Band tone="mist" kicker="Showing up and learning" title="People come, and they keep coming." lead={`Attendance is counted for every training day. Learning is checked with the same short quiz before and after, for the people who took both.`}>
        <div className="grid gap-6 md:grid-cols-3">
          <Panel title="Attendance" note={r.sessions ? `${fmt(r.sessions)} training days delivered across ${where}.` : undefined}>
            {r.attendance != null ? <Ring value={r.attendance} label="of training days attended" color={C.green} /> : <Soon>Attendance appears once the first training days are confirmed.</Soon>}
          </Panel>
          <Panel title="What people learned" note={r.learning ? `Average score before and after, for ${r.learning.n} people who took both checks. That is a gain of ${r.learning.gain} points.` : undefined}>
            {r.learning ? <BeforeAfter before={r.learning.pre} after={r.learning.post} beforeLabel="Before training" afterLabel="After training" /> : <Soon>The before-and-after quiz results appear here as soon as five or more people have taken both.</Soon>}
          </Panel>
          <Panel title="How people rate it" note={r.exit ? `From ${r.exit.n} exit forms.` : undefined}>
            {r.exit ? <div className="grid grid-cols-2 gap-2"><Dial value={r.exit.rating} min={0} max={5} text={`${r.exit.rating}`} label="out of 5" color={C.gold} /><Ring size={110} value={r.exit.recommend} label="would recommend" color={C.green} /></div> : <Soon>Ratings appear after the exit forms are in.</Soon>}
          </Panel>
        </div>
      </Band>

      <Band tone="teal" kicker="After the training" title="What changes in the weeks that follow" lead={`We visit or call every business owner at 30, 60 and 90 days. These are the results from ${where}, as each visit is completed.`}>
        {withData.length === 0 && !youthStage ? (
          <Soon><span className="text-slate-700">The follow-up results will appear here as {one ? 'this cohort reaches' : 'cohorts reach'} Day 30, Day 60 and Day 90. Nothing is estimated; these graphics fill in only from real visits.</span></Soon>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {withData.length > 0 && <Panel dark title="Businesses still trading" note="Share of business owners reached who sold something in the last 14 days. Day 0 is the share who already had a running business when they joined."><Journey points={operatingPts} color={C.gold} /></Panel>}
            {withData.length > 0 && <Panel dark title="Keeping daily records" note="Share who write down what they sell and spend, every day."><Journey points={recordsPts} color="#7FD1BE" /></Panel>}
            {lastAdult && r.adult[lastAdult].higher + r.adult[lastAdult].same + r.adult[lastAdult].lower > 0 && (
              <Panel dark title={`Income compared with before (Day ${lastAdult})`}>
                <Split parts={[{ label: 'Higher', value: r.adult[lastAdult].higher, color: '#47C1A5' }, { label: 'About the same', value: r.adult[lastAdult].same, color: C.gold }, { label: 'Lower', value: r.adult[lastAdult].lower, color: C.clay }]} />
              </Panel>)}
            {lastAdult && r.adult[lastAdult].growing + r.adult[lastAdult].stable + r.adult[lastAdult].struggling + r.adult[lastAdult].closed > 0 && (
              <Panel dark title={`How the businesses are doing (Day ${lastAdult})`}>
                <Split parts={[{ label: 'Growing', value: r.adult[lastAdult].growing, color: '#47C1A5' }, { label: 'Steady', value: r.adult[lastAdult].stable, color: C.gold }, { label: 'Struggling', value: r.adult[lastAdult].struggling, color: C.clay }, { label: 'Closed', value: r.adult[lastAdult].closed, color: '#8795A1' }]} />
              </Panel>)}
            {youthStage && (
              <div className="md:col-span-2"><Panel dark title={`Young people after training (Day ${youthStage}, ${r.youth[youthStage].n} reached)`}>
                <div className="grid gap-4 sm:grid-cols-4">
                  {([['earned their first income', r.youth[youthStage].firstIncome], ['have a CV ready', r.youth[youthStage].cvReady], ['started a venture', r.youth[youthStage].ventureStarted], ['applications sent', r.youth[youthStage].applications]] as [string, number][]).map(([l, v]) => (
                    <div key={l} className="rounded-xl bg-white/10 p-4"><div className="text-4xl font-black text-[#D4A843]">{fmt(v)}</div><div className="mt-1 text-sm text-teal-50/90">{l}</div></div>))}
                </div>
              </Panel></div>)}
          </div>
        )}
      </Band>
    </>
  );
}

/** /impact: everything together, then one card per cohort. */
export function ImpactOverview({ list }: { list: PubCohort[] }) {
  const r = rollup(list);
  const today = todayNairobi();
  return (
    <div className="bg-white font-sans text-[#1B2A2A]">
      <InfographicStyles />
      <TopBar />
      <Hero kicker="Elimu+ impact, live" title="Skills, ideas and effort, turned into real income." lead="This page updates itself every time a cohort is trained, followed up or added. It shows numbers only: no names, no photos, no phone numbers.">
        <Tile value={fmt(r.completed)} label="People trained" sub={r.inTraining ? `and ${fmt(r.inTraining)} in training now` : 'completed the full programme'} tone="gold" />
        <Tile value={fmt(r.cohorts)} label="Cohorts" sub="in partner churches, centres and schools" tone="green" />
        <Tile value={r.attendance != null ? `${r.attendance}%` : '—'} label="Attendance" sub={r.sessions ? `across ${fmt(r.sessions)} training days` : 'once training days are confirmed'} tone="light" />
      </Hero>
      {list.length === 0 ? (
        <Band kicker="Coming soon" title="Our first results are on the way"><Soon>As soon as a cohort is under way, its numbers appear here.</Soon></Band>
      ) : (
        <>
          <Sections list={list} />
          <Band kicker="Cohort by cohort" title="Every cohort has its own page" lead="Open one to see its own numbers and where it is on the 30, 60 and 90 day follow-up path.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[...list].sort((a, b) => b.seq - a.seq).map((c) => {
                const finished = phaseOf(c, today) === 'finished';
                return (
                  <Link key={c.seq} href={`/impact/${c.seq}`} className="group ig-rise block rounded-2xl border border-teal-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="text-lg font-black text-[#0D3B3B]">{cohortName(c)}</div>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-black ${finished ? 'bg-[#2E8B7A]/15 text-[#1B6666]' : 'bg-[#D4A843]/25 text-[#8a6a14]'}`}>{finished ? 'Trained' : 'In training'}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{cohortPlace(c)}{c.start ? ` · ${monthYear(c.start)}` : ''}</div>
                    <div className="mt-4 flex items-end justify-between">
                      <div><div className="text-4xl font-black text-[#0D3B3B]">{c.m.enrolled}</div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">people</div></div>
                      {!c.small && c.m.attendance_rate != null && <div className="text-right"><div className="text-2xl font-black text-[#2E8B7A]">{c.m.attendance_rate}%</div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">attendance</div></div>}
                    </div>
                    <div className="mt-4 text-sm font-bold text-[#1B6666] group-hover:underline">See this cohort →</div>
                  </Link>
                );
              })}
            </div>
          </Band>
        </>
      )}
      <Footer />
    </div>
  );
}

/** /impact/[seq]: one cohort. */
export function CohortPage({ c }: { c: PubCohort }) {
  const today = todayNairobi();
  const end = c.end ?? c.start;
  const steps = [
    { label: 'Training', sub: c.start ? `${monthYear(c.start)}` : '', state: (phaseOf(c, today) === 'finished' ? 'done' : 'now') as 'done' | 'now' | 'later' },
    ...[30, 60, 90].map((d) => {
      const due = end ? addDays(end, d) : null;
      const state: 'done' | 'now' | 'later' = !due ? 'later' : today >= due ? 'done' : (d === 30 || (end && today >= addDays(end, d - 30))) ? 'now' : 'later';
      return { label: `Day ${d} visit`, sub: due ? monthYear(due) : '', state };
    }),
  ];
  const r = rollup([c]);
  return (
    <div className="bg-white font-sans text-[#1B2A2A]">
      <InfographicStyles />
      <TopBar />
      <Hero kicker={`${cohortPlace(c)}${c.start ? ` · ${monthYear(c.start)}` : ''}`} title={cohortName(c)} lead="One cohort, in numbers. This page keeps filling in as the 30, 60 and 90 day follow-up visits are completed.">
        <Tile value={fmt(r.enrolled)} label="People" sub={phaseOf(c, todayNairobi()) === 'finished' ? `${fmt(r.completed)} completed` : 'in training now'} tone="gold" />
        <Tile value={r.attendance != null ? `${r.attendance}%` : '—'} label="Attendance" sub={r.sessions ? `${fmt(r.sessions)} training days` : undefined} tone="green" />
        <Tile value={c.format === '12-day' ? '12' : c.format === '3-day-legacy' ? '3' : '5'} label="Training days" sub="in the programme" tone="light" />
      </Hero>
      <section className="bg-[#F5FAF8]"><div className="mx-auto max-w-5xl px-5 py-10"><div className="mb-4 text-xs font-black uppercase tracking-[.25em] text-[#B88F2F]">The path</div><Steps steps={steps} /></div></section>
      {c.small ? <Band kicker="Privacy" title="Too few people to show details"><Soon>Results are only shown for groups of five or more, so that no one can be picked out.</Soon></Band> : <Sections list={[c]} one={c} />}
      <div className="bg-white"><div className="mx-auto max-w-5xl px-5 pb-4 pt-8"><Link href="/impact" className="text-sm font-bold text-[#1B6666] underline">← All cohorts together</Link></div></div>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0D3B3B] text-teal-50/90">
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-12 sm:grid-cols-2">
        <div>
          <div className="text-xs font-black uppercase tracking-[.25em] text-[#D4A843]">How we count</div>
          <p className="mt-3 text-sm leading-relaxed">Figures come straight from our training records and follow-up visits and refresh every few minutes. We show totals and percentages only. Any figure based on fewer than five people is left out, and a partner organisation is named only when it has agreed to be.</p>
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-[.25em] text-[#D4A843]">Train with Elimu+</div>
          <p className="mt-3 text-sm leading-relaxed">Churches, community centres, schools, employers and NGOs bring Elimu+ to their people.</p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-bold">
            <a className="rounded-lg bg-[#D4A843] px-4 py-2 text-[#0D3B3B]" href="https://elimuplus.com/partner.html">Become a partner</a>
            <a className="rounded-lg border border-white/40 px-4 py-2" href="https://elimuplus.com/trainer.html">Become a trainer</a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-teal-50/60">Elimu+ · Start. Start small. Start to finish.</div>
    </footer>
  );
}
