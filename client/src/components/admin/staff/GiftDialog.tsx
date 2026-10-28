import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus, Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isAnyParkingTicketType } from '@shared/parking';
import { cargoDef } from '@shared/staffCargos';
import { GIFT_DENIED_MESSAGE } from '@shared/gifts';

type Persona = { id: number; name: string; email: string | null; cargo: string | null; active: boolean };
type Recipient = { email: string; name: string };
type Pack = { id: string; name: string; items: { name: string; qty: number }[]; mode?: 'directo' | 'pase'; anyAccess?: boolean; anyQty?: number; validDays?: number | null };
const VALIDITY = [{ days: null, label: 'Hasta el evento' }, { days: 7, label: '7 días' }, { days: 15, label: '15 días' }, { days: 30, label: '30 días' }] as const;

const GROUPS = [
  { key: 'covers', label: '🎟️ Covers y entradas' },
  { key: 'parking', label: '🚗 Estacionamiento' },
  { key: 'tragos', label: '🍹 Tragos de cortesía' },
] as const;

const AUDIENCES = [
  { id: 'app', label: '📱 Tienen la app', audience: { kind: 'app' } },
  { id: 'members', label: '💳 Socios', audience: { kind: 'members' } },
  { id: 'vip', label: '👑 VIP', audience: { kind: 'level', level: 'vip' } },
  { id: 'recurrente', label: '🔁 Recurrentes', audience: { kind: 'level', level: 'recurrente' } },
  { id: 'nuevo', label: '🌱 Nuevos', audience: { kind: 'level', level: 'nuevo' } },
] as const;

