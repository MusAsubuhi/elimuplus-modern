import Link from 'next/link';
import { requireFeature } from '@/lib/access';
import { asUser } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { C, Dial, HBars, InfographicStyles, Panel, Ring, Soon, Split, Journey, Tile } from '@/components/infographics';
import { EASE_FACES, EASE_WORDS } from '@/lib/feedback-options';

export const dynamic = 'force-dynamic';

type Grp = { n: number; ease_avg: number; ease_dist: Record<string, number>; promoters: number; passives: number; detractors: number; nps: number; avg_tenure: number; avg_visits: number; valuable: Record<string, number>; frustration: Record<string, number>; missing: Record<string, number> };
const rows = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));

function Block({ g, title }: { g: Grp; title: string }) {
  const dist = [1, 2, 3, 4, 5].map((i) => ({ label: `${EASE_FACES[i - 1]} ${EASE_WORDS[i - 1]}`, value: g.ease_dist[String(i)] ?? 0, color: i <= 2 ? C.clay : i === 3 ? C.gold : C.green }));
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-black text-teal">{title} <span className="text-sm font-semibold text-slate-500">· {g.n} answers</span></h2>
      <div className="grid gap-5 md:grid-cols-3">
        <Panel title="Ease of use" note="Average out of 5."><Dial value={g.ease_avg} min={1} max={5} text={g.ease_avg.toFixed(1)} label="average ease" color={g.ease_avg >= 4 ? C.green : g.ease_avg >= 3 ? C.gold : C.clay} stops /></Panel>
        <Panel title="Would recommend" note="Net promoter score: promoters minus detractors."><Dial value={g.nps} min={-100} max={100} text={`${g.nps > 0 ? '+' : ''}${g.nps}`} label="NPS" color={g.nps >= 30 ? C.green : g.nps >= 0 ? C.gold : C.clay} stops /></Panel>
        <Panel title="How people split"><Split parts={[{ label: 'Promoters (9-10)', value: g.promoters, color: C.green }, { label: 'Passive (7-8)', value: g.passives, color: C.gold }, { label: 'Detractors (0-6)', value: g.detractors, color: C.clay }]} /></Panel>
        <div className="md:col-span-1"><Panel title="How easy people say it is"><HBars rows={dist} max={Math.max(1, ...dist.map((d) => d.value))} /></Panel></div>
        <div className="md:col-span-2"><Panel title="What people value most" note="Each person could choose up to three."><HBars rows={rows(g.valuable)} color={C.green} /></Panel></div>
        <div className="md:col-span-1"><Panel title="What gets in the way"><HBars rows={rows(g.frustration)} color={C.clay} /></Panel></div>
        <div className="md:col-span-2"><Panel title="What would help most next"><HBars rows={rows(g.missing)} color={C.blue} /></Panel></div>
      </div>
    </section>
  );
}

export default async function Page() {
  const me = await requireFeature('feedback_results');
  const s: any = (await asUser(me.id, (q) => q('select app.feedback_summary() j')).catch(() => [{ j: null }]))[0]?.j;
  return (
    <div>
      <InfographicStyles />
      <PageHeader title="System feedback" subtitle="What the people who use the portal tell us about the portal, as totals only. Nobody's answers can be read individually, and a group appears once at least three people have answered." />
      {!s || !s.responses ? (
        <Soon>No answers yet. Everyone who uses the portal is asked once they have used the portal on five days over at least two weeks, then again every sixty days.</Soon>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Tile value={s.responses} label="Answers so far" tone="gold" />
            <Tile value={`${s.answered.partner}/${Math.max(s.eligible.partner, s.answered.partner)}`} label="Partners who answered" sub="of those asked so far" tone="green" />
            <Tile value={`${s.answered.participant}/${Math.max(s.eligible.participant, s.answered.participant)}`} label="Participants who answered" sub="of those asked so far" tone="clay" />
            <Tile value={`${s.answered.founder}/${Math.max(s.eligible.founder, s.answered.founder)}`} label="Founders who answered" sub="of those asked so far" tone="teal" />
            <Tile value={`${s.answered.trainer}/${Math.max(s.eligible.trainer, s.answered.trainer)}`} label="Trainers who answered" sub="of those asked so far" tone="light" />
          </div>
          {s.overall ? <Block g={s.overall} title="Everyone" /> : <Soon>The charts appear once three people have answered.</Soon>}
          {s.partner && <Block g={s.partner} title="Partners" />}
          {s.trainer && <Block g={s.trainer} title="Trainers" />}
          {s.founder && <Block g={s.founder} title="Founders" />}
          {s.participant && <Block g={s.participant} title="Participants" />}
          {s.overall && (
            <div className="grid gap-5 md:grid-cols-2">
              {s.by_tenure.length > 0 && <Panel title="Does it get easier with time?" note="Average ease by how long people have used the portal."><HBars rows={s.by_tenure.map((t: any) => ({ label: `${t.band} (${t.n})`, value: Number(t.ease_avg) }))} max={5} color={C.green} /></Panel>}
              {s.by_round.length > 1 && <Panel title="Ease over each survey round" note="Average ease at the first, second and later rounds."><Journey points={s.by_round.map((r: any) => ({ label: `Round ${r.round}`, value: Number(r.ease_avg) }))} max={5} suffix="" color={C.gold} /></Panel>}
            </div>
          )}
        </>
      )}
      <p className="mt-8 text-xs text-slate-500">Want the other side? <Link href="/impact" className="font-bold underline">See the public impact page</Link>.</p>
    </div>
  );
}
