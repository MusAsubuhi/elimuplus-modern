import { d } from '@/lib/format';

export interface CertProps {
  heading: string;          // "Certificate of Completion"
  name: string;
  lines: string[];          // body paragraphs
  number: string;
  issued: string | Date;
  signers: { name: string; role: string }[];
  verifyUrl: string;
}

/** One landscape A4 certificate. Used on its own and stacked for printing a whole cohort. */
export function CertificateSheet({ heading, name, lines, number, issued, signers, verifyUrl }: CertProps) {
  return (
    <section className="cert-page mx-auto my-6 flex aspect-[297/210] w-full max-w-[1123px] flex-col justify-between border-[10px] border-double border-[#C9A227] bg-white p-10 text-center shadow print:my-0 print:h-[210mm] print:w-[297mm] print:max-w-none print:break-after-page print:shadow-none">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="inline-block rounded-lg bg-[#0D3B3B] px-5 py-3"><img src="/images/logo-elimu-white.png" alt="Elimu+" className="h-10 w-auto" /></span>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.35em] text-[#C9A227]">{heading}</p>
        <p className="mt-6 text-sm text-slate-500">This is to certify that</p>
        <p className="mt-2 font-serif text-5xl font-bold text-[#0D3B3B]">{name}</p>
        <div className="mx-auto mt-3 h-1 w-40 bg-[#C9A227]" />
        <div className="mx-auto mt-5 max-w-3xl space-y-2 text-lg leading-relaxed text-slate-700">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      </div>
      <div>
        <div className="mx-auto flex max-w-3xl justify-around gap-8">
          {signers.map((s) => (
            <div key={s.name} className="w-56 border-t-2 border-slate-400 pt-2 text-sm"><b className="text-[#0D3B3B]">{s.name}</b><br />{s.role}</div>
          ))}
        </div>
        <p className="mt-6 text-xs text-slate-500">Certificate no. <b>{number}</b> · Issued {d(issued)} · Verify at {verifyUrl}</p>
        <p className="text-[11px] text-slate-400">Empowering Youth &amp; Women. Building Businesses. · Elimu+ · Mombasa, Kenya · www.elimuplus.com</p>
      </div>
    </section>
  );
}

export const certPrintCss = '@page { size: A4 landscape; margin: 0 } @media print { body { background: #fff } }';
