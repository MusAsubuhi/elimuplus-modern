import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { suggestIndividual, suggestOrganisation } from '../../team-actions';
import { EDUCATION, ORG_TYPES, educationLabel, orgTypeLabel } from '@/lib/options';
import { d } from '@/lib/format';

export default async function Suggest() {
  const me = await requireMe('master', 'founder', 'facilitator');
  const { orgs, mine, mineOrgs } = await asUser(me.id, async (q) => ({
    orgs: await q('select id, name from organisations where not is_internal order by name'),
    mine: await q('select * from invitations where nominated_by=$1 order by created_at desc', [me.id]),
    mineOrgs: await q('select * from org_suggestions where suggested_by=$1 order by created_at desc', [me.id]),
  }));
  const canTrainer = me.tier >= 3 || me.roles.includes('founder');
  return (
    <>
      <PageHeader image="/images/trainer-team.jpg" title="Suggest people and partners" subtitle="Nobody joins by themselves. Tell us who should be brought in, and what we need to know about them; a founder reviews every suggestion and creates the account." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Suggest a person" subtitle="A participant, or (master trainers) a trainer candidate. Age, schooling and where they live help us place them well.">
          <form action={suggestIndividual} className="grid gap-3 text-sm sm:grid-cols-2">
            <input type="hidden" name="back" value="/portal/invite" />
            <label className="block font-bold sm:col-span-2">Full name<input name="name" required className={inputCls} /></label>
            <label className="block font-bold">Phone or email<input name="contact" required className={inputCls} /></label>
            <label className="block font-bold">Age (approximate is fine)<input name="age" type="number" min="10" max="99" required className={inputCls} /></label>
            <label className="block font-bold">Education level
              <select name="education" required defaultValue="" className={inputCls}><option value="" disabled>Choose…</option>{EDUCATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <label className="block font-bold">What they do now<input name="occupation" placeholder="e.g. sells vegetables, student, tailor" className={inputCls} /></label>
            <label className="block font-bold">As
              <select name="role" className={inputCls}><option value="participant">Participant</option>{canTrainer && <option value="trainer_candidate">Trainer candidate (campus or community)</option>}</select>
            </label>
            <label className="block font-bold">Linked partner (optional)
              <select name="org" className={inputCls}><option value="">None / Elimu+ direct</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </label>
            <label className="block font-bold">County<input name="county" defaultValue="Mombasa" className={inputCls} /></label>
            <label className="block font-bold">Ward or area<input name="ward" placeholder="e.g. Likoni" className={inputCls} /></label>
            <label className="block font-bold sm:col-span-2">Why them? (optional)<textarea name="note" rows={2} className={inputCls} /></label>
            <label className="flex gap-2 sm:col-span-2"><input type="checkbox" name="guardian" />Guardian consent obtained (required under 18)</label>
            <div className="sm:col-span-2"><button className={submitCls}>Send for approval</button></div>
          </form>
        </Card>
        <Card title="Suggest an organisation" subtitle="A church, school, CDC, college, group or company that could host a cohort. Where it is matters most.">
          <form action={suggestOrganisation} className="grid gap-3 text-sm sm:grid-cols-2">
            <label className="block font-bold sm:col-span-2">Organisation name<input name="name" required className={inputCls} /></label>
            <label className="block font-bold">Type<select name="type" className={inputCls}>{ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="block font-bold">Part of an existing partner?
              <select name="parent" className={inputCls}><option value="">No, independent</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
            </label>
            <label className="block font-bold">County<input name="county" required defaultValue="Mombasa" className={inputCls} /></label>
            <label className="block font-bold">Ward or area<input name="ward" placeholder="e.g. Likoni, Shika Adabu" className={inputCls} /></label>
            <label className="block font-bold sm:col-span-2">Street, landmark or directions<input name="address" placeholder="e.g. opposite Likoni ferry, behind the market" className={inputCls} /></label>
            <label className="block font-bold">Contact person<input name="contact_person" className={inputCls} /></label>
            <label className="block font-bold">Contact phone<input name="contact_phone" inputMode="tel" className={inputCls} /></label>
            <label className="block font-bold">Contact email<input name="contact_email" type="email" className={inputCls} /></label>
            <label className="block font-bold">About how many people could join<input name="people" type="number" min="1" className={inputCls} /></label>
            <label className="block font-bold sm:col-span-2">What they do and who they serve<textarea name="what" rows={2} className={inputCls} /></label>
            <label className="block font-bold sm:col-span-2">Why would they be a good partner?<textarea name="why" rows={2} className={inputCls} /></label>
            <div className="sm:col-span-2"><button className={submitCls}>Send for approval</button></div>
          </form>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="My people suggestions">
          <Table head={['Name', 'Age · schooling', 'Role', 'Status', 'Date']} rows={mine.map((i) => [
            <b key="n">{i.full_name}</b>,
            <span key="a" className="text-xs">{i.birth_year ? `${new Date().getFullYear() - i.birth_year} yrs` : ''}{i.education_level ? ` · ${educationLabel(i.education_level)}` : ''}</span>,
            i.role.replace(/_/g, ' '), <Badge key="s" tone={statusTone(i.status)}>{i.status === 'activated' ? 'account created' : i.status}</Badge>, d(i.created_at)])} empty="Nobody suggested yet." />
        </Card>
        <Card title="My organisation suggestions">
          <Table head={['Organisation', 'Where', 'Status', 'Date']} rows={mineOrgs.map((o) => [
            <div key="n"><b>{o.name}</b><div className="text-xs text-slate-500">{orgTypeLabel(o.type)}</div></div>,
            <span key="w" className="text-xs">{[o.ward, o.county].filter(Boolean).join(', ')}</span>,
            <Badge key="s" tone={statusTone(o.status)}>{o.status}</Badge>, d(o.created_at)])} empty="No organisations suggested yet." />
        </Card>
      </div>
    </>
  );
}
