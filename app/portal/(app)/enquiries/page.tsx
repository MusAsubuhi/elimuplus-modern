import { asUser } from '@/lib/db';
import { requireFeature } from '@/lib/access';
import { Badge, Card, PageHeader } from '@/components/ui';
import { AddPersonForm, InvitePartnerForm, type PersonDefaults } from '@/components/pin-forms';
import { dismissEnquiry, resendAck } from '../../enquiry-actions';
import { CopyBox } from '@/components/copy-box';
import { ackText } from '@/lib/enquiry';
import { d } from '@/lib/format';

export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { trainer: 'Trainer interest', organisation: 'Organisation registration', partner: 'Partner enquiry', quote: 'Quote request' };
const FIELD: Record<string, string> = {
  full_name: 'Name', your_name: 'Name', contact_person: 'Contact person', email: 'Email', phone: 'Phone', whatsapp: 'WhatsApp', location: 'Location', occupation: 'Occupation',
  path: 'How they would join', motivation: 'Why they want to train', attended_programme: 'Attended an Elimu+ programme', institution_name: 'Organisation', organisation_name: 'Organisation',
  your_role: 'Their role', contact_role: 'Their role', institution_type: 'Type', organisation_type: 'Type', community_size: 'Community size', participants: 'Participants expected',
  participant_group: 'Who the participants are', programme: 'Programme', follow_up: 'Follow-up', timing: 'Preferred timing', message: 'Message', authorised: 'Authorised to register', newsletter_optin: 'Newsletter opt-in',
};
const orgType = (t = '') => { const x = t.toLowerCase(); return x.includes('cdc') || x.includes('development cent') ? 'cdc' : x.includes('church') || x.includes('faith') || x.includes('mosque') ? 'church' : x.includes('school') ? 'school' : x.includes('college') || x.includes('universit') ? 'college' : x.includes('ngo') || x.includes('non-gov') || x.includes('community') ? 'ngo' : x.includes('company') || x.includes('business') || x.includes('sacco') ? 'company' : 'other'; };

export default async function Enquiries() {
  const me = await requireFeature('enquiries');
  const { rows, orgs, cohorts } = await asUser(me.id, async (q) => ({
    rows: await q("select * from web_enquiries order by (status='new') desc, created_at desc limit 80"),
    orgs: await q("select id, name from organisations where status <> 'closed' order by name"),
    cohorts: await q('select id, name from cohorts order by seq'),
  }));
  const recent = (r: any) => r.status === 'accepted' && r.handled_at && Date.now() - new Date(r.handled_at).getTime() < 3 * 3600 * 1000;
  // An enquiry stays on screen for a few hours after the account is created, so the PIN message can still be copied.
  const open = rows.filter((r) => r.status === 'new' || recent(r)), past = rows.filter((r) => !(r.status === 'new' || recent(r)));
  return (
    <>
      <PageHeader title="Website enquiries" subtitle="Trainer, organisation and quote forms from elimuplus.com. Check the details, change anything, then create their account. The temporary PIN appears once, ready to copy and send." />
      {open.length === 0 && <Card><p className="text-sm text-slate-600">No new enquiries. When someone fills in a form on the website it appears here, and you get an alert.</p></Card>}
      <div className="space-y-4">
        {open.map((r) => {
          const p = (r.payload ?? {}) as Record<string, string>;
          const phone = r.phone ?? '';
          const defaults: PersonDefaults = r.kind === 'trainer'
            ? { enquiry: r.id, name: r.name ?? '', phone, email: r.email ?? '', occupation: p.occupation, county: (p.location ?? '').split(',').pop()?.trim() || 'Mombasa', ward: (p.location ?? '').split(',')[0]?.trim(), role: 'trainer_candidate', lang: 'en' }
            : { enquiry: r.id, name: r.name ?? '', phone, email: r.email ?? '', newOrg: r.org_name ?? '', orgType: orgType(p.institution_type || p.organisation_type), lang: 'en' };
          return (
            <Card key={r.id} title={`${r.name || r.email || 'Someone'}${r.org_name ? ` · ${r.org_name}` : ''}`} subtitle={`${KIND[r.kind] ?? r.kind} · sent ${d(r.created_at)}`}>
              <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {Object.entries(p).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className={k === 'motivation' || k === 'message' ? 'sm:col-span-2' : ''}><dt className="text-xs font-semibold text-slate-500">{FIELD[k] ?? k.replace(/_/g, ' ')}</dt><dd className="text-slate-800">{v}</dd></div>
                ))}
              </dl>
              <div className="mb-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {r.ack_sent_at ? <Badge tone="green">Acknowledgement emailed {d(r.ack_sent_at)}</Badge> : <Badge tone="red">Acknowledgement email not sent</Badge>}
                  {!r.ack_sent_at && r.ack_error && <span className="text-xs text-red-700">{r.ack_error}</span>}
                  {!r.ack_sent_at && r.email && <form action={resendAck}><input type="hidden" name="id" value={r.id} /><button className="rounded-lg border border-teal px-3 py-1 text-xs font-bold text-teal hover:bg-teal-50">Try sending again</button></form>}
                </div>
                {!r.ack_sent_at && <CopyBox label="Or send this acknowledgement yourself (email or WhatsApp)" text={`${ackText(r as any).subject}\n\nHello ${(r.name ?? '').split(/\s+/)[0] || 'there'},\n\n${ackText(r as any).text.replace(/^[^\n]*\n+/, '')}`} />}
              </div>
              {r.status === 'accepted' && <p className="mb-3 rounded-lg bg-gold-100 px-3 py-2 text-sm font-semibold text-teal">Account created. Copy the sign-in message below before you leave this page. If you miss it, use Reset PIN on the Team page for a fresh one.</p>}
              <details className="rounded-lg border border-teal-100 p-3" open>
                <summary className="cursor-pointer font-bold text-teal">{r.kind === 'trainer' ? 'Create their trainer account' : 'Create the partner account'}</summary>
                <div className="mt-3">
                  {r.kind === 'trainer'
                    ? <AddPersonForm orgs={orgs as any} cohorts={cohorts as any} defaults={defaults} />
                    : <InvitePartnerForm orgs={orgs as any} defaults={defaults} />}
                </div>
              </details>
              <form action={dismissEnquiry} className="mt-3"><input type="hidden" name="id" value={r.id} /><button className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Set aside (spam, duplicate or not a fit)</button></form>
            </Card>
          );
        })}
      </div>
      {past.length > 0 && (
        <Card className="mt-6" title="Handled">
          <ul className="space-y-1 text-sm">{past.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2"><Badge tone={r.status === 'accepted' ? 'green' : 'grey'}>{r.status === 'accepted' ? 'Account created' : 'Set aside'}</Badge><b>{r.name || r.email}</b><span className="text-xs text-slate-500">{KIND[r.kind] ?? r.kind} · {d(r.created_at)}</span></li>)}</ul>
        </Card>
      )}
    </>
  );
}
