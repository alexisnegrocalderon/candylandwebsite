import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, Search } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isMissionActiveForEvent, missionDepositPrice } from '@shared/mission300';

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Vender por transferencia en un paso: eliges la entrada y la persona, apretas «Cobrado y enviar» y le llega el correo con su
 * entrada y su QR. La venta queda registrada como pagada por transferencia (cuenta en ventas y finanzas). Es el mismo flujo de
 * «Accesos manuales» (orders.createManual), sin los campos que casi nunca se usan. */
export function TransferSaleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { events, eventId } = useTonightEvent();
  const event = ((events ?? []) as any[]).find((e) => e.id === eventId) ?? null;
  const { data: types } = trpc.events.getTicketTypes.useQuery({ slug: event?.slug ?? '' }, { enabled: open && !!event?.slug });
  const [q, setQ] = useState('');
  const [buyer, setBuyer] = useState<{ email: string; name: string } | null>(null);
  const [name, setName] = useState('');
  const [qty, setQty] = useState<Record<number, number>>({});
  const [amount, setAmount] = useState('');
  useEffect(() => { if (open) { setQ(''); setBuyer(null); setName(''); setQty({}); setAmount(''); } }, [open]);

  const found = trpc.customers.page.useQuery({ search: q.trim(), page: 0, pageSize: 6 }, { enabled: open && !buyer && q.trim().length >= 3 });
  const options = (found.data?.rows ?? []) as any[];

  const missionOpen = event ? isMissionActiveForEvent(event) : false;
  const products = useMemo(() => ((types as any[]) ?? [])
    .filter((t) => ['acceso', 'extra'].includes(t.category) && t.status !== 'hidden' && t.name !== 'Staff' && t.name !== 'Invitación Especial' && !(t.topupAmount ?? null))
    .map((t) => ({ ...t, shown: missionOpen && t.category === 'acceso' ? missionDepositPrice(t.accesoSlug) : Number(t.price) })), [types, missionOpen]);

  const lines = products.filter((p) => (qty[p.id] ?? 0) > 0);
  const catalogTotal = lines.reduce((s, p) => s + p.shown * (qty[p.id] ?? 0), 0);
  // Con una sola línea se puede cobrar otro monto (descuento, abono): se reparte por unidad.
  const override = lines.length === 1 && amount.trim() !== '' ? Math.max(0, Math.round(Number(amount))) : null;
  const total = override ?? catalogTotal;

  const utils = trpc.useUtils();
  const sell = trpc.orders.createManual.useMutation({
    onSuccess: (r) => {
      toast.success(`Listo: ${clp(r.total)} por transferencia. Le enviamos la entrada a ${buyer?.email}.`);
      for (const b of r.blockedReview ?? []) toast.warning(`Revisa: coincide con la lista de bloqueados (${b})`);
      utils.orders.listManual.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = () => {
    if (!event || !buyer) return;
    sell.mutate({
      eventSlug: event.slug, buyerName: (name || buyer.name || buyer.email.split('@')[0]).trim(), buyerEmail: buyer.email, kind: 'paid', paymentMethod: 'Transferencia',
      items: lines.map((p) => ({ ticketTypeId: p.id, quantity: qty[p.id]!, ...(override != null ? { unitPrice: Math.round(override / qty[p.id]!) } : {}) })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-xl">💸 Vender por transferencia</DialogTitle>
          <DialogDescription>Elige la persona y la entrada: al apretar «Cobrado y enviar» le llega el correo con su entrada{event ? ` · ${event.title}` : ''}.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <p className="text-sm font-semibold">¿Quién pagó?</p>
            {buyer ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate"><span className="font-medium">{buyer.name || 'Cliente nuevo'}</span> · {buyer.email}</span>
                  <button type="button" className="shrink-0 pl-2 text-xs underline" onClick={() => { setBuyer(null); setQ(''); }}>Cambiar</button>
                </div>
                {!buyer.name && <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la persona (para la entrada)" />}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o correo, o pega un correo…" className="pl-9"
                    onKeyDown={(e) => { if (e.key === 'Enter' && looksLikeEmail(q)) { e.preventDefault(); setBuyer({ email: q.trim().toLowerCase(), name: '' }); } }} />
                </div>
                {q.trim().length >= 3 && (
                  <ul className="space-y-1">
                    {options.map((r) => (
                      <li key={r.id}><button type="button" onClick={() => setBuyer({ email: r.email.toLowerCase(), name: r.fullName ?? '' })} className="flex w-full items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-left text-sm hover:bg-muted">
                        <span className="font-medium">{r.fullName || '(sin nombre)'}</span><span className="truncate pl-2 text-xs text-muted-foreground">{r.email}</span>
                      </button></li>
                    ))}
                    {looksLikeEmail(q) && <li><button type="button" onClick={() => setBuyer({ email: q.trim().toLowerCase(), name: '' })} className="w-full rounded-xl border border-dashed border-border px-3 py-2 text-left text-sm hover:bg-muted">Usar {q.trim().toLowerCase()}</button></li>}
                  </ul>
                )}
              </>
            )}
          </section>

          <section>
            <p className="mb-2 text-sm font-semibold">¿Qué compró?</p>
            <ul className="space-y-1.5">
              {products.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.name}<span className="ml-2 text-xs font-normal text-muted-foreground">{clp(t.shown)}</span></span>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={`Uno menos de ${t.name}`} onClick={() => setQty((s) => ({ ...s, [t.id]: Math.max(0, (s[t.id] ?? 0) - 1) }))}><Minus className="h-4 w-4" /></Button>
                  <span className="w-6 text-center font-bold tabular-nums">{qty[t.id] ?? 0}</span>
                  <Button type="button" size="icon" className="h-9 w-9" aria-label={`Uno más de ${t.name}`} onClick={() => setQty((s) => ({ ...s, [t.id]: Math.min(20, (s[t.id] ?? 0) + 1) }))}><Plus className="h-4 w-4" /></Button>
                </li>
              ))}
              {types && products.length === 0 && <li className="text-sm text-muted-foreground">Este evento no tiene entradas a la venta.</li>}
            </ul>
          </section>

          {lines.length === 1 && (
            <section>
              <p className="mb-1 text-sm font-semibold">Monto transferido <span className="font-normal text-muted-foreground">(déjalo vacío para cobrar el precio de catálogo)</span></p>
              <Input type="number" inputMode="numeric" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(catalogTotal)} />
            </section>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <p className="min-w-0 flex-1 text-base font-semibold tabular-nums">{clp(total)}</p>
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>Cancelar</Button>
          <Button type="button" className="h-11 px-6" disabled={sell.isPending || !buyer || !event || lines.length === 0 || ((!buyer?.name) && !name.trim())} onClick={submit}>{sell.isPending ? 'Enviando…' : 'Cobrado y enviar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
