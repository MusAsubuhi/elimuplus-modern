'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { asAdmin, asUser, dbMode, type Q } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { requireFeature } from '@/lib/access';
import { normPhone, provisionLogin, tempPin } from '@/lib/accounts';
import { audit } from '@/lib/audit';
import { nextTrainerNumber } from '@/lib/certs';
import { notify } from '@/lib/mail';

export type PinState = { ok?: boolean; error?: string; name?: string; phone?: string; pin?: string; message?: string } | null;

const back = (path: string, msg: string, kind: 'ok' | 'err' = 'ok'): never =>
  redirect(`${path}${path.includes('?') ? '&' : '?'}${kind}=${encodeURIComponent(msg)}`);
const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const year = () => new Date().getFullYear();
const birthFromAge = (age: number) => (age > 0 && age < 100 ? year() - age : null);

type RoleSpec = { role: 'founder' | 'staff' | 'facilitator' | 'participant' | 'trainer_candidate' | 'org_admin' | 'org_viewer'; tier: number | null };
function parseRole(spec: string): RoleSpec | null {
  if (spec.startsWith('facilitator:')) {
    const tier = Number(spec.split(':')[1]);
    return tier >= 0 && tier <= 4 ? { role: 'facilitator', tier } : null;
  }
  return ['founder', 'staff', 'participant', 'trainer_candidate', 'org_admin', 'org_viewer'].includes(spec) ? { role: spec as RoleSpec['role'], tier: null } : null;
}
const needsOrg = (r: RoleSpec) => r.role === 'org_admin' || r.role === 'org_viewer';

async function phoneTaken(phone: string, exceptId?: string) {
  const rows = await asAdmin((q) => q('select id from people where phone = $1 or phone = $2', [phone, '+254' + phone.slice(1)]));
  return rows.some((r) => r.id !== exceptId);
}

/** Put a participant into a cohort and give them a canvas. Runs under the caller's rules. */
async function enrol(q: Q, cohortId: string, personId: string) {
  const en = (await q(
    `insert into enrolments(cohort_id, person_id) values ($1,$2)
     on conflict (cohort_id, person_id) do update set cohort_id = excluded.cohort_id returning id`, [cohortId, personId]))[0];
  await q('insert into canvases(enrolment_id) values ($1) on conflict (enrolment_id) do nothing', [en.id]);
}

/* ---------- founders add people directly ---------- */
export async function addPerson(_prev: PinState, f: FormData): Promise<PinState> {
  const me = await requireMe('founder');
  const name = s(f, 'name');
  const phone = normPhone(s(f, 'phone'));
  const role = parseRole(s(f, 'role'));
  const orgId = s(f, 'org') || null;
  const age = Number(s(f, 'age')) || 0;
  if (!name) return { error: 'Enter the full name.' };
  if (!phone) return { error: 'Enter a valid Kenyan phone number, for example 0712 345 678. It is their sign-in.' };
  if (!role) return { error: 'Choose a role.' };
  if (needsOrg(role) && !orgId) return { error: 'Choose the partner organisation for this role.' };
  if (role.role === 'facilitator' && age && age < 15) return { error: 'Facilitators must be at least 15.' };
  if (age && age < 18 && f.get('guardian') !== 'on') return { error: 'Under 18: tick that guardian consent has been obtained.' };
  if (await phoneTaken(phone)) return { error: 'Someone with that phone number is already on the platform.' };

  let personId = '';
  try {
    personId = await asUser(me.id, async (q) => {
      const p = (await q(
        `insert into people(full_name, display_name, phone, email, preferred_language, birth_year, education_level, occupation, county, ward, newsletter_consent, newsletter_consent_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, case when $11 then now() end) returning id`,
        [name, s(f, 'display') || name.split(/\s+/)[0], phone, s(f, 'email') || null, s(f, 'lang') === 'en' ? 'en' : 'sw',
         age ? birthFromAge(age) : null, s(f, 'education') || null, s(f, 'occupation') || null, s(f, 'county') || null, s(f, 'ward') || null,
         !!s(f, 'email') && f.get('newsletter') === 'on']))[0];
      await q('insert into role_assignments(person_id, role, tier, organisation_id) values ($1,$2,$3,$4)',
        [p.id, role.role, role.tier, role.role === 'participant' || needsOrg(role) ? orgId : null]);
      if (role.role === 'participant' && s(f, 'cohort')) await enrol(q, s(f, 'cohort'), p.id);
      return p.id as string;
    });
  } catch (e: any) {
    return { error: 'Could not add this person. ' + (e?.message?.includes('row-level') ? 'You do not have permission.' : 'Check the details and try again.') };
  }
  const pin = tempPin();
  try { await provisionLogin(personId, phone, pin); }
  catch (e: any) { return { error: `${name} was added, but the sign-in could not be created (${e.message}). Use "Reset PIN" beside their name.` }; }
  await audit(me.id, `added ${role.role}${role.tier ? ' tier ' + role.tier : ''}: ${name}`, 'people');
  revalidatePath('/portal/team');
  return { ok: true, name, phone, pin };
}

