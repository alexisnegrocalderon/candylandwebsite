import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, ChevronLeft, Minus, Plus, Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { isTestEvent, useTonightEvent } from '@/hooks/useTonightEvent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useBackClosable } from '@/components/site/AmbassadorAccount';
import { InstantInviteButton } from '@/components/admin/gifts/InstantInviteButton';
import { isAnyParkingTicketType } from '@shared/parking';
import { cargoDef } from '@shared/staffCargos';
import { GIFT_DENIED_MESSAGE } from '@shared/gifts';
import { GIFT_MESSAGE_MAX, LIMITE_DIAS, VIGENCIAS, giftSummary, initialOf, lastVisitLabel, type GiftPackData, type Vigencia } from '@shared/giftFlow';

type Persona = { id: number; name: string; email: string | null; cargo: string | null; active: boolean };
type Recipient = { email: string; name: string };
type Step = 'form' | 'listo' | 'historial';

const AUDIENCES = [
  { id: 'app', label: '📱 Tienen la app', short: 'quienes tienen la app', audience: { kind: 'app' } },
  { id: 'members', label: '💳 Socios', short: 'los socios', audience: { kind: 'members' } },
  { id: 'vip', label: '👑 VIP', short: 'el grupo VIP', audience: { kind: 'level', level: 'vip' } },
  { id: 'recurrente', label: '🔁 Recurrentes', short: 'los recurrentes', audience: { kind: 'level', level: 'recurrente' } },
  { id: 'nuevo', label: '🌱 Nuevos', short: 'los nuevos', audience: { kind: 'level', level: 'nuevo' } },
] as const;
const VALIDITY_EVENT = [{ days: null, label: 'Hasta el evento' }, { days: 7, label: '7 días' }, { days: 15, label: '15 días' }, { days: 30, label: '30 días' }] as const;

// Los paquetes vivían solo en este celular; ahora están en la cuenta. Los de antes se suben solos una vez.
const LOCAL_PACKS_KEY = 'gift.packages';
const loadLocalPacks = (): { name: string; items: { name: string; qty: number }[]; mode?: 'directo' | 'pase'; anyAccess?: boolean; anyQty?: number; validDays?: number | null }[] => {
  try { const v = JSON.parse(localStorage.getItem(LOCAL_PACKS_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Espera `ms` sin cambios antes de devolver el valor (búsqueda en vivo sin una consulta por tecla). */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t); }, [value, ms]);
  return v;
}

const chip = (on: boolean) => `rounded-full px-3 py-1.5 text-sm font-medium transition ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`;

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <li className="flex items-center gap-2 rounded-2xl bg-muted/50 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
      <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={`Uno menos de ${label}`} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}><Minus className="h-4 w-4" /></Button>
      <span className="w-6 text-center font-bold tabular-nums" aria-live="polite">{value}</span>
      <Button type="button" size="icon" className="h-9 w-9" aria-label={`Uno más de ${label}`} onClick={() => onChange(Math.min(20, value + 1))}><Plus className="h-4 w-4" /></Button>
    </li>
  );
}

