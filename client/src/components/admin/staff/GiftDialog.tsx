import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isAnyParkingTicketType } from '@shared/parking';

type Persona = { id: number; name: string; email: string | null; cargo: string | null; active: boolean };

const GROUPS = [
  { key: 'covers', label: '🎟️ Covers y entradas' },
  { key: 'parking', label: '🚗 Estacionamiento' },
  { key: 'tragos', label: '🍹 Tragos de cortesía' },
] as const;

/** Regalar covers, entradas, estacionamiento y tragos de cortesía a una o varias personas del equipo: se crean al
 * instante, les llega un aviso al celular y aparecen en su app («Mis entradas») listos para canjear. */
export function GiftDialog({ open, onClose, team, initialIds }: { open: boolean; onClose: () => void; team: Persona[]; initialIds: number[] }) {
  const { data: event } = trpc.events.getActiveForCaja.useQuery(undefined, { enabled: open });
  const { data: types } = trpc.events.getTicketTypes.useQuery({ slug: event?.slug ?? '' }, { enabled: open && !!event?.slug });
  const [ids, setIds] = useState<number[]>(initialIds);
  const [qty, setQty] = useState<Record<number, number>>({});
  const initialKey = initialIds.join(',');
  useEffect(() => { if (open) { setIds(initialKey ? initialKey.split(',').map(Number) : []); setQty({}); } }, [open, initialKey]);

  const gift = trpc.orders.giftToStaff.useMutation({
    onSuccess: (r) => {
      const ok = r.results.filter((x) => x.ok).length;
      const bad = r.results.filter((x) => !x.ok);
      if (ok) toast.success(`Regalado a ${ok} ${ok === 1 ? 'persona' : 'personas'}: ${r.resumen}. Ya les llegó el aviso.`);
      for (const b of bad) toast.error(`${b.email}: ${b.error}`);
      if (bad.length === 0) onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const products = useMemo(() => {
    const list = ((types as any[]) ?? []).filter((t) => t.status !== 'hidden' && t.name !== 'Staff' && t.name !== 'Invitación Especial' && !(t.topupAmount ?? null));
    const g: Record<(typeof GROUPS)[number]['key'], any[]> = { covers: [], parking: [], tragos: [] };
    for (const t of list) {
      if (t.category === 'acceso' || (t.category === 'extra' && !isAnyParkingTicketType(t.name))) g.covers.push(t);
      else if (t.category === 'extra') g.parking.push(t);
      else if (['consumo', 'merch'].includes(t.category)) g.tragos.push(t);
    }
    return g;
  }, [types]);

  const people = team.filter((m) => m.active && m.email);
  const toggle = (id: number) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([id, q]) => ({ ticketTypeId: Number(id), quantity: q }));
  const emails = people.filter((m) => ids.includes(m.id)).map((m) => m.email!);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-xl">🎁 Regalar al equipo</DialogTitle>
          <DialogDescription>Elige a quién y qué. Les llega un aviso al celular y aparece al instante en su app{event ? ` · ${event.title}` : ''}.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">¿A quién? <button type="button" className="text-xs font-normal underline" onClick={() => setIds(people.map((m) => m.id))}>todos</button> <button type="button" className="text-xs font-normal underline" onClick={() => setIds([])}>ninguno</button></p>
            <div className="flex flex-wrap gap-1.5">
              {people.map((m) => (
                <button key={m.id} type="button" aria-pressed={ids.includes(m.id)} onClick={() => toggle(m.id)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${ids.includes(m.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{m.name}</button>
              ))}
              {people.length === 0 && <p className="text-sm text-muted-foreground">Nadie del equipo tiene correo todavía: agrégalo en su ficha para poder regalarle.</p>}
            </div>
          </section>
          {GROUPS.map((g) => products[g.key].length > 0 && (
            <section key={g.key}>
              <p className="mb-2 text-sm font-semibold">{g.label}</p>
              <ul className="space-y-1.5">
                {products[g.key].map((t: any) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.emoji ? `${t.emoji} ` : ''}{t.name}</span>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={`Uno menos de ${t.name}`} onClick={() => setQty((q) => ({ ...q, [t.id]: Math.max(0, (q[t.id] ?? 0) - 1) }))}><Minus className="h-4 w-4" /></Button>
                    <span className="w-6 text-center font-bold tabular-nums">{qty[t.id] ?? 0}</span>
                    <Button type="button" size="icon" className="h-9 w-9" aria-label={`Uno más de ${t.name}`} onClick={() => setQty((q) => ({ ...q, [t.id]: Math.min(20, (q[t.id] ?? 0) + 1) }))}><Plus className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {event && types && GROUPS.every((g) => products[g.key].length === 0) && <p className="text-sm text-muted-foreground">Este evento todavía no tiene productos para regalar.</p>}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{emails.length} {emails.length === 1 ? 'persona' : 'personas'} · {items.reduce((s, i) => s + i.quantity, 0)} regalos cada una</p>
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>Cancelar</Button>
          <Button type="button" className="h-11 px-6" disabled={gift.isPending || emails.length === 0 || items.length === 0 || !event}
            onClick={() => event && gift.mutate({ eventId: event.id, emails, items })}>{gift.isPending ? 'Regalando…' : '🎁 Regalar'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