/** One step for a new partner contact: the organisation (if it is new), the person, a partner role and a first sign-in. */
export async function invitePartnerContact(_prev: PinState, f: FormData): Promise<PinState> {
  const me = await requireMe('founder');
  const name = s(f, 'name'), phone = normPhone(s(f, 'phone')), email = s(f, 'email').toLowerCase();
  const role = s(f, 'role') === 'org_viewer' ? 'org_viewer' : 'org_admin';
  const lang = s(f, 'lang') === 'en' ? 'en' : 'sw';
  let orgId = s(f, 'org');
  const newName = s(f, 'new_org');
  if (!name) return { error: 'Enter the full name of the person you are inviting.' };
  if (!phone) return { error: 'Enter a valid Kenyan phone number, for example 0712 345 678. It is their sign-in.' };
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'That email address does not look right.' };
  if (!orgId && !newName) return { error: 'Choose their organisation, or type the name of a new one.' };
  if (await phoneTaken(phone)) return { error: 'Someone with that phone number is already on the platform.' };
  let orgName = '', personId = '';
  try {
    await asUser(me.id, async (q) => {
      if (!orgId) {
        const type = ['church', 'cdc', 'school', 'college', 'ngo', 'company', 'other'].includes(s(f, 'org_type')) ? s(f, 'org_type') : 'other';
        const dup = (await q('select id from organisations where lower(name)=lower($1)', [newName]))[0];
        if (dup) throw new Error('org-exists');
        orgId = (await q(`insert into organisations(name,type,status,county,ward) values ($1,$2,'prospect',$3,$4) returning id`, [newName, type, s(f, 'county') || 'Mombasa', s(f, 'ward') || null]))[0].id;
        await q('insert into agreements(organisation_id) values ($1)', [orgId]);
      }
      const o = (await q('select name, contact_person, contact_phone, contact_email from organisations where id=$1', [orgId]))[0];
      if (!o) throw new Error('org');
      orgName = o.name;
      personId = (await q(`insert into people(full_name, display_name, phone, email, preferred_language) values ($1,$2,$3,$4,$5) returning id`,
        [name, name.split(/\s+/)[0], phone, email || null, lang]))[0].id;
      await q('insert into role_assignments(person_id, role, organisation_id) values ($1,$2,$3)', [personId, role, orgId]);
      // First contact becomes the organisation's contact, so quotations, invoices and receipts have somewhere to go.
      await q(`update organisations set contact_person = coalesce(contact_person, $2), contact_phone = coalesce(contact_phone, $3), contact_email = coalesce(contact_email, $4) where id=$1`,
        [orgId, name, phone, email || null]);
    });
  } catch (e: any) {
    if (e?.message === 'org-exists') return { error: 'An organisation with that name already exists. Choose it from the list instead.' };
    console.error('[invite partner]', e);
    return { error: 'Could not create the invitation. Check the details and try again.' };
  }
  const pin = tempPin();
  try { await provisionLogin(personId, phone, pin); }
  catch (e: any) { return { error: `${name} was added to ${orgName}, but the sign-in could not be created (${e.message}). Find them under Team and people and use "Reset PIN".` }; }
  await audit(me.id, `invited ${role === 'org_admin' ? 'partner admin' : 'partner viewer'} ${name} for ${orgName}`, 'people');
  revalidatePath('/portal', 'layout');
  const link = `${(process.env.NEXT_PUBLIC_PORTAL_URL || 'https://portal.elimuplus.com').replace(/\/$/, '')}/portal/login`;
  const message = lang === 'en'
    ? `Hello ${name.split(/\s+/)[0]}, you have been invited to the Elimu+ partner portal for ${orgName}. There you can request training, add the participants you want us to train, follow each training day, and see invoices, receipts and reports in one place.\n\nSign in: ${link}\nPhone: ${phone}\nTemporary PIN: ${pin}\nYou will choose your own PIN the first time you sign in.\n\nElimu+ · hello@elimuplus.com`
    : `Habari ${name.split(/\s+/)[0]}, umealikwa kwenye tovuti ya washirika ya Elimu+ kwa niaba ya ${orgName}. Hapo unaweza kuomba mafunzo, kuongeza washiriki unaotaka tuwafunze, kufuatilia kila siku ya mafunzo, na kuona ankara, risiti na ripoti mahali pamoja.\n\nIngia: ${link}\nSimu: ${phone}\nPIN ya muda: ${pin}\nUtachagua PIN yako mwenyewe utakapoingia mara ya kwanza.\n\nElimu+ · hello@elimuplus.com`;
  return { ok: true, name, phone, pin, message };
}

