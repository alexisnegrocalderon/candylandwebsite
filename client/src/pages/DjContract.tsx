import { useEffect, useRef, useState } from 'react';
import { useRoute } from 'wouter';
import { CheckCircle2, Download, Eraser, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { formatRutLive } from '@shared/rut';

/* /contrato/:token — el contrato de un DJ, pensado para el celular. Lo abre la artista desde el link del correo: lee el
 * resumen y las cláusulas, completa sus datos y firma con el dedo. Look PLAYMORE (negro, dorado y magenta), sin el menú
 * del sitio (ver `hideChrome` en App.tsx). */

const GOLD = '#d6b25e';
const MAGENTA = '#E477EA';

function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = c.getBoundingClientRect();
    c.width = Math.round(width * dpr); c.height = Math.round(height * dpr);
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#141210';
  }, []);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const p = pos(e); const ctx = ref.current!.getContext('2d')!;
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false; last.current = null;
    onChange(ref.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHasInk(false); onChange('');
  };

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border-2 border-dashed" style={{ borderColor: `${GOLD}99`, background: '#f6f1e4' }}>
        <canvas ref={ref} className="block h-44 w-full touch-none" style={{ touchAction: 'none' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} aria-label="Recuadro para dibujar tu firma" />
        {!hasInk && <p className="pointer-events-none absolute inset-0 grid place-items-center text-sm" style={{ color: '#8b7f63' }}>Dibuja tu firma aquí con el dedo</p>}
      </div>
      <button type="button" onClick={clear} className="mt-2 inline-flex items-center gap-1.5 text-sm" style={{ color: GOLD }}>
        <Eraser className="h-4 w-4" /> Borrar y volver a firmar
      </button>
    </div>
  );
}

const field = 'h-12 w-full rounded-xl border bg-[#141210] px-4 text-base text-[#f4efe6] placeholder:text-[#7c7260] outline-none focus:border-[#d6b25e]';

