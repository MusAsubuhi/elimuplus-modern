import Link from 'next/link';
import { notFound } from 'next/navigation';
import { asAdmin } from '@/lib/db';
import { submitSignIn } from '../actions';
import { Shell, inputCls, labelCls, submitCls, whenOf } from '../shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Seminar sign-in | Elimu+', robots: { index: false } };

export default async function SignIn({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const sem = (await asAdmin((q) => q('select title, held_on, venue, status from seminars where code = $1', [code])))[0];
  if (!sem) notFound();
  return (
    <Shell title={sem.title} when={whenOf(sem)}>
      {sem.status !== 'open' ? <p className="rounded-lg bg-slate-100 p-4 text-sm">Sign-in for this seminar has closed.</p> : (
        <form action={submitSignIn} className="space-y-4">
          <input type="hidden" name="code" value={code} />
          <input type="text" name="_gotcha" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <div><label className={labelCls} htmlFor="name">Your full name</label><input id="name" name="name" required className={inputCls} autoComplete="name" /></div>
          <div><label className={labelCls} htmlFor="phone">Phone number (WhatsApp or M-Pesa)</label><input id="phone" name="phone" required inputMode="tel" className={inputCls} autoComplete="tel" /></div>
          <div><label className={labelCls} htmlFor="group">Your cohort or group (for example, the church or school you trained with)</label><input id="group" name="group" className={inputCls} /></div>
          <div><label className={labelCls} htmlFor="email">Email address (optional)</label><input id="email" name="email" type="email" className={inputCls} autoComplete="email" /></div>
          <div><label className={labelCls} htmlFor="how_heard">How did you hear about today&apos;s seminar? (optional)</label><input id="how_heard" name="how_heard" className={inputCls} /></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="newsletter" value="yes" className="mt-1" /><span>Send me the Elimu+ newsletter by email. I can unsubscribe at any time. (Needs an email address above.)</span></label>
          <button className={submitCls}>Sign in</button>
        </form>
      )}
      <p className="mt-6 text-sm">Already attended? <Link className="font-bold text-teal underline" href={`/seminar/${code}/feedback`}>Give your feedback</Link></p>
    </Shell>
  );
}