export async function resetPin(_prev: PinState, f: FormData): Promise<PinState> {
  const me = await requireMe('founder');
  const id = s(f, 'person');
  const p = (await asUser(me.id, (q) => q('select full_name, phone from people where id=$1', [id])))[0];
  const phone = normPhone(p?.phone ?? '');
  if (!p) return { error: 'Person not found.' };
  if (!phone) return { error: 'This person has no valid phone number on record. Add one first.' };
  const pin = tempPin();
  try { await provisionLogin(id, phone, pin); } catch (e: any) { return { error: e.message }; }
  await audit(me.id, `reset PIN for ${p.full_name}`, 'people');
  return { ok: true, name: p.full_name, phone, pin };
}

export async function grantRole(f: FormData) {
  const me = await requireMe('founder');
  const role = parseRole(s(f, 'role'));
  const orgId = s(f, 'org') || null;
  if (!role || !s(f, 'person')) back('/portal/team', 'Choose a person and a role.', 'err');
  if (role && needsOrg(role) && !orgId) back('/portal/team', 'Choose the partner organisation.', 'err');
  try {
    await asUser(me.id, async (q) => {
      await q('insert into role_assignments(person_id, role, tier, organisation_id) values ($1,$2,$3,$4)',
        [s(f, 'person'), role!.role, role!.tier, role!.role === 'participant' || (role && needsOrg(role)) ? orgId : null]);
      // Every trainer level comes with a certificate, so none is forgotten.
      if (role!.role === 'facilitator' && (role!.tier ?? 0) >= 1 &&
          !(await q("select 1 from certifications where person_id=$1 and tier=$2 and status='active'", [s(f, 'person'), role!.tier])).length)
        await q("insert into certifications(person_id,tier,number,issued_on,status) values ($1,$2,$3,current_date,'active')", [s(f, 'person'), role!.tier, await nextTrainerNumber(q, role!.tier!)]);
    });
  } catch (e) { console.error("[portal action]", e); back('/portal/team', 'That change is not allowed. Founders cannot raise their own facilitator tier; a co-founder certifies it.', 'err'); }
  await audit(me.id, `granted ${role!.role}${role!.tier ? ' tier ' + role!.tier : ''}`, 'role_assignments');
  revalidatePath('/portal', 'layout');
  back('/portal/team', 'Role added');
}

export async function endRole(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'assignment');
  const ra = (await asUser(me.id, (q) => q('select * from role_assignments where id=$1', [id])))[0];
  if (!ra) back('/portal/team', 'Role not found.', 'err');
  if (ra.role === 'founder') {
    const n = (await asUser(me.id, (q) => q("select count(*)::int n from role_assignments where role='founder' and status='active'")))[0].n;
    if (ra.person_id === me.id || n <= 2) back('/portal/team', 'Founder roles are not ended here. Ask the other founder, and keep at least two founders.', 'err');
  }
  await asUser(me.id, (q) => q("update role_assignments set status='ended', end_date=current_date where id=$1", [id]));
  await audit(me.id, `ended ${ra.role} role`, 'role_assignments');
  revalidatePath('/portal', 'layout');
  back('/portal/team', 'Role ended');
}