export default function DjContract() {
  useSeo({ title: 'Tu contrato — Playroom × Dalmore', description: 'Contrato privado.', path: '/contrato', noindex: true });
  const [, params] = useRoute('/contrato/:token');
  const token = params?.token ?? '';
  const view = trpc.djContract.view.useQuery({ token }, { enabled: !!token, retry: false, refetchOnWindowFocus: false });
  const sign = trpc.djContract.sign.useMutation();
  const [legalName, setLegalName] = useState('');
  const [rut, setRut] = useState('');
  const [bank, setBank] = useState('');
  const [phone, setPhone] = useState('');
  const [accept, setAccept] = useState(false);
  const [signature, setSignature] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [donePdf, setDonePdf] = useState<string | null>(null);

  useEffect(() => { document.documentElement.style.background = '#0c0908'; document.body.style.background = '#0c0908'; }, []);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh px-4 pb-16 pt-[calc(env(safe-area-inset-top,0px)+20px)]" style={{ background: '#0c0908', color: '#f4efe6' }}>
      <div className="mx-auto max-w-xl">
        <div className="mb-5 rounded-2xl border px-4 py-3 text-center" style={{ borderColor: `${GOLD}66` }}>
          <p className="text-[11px] font-extrabold tracking-[0.3em]" style={{ color: MAGENTA }}>PLAYROOM × DALMORE</p>
          <p className="text-2xl font-extrabold tracking-wide" style={{ color: GOLD }}>PLAYMORE</p>
        </div>
        {children}
      </div>
    </div>
  );

  if (view.isLoading) return shell(<div className="grid place-items-center py-24"><Loader2 className="h-7 w-7 animate-spin" style={{ color: GOLD }} /></div>);
  if (view.isError || !view.data) return shell(
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
      <h1 className="text-xl font-bold">No pudimos abrir este contrato</h1>
      <p className="mt-2 text-sm text-[#c4b3a6]">{view.error?.message ?? 'El link no es válido.'} Escríbenos a contacto@mansionplayroom.cl y te enviamos uno nuevo.</p>
    </div>,
  );

  const d = view.data;
  const signedNow = donePdf || d.signed;
  const pdf = donePdf ?? d.pdfPath;

  const submit = async () => {
    setError(null);
    try {
      const r = await sign.mutateAsync({ token, legalName, rut, bank, phone: phone || undefined, accept, signature });
      setDonePdf(r.pdfPath);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo firmar. Intenta de nuevo.'); }
  };

  return shell(
    <>
      <h1 className="text-2xl font-extrabold leading-tight">{d.contract.title}</h1>
      <p className="mt-1 text-sm text-[#c4b3a6]">Para <strong style={{ color: '#f4efe6' }}>{d.artistName}</strong></p>

      {signedNow && (
        <div className="mt-5 rounded-2xl border p-5 text-center" style={{ borderColor: '#34d39966', background: '#34d3991a' }}>
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-300" />
          <h2 className="mt-2 text-lg font-bold">¡Contrato firmado!</h2>
          <p className="mt-1 text-sm text-[#d8cdbd]">{d.signed ? `Lo firmó ${d.signed.legalName} el ${d.signed.signedAtText}.` : 'Recibimos tu firma.'} Te enviamos el PDF por correo.</p>
          {pdf && <a href={pdf} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-12 items-center gap-2 rounded-full px-6 font-bold" style={{ background: GOLD, color: '#141210' }}><Download className="h-5 w-5" /> Descargar PDF</a>}
        </div>
      )}

      <dl className="mt-5 grid gap-2 rounded-2xl border p-4" style={{ borderColor: `${GOLD}44`, background: '#170d1a' }}>
        {d.contract.summary.map((s) => (
          <div key={s.label} className="flex flex-col gap-0.5 border-b border-white/5 pb-2 last:border-0 last:pb-0">
            <dt className="text-[11px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>{s.label}</dt>
            <dd className="text-[15px]">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 space-y-5">
        {d.contract.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-base font-bold" style={{ color: GOLD }}>{s.heading}</h2>
            {s.paragraphs.map((p, i) => <p key={i} className="mt-2 text-[15px] leading-relaxed text-[#d8cdbd]">{p}</p>)}
          </section>
        ))}
      </div>

      {d.canSign && !signedNow && (
        <form className="mt-8 space-y-4 rounded-2xl border p-4" style={{ borderColor: `${MAGENTA}66`, background: '#170d1a' }} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <h2 className="text-lg font-bold">Firma el contrato</h2>
          <label className="block text-sm"><span className="mb-1 block text-[#c4b3a6]">Nombre completo (como en tu boleta)</span>
            <input className={field} style={{ borderColor: '#ffffff26' }} value={legalName} onChange={(e) => setLegalName(e.target.value)} autoComplete="name" /></label>
          <label className="block text-sm"><span className="mb-1 block text-[#c4b3a6]">RUT</span>
            <input className={field} style={{ borderColor: '#ffffff26' }} value={rut} onChange={(e) => setRut(formatRutLive(e.target.value))} inputMode="text" placeholder="12.345.678-9" /></label>
          <label className="block text-sm"><span className="mb-1 block text-[#c4b3a6]">Datos para la transferencia (banco, tipo y número de cuenta)</span>
            <input className={field} style={{ borderColor: '#ffffff26' }} value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Banco Estado · Cuenta RUT · 12345678" /></label>
          <label className="block text-sm"><span className="mb-1 block text-[#c4b3a6]">Teléfono (opcional)</span>
            <input className={field} style={{ borderColor: '#ffffff26' }} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" /></label>
          <div><p className="mb-1 text-sm text-[#c4b3a6]">Tu firma</p><SignaturePad onChange={setSignature} /></div>
          <label className="flex items-start gap-3 text-sm leading-snug">
            <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#d6b25e]" />
            <span>Leí el contrato completo y lo acepto. Entiendo que firmarlo con mi nombre, RUT y firma tiene validez como firma electrónica.</span>
          </label>
          {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
          <button type="submit" disabled={sign.isPending} className="flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-extrabold disabled:opacity-60" style={{ background: MAGENTA, color: '#16060F' }}>
            {sign.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Firmar contrato
          </button>
          <p className="text-center text-xs text-[#8b7f63]">Quedan registradas la fecha, la hora y tu dirección IP como constancia.</p>
        </form>
      )}
      {!d.canSign && !signedNow && <p className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-center text-sm text-[#c4b3a6]">Este contrato todavía no está habilitado para firmar. Te avisaremos cuando esté listo.</p>}
    </>,
  );
}
