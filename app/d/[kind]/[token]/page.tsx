import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { asAdmin } from '@/lib/db';
import PrintButton from '@/components/print-button';
import { d, kes } from '@/lib/format';
import { BANK, CONTACT, SESSION_HOURS, SMALL_GROUP, SMALL_GROUP_SESSION, TIERS, followups, tierFor, training } from '@/lib/pricing';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Elimu+ document' };

const wrap = 'mx-auto my-6 max-w-[820px] rounded-xl border border-teal-100 bg-white p-8 shadow-sm print:my-0 print:border-0 print:shadow-none';
const h2 = 'mt-7 border-b-2 border-gold pb-1 text-lg font-extrabold text-teal';
const th = 'bg-teal px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-white';
const td = 'border-b border-teal-50 px-3 py-2 text-sm';

function Head({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="flex items-start justify-between gap-4 border-b-4 border-teal pb-4">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="inline-block rounded-lg bg-teal px-3 py-2"><img src="/images/logo-elimu-white.png" alt="Elimu+" className="h-8 w-auto" /></span>
        <p className="mt-1 text-xs text-slate-500">Empowering Youth &amp; Women. Building Businesses. · Mombasa, Kenya · {CONTACT.email} · {CONTACT.web}</p>
      </div>
      <div className="text-right"><div className="text-2xl font-extrabold tracking-wide text-teal">{title}</div>{sub && <div className="text-xs text-slate-500">{sub}</div>}</div>
    </header>
  );
}
const Pair = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-4 border-b border-teal-50 py-1.5 text-sm"><span className="font-bold text-slate-600">{k}</span><span className="text-right">{v}</span></div>;