/* ---------- certificates: the other founder issues yours ---------- */
export async function issueCertificate(f: FormData) {
  const me = await requireMe('founder');
  const person = s(f, 'person');
  const tier = Number(s(f, 'tier'));
  if (person === me.id) back('/portal/team', 'You cannot certify yourself. Your co-founder issues your certificate, as for any trainer.', 'err');
  if (!(tier >= 1 && tier <= 4)) back('/portal/team', 'Choose a tier.', 'err');
  try {
    await asUser(me.id, async (q) => {
      const cur = (await q("select coalesce(max(tier),0)::int t from certifications where person_id=$1 and status='active'", [person]))[0].t as number;
      if (tier !== cur + 1) throw new Error(`No tier can be skipped. The next certificate for this person is Tier ${cur + 1}.`);
      let seq = ((await q("select count(*)::int n from certifications where number like $1", [`EL-${year()}-T${tier}-%`]))[0].n as number) + 1;
      while ((await q('select 1 from certifications where number=$1', [`EL-${year()}-T${tier}-${String(seq).padStart(3, '0')}`])).length) seq++;
      await q("insert into certifications(person_id,tier,number,issued_on,status) values ($1,$2,$3,current_date,'active')",
        [person, tier, `EL-${year()}-T${tier}-${String(seq).padStart(3, '0')}`]);
      await q("update role_assignments set status='ended', end_date=current_date where person_id=$1 and role='facilitator' and status='active'", [person]);
      await q("insert into role_assignments(person_id, role, tier) values ($1,'facilitator',$2)", [person, tier]);
    });
  } catch (e: any) { back('/portal/team', e.message?.startsWith('No tier') ? e.message : 'Could not issue that certificate.', 'err'); }
  await audit(me.id, `issued Tier ${tier} certificate`, 'certifications');
  revalidatePath('/portal', 'layout');
  back('/portal/team', `Tier ${tier} certificate issued`);
}

/* ---------- founders go through the journey they teach ---------- */
export async function startJourney(f: FormData) {
  const me = await requireFeature('journey', 'edit');
  const kind = s(f, 'kind');
  // Writes are limited to the signed-in person's own id, so a trainer can only ever start their own journey.
  try {
    await asAdmin(async (q) => {
      if (kind === 'facilitator') {
        if (!me.roles.includes('founder')) return; // trainers already hold a facilitator role
        const has = await q("select 1 from role_assignments where person_id=$1 and role='facilitator' and status='active'", [me.id]);
        if (!has.length) await q("insert into role_assignments(person_id, role, tier) values ($1,'facilitator',1)", [me.id]);
        return;
      }
      let org = (await q('select id from organisations where is_internal limit 1'))[0];
      if (!org) org = (await q(
        `insert into organisations(name,type,status,county,ward,is_internal) values ('Elimu+ team''s own cohort','other','active','Mombasa','Likoni',true) returning id`))[0];
      let cohort = (await q("select id from cohorts where organisation_id=$1 and status <> 'closed' order by created_at limit 1", [org.id]))[0];
      if (!cohort) cohort = (await q(
        `insert into cohorts(organisation_id,name,format,language,audience,start_date,venue,status)
         values ($1,'Team cohort','5-day','en','The team takes the journey it teaches',current_date,'Self-paced','delivering') returning id`, [org.id]))[0];
      const has = await q("select 1 from role_assignments where person_id=$1 and role='participant' and status='active'", [me.id]);
      if (!has.length) await q("insert into role_assignments(person_id, role, organisation_id) values ($1,'participant',$2)", [me.id, org.id]);
      await enrol(q, cohort.id, me.id);
      await q('insert into canvas_unlocks(cohort_id, box_number) select $1, number from canvas_boxes on conflict do nothing', [cohort.id]);
    });
  } catch (e) { console.error("[portal action]", e); back('/portal/journey', 'Could not start that journey.', 'err'); }
  await audit(me.id, `started the ${kind} journey`, 'role_assignments');
  revalidatePath('/portal', 'layout');
  back('/portal/journey', kind === 'facilitator' ? 'Your facilitator pathway has started at Tier 1.' : 'Your participant journey has started. All twelve canvas boxes are open for you.');
}

