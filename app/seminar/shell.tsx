import Flash from '@/components/flash';
import { inputCls, submitCls } from '@/components/ui';

export { inputCls, submitCls };
export const labelCls = 'mb-1 block text-sm font-bold text-teal';

export function Shell({ title, when, children }: { title: string; when: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <p className="text-sm font-bold uppercase tracking-wide text-gold">Elimu+ monthly seminar</p>
      <h1 className="mt-1 text-2xl font-bold text-teal">{title}</h1>
      <p className="mb-6 text-sm text-slate-600">{when}</p>
      <Flash />
      {children}
      <p className="mt-8 text-xs text-slate-500">We use your details only to run Elimu+ seminars and to follow up with you. See our privacy notice at elimuplus.com/privacy.html. You may ask us to correct or delete them at any time: hello@elimuplus.com.</p>
    </main>
  );
}

export const whenOf = (s: any) =>
  `${new Date(s.held_on).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}${s.venue ? ` · ${s.venue}` : ''}`;