const PACKS_KEY = 'gift.packages';
const loadPacks = (): Pack[] => { try { const v = JSON.parse(localStorage.getItem(PACKS_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const savePacks = (p: Pack[]) => { try { localStorage.setItem(PACKS_KEY, JSON.stringify(p)); } catch { /* sin storage: no se recuerda */ } };
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Regalar entradas, estacionamiento y tragos de cortesía: a una persona (ficha del cliente), a quien busques por nombre o
 * correo, a una lista de correos, a un grupo de clientes o al equipo (con paquetes por cargo). Se crean al instante, llega el
 * correo con el QR, un aviso al celular y aparecen en la app («Mis entradas»). Solo el dueño puede regalar (shared/gifts.ts). */
export function GiftDialog({ open, onClose, team = [], initialIds = [], initialRecipients = [] }: {
  open: boolean; onClose: () => void; team?: Persona[]; initialIds?: number[]; initialRecipients?: Recipient[];
}) {
  const { events, eventId } = useTonightEvent();
  const event = ((events ?? []) as any[]).find((e) => e.id === eventId) ?? null;
  const { data: types } = trpc.events.getTicketTypes.useQuery({ slug: event?.slug ?? '' }, { enabled: open && !!event?.slug });
  const canGift = trpc.orders.canGift.useQuery(undefined, { enabled: open });

  const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients);
  const [staffIds, setStaffIds] = useState<number[]>(initialIds);
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qty, setQty] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const [packs, setPacks] = useState<Pack[]>(loadPacks);
  const [mode, setMode] = useState<'directo' | 'pase'>('directo');
  const [anyAccess, setAnyAccess] = useState(false);
  const [anyQty, setAnyQty] = useState(1);
  const [validDays, setValidDays] = useState<number | null>(null);
  const [view, setView] = useState<'regalar' | 'historial'>('regalar');
  const recKey = initialRecipients.map((r) => r.email).join(',');
  const idsKey = initialIds.join(',');
  useEffect(() => {
    if (!open) return;
    setRecipients(initialRecipients); setStaffIds(idsKey ? idsKey.split(',').map(Number) : []); setAudienceId(null); setQ(''); setQty({}); setReason(''); setPacks(loadPacks()); setMode('directo'); setAnyAccess(false); setAnyQty(1); setValidDays(null); setView('regalar');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recKey, idsKey]);

  const utils = trpc.useUtils();
  const gift = trpc.orders.gift.useMutation({
    onSuccess: (r) => {
      const ok = r.results.filter((x) => x.ok).length;
      const bad = r.results.filter((x) => !x.ok);
      if (ok) toast.success(`Regalado a ${ok} ${ok === 1 ? 'persona' : 'personas'}: ${r.resumen}. Ya les llegó el correo y el aviso.`);
      for (const b of bad.slice(0, 5)) toast.error(`${b.email}: ${b.error}`);
      utils.orders.listStaffComps.invalidate();
      if (bad.length === 0) onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const history = trpc.orders.listGifts.useQuery({ eventId: event?.id ?? 0 }, { enabled: open && view === 'historial' && !!event });
  const cancel = trpc.orders.cancelGift.useMutation({
    onSuccess: () => { toast.success('Pase anulado'); history.refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const found = trpc.customers.page.useQuery({ search: q.trim(), page: 0, pageSize: 6 }, { enabled: open && q.trim().length >= 3 });
  const options = ((found.data?.rows ?? []) as any[]).filter((r) => r.email && !recipients.some((x) => x.email === r.email.toLowerCase()));
  const audience = AUDIENCES.find((a) => a.id === audienceId)?.audience;
  const preview = trpc.member.previewCouponAudience.useQuery(audience as any, { enabled: open && !!audience });

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
  const allProducts = [...products.covers, ...products.parking, ...products.tragos];

  const people = team.filter((m) => m.active && m.email);
  const staffEmails = people.filter((m) => staffIds.includes(m.id)).map((m) => m.email!.toLowerCase());
  const emails = Array.from(new Set([...recipients.map((r) => r.email), ...staffEmails]));
  const accesos = allProducts.filter((t) => t.category === 'acceso');
  const passAny = mode === 'pase' && anyAccess && accesos.length > 0;
  const items = [
    ...Object.entries(qty).filter(([id, n]) => n > 0 && !(passAny && accesos.some((a) => String(a.id) === id))).map(([id, n]) => ({ ticketTypeId: Number(id), quantity: n })),
    ...(passAny && anyQty > 0 ? [{ ticketTypeId: accesos[0].id as number, quantity: anyQty }] : []),
  ];
  const count = (audience ? preview.data?.count ?? 0 : 0) + emails.length;

  const addRecipient = (r: Recipient) => { setRecipients((l) => (l.some((x) => x.email === r.email) ? l : [...l, r])); setQ(''); };
  const toggleStaff = (id: number) => setStaffIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const applyPack = (pack: Pack) => {
    const next: Record<number, number> = {};
    const missing: string[] = [];
    for (const it of pack.items) {
      const t = allProducts.find((p) => p.name.trim().toLowerCase() === it.name.trim().toLowerCase());
      if (t) next[t.id] = Math.min(20, it.qty); else missing.push(it.name);
    }
    setQty(next);
    setMode(pack.mode ?? 'directo'); setAnyAccess(!!pack.anyAccess); setAnyQty(pack.anyQty ?? 1); setValidDays(pack.validDays ?? null);
    if (missing.length) toast.message(`Este evento no tiene: ${missing.join(', ')}`);
  };
  const saveAsPack = () => {
    const name = window.prompt('Nombre del paquete (ej. Barra, Puerta, Invitado VIP)');
    if (!name?.trim()) return;
    const packItems = items.filter((i) => !(passAny && i.ticketTypeId === accesos[0].id)).map((i) => ({ name: allProducts.find((p) => p.id === i.ticketTypeId)?.name ?? '', qty: i.quantity })).filter((i) => i.name);
    const next = [...packs.filter((p) => p.name.toLowerCase() !== name.trim().toLowerCase()), { id: `${Date.now()}`, name: name.trim(), items: packItems, mode, anyAccess: passAny, anyQty: passAny ? anyQty : undefined, validDays }];
    setPacks(next); savePacks(next); toast.success(`Paquete «${name.trim()}» guardado`);
  };
  const deletePack = (id: string) => { const next = packs.filter((p) => p.id !== id); setPacks(next); savePacks(next); };
  // Al elegir a una persona del equipo con cargo, se ofrece el paquete que se llame como su cargo.
  const cargoPacks = useMemo(() => {
    const labels = new Set(people.filter((m) => staffIds.includes(m.id)).map((m) => cargoDef(m.cargo)?.label.toLowerCase()).filter(Boolean) as string[]);
    return packs.filter((p) => Array.from(labels).some((l) => l.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(l.split(' / ')[0])));
  }, [people, staffIds, packs]);

  const submit = () => {
    if (!event) return;
    gift.mutate({ eventId: event.id, emails: emails.length ? emails : undefined, audience: audience as any, items, reason: reason.trim() || undefined, mode, anyAccess: passAny, validDays });
  };
  const blocked = canGift.data ? !canGift.data.can : false;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="text-xl">🎁 Regalar</DialogTitle>
          <DialogDescription>Elige a quién y qué. Les llega el correo con el QR y un aviso al celular, y aparece al instante en su app{event ? ` · ${event.title}` : ''}.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5 border-b border-border px-5 py-2" role="tablist" aria-label="Regalos">
          {([['regalar', '🎁 Regalar'], ['historial', '📋 Regalos hechos']] as const).map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${view === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{label}</button>
          ))}
        </div>
        {view === 'historial' ? (
          <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
            {history.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!history.isLoading && (history.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay pases regalados para este evento.</p>}
            {(history.data ?? []).map((g) => (
              <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{g.buyerName || g.buyerEmail} <span className="font-normal text-muted-foreground">· {g.accesoName}</span></p>
                  <p className="truncate text-xs text-muted-foreground">{g.buyerEmail} · {g.code}{g.reason ? ` · ${g.reason}` : ''}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${g.availability === 'available' ? 'bg-emerald-500/15 text-emerald-500' : g.availability === 'used' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                  {g.availability === 'available' ? 'Disponible' : g.availability === 'used' ? 'Canjeado' : g.availability === 'expired' ? 'Vencido' : 'Anulado'}
                </span>
                {g.availability === 'available' && (
                  <Button type="button" variant="outline" size="sm" disabled={cancel.isPending || blocked} onClick={() => { if (window.confirm(`¿Anular el pase de ${g.buyerEmail}?`)) cancel.mutate({ creditId: g.id }); }}>Anular</Button>
                )}
              </div>
            ))}
          </div>
        ) : (
        <>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {blocked && <p className="rounded-2xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{GIFT_DENIED_MESSAGE}</p>}

          <section className="space-y-2">
            <p className="text-sm font-semibold">¿A quién?</p>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recipients.map((r) => (
                  <span key={r.email} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                    {r.name || r.email}
                    <button type="button" aria-label={`Quitar a ${r.name || r.email}`} onClick={() => setRecipients((l) => l.filter((x) => x.email !== r.email))}><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o correo, o pega un correo…" className="pl-9"
                onKeyDown={(e) => { if (e.key === 'Enter' && looksLikeEmail(q)) { e.preventDefault(); addRecipient({ email: q.trim().toLowerCase(), name: '' }); } }} />
            </div>
            {q.trim().length >= 3 && (
              <ul className="space-y-1">
                {options.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => addRecipient({ email: r.email.toLowerCase(), name: r.fullName ?? '' })} className="flex w-full items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="font-medium">{r.fullName || '(sin nombre)'}</span><span className="truncate pl-2 text-xs text-muted-foreground">{r.email}</span>
                    </button>
                  </li>
                ))}
                {looksLikeEmail(q) && !options.some((r) => r.email.toLowerCase() === q.trim().toLowerCase()) && (
                  <li><button type="button" onClick={() => addRecipient({ email: q.trim().toLowerCase(), name: '' })} className="w-full rounded-xl border border-dashed border-border px-3 py-2 text-left text-sm hover:bg-muted">Agregar {q.trim().toLowerCase()}</button></li>
                )}
                {!found.isLoading && options.length === 0 && !looksLikeEmail(q) && <li className="px-1 text-xs text-muted-foreground">Sin resultados: escribe el correo completo para agregarlo.</li>}
              </ul>
            )}

            {people.length > 0 && (
              <div>
                <p className="mb-1 mt-2 flex items-center gap-2 text-xs font-semibold text-muted-foreground">Equipo <button type="button" className="font-normal underline" onClick={() => setStaffIds(people.map((m) => m.id))}>todos</button> <button type="button" className="font-normal underline" onClick={() => setStaffIds([])}>ninguno</button></p>
                <div className="flex flex-wrap gap-1.5">
                  {people.map((m) => (
                    <button key={m.id} type="button" aria-pressed={staffIds.includes(m.id)} onClick={() => toggleStaff(m.id)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium ${staffIds.includes(m.id) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{cargoDef(m.cargo)?.emoji ?? ''} {m.name}</button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1 mt-2 text-xs font-semibold text-muted-foreground">O a todo un grupo</p>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCES.map((a) => (
                  <button key={a.id} type="button" aria-pressed={audienceId === a.id} onClick={() => setAudienceId(audienceId === a.id ? null : a.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ${audienceId === a.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{a.label}</button>
                ))}
              </div>
              {audience && <p className="mt-1 text-xs text-muted-foreground">{preview.isLoading ? 'Contando…' : preview.data?.overLimit ? 'Es demasiado grande para un solo envío: elige un grupo más chico.' : `Le llegaría a ${preview.data?.count ?? 0} personas.`}</p>}
            </div>
          </section>

          <section className="space-y-2">
            <p className="text-sm font-semibold">¿Cómo lo recibe?</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo lo recibe">
              {([['directo', '🎟️ Llega directo', 'La entrada llega con su QR, lista para usar.'], ['pase', '🎁 Pase para canjear', 'Queda en Cupones: canjea y compra con su acceso de regalo.']] as const).map(([m, label, help]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={`rounded-2xl border-2 px-3 py-2.5 text-left transition ${mode === m ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{help}</span>
                </button>
              ))}
            </div>
            {mode === 'pase' && (
              <div className="space-y-2 rounded-2xl bg-muted/40 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {([[false, 'Acceso fijo'], [true, 'A elección']] as const).map(([v, label]) => (
                    <button key={label} type="button" aria-pressed={anyAccess === v} onClick={() => setAnyAccess(v)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium ${anyAccess === v ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{label}</button>
                  ))}
                </div>
                {anyAccess && (
                  <div className="flex items-center gap-2 rounded-2xl bg-card/60 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">🎟️ Pase a elección (cada uno vale por un acceso)</span>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label="Un pase menos" onClick={() => setAnyQty((n) => Math.max(0, n - 1))}><Minus className="h-4 w-4" /></Button>
                    <span className="w-6 text-center font-bold tabular-nums">{anyQty}</span>
                    <Button type="button" size="icon" className="h-9 w-9" aria-label="Un pase más" onClick={() => setAnyQty((n) => Math.min(20, n + 1))}><Plus className="h-4 w-4" /></Button>
                  </div>
                )}
                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Vigencia</p>
                  <div className="flex flex-wrap gap-1.5">
                    {VALIDITY.map((v) => (
                      <button key={v.label} type="button" aria-pressed={validDays === v.days} onClick={() => setValidDays(v.days)}
                        className={`rounded-full px-3 py-1.5 text-sm font-medium ${validDays === v.days ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{v.label}</button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">El pase es personal, vale solo para {event?.title ?? 'este evento'} y se canjea en el checkout con todos sus pasos (incluido el código de Soltero). Los tragos siempre llegan con QR.</p>
              </div>
            )}
          </section>

          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Paquetes</p>
              {(cargoPacks.length ? cargoPacks : packs).map((p) => (
                <span key={p.id} className="inline-flex items-center overflow-hidden rounded-full border border-border bg-card text-sm">
                  <button type="button" onClick={() => applyPack(p)} className="px-3 py-1.5 font-medium hover:bg-muted">📦 {p.name}</button>
                  <button type="button" aria-label={`Borrar el paquete ${p.name}`} onClick={() => deletePack(p.id)} className="px-2 py-1.5 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              <button type="button" disabled={items.length === 0} onClick={saveAsPack} className="text-xs underline disabled:opacity-40">Guardar lo elegido como paquete</button>
            </div>
          </section>

          {GROUPS.map((g) => products[g.key].length > 0 && (
            <section key={g.key}>
              <p className="mb-2 text-sm font-semibold">{g.label}</p>
              <ul className="space-y-1.5">
                {products[g.key].filter((t: any) => !(passAny && t.category === 'acceso')).map((t: any) => (
                  <li key={t.id} className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.emoji ? `${t.emoji} ` : ''}{t.name}</span>
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={`Uno menos de ${t.name}`} onClick={() => setQty((s) => ({ ...s, [t.id]: Math.max(0, (s[t.id] ?? 0) - 1) }))}><Minus className="h-4 w-4" /></Button>
                    <span className="w-6 text-center font-bold tabular-nums">{qty[t.id] ?? 0}</span>
                    <Button type="button" size="icon" className="h-9 w-9" aria-label={`Uno más de ${t.name}`} onClick={() => setQty((s) => ({ ...s, [t.id]: Math.min(20, (s[t.id] ?? 0) + 1) }))}><Plus className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {event && types && GROUPS.every((g) => products[g.key].length === 0) && <p className="text-sm text-muted-foreground">Este evento todavía no tiene productos para regalar.</p>}

          <section>
            <p className="mb-1 text-sm font-semibold">Motivo <span className="font-normal text-muted-foreground">(opcional, queda en el historial)</span></p>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej. cumpleaños, compensación, invitado de producción…" />
          </section>
        </div>
        <div className="flex items-center gap-3 border-t border-border px-5 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{count} {count === 1 ? 'persona' : 'personas'} · {items.reduce((s, i) => s + i.quantity, 0)} regalos cada una</p>
          <Button type="button" variant="outline" className="h-11" onClick={onClose}>Cancelar</Button>
          <Button type="button" className="h-11 px-6" disabled={blocked || gift.isPending || count === 0 || items.length === 0 || !event || (!!audience && !!preview.data?.overLimit)} onClick={submit}>{gift.isPending ? 'Regalando…' : mode === 'pase' ? '🎁 Enviar pase' : '🎁 Regalar'}</Button>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