export default async function Doc({ params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind, token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  if (kind === 'quote' || kind === 'proposal') {
    const x = await asAdmin(async (q) => {
      const qt = (await q('select * from quotes where share_token=$1', [token]))[0];
      if (!qt) return null;
      const org = (await q('select * from organisations where id=$1', [qt.organisation_id]))[0];
      const co = qt.cohort_id ? (await q('select * from cohorts where id=$1', [qt.cohort_id]))[0] : null;
      const lines = await q('select * from quote_lines where quote_id=$1 order by kind', [qt.id]);
      return { qt, org, co, lines };
    });
    if (!x) notFound();
    return kind === 'quote' ? <Quotation {...x} /> : <Proposal {...x} />;
  }
  if (kind === 'invoice') {
    const x = await asAdmin(async (q) => {
      const inv = (await q('select * from invoices where share_token=$1', [token]))[0];
      if (!inv) return null;
      const org = (await q('select * from organisations where id=$1', [inv.organisation_id]))[0];
      const co = inv.cohort_id ? (await q('select name from cohorts where id=$1', [inv.cohort_id]))[0] : null;
      const paid = Number((await q('select coalesce(sum(amount_kes),0)::int n from payments where invoice_id=$1', [inv.id]))[0].n);
      const lines = inv.quote_id ? await q('select * from quote_lines where quote_id=$1 order by kind', [inv.quote_id]) : [];
      return { inv, org, co, paid, lines };
    });
    if (!x) notFound();
    return <Invoice {...x} />;
  }
  if (kind === 'receipt') {
    const x = await asAdmin(async (q) => {
      const r = (await q('select * from receipts where share_token=$1', [token]))[0];
      if (!r) return null;
      const p = (await q('select * from payments where id=$1', [r.payment_id]))[0];
      const inv = (await q('select * from invoices where id=$1', [p.invoice_id]))[0];
      const org = (await q('select * from organisations where id=$1', [inv.organisation_id]))[0];
      const total = Number((await q('select coalesce(sum(amount_kes),0)::int n from payments where invoice_id=$1', [inv.id]))[0].n);
      return { r, p, inv, org, total };
    });
    if (!x) notFound();
    return <Receipt {...x} />;
  }
  notFound();
}

function Quotation({ qt, org, co }: any) {
  const n = Number(qt.participants) || Number(co?.expected_participants) || 15;
  const sessions = Number(qt.sessions) || 5;
  const t = training(n, sessions), f = followups(n);
  const sizes = Array.from(new Set([n, ...(n <= 15 ? [10, 15] : n <= 25 ? [16, 20, 25] : [26, 30, 40])])).sort((a, b) => a - b);
  return (
    <>
      <div className="no-print mx-auto mt-4 flex max-w-[820px] justify-end"><PrintButton label="Print or save as PDF" /></div>
      <div className={wrap}>
        <Head title="QUOTATION" sub={qt.number ?? ''} />
        <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
          <Pair k="Quotation no." v={<b>{qt.number}</b>} /><Pair k="Date issued" v={d(qt.issued_on)} />
          <Pair k="Prepared for" v={<>{org.name}{org.code ? ` (${org.code})` : ''}</>} /><Pair k="Valid until" v={d(qt.valid_until)} />
          <Pair k="Prepared by" v="Elimu+, Mombasa" /><Pair k="Tier" v={t.tier.label} />
        </div>
        <h2 className={h2}>Pricing basis</h2>
        <table className="mt-2 w-full border-collapse"><tbody>
          <tr><td className={td}>Participant tier</td><td className={td}>{t.tier.label}</td></tr>
          <tr><td className={td}>Rate</td><td className={td}>KES {t.tier.rate} per participant, per session</td></tr>
          <tr><td className={td}>Session length</td><td className={td}>{SESSION_HOURS} hours</td></tr>
          <tr><td className={td}>Minimum sessions per participant</td><td className={td}>{sessions} sessions</td></tr>
          <tr><td className={td}>Cost per participant</td><td className={td}>KES {t.tier.rate} × {sessions} = {kes(t.perParticipant)}</td></tr>
        </tbody></table>
        {n <= SMALL_GROUP && <p className="mt-2 text-xs text-slate-600">For groups of {SMALL_GROUP} participants or fewer, Elimu+ applies a flat rate of {kes(SMALL_GROUP_SESSION)} per {SESSION_HOURS}-hour session.</p>}
        <h2 className={h2}>Estimated training cost</h2>
        <table className="mt-2 w-full border-collapse"><thead><tr><th className={th}>Participants</th><th className={th}>Per participant ({sessions} sessions)</th><th className={th}>Estimated total</th></tr></thead>
          <tbody>{sizes.map((s) => { const tt = training(s, sessions); return <tr key={s} className={s === n ? 'bg-gold-100 font-bold' : ''}><td className={td}>{s}{s === n ? ' (this quotation)' : ''}</td><td className={td}>{kes(tt.perParticipant)}</td><td className={td}>{kes(tt.total)}</td></tr>; })}</tbody></table>
        <h2 className={h2}>Follow-up visits (30, 60 and 90 days)</h2>
        <table className="mt-2 w-full border-collapse"><thead><tr><th className={th}>Participants</th><th className={th}>Per participant</th><th className={th}>Estimated total</th></tr></thead>
          <tbody>{sizes.map((s) => { const ff = followups(s); return <tr key={s} className={s === n ? 'bg-gold-100 font-bold' : ''}><td className={td}>{s}</td><td className={td}>{kes(ff.perParticipant)}</td><td className={td}>{kes(ff.total)}</td></tr>; })}</tbody></table>
        <p className="mt-2 text-xs text-slate-600">The follow-up fee is shared equally across the three visits. Each visit is invoiced separately, about two weeks before it takes place.</p>
        <div className="mt-5 rounded-lg bg-mist p-4 text-sm"><b>This quotation: </b>training {kes(t.total)} + follow-up {kes(f.total)} = <b>{kes(t.total + f.total)}</b> for {n} participants.</div>
        <h2 className={h2}>What is included</h2>
        <p className="mt-2 text-sm leading-relaxed">Curriculum &amp; facilitation (two trained facilitators, SAME framework &amp; SEE Canvas) · Bilingual materials (Swahili-first) · 30/60/90-day follow-up visits · Formal programme report · Certificates of Completion.</p>
        <h2 className={h2}>Payment terms</h2>
        <p className="mt-2 text-sm leading-relaxed">Payment is per participant, per session, at the rate shown. Final invoicing is based on confirmed attendance registers. This quotation is valid until {d(qt.valid_until)} and may be revised if final numbers fall outside the tier indicated.</p>
        <p className="mt-2 text-sm"><b>Bank details:</b> Account name: {BANK.name} · Account number: {BANK.number} · Bank: {BANK.bank}</p>
        <p className="mt-6 text-sm">We look forward to partnering with {org.name} on this cohort.<br />For Elimu+,<br /><b>{CONTACT.signer}</b><br />{CONTACT.signerRole}, Elimu+</p>
      </div>
    </>
  );
}

function Invoice({ inv, org, co, paid, lines }: any) {
  const bal = inv.amount_kes - paid;
  return (
    <>
      <div className="no-print mx-auto mt-4 flex max-w-[820px] justify-end"><PrintButton label="Print or save as PDF" /></div>
      <div className={wrap}>
        <Head title="INVOICE" sub={inv.number} />
        <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
          <Pair k="Invoice no." v={<b>{inv.number}</b>} /><Pair k="Issued" v={d(inv.issued_on)} />
          <Pair k="Billed to" v={org.name} /><Pair k="Due" v={d(inv.due_on)} />
          {co && <Pair k="Cohort" v={co.name} />}<Pair k="Status" v={bal <= 0 ? 'Paid' : paid > 0 ? 'Part paid' : 'Awaiting payment'} />
        </div>
        <table className="mt-5 w-full border-collapse"><thead><tr><th className={th}>Description</th><th className={th}>Amount</th></tr></thead>
          <tbody><tr><td className={td}>{inv.description || (inv.kind === 'followup' ? '30, 60 and 90-day follow-up visits' : 'Training')}</td><td className={td}>{kes(inv.amount_kes)}</td></tr>
            <tr><td className={`${td} text-right font-bold`}>Paid so far</td><td className={td}>{kes(paid)}</td></tr>
            <tr><td className={`${td} text-right font-bold`}>Balance due</td><td className={`${td} font-bold`}>{kes(bal)}</td></tr></tbody></table>
        {lines.length > 0 && <p className="mt-2 text-xs text-slate-500">Based on quotation lines: {lines.map((l: any) => `${l.description} (${l.qty} × ${kes(l.unit_kes)})`).join('; ')}</p>}
        <h2 className={h2}>How to pay</h2>
        <p className="mt-2 text-sm leading-relaxed">Bank transfer: {BANK.name}, account {BANK.number}, {BANK.bank}. Please use <b>{inv.number}</b> as the reference. After paying, sign in to the Elimu+ portal and choose “I have paid” on the invoice, so we can confirm it and send your receipt.</p>
        <p className="mt-6 text-xs text-slate-500">Questions: {CONTACT.email} · {CONTACT.phone}</p>
      </div>
    </>
  );
}

function Receipt({ r, p, inv, org, total }: any) {
  return (
    <>
      <div className="no-print mx-auto mt-4 flex max-w-[820px] justify-end"><PrintButton label="Print or save as PDF" /></div>
      <div className={wrap}>
        <Head title="RECEIPT" sub={r.number} />
        <div className="mt-4 grid gap-x-8 sm:grid-cols-2">
          <Pair k="Receipt no." v={<b>{r.number}</b>} /><Pair k="Date" v={d(p.received_on)} />
          <Pair k="Received from" v={org.name} /><Pair k="Method" v={p.method === 'mpesa' ? 'M-Pesa' : p.method === 'bank' ? 'Bank transfer' : p.method} />
          <Pair k="For invoice" v={inv.number} /><Pair k="Reference" v={p.reference || '—'} />
        </div>
        <div className="mt-6 rounded-lg bg-mist p-5 text-center"><div className="text-xs font-bold uppercase text-slate-500">Amount received</div><div className="text-3xl font-extrabold text-teal">{kes(p.amount_kes)}</div></div>
        <p className="mt-4 text-sm">Invoice total {kes(inv.amount_kes)} · received to date {kes(total)} · balance {kes(Math.max(0, inv.amount_kes - total))}.</p>
        <p className="mt-6 text-sm">Thank you for partnering with Elimu+.<br /><b>{CONTACT.signer}</b>, {CONTACT.signerRole}</p>
        <p className="mt-4 text-xs text-slate-500">{CONTACT.email} · {CONTACT.phone} · {CONTACT.web}</p>
      </div>
    </>
  );
}

function Proposal({ qt, org, co }: any) {
  const n = Number(qt.participants) || Number(co?.expected_participants) || 15;
  const t = training(n, Number(qt.sessions) || 5), f = followups(n);
  const fmt = co?.format === '12-day' ? '12-Day Programme' : '5-Day Foundation';
  const Box = ({ title, children }: { title: string; children: React.ReactNode }) => <div className="rounded-lg border border-teal-100 bg-mist p-4"><div className="font-extrabold text-teal">{title}</div><div className="mt-1 text-sm leading-relaxed">{children}</div></div>;
  return (
    <>
      <div className="no-print mx-auto mt-4 flex max-w-[820px] justify-end"><PrintButton label="Print or save as PDF" /></div>
      <div className={wrap}>
        <Head title="PARTNERSHIP PROPOSAL" sub={`For ${org.name}${org.code ? ` (${org.code})` : ''}`} />
        <p className="mt-6 text-sm leading-relaxed">Elimu+ is a Mombasa-based capacity-building organisation that helps women and youth from low-income communities build real, surviving businesses, not just attend training. We work through institutional partners, churches, NGOs and colleges, that already know their communities and want to offer them something practical and lasting. This proposal sets out what a partnership with {org.name} would look like{co ? `, starting with the ${co.name} cohort` : ''}.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Box title="Simple and actionable">The SAME framework (Simple, Actionable, Memorable, Experiential) runs through every session.</Box>
          <Box title="Bilingual by design">All materials are Swahili-first with English support, built for participants with limited formal education.</Box>
          <Box title="Handholding until success">Structured follow-up at 30, 60 and 90 days tracks real business outcomes.</Box>
        </div>
        <h2 className={h2}>The problem we solve</h2>
        <p className="mt-2 text-sm leading-relaxed">Across Mombasa’s low-income communities many women and youth have already received training and start-up capital, yet most of those businesses collapse within months. The failure is not a lack of motivation. It is a lack of practical tools, localised content and follow-through: training designed for classrooms and not market stalls, capital without systems to separate business money from household money, and organisations that train, report and move on.</p>
        <h2 className={h2}>Proof of traction</h2>
        <p className="mt-2 text-sm leading-relaxed">At KE358 Deliverance Church Likoni CDC, 30 days after training, <b>90%</b> of businesses were still operating and <b>70%</b> reported growing income, across ten businesses and KES 153,000 of total support mobilised. Three programmes have been delivered so far, and follow-up continues.</p>
        <h2 className={h2}>Our core tool: the SEE Canvas</h2>
        <p className="mt-2 text-sm leading-relaxed">The SEE Canvas (Solutions for Employability and Entrepreneurship) is a 12-section bilingual business planning tool covering problem, solution, customers, pricing, costs, break-even and profit. Every participant keeps their completed canvas as a reference after training ends.</p>
        <h2 className={h2}>The programme for {org.name}</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Box title={fmt}>{co?.format === '12-day' ? 'The complete programme: twelve sessions covering all employability and entrepreneurship topics in depth.' : 'A compressed intensive that takes participants from zero to a completed SEE Canvas, with strong financial literacy coverage and follow-up dates confirmed before the last day.'}</Box>
          <Box title="Proposed cohort">{n} participants{co?.venue ? ` · ${co.venue}` : ''}{co?.start_date ? ` · starting ${d(co.start_date)}` : ''}. Training in {co?.language === 'en' ? 'English' : 'Kiswahili'}.</Box>
        </div>
        <h2 className={h2}>What partnership looks like</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Box title="Elimu+ provides">Two trained facilitators for every session · bilingual participant booklets and SEE Canvas · 30, 60 and 90-day follow-up visits · a formal programme report after the cohort · a Certificate of Completion for every graduate · a portal where you see your cohorts, daily attendance summaries, results and invoices.</Box>
          <Box title={`${org.name} provides`}>Participant recruitment and mobilisation · a venue for sessions · a liaison for coordination · contribution to the programme cost, as set out in the attached quotation.</Box>
        </div>
        <h2 className={h2}>Investment</h2>
        <p className="mt-2 text-sm leading-relaxed">For {n} participants: training {kes(t.total)} and follow-up visits {kes(f.total)}, a total of <b>{kes(t.total + f.total)}</b>. Rates by group size: {TIERS.map((x) => `${x.label} at KES ${x.rate} per participant per session`).join('; ')}. Full details are in quotation {qt.number}.</p>
        <h2 className={h2}>Beyond the cohort</h2>
        <p className="mt-2 text-sm leading-relaxed">Graduates can grow from participant to active alumni (after the 90-day visit), peer mentor and certified facilitator, so your investment grows with every cohort. Monthly forums keep alumni connected to each other and to us.</p>
        <h2 className={h2}>The team</h2>
        <p className="mt-2 text-sm leading-relaxed"><b>James Kimani</b>, Co-founder &amp; Executive Director, brings eight years in insurance sales and three in banking to the operational leadership of Elimu+ and co-facilitates every programme. <b>Musa Asubuhi</b>, Co-founder &amp; Programme Director, is the architect of the SEE Canvas and SAME framework and leads curriculum design and facilitation.</p>
        <div className="mt-6 rounded-lg border-2 border-gold p-4 text-sm"><b className="text-teal">Suggested next step:</b> a brief conversation to understand your cohort, agree on the format and confirm a launch date. Contact James Kimani, {CONTACT.phone}, {CONTACT.email}.</div>
      </div>
    </>
  );
}
