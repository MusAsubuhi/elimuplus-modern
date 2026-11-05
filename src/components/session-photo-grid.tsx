import { Badge } from '@/components/ui';
import { approveSessionPhoto, removeSessionPhoto } from '../../app/portal/session-photo-actions';

type P = { id: string; day_number: number; caption: string | null; status: string; url?: string; cohort_name?: string; uploaded_by?: string | null };

/** mode: founder can approve and remove; trainer can remove their own waiting photo; partner just looks. */
export default function SessionPhotoGrid({ photos, mode, me, back }: { photos: P[]; mode: 'founder' | 'trainer' | 'partner'; me?: string; back: string }) {
  if (!photos.length) return <p className="text-sm text-slate-500">No session photos yet.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {photos.map((p) => (
        <figure key={p.id} className="overflow-hidden rounded-xl border border-teal-100 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {p.url ? <img src={p.url} alt={`Training day ${p.day_number}`} className="aspect-[4/3] w-full object-cover" /> : <div className="flex aspect-[4/3] items-center justify-center bg-mist text-xs text-slate-500">Preview unavailable</div>}
          <figcaption className="space-y-2 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-teal">{p.cohort_name ? `${p.cohort_name} · ` : ''}Day {p.day_number}</b>
              {mode !== 'partner' && <Badge tone={p.status === 'approved' ? 'green' : 'gold'}>{p.status === 'approved' ? 'visible to partner' : 'waiting for a founder'}</Badge>}
            </div>
            {p.caption && <p className="text-xs text-slate-600">{p.caption}</p>}
            {mode === 'founder' && (
              <div className="flex gap-2">
                {p.status !== 'approved' && <form action={approveSessionPhoto}><input type="hidden" name="photo" value={p.id} /><input type="hidden" name="back" value={back} /><button className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-white">Approve</button></form>}
                <form action={removeSessionPhoto}><input type="hidden" name="photo" value={p.id} /><input type="hidden" name="back" value={back} /><button className="rounded-lg border border-[#C8553D] px-3 py-1.5 text-xs font-bold text-[#C8553D]">Remove</button></form>
              </div>)}
            {mode === 'trainer' && p.status === 'pending' && p.uploaded_by === me && (
              <form action={removeSessionPhoto}><input type="hidden" name="photo" value={p.id} /><input type="hidden" name="back" value={back} /><button className="rounded-lg border border-[#C8553D] px-3 py-1.5 text-xs font-bold text-[#C8553D]">Remove</button></form>)}
          </figcaption>
        </figure>))}
    </div>
  );
}
