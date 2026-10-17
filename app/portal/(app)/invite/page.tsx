import { asUser } from '@/lib/db';
import { requireMe } from '@/lib/session';
import { Badge, Card, PageHeader, Table, inputCls, statusTone, submitCls } from '@/components/ui';
import { nominate } from '../../actions';
import { d } from '@/lib/format';

export default async function Invite() {
  const me = await requireMe('master', 'founder', 'facilitator');
  const { orgs, mine } = await asUser(me.id, async (q) => ({
    orgs: await q('select id, name from organisations order by name'),
    mine: await q('select * from invitations where nominated_by=$1 order by created_at desc', [me.id]),
  }));
  const canTrainer = me.tier >= 3 || me.roles.includes('founder');
  return (
    <>
      <PageHeader image="/images/trainer-team.jpg" title="Nominate" subtitle="Nobody creates an account by themselves. You nominate; a founder approves; then an invitation is sent." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="New nomination">
          <form action={nominate} className="space-y-3 text-sm">
            <input type="hidden" name="back" value="/portal/invite" />
            <label className="block font-bold">Full name<input name="name" required className={inputCls} /></label>
            <label className="block font-bold">Phone or email<input name="contact" required className={inputCls} /></label>
            <label className="block font-bold">As<select name="role" className={inputCls}><option value="participant">Participant</option>{canTrainer && <option value="trainer_candidate">Trainer candidate (campus or community)</option>}</select></label>
            <label className="block font-bold">Partner organisation<select name="org" className={inputCls}><option value="">None / Elimu+ direct</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
            <label className="block font-bold">Year of birth<input name="birth" type="number" min="1940" max="2015" className={inputCls} /></label>
            <label className="flex gap-2"><input type="checkbox" name="guardian" />Guardian consent obtained (required under 18)</label>
            <button className={submitCls}>Send for approval</button>
          </form>
        </Card>
        <Card title="My nominations" className="lg:col-span-2">
          <Table head={['Name', 'Role', 'Status', 'Date', 'Note']} rows={mine.map((i) => [<b key="n">{i.full_name}</b>, i.role, <Badge key="s" tone={statusTone(i.status)}>{i.status}</Badge>, d(i.created_at), i.note ?? ''])} empty="Nothing nominated yet." />
        </Card>
      </div>
    </>
  );
}
