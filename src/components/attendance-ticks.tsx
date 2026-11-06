'use client';
import { useState } from 'react';

/** The attendance tick list with "Tick everyone" and "Clear all", and a running count. Individual boxes can still be changed. */
export default function AttendanceTicks({ people, present }: { people: { id: string; name: string }[]; present: string[] }) {
  const [on, setOn] = useState<Set<string>>(new Set(present));
  const flip = (id: string) => setOn((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => setOn(new Set(people.map((p) => p.id)))} className="rounded-lg border border-teal bg-white px-3 py-1.5 text-xs font-bold text-teal hover:bg-teal-50">Tick everyone</button>
        <button type="button" onClick={() => setOn(new Set())} className="rounded-lg border border-teal-100 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-mist">Clear all</button>
        <span className="text-xs text-slate-600"><b>{on.size}</b> of {people.length} present</span>
      </div>
      <div className="grid grid-cols-2 gap-1 text-sm lg:grid-cols-3">
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-2"><input type="checkbox" name="present" value={p.id} checked={on.has(p.id)} onChange={() => flip(p.id)} />{p.name}</label>
        ))}
      </div>
    </div>
  );
}
