import { useState } from 'react';
import { toast } from 'sonner';
import { Ban, Check, Undo2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { WriteButton } from '@/components/admin/WriteButton';
import { parseTicketCodeFromQr } from '@shared/qr';
import { VETO_NOTE_MAX, VETO_REASONS, vetoReasonText, type VetoReasonKey } from '@shared/veto';

const when = (iso: string) => { try { return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

/** Vetos del momento: los que pidió la puerta quedan «por confirmar» (confirmar o levantar), y acá mismo se puede vetar a
 * alguien con el código de su entrada (titular y acompañantes). Se ve arriba de Bloqueo de Clientes. */
export function VetoPanel({ onChanged }: { onChanged: () => void }) {
  const list = trpc.blockedCustomers.vetoList.useQuery(undefined, { refetchInterval: 20_000 });
  const confirm = trpc.blockedCustomers.vetoConfirm.useMutation({ onSuccess: () => { toast.success('Veto confirmado: es para siempre'); list.refetch(); onChanged(); }, onError: (e) => toast.error(e.message) });
  const lift = trpc.blockedCustomers.vetoLift.useMutation({ onSuccess: (r) => { toast.success(`Veto levantado${r.ticketsRestored ? ` y ${r.ticketsRestored} ${r.ticketsRestored === 1 ? 'entrada devuelta' : 'entradas devueltas'}` : ''}`); list.refetch(); onChanged(); }, onError: (e) => toast.error(e.message) });
  const veto = trpc.blockedCustomers.vetoTicket.useMutation({
    onSuccess: (r) => { toast.success(`Vetado: ${r.people.join(', ')}${r.ticketsCancelled ? ` · ${r.ticketsCancelled} entradas anuladas` : ''}`); setCode(''); setNote(''); setReason(null); setOpen(false); list.refetch(); onChanged(); },
    onError: (e) => toast.error(e.message),
  });
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState<VetoReasonKey | null>(null);
  const [note, setNote] = useState('');

  const items = list.data ?? [];
  const pending = items.filter((v) => v.status === 'pendiente');
  const done = items.filter((v) => v.status === 'confirmado').slice(0, 5);
  const parsed = parseTicketCodeFromQr(code.trim());
  const ready = !!parsed && !!reason && !!vetoReasonText(reason, note);

  return (
    <div className="space-y-3">
      {pending.length > 0 && (
        <section className="space-y-2 rounded-2xl border border-red-400/40 bg-red-500/10 p-3" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-red-300"><Ban className="h-4 w-4" /> Vetos por confirmar ({pending.length})</p>
          <ul className="space-y-2">
            {pending.map((v) => (
              <li key={v.ticketCode} className="rounded-xl bg-card/60 p-3 text-sm">
                <p className="font-semibold">{v.people.map((p) => p.name || 'Sin nombre').join(', ')}</p>
                <p className="text-xs text-muted-foreground">{v.reason ?? VETO_REASONS.find((r) => r.key === v.reasonKey)?.label} · lo pidió {v.by} · {when(v.at)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <WriteButton size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate({ ticketCode: v.ticketCode })}><Check className="mr-1 h-4 w-4" /> Confirmar para siempre</WriteButton>
                  <WriteButton size="sm" variant="outline" disabled={lift.isPending} onClick={() => { if (window.confirm('¿Levantar este veto? Se devuelven sus entradas y pueden volver a entrar.')) lift.mutate({ ticketCode: v.ticketCode }); }}><Undo2 className="mr-1 h-4 w-4" /> Levantar</WriteButton>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Ya rigen: no pueden entrar ni comprar. Confirmarlos los deja fijos; levantarlos los saca de la lista.</p>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <WriteButton variant="outline" onClick={() => setOpen((o) => !o)}><Ban className="mr-1 h-4 w-4" /> Vetar con código de entrada</WriteButton>
        {done.length > 0 && <span className="text-xs text-muted-foreground">Últimos vetos: {done.map((v) => v.people[0]?.name || 'Sin nombre').join(', ')}</span>}
      </div>

      {open && (
        <section className="space-y-3 rounded-2xl border border-border p-3">
          <p className="text-sm text-muted-foreground">Pega el código de la entrada o lo que lee el lector de QR. Se vetan el titular y todos los acompañantes de esa compra, se anulan sus entradas y salen de Playmatch.</p>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MP-XXXXXXXXXXXX" aria-label="Código de la entrada" autoComplete="off" />
          <div className="flex flex-wrap gap-1.5">
            {VETO_REASONS.map((r) => (
              <button key={r.key} type="button" aria-pressed={reason === r.key} onClick={() => setReason(r.key)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${reason === r.key ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>{r.emoji} {r.label}</button>
            ))}
          </div>
          {reason && <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, VETO_NOTE_MAX))} placeholder={reason === 'otro' ? 'Cuenta qué pasó (obligatorio)' : 'Detalle (opcional)'} aria-label="Detalle del motivo" />}
          <Button variant="destructive" disabled={!ready || veto.isPending}
            onClick={() => { if (parsed && reason && window.confirm('¿Vetar para siempre al titular y a todos los acompañantes de esta compra?')) veto.mutate({ ticketCode: parsed, reasonKey: reason, note: note.trim() || null }); }}>
            {veto.isPending ? 'Vetando…' : 'Vetar para siempre'}
          </Button>
        </section>
      )}
    </div>
  );
}