function SectionTitle({ n, children, hint }: { n: number; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
      <h3 className="text-base font-bold">{children}</h3>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** «Regalar» en una sola pantalla: 1 a quién (búsqueda en vivo de clientes y equipo, o un grupo), 2 para qué vale (un evento, cualquier
 * evento sin vencimiento o cualquier evento con fecha límite), 3 qué regalas (entradas y tragos, o un cupón libre), y abajo un botón
 * fijo con el resumen. Con `limited` (la supervisora) solo invita entradas y extras gratis a correos que escribe. La misma hoja en el panel
 * y en la App; en la App funciona si ese celular ya tiene abierta la sesión del panel. */
export function GiftSheet({ open, onClose, team = [], initialIds = [], initialRecipients = [], variant = 'sheet', limited = false }: {
  open: boolean; onClose: () => void; team?: Persona[]; initialIds?: number[]; initialRecipients?: Recipient[];
  /** `sheet`: hoja inferior del panel. `app`: pantalla de la App (Mi cuenta), con su mismo estilo oscuro. */
  variant?: 'sheet' | 'app';
  /** La supervisora: solo invita entradas y extras, a correos que escribe (sin buscador de clientes, tragos ni pases). */
  limited?: boolean;
}) {
  const access = trpc.orders.canGift.useQuery(undefined, { enabled: open && !limited, retry: false });
  const allowed = limited || !!access.data?.can;
  // Solo con la hoja abierta y la sesión del panel: en la App, las consultas del panel no se piden de más.
  const { events, eventId: defaultEventId } = useTonightEvent({ enabled: open && allowed });
  // El evento del regalo: el de esta noche, o el que elijas aquí (sin cambiar el evento del resto del panel).
  const [pickedEventId, setPickedEventId] = useState<number | null>(null);
  const eventId = pickedEventId ?? defaultEventId;
  const event = ((events ?? []) as any[]).find((e) => e.id === eventId) ?? null;
  const eventOptions = useMemo(() => {
    const now = Date.now();
    const real = ((events ?? []) as any[]).filter((e) => !isTestEvent(e));
    const next = real.filter((e) => new Date(e.eventDate).getTime() >= now - 2 * 86_400_000).sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
    const past = real.filter((e) => !next.includes(e)).sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime()).slice(0, 3);
    const all = [...next, ...past];
    return event && !all.some((e) => e.id === event.id) ? [event, ...all] : all;
  }, [events, event]);
  const { data: types } = trpc.events.getTicketTypes.useQuery({ slug: event?.slug ?? '' }, { enabled: open && allowed && !!event?.slug });

  const [step, setStep] = useState<Step>('form');
  const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients);
  const [staffIds, setStaffIds] = useState<number[]>(initialIds);
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [teamOpen, setTeamOpen] = useState(false);
  const [q, setQ] = useState('');
  const [qty, setQty] = useState<Record<number, number>>({});
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [vigencia, setVigencia] = useState<Vigencia>('evento');
  const [limiteDias, setLimiteDias] = useState<number>(30);
  const [mode, setMode] = useState<'directo' | 'pase'>('directo');
  const [anyAccess, setAnyAccess] = useState(false);
  const [anyQty, setAnyQty] = useState(1);
  /** Cupón para cualquier evento: el acceso fijo elegido (id del acceso) o `null` = «a elección». */
  const [libreAccessId, setLibreAccessId] = useState<number | null>(null);
  const [validDays, setValidDays] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: number; bad: { email: string; error?: string }[]; resumen: string; passes: { email: string; codes: string[] }[] } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const reset = (keepRecipients: Recipient[] = [], keepIds: number[] = []) => {
    setStep('form');
    setRecipients(keepRecipients); setStaffIds(keepIds); setAudienceId(null); setQ(''); setQty({}); setMessage(''); setReason('');
    setVigencia('evento'); setLimiteDias(30); setMode('directo'); setAnyAccess(false); setAnyQty(1); setLibreAccessId(null); setValidDays(null); setResult(null); setPickedEventId(null); setTeamOpen(false);
  };
  /** «Regalar a otra persona»: vuelve a la pantalla con lo mismo elegido para regalar (cambia solo a quién y el mensaje). */
  const anotherPerson = () => { setRecipients([]); setStaffIds([]); setAudienceId(null); setQ(''); setMessage(''); setResult(null); setStep('form'); window.setTimeout(() => searchRef.current?.focus(), 150); };
  const recKey = initialRecipients.map((r) => r.email).join(',');
  const idsKey = initialIds.join(',');
  useEffect(() => {
    if (open) reset(initialRecipients, idsKey ? idsKey.split(',').map(Number) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recKey, idsKey]);
  useEffect(() => { if (open && step === 'form' && !initialRecipients.length && !initialIds.length) window.setTimeout(() => searchRef.current?.focus(), 300); }, [open, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // A quién: búsqueda en vivo desde 2 caracteres, con 250 ms de espera. La supervisora no ve el directorio de clientes: escribe el correo.
  const term = useDebounced(q.trim(), 250);
  const found = trpc.customers.quickSearch.useQuery({ q: term }, { enabled: open && allowed && !limited && term.length >= 2, placeholderData: (prev) => prev });
  const people = limited ? [] : team.filter((m) => m.active && m.email);
  // El mismo buscador encuentra también al equipo (por nombre, correo o cargo): clientes y staff en una sola lista.
  const needle = term.toLowerCase();
  const staffMatches = term.length >= 2
    ? people.filter((m) => !staffIds.includes(m.id) && [m.name, m.email ?? '', cargoDef(m.cargo)?.label ?? ''].some((v) => v.toLowerCase().includes(needle)))
    : [];
  const options = (!limited && term.length >= 2 ? found.data ?? [] : []).filter((r) => !recipients.some((x) => x.email === r.email.toLowerCase()) && !people.some((m) => m.email!.toLowerCase() === r.email.toLowerCase() && (staffIds.includes(m.id) || staffMatches.some((x) => x.id === m.id))));
  const audienceDef = limited ? undefined : AUDIENCES.find((a) => a.id === audienceId);
  const preview = trpc.member.previewCouponAudience.useQuery(audienceDef?.audience as any, { enabled: open && allowed && !!audienceDef });

  const staffEmails = people.filter((m) => staffIds.includes(m.id)).map((m) => m.email!.toLowerCase());
  const emails = Array.from(new Set([...recipients.map((r) => r.email), ...staffEmails]));
  const count = (audienceDef ? preview.data?.count ?? 0 : 0) + emails.length;
  const addRecipient = (r: Recipient) => { setRecipients((l) => (l.some((x) => x.email === r.email) ? l : [...l, r])); setQ(''); searchRef.current?.focus(); };

  // Qué regalas: entradas (accesos y extras) y tragos de la carta del evento.
  const libre = !limited && vigencia !== 'evento';
  const products = useMemo(() => {
    const list = ((types as any[]) ?? []).filter((t) => t.status !== 'hidden' && t.name !== 'Staff' && t.name !== 'Invitación Especial' && !(t.topupAmount ?? null));
    return {
      entradas: list.filter((t) => t.category === 'acceso' || t.category === 'extra').sort((a, b) => Number(a.category !== 'acceso') - Number(b.category !== 'acceso') || Number(isAnyParkingTicketType(a.name)) - Number(isAnyParkingTicketType(b.name))),
      tragos: limited ? [] : list.filter((t) => ['consumo', 'merch'].includes(t.category)),
    };
  }, [types, limited]);
  const allProducts = [...products.entradas, ...products.tragos];
  const accesos = products.entradas.filter((t) => t.category === 'acceso');
  // Un cupón para cualquier evento es siempre un pase «a elección»; en un evento puede serlo si lo eliges.
  const libreAcceso = libre ? accesos.find((a) => a.id === libreAccessId) ?? null : null;
  const passAny = libre ? !libreAcceso : (mode === 'pase' && anyAccess && accesos.length > 0);
  const passDays = vigencia === 'limite' ? limiteDias : vigencia === 'libre' ? null : validDays;
  const items = libre
    ? ((libreAcceso ?? accesos[0]) && anyQty > 0 ? [{ ticketTypeId: (libreAcceso ?? accesos[0]).id as number, quantity: anyQty }] : [])
    : [
      ...Object.entries(qty).filter(([id, n]) => n > 0 && !(passAny && accesos.some((a) => String(a.id) === id))).map(([id, n]) => ({ ticketTypeId: Number(id), quantity: n })),
      ...(passAny && anyQty > 0 && accesos[0] ? [{ ticketTypeId: accesos[0].id as number, quantity: anyQty }] : []),
    ];
  const giftCount = items.reduce((s, i) => s + i.quantity, 0);

  // Paquetes guardados en la cuenta (se ven en cualquier celular o tablet).
  const utils = trpc.useUtils();
  const packsQ = trpc.orders.giftPacks.useQuery(undefined, { enabled: open && allowed && !limited, retry: false });
  const packs = packsQ.data ?? [];
  const savePackM = trpc.orders.saveGiftPack.useMutation({ onSuccess: () => utils.orders.giftPacks.invalidate(), onError: (e) => toast.error(e.message) });
  const deletePackM = trpc.orders.deleteGiftPack.useMutation({ onSuccess: () => utils.orders.giftPacks.invalidate(), onError: (e) => toast.error(e.message) });
  const migrated = useRef(false);
  useEffect(() => {
    // Los paquetes que había en este celular suben a la cuenta una sola vez (si la cuenta todavía no tiene ninguno).
    if (!open || !allowed || limited || migrated.current || !packsQ.isSuccess || packs.length > 0) return;
    migrated.current = true;
    const local = loadLocalPacks().filter((p) => p?.name && Array.isArray(p.items));
    if (local.length === 0) return;
    void Promise.all(local.map((p) => savePackM.mutateAsync({
      name: p.name.slice(0, 60),
      data: { vigencia: 'evento', mode: p.mode ?? 'directo', anyAccess: !!p.anyAccess, anyQty: p.anyQty, validDays: p.validDays ?? null, items: p.items.filter((i) => i?.name && i.qty > 0).map((i) => ({ name: String(i.name).slice(0, 120), qty: Math.min(20, Math.max(1, Math.round(i.qty))) })) },
    }).catch(() => null))).then(() => { try { localStorage.removeItem(LOCAL_PACKS_KEY); } catch { /* sin storage */ } toast.message('Tus paquetes ahora están guardados en tu cuenta'); });
  }, [open, allowed, limited, packsQ.isSuccess, packs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyPack = (pack: GiftPackData & { name: string }) => {
    setVigencia(pack.vigencia ?? 'evento');
    setMode(pack.mode ?? 'directo'); setAnyAccess(!!pack.anyAccess); setAnyQty(pack.anyQty ?? 1);
    if (pack.vigencia === 'limite') setLimiteDias(pack.validDays ?? 30); else setValidDays(pack.validDays ?? null);
    const next: Record<number, number> = {};
    const missing: string[] = [];
    for (const it of pack.items) {
      const t = allProducts.find((p) => p.name.trim().toLowerCase() === it.name.trim().toLowerCase());
      if (t) next[t.id] = Math.min(20, it.qty); else missing.push(it.name);
    }
    setQty(next);
    if (missing.length) toast.message(`Este evento no tiene: ${missing.join(', ')}`);
  };
  const saveAsPack = () => {
    const name = window.prompt('Nombre del paquete (ej. Barra, Puerta, Invitado VIP)');
    if (!name?.trim()) return;
    const packItems = libre ? [] : items.filter((i) => !(passAny && i.ticketTypeId === accesos[0]?.id)).map((i) => ({ name: allProducts.find((p) => p.id === i.ticketTypeId)?.name ?? '', qty: i.quantity })).filter((i) => i.name);
    savePackM.mutate({ name: name.trim(), data: { vigencia, mode: libre ? 'pase' : mode, anyAccess: passAny, anyQty: passAny ? anyQty : undefined, validDays: passDays, items: packItems } }, { onSuccess: () => toast.success(`Paquete «${name.trim()}» guardado en tu cuenta`) });
  };
  // Con gente del equipo elegida, primero los paquetes que se llaman como su cargo.
  const shownPacks = useMemo(() => {
    const labels = people.filter((m) => staffIds.includes(m.id)).map((m) => cargoDef(m.cargo)?.label.toLowerCase()).filter(Boolean) as string[];
    const match = packs.filter((p) => labels.some((l) => l.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(l.split(' / ')[0])));
    return match.length ? [...match, ...packs.filter((p) => !match.includes(p))] : packs;
  }, [people, staffIds, packs]);

  // El resumen en palabras.
  const toLabel = (() => {
    const named = [...recipients.map((r) => r.name || r.email), ...people.filter((m) => staffIds.includes(m.id)).map((m) => m.name)];
    const parts: string[] = [];
    if (named.length === 1) parts.push(named[0].split(' ')[0]);
    else if (named.length > 1) parts.push(`${named.length} personas`);
    if (audienceDef) parts.push(`${audienceDef.short}${preview.data ? ` (${preview.data.count} personas)` : ''}`);
    return parts.join(' y ') || 'esta persona';
  })();
  const summary = giftSummary({
    to: toLabel, mode: libre ? 'pase' : mode, anyAccessQty: passAny ? anyQty : 0, eventTitle: libre ? null : event?.title ?? null, anyEvent: libre,
    validity: passDays ? `por ${passDays} días` : libre ? 'sin vencimiento' : 'hasta el evento',
    items: items.filter((i) => !(passAny && i.ticketTypeId === accesos[0]?.id)).map((i) => {
      const t = allProducts.find((p) => p.id === i.ticketTypeId);
      return { name: t?.name ?? 'producto', quantity: i.quantity, kind: t?.category === 'acceso' ? 'acceso' as const : t?.category === 'extra' ? 'extra' as const : 'trago' as const };
    }),
  });

  const done = (r: { results: { email: string; ok: boolean; error?: string; codes?: string[] }[]; resumen: string }) => {
    setResult({ ok: r.results.filter((x) => x.ok).length, bad: r.results.filter((x) => !x.ok), resumen: r.resumen, passes: r.results.filter((x) => x.ok && x.codes?.length).map((x) => ({ email: x.email, codes: x.codes! })) });
    setStep('listo');
    utils.orders.listStaffComps.invalidate();
    utils.orders.listGifts.invalidate();
  };
  const gift = trpc.orders.gift.useMutation({ onSuccess: done, onError: (e) => toast.error(e.message) });
  const invite = trpc.orders.giftInvitation.useMutation({ onSuccess: done, onError: (e) => toast.error(e.message) });
  const sending = gift.isPending || invite.isPending;
  const submit = () => {
    if (!event) return;
    if (limited) {
      invite.mutate({ eventId: event.id, emails, items, message: message.trim() || undefined });
      return;
    }
    gift.mutate({
      eventId: event.id, emails: emails.length ? emails : undefined, audience: audienceDef?.audience as any, items,
      reason: reason.trim() || undefined, message: message.trim() || undefined,
      mode: libre ? 'pase' : mode, anyAccess: passAny, anyEvent: libre || undefined, validDays: passDays,
    });
  };

  const history = trpc.orders.listGifts.useQuery({ eventId: event?.id ?? 0 }, { enabled: open && allowed && !limited && step === 'historial' && !!event });
  const cancel = trpc.orders.cancelGift.useMutation({
    onSuccess: () => { toast.success('Pase anulado'); history.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const canSend = !sending && !!event && count > 0 && giftCount > 0 && !(audienceDef && preview.data?.overLimit);
  const missing = count === 0 ? 'Elige a quién regalar' : giftCount === 0 ? (libre ? 'Elige cuántos cupones' : 'Elige qué regalar') : null;

  // Atrás del encabezado de la App: cierra, o vuelve del historial.
  const goBack = () => { if (step === 'historial') setStep('form'); else onClose(); };
  useBackClosable(open && variant === 'app', onClose);

  const title = limited ? 'Invitar' : 'Regalar';
  const headTitle = step === 'form' ? `🎁 ${title}` : step === 'historial' ? '📋 Regalos hechos' : '🎉 ¡Listo!';
  const headSub = libre && step === 'form' ? 'Para cualquier evento' : event ? event.title : 'Cargando el evento…';

  const whoSection = (
    <section>
      <SectionTitle n={1}>¿A quién?</SectionTitle>
      {(recipients.length > 0 || staffIds.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {people.filter((m) => staffIds.includes(m.id)).map((m) => (
            <span key={`s${m.id}`} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              {cargoDef(m.cargo)?.emoji ?? '👤'} {m.name}
              <button type="button" aria-label={`Quitar a ${m.name}`} onClick={() => setStaffIds((l) => l.filter((x) => x !== m.id))}><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
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
        <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={limited ? 'Correo de quien recibe' : 'Cliente o equipo: nombre, correo o teléfono'} className="h-12 pl-9 text-base" inputMode={limited ? 'email' : 'search'} autoComplete="off"
          onKeyDown={(e) => { if (e.key === 'Enter' && looksLikeEmail(q)) { e.preventDefault(); addRecipient({ email: q.trim().toLowerCase(), name: '' }); } }} />
      </div>
      {limited && looksLikeEmail(q) && (
        <button type="button" onClick={() => addRecipient({ email: q.trim().toLowerCase(), name: '' })} className="mt-1.5 w-full rounded-2xl border border-dashed border-border px-3 py-2.5 text-left text-sm hover:bg-muted">Agregar {q.trim().toLowerCase()}</button>
      )}
      {q.trim().length === 1 && !limited && <p className="mt-1 text-xs text-muted-foreground">Escribe una letra más para buscar.</p>}
      {!limited && term.length >= 2 && (
        <ul className="mt-2 space-y-1.5" aria-live="polite">
          {staffMatches.map((m) => (
            <li key={`m${m.id}`}>
              <button type="button" onClick={() => { setStaffIds((l) => (l.includes(m.id) ? l : [...l, m.id])); setQ(''); searchRef.current?.focus(); }} className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5 text-left hover:bg-muted">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-lg">{cargoDef(m.cargo)?.emoji ?? '👤'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{m.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
                </span>
                <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Equipo{cargoDef(m.cargo) ? ` · ${cargoDef(m.cargo)!.label.split(' / ')[0]}` : ''}</span>
              </button>
            </li>
          ))}
          {options.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => addRecipient({ email: r.email.toLowerCase(), name: r.fullName ?? '' })} className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2.5 text-left hover:bg-muted">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 font-bold text-primary">{initialOf(r.fullName, r.email)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.fullName || '(sin nombre)'}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.email}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-muted-foreground">{lastVisitLabel(r.lastSeenAt)}</span>
              </button>
            </li>
          ))}
          {looksLikeEmail(q) && !options.some((r) => r.email.toLowerCase() === q.trim().toLowerCase()) && (
            <li><button type="button" onClick={() => addRecipient({ email: q.trim().toLowerCase(), name: '' })} className="w-full rounded-2xl border border-dashed border-border px-3 py-2.5 text-left text-sm hover:bg-muted">Agregar {q.trim().toLowerCase()}</button></li>
          )}
          {!found.isFetching && options.length === 0 && staffMatches.length === 0 && !looksLikeEmail(q) && <li className="px-1 text-xs text-muted-foreground">Nadie con «{term}». Si no es cliente todavía, escribe su correo completo.</li>}
          {found.isFetching && options.length === 0 && staffMatches.length === 0 && <li className="px-1 text-xs text-muted-foreground">Buscando…</li>}
        </ul>
      )}
      {!limited && (
        <div className="mt-3 space-y-2">
          {people.length > 0 && (
            <div>
              <button type="button" onClick={() => setTeamOpen((v) => !v)} aria-expanded={teamOpen} className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline">
                {teamOpen ? '▾' : '▸'} Elegir del equipo ({people.length}){staffIds.length > 0 ? ` · ${staffIds.length} elegidos` : ''}
              </button>
              {teamOpen && (
                <div className="mt-1.5">
                  <p className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <button type="button" className="underline" onClick={() => setStaffIds(people.map((m) => m.id))}>todos</button>
                    <button type="button" className="underline" onClick={() => setStaffIds([])}>ninguno</button>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {people.map((m) => (
                      <button key={m.id} type="button" aria-pressed={staffIds.includes(m.id)} onClick={() => setStaffIds((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))} className={chip(staffIds.includes(m.id))}>
                        {cargoDef(m.cargo)?.emoji ?? ''} {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">O a todo un grupo</p>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => <button key={a.id} type="button" aria-pressed={audienceId === a.id} onClick={() => setAudienceId(audienceId === a.id ? null : a.id)} className={chip(audienceId === a.id)}>{a.label}</button>)}
            </div>
            {audienceDef && <p className="mt-1.5 text-xs text-muted-foreground">{preview.isLoading ? 'Contando…' : preview.data?.overLimit ? 'Es demasiado grande para un solo envío: elige un grupo más chico.' : `Le llegaría a ${preview.data?.count ?? 0} personas.`}</p>}
          </div>
        </div>
      )}
    </section>
  );

  const vigenciaSection = !limited && (
    <section>
      <SectionTitle n={2}>¿Para qué vale?</SectionTitle>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Para qué vale el regalo">
        {VIGENCIAS.map((v) => (
          <button key={v.id} type="button" role="radio" aria-checked={vigencia === v.id} onClick={() => setVigencia(v.id)}
            className={`flex items-start gap-2 rounded-2xl border-2 px-3 py-2.5 text-left transition sm:flex-col sm:gap-1 ${vigencia === v.id ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
            <span className="text-xl leading-none">{v.emoji}</span>
            <span>
              <span className="block text-sm font-semibold leading-tight">{v.label}</span>
              <span className="block text-xs text-muted-foreground">{v.help}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );

  const queSection = (
    <section className="space-y-3">
      <SectionTitle n={limited ? 2 : 3}>{libre ? '¿Cuántos cupones?' : '¿Qué regalas?'}</SectionTitle>

      {!libre && eventOptions.length > 0 && (
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Para qué evento</label>
          <Select value={eventId ? String(eventId) : ''} onValueChange={(v) => { setPickedEventId(Number(v)); setQty({}); }}>
            <SelectTrigger className="h-11" aria-label="Evento del regalo"><SelectValue placeholder="Elige un evento" /></SelectTrigger>
            <SelectContent className="z-[110]">
              {eventOptions.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {libre ? (
        <div className="space-y-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Tipo de acceso</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de acceso del cupón">
              <button type="button" role="radio" aria-checked={!libreAcceso} onClick={() => setLibreAccessId(null)} className={chip(!libreAcceso)}>✨ A elección</button>
              {accesos.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={libreAcceso?.id === a.id} onClick={() => setLibreAccessId(a.id as number)} className={chip(libreAcceso?.id === a.id)}>{a.emoji ? `${a.emoji} ` : ''}{a.name}</button>
              ))}
            </div>
          </div>
          <ul><Stepper label={libreAcceso ? `Cupón de ${libreAcceso.name}` : 'Cupón de acceso a elección'} value={anyQty} onChange={setAnyQty} /></ul>
          {vigencia === 'limite' && (
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Vale por</p>
              <div className="flex flex-wrap gap-1.5">
                {LIMITE_DIAS.map((d) => <button key={d} type="button" aria-pressed={limiteDias === d} onClick={() => setLimiteDias(d)} className={chip(limiteDias === d)}>{d} días</button>)}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Queda en sus Cupones y lo usa en el evento que quiera{vigencia === 'limite' ? `, hasta ${limiteDias} días desde hoy` : ', sin vencimiento'}. Es personal y se canjea en el checkout con todos sus pasos.{libreAcceso ? ` Sirve en los eventos que tengan el acceso «${libreAcceso.name}»; si quieres que elija entre todos, usa «A elección».` : ' La persona elige el acceso que quiera al canjearlo.'}</p>
          {!accesos[0] && types && <p className="text-xs text-amber-500">Este evento no tiene accesos para armar el cupón: elige otro evento arriba en «Para un evento».</p>}
        </div>
      ) : (
        <>
          {(packs.length > 0 || giftCount > 0) && !limited && (
            <div className="flex flex-wrap items-center gap-1.5">
              {shownPacks.map((p) => (
                <span key={p.id} className="inline-flex items-center overflow-hidden rounded-full border border-border bg-card text-sm">
                  <button type="button" onClick={() => applyPack(p)} className="px-3 py-1.5 font-medium hover:bg-muted">📦 {p.name}</button>
                  <button type="button" aria-label={`Borrar el paquete ${p.name}`} onClick={() => { if (window.confirm(`¿Borrar el paquete «${p.name}»?`)) deletePackM.mutate({ id: p.id }); }} className="px-2 py-1.5 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              {giftCount > 0 && <button type="button" onClick={saveAsPack} className="text-xs underline">Guardar como paquete</button>}
            </div>
          )}

          {!limited && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo lo recibe">
              {([['directo', '🎟️ Llega directo', 'La entrada llega con su QR.'], ['pase', '🎁 Pase para canjear', 'Queda en Cupones; compra con su acceso de regalo.']] as const).map(([m, label, help]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={`rounded-2xl border-2 px-3 py-2 text-left transition ${mode === m ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block text-xs text-muted-foreground">{help}</span>
                </button>
              ))}
            </div>
          )}
          {mode === 'pase' && !limited && (
            <div className="space-y-2 rounded-2xl bg-muted/40 p-3">
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!anyAccess} onClick={() => setAnyAccess(false)} className={chip(!anyAccess)}>Acceso fijo</button>
                <button type="button" aria-pressed={anyAccess} onClick={() => setAnyAccess(true)} className={chip(anyAccess)}>A elección</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VALIDITY_EVENT.map((v) => <button key={v.label} type="button" aria-pressed={validDays === v.days} onClick={() => setValidDays(v.days)} className={chip(validDays === v.days)}>{v.label}</button>)}
              </div>
              <p className="text-xs text-muted-foreground">Personal, solo para este evento y se canjea en el checkout con todos sus pasos. ¿Sin atarlo a un evento? Elige arriba «Cualquier evento».</p>
            </div>
          )}

          <div className="rounded-3xl border border-border p-3">
            <p className="mb-2 font-semibold">🎟️ Entrada</p>
            <ul className="space-y-1.5">
              {passAny && <Stepper label="Pase de acceso a elección" value={anyQty} onChange={setAnyQty} />}
              {products.entradas.filter((t) => !(passAny && t.category === 'acceso')).map((t) => (
                <Stepper key={t.id} label={`${t.emoji ? `${t.emoji} ` : ''}${t.name}`} value={qty[t.id] ?? 0} onChange={(n) => setQty((s) => ({ ...s, [t.id]: n }))} />
              ))}
              {types && products.entradas.length === 0 && <li className="text-sm text-muted-foreground">Este evento no tiene entradas.</li>}
            </ul>
          </div>
          {!limited && (
            <div className="rounded-3xl border border-border p-3">
              <p className="mb-2 font-semibold">🍹 Tragos de cortesía</p>
              <ul className="space-y-1.5">
                {products.tragos.map((t) => (
                  <Stepper key={t.id} label={`${t.emoji ? `${t.emoji} ` : ''}${t.name}`} value={qty[t.id] ?? 0} onChange={(n) => setQty((s) => ({ ...s, [t.id]: n }))} />
                ))}
                {types && products.tragos.length === 0 && <li className="text-sm text-muted-foreground">La carta de este evento no tiene tragos.</li>}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Los tragos quedan en sus Cupones con un QR para la barra y se canjean en la caja.</p>
            </div>
          )}
        </>
      )}
    </section>
  );

  const messageSection = (
    <section className="space-y-3">
      <details className="rounded-2xl border border-border px-3 py-2 [&_summary]:cursor-pointer [&_summary]:select-none [&_summary]:text-sm [&_summary]:font-semibold">
        <summary>💬 Mensaje para quien lo recibe <span className="font-normal text-muted-foreground">(opcional)</span></summary>
        <div className="mt-2 space-y-3">
          <div>
            <textarea id="gift-message" value={message} maxLength={GIFT_MESSAGE_MAX} rows={3} onChange={(e) => setMessage(e.target.value.slice(0, GIFT_MESSAGE_MAX))}
              placeholder="Ej. ¡Feliz cumpleaños! Te esperamos en la fiesta 💖" aria-label="Mensaje"
              className="w-full resize-none rounded-2xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className={`text-right text-xs tabular-nums ${message.length >= GIFT_MESSAGE_MAX ? 'text-amber-500' : 'text-muted-foreground'}`}>{message.length}/{GIFT_MESSAGE_MAX}</p>
          </div>
          {!limited && (
            <div>
              <label htmlFor="gift-reason" className="mb-1 block text-xs font-semibold text-muted-foreground">Motivo interno (solo lo ves tú, en «Regalos hechos»)</label>
              <Input id="gift-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej. compensación, invitado de producción…" />
            </div>
          )}
        </div>
      </details>
    </section>
  );

  const body = (
    <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      {!limited && access.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !allowed ? (
        <div className="space-y-3 rounded-2xl bg-muted/50 p-4 text-sm">
          <p className="font-semibold">{access.data ? GIFT_DENIED_MESSAGE : 'Para regalar, entra al panel una vez en este celular.'}</p>
          {!access.data && <p className="text-muted-foreground">Regalar es dar plata, por eso pide la sesión del panel (con la app autenticadora). Entras una vez y después regalas desde aquí sin salir de la App.</p>}
          {!access.data && <a href="/admin" className="inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-primary-foreground">Entrar al panel</a>}
        </div>
      ) : step === 'form' ? (
        <div className="space-y-6">
          {event?.slug && (
            <div className="flex items-center gap-2 rounded-2xl bg-muted/40 px-3 py-2">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">¿Llegó alguien a la puerta sin QR?</p>
              <InstantInviteButton eventSlug={event.slug} className="h-9 shrink-0 px-3 text-sm interactive" />
            </div>
          )}
          {whoSection}
          {vigenciaSection}
          {queSection}
          {messageSection}
        </div>
      ) : step === 'listo' && result ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-500"><Check className="h-8 w-8" /></span>
          <p className="text-xl font-bold">{result.ok > 0 ? `Le llegó a ${result.ok === 1 ? toLabel : `${result.ok} personas`}` : 'No se pudo regalar'}</p>
          {result.ok > 0 && <p className="text-sm text-muted-foreground">{result.resumen}. Ya tiene el correo y el aviso en su app.</p>}
          {result.passes.length > 0 && (
            <div className="w-full space-y-1 rounded-2xl bg-muted/50 p-3 text-left text-sm">
              <p className="text-xs font-semibold text-muted-foreground">Queda en los Cupones de la cuenta con ese correo:</p>
              {result.passes.slice(0, 6).map((p) => <p key={p.email} className="break-all"><strong>{p.email}</strong> · <span className="font-mono text-xs">{p.codes.join(', ')}</span></p>)}
            </div>
          )}
          {result.bad.length > 0 && (
            <ul className="w-full space-y-1 rounded-2xl bg-destructive/10 p-3 text-left text-sm text-destructive">
              {result.bad.slice(0, 6).map((b) => <li key={b.email}>{b.email}: {b.error}</li>)}
            </ul>
          )}
        </div>
      ) : step === 'historial' ? (
        <div className="space-y-2">
          {history.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {!history.isLoading && (history.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay pases regalados para este evento ni cupones para cualquier evento.</p>}
          {(history.data ?? []).map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-muted/50 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{g.buyerName || g.buyerEmail} <span className="font-normal text-muted-foreground">· {g.accesoName}{g.eventId === null ? ' · cualquier evento' : ''}</span></p>
                <p className="truncate text-xs text-muted-foreground">{g.buyerEmail} · {g.code}{g.reason ? ` · ${g.reason}` : ''}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${g.availability === 'available' ? 'bg-emerald-500/15 text-emerald-500' : g.availability === 'used' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {g.availability === 'available' ? 'Disponible' : g.availability === 'used' ? 'Canjeado' : g.availability === 'expired' ? 'Vencido' : 'Anulado'}
              </span>
              {g.availability === 'available' && (
                <Button type="button" variant="outline" size="sm" disabled={cancel.isPending} onClick={() => { if (window.confirm(`¿Anular el pase de ${g.buyerEmail}?`)) cancel.mutate({ creditId: g.id }); }}>Anular</Button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  // Pie fijo: el resumen y la acción.
  const footer = allowed && step !== 'historial' && (
    <div className="shrink-0 border-t border-border px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      {step === 'listo' ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" className="h-12 flex-1" onClick={onClose}>Cerrar</Button>
          <Button type="button" className="h-12 flex-1" onClick={anotherPerson}>Regalar a otra persona</Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <p className="line-clamp-2 min-w-0 flex-1 text-xs leading-snug text-muted-foreground" aria-live="polite">{missing ?? summary}</p>
          <Button type="button" className="h-12 shrink-0 px-6 text-base" disabled={!canSend} onClick={submit}>{sending ? 'Enviando…' : limited ? '✉️ Invitar' : '🎁 Regalar'}</Button>
        </div>
      )}
    </div>
  );

  // Dentro de la App (Mi cuenta): una pantalla más de la App, con su mismo fondo oscuro, tipografía y «Volver», no una hoja
  // clara encima. Entra deslizándose como Staff y Dosier de barra.
  if (variant === 'app') {
    return createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            key="gift-screen"
            role="dialog"
            aria-label="Regalar"
            className="account-font account-tokens fixed inset-0 z-[90] flex flex-col bg-[#0b0612] text-white"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }}
          >
            <div className="account-backdrop" />
            <header className="relative z-10 shrink-0 px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
              <div className="flex items-center gap-2">
                <button type="button" onClick={goBack} className="inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-subhead font-semibold text-pink-300 interactive" aria-label="Volver">
                  <ChevronLeft className="h-6 w-6" /> Volver
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <h2 className="truncate text-body font-bold">{headTitle}</h2>
                  <p className="truncate text-caption1 text-white/60">{headSub}</p>
                </div>
                {step === 'form' && allowed && !limited ? (
                  <button type="button" onClick={() => setStep('historial')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-base interactive" aria-label="Regalos hechos">📋</button>
                ) : <span className="w-10 shrink-0" aria-hidden />}
              </div>
            </header>
            <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
              {body}
              {footer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    );
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* z-[100]: la App (Cuenta) vive en una capa fija z-[60] y el detalle de un evento en z-[80]; con el z-50 de siempre la hoja
          quedaba debajo y, como una hoja abierta bloquea los toques del resto, la pantalla parecía congelada. */}
      <SheetContent side="bottom" hideClose overlayClassName="z-[100]" className="z-[100] mx-auto flex h-[94dvh] max-w-2xl flex-col gap-0 overflow-hidden rounded-t-3xl border-0 p-0">
        {/* Encabezado: título y cerrar. */}
        <div className="shrink-0 border-b border-border px-5 pb-3 pt-3">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden />
          <div className="flex items-center gap-2">
            {step === 'historial' && (
              <button type="button" onClick={() => setStep('form')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted" aria-label="Atrás"><ArrowLeft className="h-4 w-4" /></button>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-lg">{headTitle}</SheetTitle>
              <SheetDescription className="truncate text-xs">{headSub}</SheetDescription>
            </div>
            {step === 'form' && allowed && !limited && <button type="button" onClick={() => setStep('historial')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-base" aria-label="Regalos hechos" title="Regalos hechos">📋</button>}
            <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted" aria-label="Cerrar"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {body}

        {footer}
      </SheetContent>
    </Sheet>
  );
}
