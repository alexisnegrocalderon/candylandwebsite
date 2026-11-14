import { useState } from 'react';
import { Copy, FileSignature, Loader2, Pencil, Plus, Send, Trash2, X, Download } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/admin/EmptyState';
import { formatChileDateTime } from '@shared/chileDate';

const STATUS: Record<string, { label: string; cls: string }> = {
  borrador: { label: 'Borrador', cls: 'bg-white/10 text-white/70' },
  enviado: { label: 'Enviado', cls: 'bg-sky-400/15 text-sky-200' },
  visto: { label: 'Visto, sin firmar', cls: 'bg-amber-400/15 text-amber-200' },
  firmado: { label: 'Firmado', cls: 'bg-emerald-400/15 text-emerald-200' },
  anulado: { label: 'Anulado', cls: 'bg-red-400/15 text-red-200' },
};

type Form = {
  artistName: string; email: string; phone: string; callTime: string; soundcheckTime: string; setStart: string; setEnd: string;
  amountClp: string; amountMode: 'liquido' | 'bruto'; proportionalDiscount: boolean;
  cancelEnabled: boolean; noticeDays: string; penaltyPercent: string;
};
const EMPTY: Form = {
  artistName: '', email: '', phone: '', callTime: '00:30', soundcheckTime: '01:00', setStart: '02:00', setEnd: '04:00',
  amountClp: '', amountMode: 'liquido', proportionalDiscount: true, cancelEnabled: false, noticeDays: '15', penaltyPercent: '50',
};
const input = 'h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-base text-white outline-none focus:border-white/40';
const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Admin → Contratos DJ: crea el contrato de una artista, lo manda a Cross check y sigue su firma. */
export function DjContractsManager() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.djContract.list.useQuery(undefined, { refetchInterval: 30_000 });
  const refresh = () => utils.djContract.list.invalidate();
  const [editing, setEditing] = useState<{ id: number | null; form: Form } | null>(null);
  const create = trpc.djContract.create.useMutation({ onSuccess: () => { toast.success('Borrador creado'); setEditing(null); refresh(); }, onError: (e) => toast.error(e.message) });
  const update = trpc.djContract.update.useMutation({ onSuccess: () => { toast.success('Cambios guardados'); setEditing(null); refresh(); }, onError: (e) => toast.error(e.message) });
  const requestSend = trpc.djContract.requestSend.useMutation({
    onSuccess: (r) => { toast.success(r.created ? 'Listo: está en Cross check esperando tu «Reportar»' : 'Ya hay un envío esperando hoy en Cross check'); utils.crossCheck.list.invalidate(); utils.adminBadges.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const voidIt = trpc.djContract.void.useMutation({ onSuccess: () => { toast('Contrato anulado'); refresh(); }, onError: (e) => toast.error(e.message) });

  const openEdit = (c: NonNullable<typeof data>[number]) => setEditing({
    id: c.id,
    form: {
      artistName: c.artistName, email: c.email, phone: c.phone ?? '', callTime: c.terms.callTime, soundcheckTime: c.terms.soundcheckTime, setStart: c.terms.setStart, setEnd: c.terms.setEnd,
      amountClp: String(c.terms.amountClp), amountMode: c.terms.amountMode, proportionalDiscount: c.terms.proportionalDiscount,
      cancelEnabled: c.terms.cancellation.enabled, noticeDays: String(c.terms.cancellation.noticeDays), penaltyPercent: String(c.terms.cancellation.penaltyPercent),
    },
  });

  const save = () => {
    if (!editing) return;
    const f = editing.form;
    const payload = {
      artistName: f.artistName, email: f.email, phone: f.phone || null, callTime: f.callTime, soundcheckTime: f.soundcheckTime, setStart: f.setStart, setEnd: f.setEnd,
      amountClp: Math.round(Number(f.amountClp.replace(/\D/g, ''))), amountMode: f.amountMode, proportionalDiscount: f.proportionalDiscount,
      cancellation: { enabled: f.cancelEnabled, noticeDays: Number(f.noticeDays) || 15, penaltyPercent: Number(f.penaltyPercent) || 50 },
    };
    if (!payload.amountClp) { toast.error('Escribe el monto.'); return; }
    if (editing.id) update.mutate({ id: editing.id, ...payload }); else create.mutate(payload);
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setEditing((e) => (e ? { ...e, form: { ...e.form, [k]: v } } : e));
  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-5">
      <section className="admin-clay p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl">Contratos de DJs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Crea el contrato, mándalo a Cross check y la artista lo firma desde su celular. Al firmar queda «por pagar» en Staff.</p>
          </div>
          <button type="button" onClick={() => setEditing({ id: null, form: EMPTY })} className="admin-tab flex h-11 shrink-0 items-center gap-2 rounded-2xl px-4 text-sm font-semibold"><Plus className="h-4 w-4" /> Nuevo</button>
        </div>
        <div className="mt-4 space-y-3">
          {isLoading ? null : (data?.length ?? 0) === 0 ? <EmptyState icon={FileSignature} title="Todavía no hay contratos." /> : data!.map((c) => (
            <article key={c.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-lg">{c.artistName}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[c.status]?.cls ?? ''}`}>{STATUS[c.status]?.label ?? c.status}</span>
              </div>
              <p className="mt-1 text-sm text-white/80">{c.terms.eventName} · set {c.terms.setStart}–{c.terms.setEnd} · {clp(c.payment.gross)} brutos ({clp(c.payment.net)} líquidos)</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.email}{c.sentAt ? ` · enviado ${formatChileDateTime(c.sentAt)}` : ''}{c.signedAt ? ` · firmó ${c.legalName ?? ''} el ${formatChileDateTime(c.signedAt)}` : ''}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.status !== 'firmado' && c.status !== 'anulado' && (
                  <button type="button" disabled={requestSend.isPending} onClick={() => requestSend.mutate({ id: c.id })} className="flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
                    {requestSend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {c.status === 'borrador' ? 'Enviar (a Cross check)' : 'Reenviar'}
                  </button>
                )}
                {c.status === 'borrador' && <button type="button" onClick={() => openEdit(c)} className="admin-tab flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm"><Pencil className="h-4 w-4" /> Editar</button>}
                {c.status !== 'anulado' && <button type="button" onClick={() => { navigator.clipboard?.writeText(c.link).then(() => toast.success('Link copiado'), () => toast.error('No se pudo copiar')); }} className="admin-tab flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm"><Copy className="h-4 w-4" /> Copiar link</button>}
                {c.pdfPath && <a href={c.pdfPath} target="_blank" rel="noreferrer" className="admin-tab flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm"><Download className="h-4 w-4" /> PDF firmado</a>}
                {(c.status === 'borrador' || c.status === 'enviado' || c.status === 'visto') && (
                  <button type="button" onClick={() => { if (confirm(`¿Anular el contrato de ${c.artistName}? El link deja de funcionar.`)) voidIt.mutate({ id: c.id }); }} className="admin-tab flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-red-300"><Trash2 className="h-4 w-4" /> Anular</button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-xl flex-col gap-3 overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle className="text-lg">{editing?.id ? 'Editar contrato' : 'Nuevo contrato de DJ'}</DialogTitle>
            <DialogDescription className="text-sm">El texto lo arma el sistema con estos datos. La artista completa su nombre legal, RUT y cuenta al firmar.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <label className="block text-sm">Nombre artístico<input className={input} value={editing.form.artistName} onChange={(e) => set('artistName', e.target.value)} placeholder="FaeDior" /></label>
              <label className="block text-sm">Correo<input className={input} type="email" value={editing.form.email} onChange={(e) => set('email', e.target.value)} placeholder="booking@…" /></label>
              <label className="block text-sm">Teléfono (opcional)<input className={input} value={editing.form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">Set desde<input className={input} type="time" value={editing.form.setStart} onChange={(e) => set('setStart', e.target.value)} /></label>
                <label className="block text-sm">Set hasta<input className={input} type="time" value={editing.form.setEnd} onChange={(e) => set('setEnd', e.target.value)} /></label>
                <label className="block text-sm">Llegada<input className={input} type="time" value={editing.form.callTime} onChange={(e) => set('callTime', e.target.value)} /></label>
                <label className="block text-sm">Prueba de sonido<input className={input} type="time" value={editing.form.soundcheckTime} onChange={(e) => set('soundcheckTime', e.target.value)} /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">Monto (CLP)<input className={input} inputMode="numeric" value={editing.form.amountClp} onChange={(e) => set('amountClp', e.target.value.replace(/[^\d]/g, ''))} placeholder="400000" /></label>
                <label className="block text-sm">El monto es<select className={input} value={editing.form.amountMode} onChange={(e) => set('amountMode', e.target.value as 'liquido' | 'bruto')}><option value="liquido">Líquido (ella recibe esto)</option><option value="bruto">Bruto (el de la boleta)</option></select></label>
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={editing.form.proportionalDiscount} onChange={(e) => set('proportionalDiscount', e.target.checked)} /><span>Si llega tarde o acorta el set, se descuenta en proporción al tiempo no tocado.</span></label>
              <div className="rounded-xl border border-white/10 p-3">
                <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4" checked={editing.form.cancelEnabled} onChange={(e) => set('cancelEnabled', e.target.checked)} /><span>Incluir cláusula de cancelación y penalidad <span className="text-amber-200">(recomendado: sin pago previo, es lo único que la compromete)</span></span></label>
                {editing.form.cancelEnabled && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block text-sm">Aviso mínimo (días)<input className={input} inputMode="numeric" value={editing.form.noticeDays} onChange={(e) => set('noticeDays', e.target.value.replace(/\D/g, ''))} /></label>
                    <label className="block text-sm">Penalidad (% del monto)<input className={input} inputMode="numeric" value={editing.form.penaltyPercent} onChange={(e) => set('penaltyPercent', e.target.value.replace(/\D/g, ''))} /></label>
                  </div>
                )}
              </div>
              <p className="rounded-xl bg-white/5 p-3 text-xs text-muted-foreground">Pago fijo: 100 % el mismo día, al terminar el set, contra boleta de honorarios. Plantilla razonable, no asesoría legal: conviene que un abogado la revise.</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button type="button" disabled={busy} onClick={save} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-base font-semibold text-white disabled:opacity-60">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null} Guardar borrador</button>
                <button type="button" onClick={() => setEditing(null)} className="admin-tab flex h-12 items-center gap-1.5 rounded-2xl px-4 text-sm"><X className="h-4 w-4" /> Cancelar</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