/* ---------- suggestions from trainers and partners ---------- */
export async function suggestIndividual(f: FormData) {
  const me = await requireMe();
  const ret = s(f, 'back') || '/portal/invite';
  const age = Number(s(f, 'age')) || 0;
  const contact = s(f, 'contact');
  if (!s(f, 'name') || !contact) back(ret, 'Name and phone or email are required.', 'err');
  if (!age) back(ret, 'Add their age. An approximate age is fine.', 'err');
  if (!s(f, 'education')) back(ret, 'Choose their education level.', 'err');
  const minor = age < 18;
  const role = s(f, 'role') || 'participant';
  try {
    await asUser(me.id, (q) => q(
      `insert into invitations(full_name,contact,role,organisation_id,cohort_id,birth_year,guardian_consent,nominated_by,note,education_level,occupation,county,ward)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [s(f, 'name'), contact, role, s(f, 'org') || null, s(f, 'cohort') || null, birthFromAge(age), f.get('guardian') === 'on', me.id,
       [s(f, 'note'), minor ? 'Under 18: guardian consent needed before approval' : ''].filter(Boolean).join(' | ') || null,
       s(f, 'education'), s(f, 'occupation') || null, s(f, 'county') || null, s(f, 'ward') || null]));
  } catch (e) { console.error("[portal action]", e); back(ret, 'You are not allowed to suggest that role.', 'err'); }
  await notify();
  revalidatePath('/portal', 'layout');
  back(ret, 'Suggestion sent. A founder will review it.');
}

export async function suggestOrganisation(f: FormData) {
  const me = await requireMe('facilitator', 'founder');
  if (!s(f, 'name') || !s(f, 'county')) back('/portal/invite', 'Organisation name and county are required.', 'err');
  if (!s(f, 'ward') && !s(f, 'address')) back('/portal/invite', 'Say where it is: the area or ward, or a street or landmark.', 'err');
  try {
    await asUser(me.id, (q) => q(
      `insert into org_suggestions(name,type,parent_id,county,ward,address,contact_person,contact_phone,contact_email,approx_people,what_they_do,why,suggested_by)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [s(f, 'name'), s(f, 'type') || 'other', s(f, 'parent') || null, s(f, 'county'), s(f, 'ward') || null, s(f, 'address') || null,
       s(f, 'contact_person') || null, s(f, 'contact_phone') || null, s(f, 'contact_email') || null, Number(s(f, 'people')) || null,
       s(f, 'what') || null, s(f, 'why') || null, me.id]));
  } catch (e) { console.error("[portal action]", e); back('/portal/invite', 'Could not send that suggestion.', 'err'); }
  await notify();
  revalidatePath('/portal', 'layout');
  back('/portal/invite', 'Organisation suggested. A founder will review it.');
}

export async function decideOrgSuggestion(f: FormData) {
  const me = await requireMe('founder');
  const id = s(f, 'suggestion');
  const approve = s(f, 'decision') === 'approve';
  try {
    await asUser(me.id, async (q) => {
      const sg = (await q('select * from org_suggestions where id=$1 and status=$2', [id, 'suggested']))[0];
      if (!sg) throw new Error('gone');
      let orgId: string | null = null;
      if (approve) {
        orgId = (await q(
          `insert into organisations(name,type,parent_id,county,ward,address,contact_person,contact_phone,contact_email,approx_people,what_they_do,status)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'prospect') returning id`,
          [sg.name, sg.type, sg.parent_id, sg.county, sg.ward, sg.address, sg.contact_person, sg.contact_phone, sg.contact_email, sg.approx_people, sg.what_they_do]))[0].id;
        await q('insert into agreements(organisation_id) values ($1)', [orgId]);
      }
      await q('update org_suggestions set status=$2, decided_by=$3, decision_note=$4, organisation_id=$5 where id=$1',
        [id, approve ? 'approved' : 'declined', me.id, s(f, 'note') || null, orgId]);
    });
  } catch (e) { console.error("[portal action]", e); back('/portal/people', 'That suggestion was already decided.', 'err'); }
  await audit(me.id, `${approve ? 'approved' : 'declined'} organisation suggestion`, 'org_suggestions');
  revalidatePath('/portal', 'layout');
  back('/portal/people', approve ? 'Organisation added as a prospect. Agreement defaults to aggregates only.' : 'Suggestion declined');
}

