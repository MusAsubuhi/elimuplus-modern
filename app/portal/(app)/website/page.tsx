import Link from 'next/link';
import { asAdmin } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { audit } from '@/lib/audit';
import { Badge, Card, PageHeader, Stat, inputCls, submitCls } from '@/components/ui';
import { d } from '@/lib/format';
import { addListing, deleteListing, hideListing, publishListing, refreshListing, saveListing } from '../../website-actions';

export const dynamic = 'force-dynamic';

type L = { id: string; cohort_id: string | null; cohort_name: string | null; cohort_status: string | null; start_date: string | null; badge: string; heading: string; blurb: string; date_note: string; status: string; published_at: string | null; starts_on: string | null };

const Fields = ({ l }: { l?: Partial<L> }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    <label className="text-xs font-bold text-teal">Label (the dark tag)<input name="badge" defaultValue={l?.badge} maxLength={80} required className={inputCls} /></label>
    <label className="text-xs font-bold text-teal">Heading<input name="heading" defaultValue={l?.heading} maxLength={80} required className={inputCls} /></label>
    <label className="text-xs font-bold text-teal sm:col-span-2">Description<textarea name="blurb" defaultValue={l?.blurb} maxLength={500} rows={2} required className={inputCls} /></label>
    <label className="text-xs font-bold text-teal sm:col-span-2">{l?.cohort_id ? 'Dates line (automatic: worked out from the cohort’s dates, so it stays current)' : 'Dates line (gold, at the bottom of the card)'}<input name="date_note" defaultValue={l?.date_note} maxLength={120} required readOnly={!!l?.cohort_id} className={inputCls + (l?.cohort_id ? ' bg-gray-100 text-gray-600' : '')} /></label>
  </div>
);

/** What the visitor sees, drawn the same way as on the Join page. */
const Preview = ({ l }: { l: Pick<L, 'badge' | 'heading' | 'blurb' | 'date_note'> }) => (
  <div className="rounded-lg border border-teal-100 bg-white p-4">
    <span className="inline-block rounded bg-teal px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gold">{l.badge}</span>
    <div className="mt-2 text-lg font-bold text-teal">{l.heading}</div>
    <p className="mt-1 text-sm">{l.blurb}</p>
    <p className="mt-2 text-sm font-bold text-amber-700">{l.date_note}</p>
  </div>
);

function Row({ l, mode }: { l: L; mode: 'draft' | 'published' | 'hidden' }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-mist p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        {l.cohort_id ? <>Cohort: <Link href={`/portal/cohorts/${l.cohort_id}`} className="font-bold text-teal underline">{l.cohort_name}</Link>{l.cohort_status && <Badge>{l.cohort_status}</Badge>}{l.start_date && <span>starts {d(l.start_date)}</span>}</> : <span>Not tied to a cohort in the portal</span>}
        {l.published_at && mode === 'published' && <span>published {d(l.published_at)}</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div><div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">As visitors will see it</div><Preview l={l} /></div>
        <form className="space-y-2">
          <input type="hidden" name="id" value={l.id} />
          <Fields l={l} />
          <div className="flex flex-wrap gap-2 pt-1">
            {mode !== 'published' && <button formAction={publishListing} className={submitCls}>Publish on the website</button>}
            <button formAction={saveListing} className="rounded-lg border border-teal px-4 py-2 text-sm font-bold text-teal hover:bg-white">{mode === 'published' ? 'Save changes (live at once)' : 'Save wording'}</button>
            {l.cohort_id && <button formAction={refreshListing} className="rounded-lg border border-teal-100 px-4 py-2 text-sm text-slate-600 hover:bg-white">Refresh from cohort</button>}
            {mode !== 'hidden' && <button formAction={hideListing} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-white">{mode === 'published' ? 'Take off the website' : 'Hide'}</button>}
            {!l.cohort_id && <button formAction={deleteListing} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-white">Delete</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

export default async function Website() {
  const me = await requireFeature('website');
  await audit(me.id, 'view website listings', 'website_listings');
  const list = (await asAdmin((q) => q(`select l.id, l.cohort_id, c.name cohort_name, c.status cohort_status, c.start_date, l.badge, l.heading, l.blurb, case when c.id is not null then app.listing_when(c) else l.date_note end date_note, l.status, l.published_at, l.starts_on
    from website_listings l left join cohorts c on c.id=l.cohort_id order by coalesce(c.start_date, l.starts_on) nulls last, l.created_at`))) as unknown as L[];
  const drafts = list.filter((l) => l.status === 'draft'), live = list.filter((l) => l.status === 'published'), hidden = list.filter((l) => l.status === 'hidden');
  return (
    <>
      <PageHeader title="Website listings" subtitle="The cohort cards under “Cohorts in planning” on the Join page. A new cohort arrives here as a draft with the wording already written. Nothing goes public until you tap Publish, and each card’s dates line updates by itself as the cohort moves from upcoming to under way to finished, and the card leaves the website 30 days after the cohort ends." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat tone={drafts.length ? 'gold' : 'teal'} label="Waiting for you" value={drafts.length} sub="drafts to publish or hide" />
        <Stat tone="green" label="On the website now" value={live.length} />
        <Stat label="Hidden" value={hidden.length} />
      </div>
      <p className="mb-4 rounded-lg bg-teal-50 p-3 text-sm text-teal">Only these four lines ever leave the portal for a card: label, heading, description and dates. No names, phone numbers, money or participant counts are sent. The website shows the cards a minute or so after you publish, with no redeploy.</p>

      {drafts.length > 0 && <Card className="mb-6" title="Waiting for you" subtitle="Read the wording, change what you like, then publish or hide.">
        <div className="space-y-4">{drafts.map((l) => <Row key={l.id} l={l} mode="draft" />)}</div></Card>}

      <Card className="mb-6" title="On the website now" subtitle="Edits to these go live as soon as you save.">
        {live.length ? <div className="space-y-4">{live.map((l) => <Row key={l.id} l={l} mode="published" />)}</div> : <p className="text-sm text-slate-600">Nothing is published. The website then shows its built-in cards.</p>}</Card>

      <Card className="mb-6" title="Add a planned cohort that is not in the portal yet" subtitle="For example next April's youth cohort before a partner has booked it. It starts as a draft.">
        <form className="space-y-2">
          <Fields />
          <label className="block text-xs font-bold text-teal sm:w-1/2">Month it starts (used for order, and to take the card down once that month has passed)<input type="date" name="starts_on" className={inputCls} /></label>
          <button formAction={addListing} className={submitCls}>Add as a draft</button>
        </form></Card>

      {hidden.length > 0 && <Card title="Hidden" subtitle="Not on the website. Publish again any time.">
        <div className="space-y-4">{hidden.map((l) => <Row key={l.id} l={l} mode="hidden" />)}</div></Card>}
    </>
  );
}