/** Approving a suggested person creates their account and returns a one-time PIN to hand over. */
export async function approveInvitation(_prev: PinState, f: FormData): Promise<PinState> {
  const me = await requireMe('founder');
  const id = s(f, 'invitation');
  const inv = (await asUser(me.id, (q) => q('select * from invitations where id=$1', [id])))[0];
  if (!inv) return { error: 'Suggestion not found.' };
  if (inv.status === 'activated') return { error: 'This person already has an account.' };
  if (inv.birth_year && year() - inv.birth_year < 18 && !inv.guardian_consent) return { error: 'Guardian consent is required before approving someone under 18.' };
  const called = (await asUser(me.id, (q) => q('select called from crm_person_status where invitation_id=$1', [id])))[0]?.called === true;
  const override = s(f, 'override');
  if (!called && !override) return { error: 'Call this person first and log the call in CRM (they must be reached). If a call is not possible, type the reason in the box and approve again.' };
  if (!called) await asUser(me.id, (q) => q("insert into crm_activities(invitation_id, kind, outcome, summary, logged_by) values ($1,'note','completed',$2,$3)", [id, 'Approved without a call. Reason: ' + override, me.id]));
  const phone = normPhone(s(f, 'phone'));
  if (!phone) return { error: 'Enter the phone number they will sign in with, for example 0712 345 678.' };
  if (await phoneTaken(phone)) return { error: 'Someone with that phone number is already on the platform.' };
  const isEmail = String(inv.contact).includes('@');
  let personId = '';
  try {
    personId = await asUser(me.id, async (q) => {
      const p = (await q(
        `insert into people(full_name, display_name, phone, email, preferred_language, birth_year, education_level, occupation, county, ward)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [inv.full_name, String(inv.full_name).split(/\s+/)[0], phone, isEmail ? inv.contact : null, s(f, 'lang') === 'en' ? 'en' : 'sw',
         inv.birth_year, inv.education_level, inv.occupation, inv.county, inv.ward]))[0];
      const tier = inv.role === 'facilitator' ? inv.tier ?? 1 : null;
      await q('insert into role_assignments(person_id, role, tier, organisation_id) values ($1,$2,$3,$4)',
        [p.id, inv.role, tier, inv.role === 'trainer_candidate' ? null : inv.organisation_id]);
      if (inv.role === 'participant' && inv.cohort_id) await enrol(q, inv.cohort_id, p.id);
      await q("update invitations set status='activated', approved_by=$2, accepted_at=now() where id=$1", [id, me.id]);
      return p.id as string;
    });
  } catch (e) { console.error("[portal action]", e); return { error: 'Could not create the account. Check the details and try again.' }; }
  const pin = tempPin();
  try { await provisionLogin(personId, phone, pin); }
  catch (e: any) { return { error: `${inv.full_name} was added, but the sign-in could not be created (${e.message}). Use "Reset PIN" on the Team page.` }; }
  await audit(me.id, `approved suggestion and created account: ${inv.full_name}`, 'invitations');
  return { ok: true, name: inv.full_name, phone, pin };
}

/* ---------- first sign-in: choose your own PIN ---------- */
export async function changePin(_prev: { error?: string } | null, f: FormData): Promise<{ error?: string } | null> {
  const me = await requireMe();
  const pin = s(f, 'pin');
  if (!/^\d{6,12}$/.test(pin)) return { error: 'Use 6 to 12 digits.' };
  if (/^(\d)\1+$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return { error: 'Choose a PIN that is not a simple run like 123456 or 000000.' };
  if (pin !== s(f, 'again')) return { error: 'The two PINs do not match.' };
  if ((await dbMode()) === 'pg') {
    const { createServerClient } = await import('@supabase/ssr');
    const jar = await cookies();
    const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => jar.getAll(), setAll: (cs) => cs.forEach((c) => jar.set(c.name, c.value, c.options)) },
    });
    const { error } = await sb.auth.updateUser({ password: pin });
    if (error) return { error: error.message.includes('different') ? 'Choose a PIN different from the one you were given.' : 'Could not save your PIN. Try again.' };
  }
  await asAdmin((q) => q('update people set pin_reset_required=false where id=$1', [me.id]));
  redirect('/portal');
}
