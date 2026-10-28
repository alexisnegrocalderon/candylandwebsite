import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, ChevronLeft, Minus, Plus, Search, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useTonightEvent } from '@/hooks/useTonightEvent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { useBackClosable } from '@/components/site/AmbassadorAccount';
import { isAnyParkingTicketType } from '@shared/parking';
import { cargoDef } from '@shared/staffCargos';
import { GIFT_DENIED_MESSAGE } from '@shared/gifts';
import { GIFT_MESSAGE_MAX, giftSummary, initialOf, lastVisitLabel } from '@shared/giftFlow';

type Persona = { id: number; name: string; email: string | null; cargo: string | null; active: boolean };
type Recipient = { email: string; name: string };
type Pack = { id: string; name: string; items: { name: string; qty: number }[]; mode?: 'directo' | 'pase'; anyAccess?: boolean; anyQty?: number; validDays?: number | null };
type Step = 'quien' | 'que' | 'confirmar' | 'listo' | 'historial';

const VALIDITY = [{ days: null, label: 'Hasta el evento' }, { days: 7, label: '7 días' }, { days: 15, label: '15 días' }, { days: 30, label: '30 días' }] as const;
const AUDIENCES = [
  { id: 'app', label: '📱 Tienen la app', short: 'quienes tienen la app', audience: { kind: 'app' } },
  { id: 'members', label: '💳 Socios', short: 'los socios', audience: { kind: 'members' } },
  { id: 'vip', label: '👑 VIP', short: 'el grupo VIP', audience: { kind: 'level', level: 'vip' } },
  { id: 'recurrente', label: '🔁 Recurrentes', short: 'los recurrentes', audience: { kind: 'level', level: 'recurrente' } },
  { id: 'nuevo', label: '🌱 Nuevos', short: 'los nuevos', audience: { kind: 'level', level: 'nuevo' } },
] as const;

const PACKS_KEY = 'gift.packages';
const loadPacks = (): Pack[] => { try { const v = JSON.parse(localStorage.getItem(PACKS_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const savePacks = (p: Pack[]) => { try { localStorage.setItem(PACKS_KEY, JSON.stringify(p)); } catch { /* sin storage: no se recuerda */ } };
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const STEP_LABEL: Record<'quien' | 'que' | 'confirmar', string> = { quien: '¿A quién?', que: '¿Qué le regalas?', confirmar: 'Confirmar' };
const STEP_NUM: Record<'quien' | 'que' | 'confirmar', number> = { quien: 1, que: 2, confirmar: 3 };

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

/** «Regalar» en 3 pasos, en una hoja que sube desde abajo (sin cambiar de pantalla): 1 Quién (búsqueda en vivo, equipo o un
 * grupo), 2 Qué (entradas y tragos, paquetes guardados, «Llega directo» o «Pase para canjear») y 3 Confirmar (resumen y un
 * mensaje opcional que le llega en el correo y en su app). La misma hoja en el panel y en la App: en la App funciona si ese
 * celular ya tiene abierta la sesión del panel (que pide la app autenticadora); si no, lo dice. Solo el dueño regala. */
export function GiftSheet({ open, onClose, team = [], initialIds = [], initialRecipients = [], variant = 'sheet' }: {
  open: boolean; onClose: () => void; team?: Persona[]; initialIds?: number[]; initialRecipients?: Recipient[];
  /** `sheet`: hoja inferior del panel. `app`: pantalla de la App (Mi cuenta), con su mismo estilo oscuro. */
  variant?: 'sheet' | 'app';
}) {
  const access = trpc.orders.canGift.useQuery(undefined, { enabled: open, retry: false });
  const allowed = !!access.data?.can;
  // Solo con la hoja abierta y la sesión del panel: en la App, las consultas del panel no se piden de más.
  const { events, eventId } = useTonightEvent({ enabled: open && allowed });
  const event = ((events ?? []) as any[]).find((e) => e.id === eventId) ?? null;
  const { data: types } = trpc.events.getTicketTypes.useQuery({ slug: event?.slug ?? '' }, { enabled: open && allowed && !!event?.slug });

  const [step, setStep] = useState<Step>('quien');
  const [recipients, setRecipients] = useState<Recipient[]>(initialRecipients);
  const [staffIds, setStaffIds] = useState<number[]>(initialIds);
  const [audienceId, setAudienceId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [qty, setQty] = useState<Record<number, number>>({});
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');
  const [packs, setPacks] = useState<Pack[]>(loadPacks);
  const [mode, setMode] = useState<'directo' | 'pase'>('directo');
  const [anyAccess, setAnyAccess] = useState(false);
  const [anyQty, setAnyQty] = useState(1);
  const [validDays, setValidDays] = useState<number | null>(null);
  const [result, setResult] = useState<{ ok: number; bad: { email: string; error?: string }[]; resumen: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const reset = (keepRecipients: Recipient[] = [], keepIds: number[] = []) => {
    setStep(keepRecipients.length || keepIds.length ? 'que' : 'quien');
    setRecipients(keepRecipients); setStaffIds(keepIds); setAudienceId(null); setQ(''); setQty({}); setMessage(''); setReason('');
    setPacks(loadPacks()); setMode('directo'); setAnyAccess(false); setAnyQty(1); setValidDays(null); setResult(null);
  };
  /** «Regalar a otra persona»: vuelve al paso 1 con lo mismo elegido para regalar (cambia solo a quién y el mensaje). */
  const anotherPerson = () => { setRecipients([]); setStaffIds([]); setAudienceId(null); setQ(''); setMessage(''); setResult(null); setStep('quien'); };
  const recKey = initialRecipients.map((r) => r.email).join(',');
  const idsKey = initialIds.join(',');
  useEffect(() => {
    if (open) reset(initialRecipients, idsKey ? idsKey.split(',').map(Number) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recKey, idsKey]);
  useEffect(() => { if (open && step === 'quien') window.setTimeout(() => searchRef.current?.focus(), 250); }, [open, step]);

  // Paso 1: búsqueda en vivo desde 2 caracteres, con 250 ms de espera.
  const term = useDebounced(q.trim(), 250);
  const found = trpc.customers.quickSearch.useQuery({ q: term }, { enabled: open && allowed && term.length >= 2, placeholderData: (prev) => prev });
  const options = (term.length >= 2 ? found.data ?? [] : []).filter((r) => !recipients.some((x) => x.email === r.email.toLowerCase()));
  const audienceDef = AUDIENCES.find((a) => a.id === audienceId);
  const preview = trpc.member.previewCouponAudience.useQuery(audienceDef?.audience as any, { enabled: open && allowed && !!audienceDef });

  const people = team.filter((m) => m.active && m.email);
  const staffEmails = people.filter((m) => staffIds.includes(m.id)).map((m) => m.email!.toLowerCase());
  const emails = Array.from(new Set([...recipients.map((r) => r.email), ...staffEmails]));
  const count = (audienceDef ? preview.data?.count ?? 0 : 0) + emails.length;
  const addRecipient = (r: Recipient) => { setRecipients((l) => (l.some((x) => x.email === r.email) ? l : [...l, r])); setQ(''); searchRef.current?.focus(); };

  // Paso 2: entradas (accesos y extras) y tragos de la carta del evento.
  const products = useMemo(() => {
    const list = ((types as any[]) ?? []).filter((t) => t.status !== 'hidden' && t.name !== 'Staff' && t.name !== 'Invitación Especial' && !(t.topupAmount ?? null));
    return {
      entradas: list.filter((t) => t.category === 'acceso' || t.category === 'extra').sort((a, b) => Number(a.category !== 'acceso') - Number(b.category !== 'acceso') || Number(isAnyParkingTicketType(a.name)) - Number(isAnyParkingTicketType(b.name))),
      tragos: list.filter((t) => ['consumo', 'merch'].includes(t.category)),
    };
  }, [types]);
  const allProducts = [...products.entradas, ...products.tragos];
  const accesos = products.entradas.filter((t) => t.category === 'acceso');
  const passAny = mode === 'pase' && anyAccess && accesos.length > 0;
  const items = [
    ...Object.entries(qty).filter(([id, n]) => n > 0 && !(passAny && accesos.some((a) => String(a.id) === id))).map(([id, n]) => ({ ticketTypeId: Number(id), quantity: n })),
    ...(passAny && anyQty > 0 ? [{ ticketTypeId: accesos[0].id as number, quantity: anyQty }] : []),
  ];
  const giftCount = items.reduce((s, i) => s + i.quantity, 0);

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
  // Con gente del equipo elegida, primero los paquetes que se llaman como su cargo.
  const shownPacks = useMemo(() => {
    const labels = people.filter((m) => staffIds.includes(m.id)).map((m) => cargoDef(m.cargo)?.label.toLowerCase()).filter(Boolean) as string[];
    const match = packs.filter((p) => labels.some((l) => l.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(l.split(' / ')[0])));
    return match.length ? [...match, ...packs.filter((p) => !match.includes(p))] : packs;
  }, [people, staffIds, packs]);

  // Paso 3: el resumen en palabras.
  const toLabel = (() => {
    const named = [...recipients.map((r) => r.name || r.email), ...people.filter((m) => staffIds.includes(m.id)).map((m) => m.name)];
    const parts: string[] = [];
    if (named.length === 1) parts.push(named[0].split(' ')[0]);
    else if (named.length > 1) parts.push(`${named.length} personas`);
    if (audienceDef) parts.push(`${audienceDef.short}${preview.data ? ` (${preview.data.count} personas)` : ''}`);
    return parts.join(' y ') || 'esta persona';
  })();
  const summary = giftSummary({
    to: toLabel, mode, anyAccessQty: passAny ? anyQty : 0, eventTitle: event?.title ?? null,
    validity: validDays ? `por ${validDays} días` : 'hasta el evento',
    items: items.filter((i) => !(passAny && i.ticketTypeId === accesos[0]?.id)).map((i) => {
      const t = allProducts.find((p) => p.id === i.ticketTypeId);
      return { name: t?.name ?? 'producto', quantity: i.quantity, kind: t?.category === 'acceso' ? 'acceso' as const : t?.category === 'extra' ? 'extra' as const : 'trago' as const };
    }),
  });

  const utils = trpc.useUtils();
  const gift = trpc.orders.gift.useMutation({
    onSuccess: (r) => {
      setResult({ ok: r.results.filter((x) => x.ok).length, bad: r.results.filter((x) => !x.ok), resumen: r.resumen });
      setStep('listo');
      utils.orders.listStaffComps.invalidate();
      utils.orders.listGifts.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = () => {
    if (!event) return;
    gift.mutate({
      eventId: event.id, emails: emails.length ? emails : undefined, audience: audienceDef?.audience as any, items,
      reason: reason.trim() || undefined, message: message.trim() || undefined, mode, anyAccess: passAny, validDays,
    });
  };

  const history = trpc.orders.listGifts.useQuery({ eventId: event?.id ?? 0 }, { enabled: open && allowed && step === 'historial' && !!event });
  const cancel = trpc.orders.cancelGift.useMutation({
    onSuccess: () => { toast.success('Pase anulado'); history.refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const flowStep = step === 'quien' || step === 'que' || step === 'confirmar' ? step : null;
  const canNext = step === 'quien' ? count > 0 && !(audienceDef && preview.data?.overLimit) : step === 'que' ? giftCount > 0 : true;

  // Atrás del encabezado de la App: un paso atrás, o cerrar si ya está en el primero.
  const goBack = () => {
    if (step === 'confirmar') setStep('que');
    else if (step === 'que' || step === 'historial') setStep('quien');
    else onClose();
  };
  useBackClosable(open && variant === 'app', onClose);

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      {access.isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : !allowed ? (
        <div className="space-y-3 rounded-2xl bg-muted/50 p-4 text-sm">
          <p className="font-semibold">{access.data ? GIFT_DENIED_MESSAGE : 'Para regalar, entra al panel una vez en este celular.'}</p>
          {!access.data && <p className="text-muted-foreground">Regalar es dar plata, por eso pide la sesión del panel (con la app autenticadora). Entras una vez y después regalas desde aquí sin salir de la App.</p>}
          {!access.data && <a href="/admin" className="inline-flex h-11 items-center rounded-full bg-primary px-5 font-semibold text-primary-foreground">Entrar al panel</a>}
        </div>
      ) : step === 'quien' ? (
        <div className="space-y-4">
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
            <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, apellido, correo o teléfono" className="h-12 pl-9 text-base" inputMode="search" autoComplete="off"
              onKeyDown={(e) => { if (e.key === 'Enter' && looksLikeEmail(q)) { e.preventDefault(); addRecipient({ email: q.trim().toLowerCase(), name: '' }); } }} />
          </div>
          {q.trim().length === 1 && <p className="text-xs text-muted-foreground">Escribe una letra más para buscar.</p>}
          {term.length >= 2 && (
            <ul className="space-y-1.5" aria-live="polite">
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
              {!found.isFetching && options.length === 0 && !looksLikeEmail(q) && <li className="px-1 text-xs text-muted-foreground">Nadie con «{term}». Si no es cliente todavía, escribe su correo completo.</li>}
              {found.isFetching && options.length === 0 && <li className="px-1 text-xs text-muted-foreground">Buscando…</li>}
            </ul>
          )}

          {people.length > 0 && (
            <section>
              <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">Equipo
                <button type="button" className="font-normal underline" onClick={() => setStaffIds(people.map((m) => m.id))}>todos</button>
                <button type="button" className="font-normal underline" onClick={() => setStaffIds([])}>ninguno</button>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {people.map((m) => (
                  <button key={m.id} type="button" aria-pressed={staffIds.includes(m.id)} onClick={() => setStaffIds((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id]))} className={chip(staffIds.includes(m.id))}>
                    {cargoDef(m.cargo)?.emoji ?? ''} {m.name}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">O a todo un grupo</p>
            <div className="flex flex-wrap gap-1.5">
              {AUDIENCES.map((a) => <button key={a.id} type="button" aria-pressed={audienceId === a.id} onClick={() => setAudienceId(audienceId === a.id ? null : a.id)} className={chip(audienceId === a.id)}>{a.label}</button>)}
            </div>
            {audienceDef && <p className="mt-1.5 text-xs text-muted-foreground">{preview.isLoading ? 'Contando…' : preview.data?.overLimit ? 'Es demasiado grande para un solo envío: elige un grupo más chico.' : `Le llegaría a ${preview.data?.count ?? 0} personas.`}</p>}
          </section>
        </div>
      ) : step === 'que' ? (
        <div className="space-y-4">
          {(packs.length > 0 || giftCount > 0) && (
            <section>
              <div className="flex flex-wrap items-center gap-1.5">
                {shownPacks.map((p) => (
                  <span key={p.id} className="inline-flex items-center overflow-hidden rounded-full border border-border bg-card text-sm">
                    <button type="button" onClick={() => applyPack(p)} className="px-3 py-1.5 font-medium hover:bg-muted">📦 {p.name}</button>
                    <button type="button" aria-label={`Borrar el paquete ${p.name}`} onClick={() => deletePack(p.id)} className="px-2 py-1.5 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
                {giftCount > 0 && <button type="button" onClick={saveAsPack} className="text-xs underline">Guardar como paquete</button>}
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cómo lo recibe">
            {([['directo', '🎟️ Llega directo', 'La entrada llega con su QR.'], ['pase', '🎁 Pase para canjear', 'Queda en Cupones y compra con su acceso de regalo.']] as const).map(([m, label, help]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                className={`rounded-2xl border-2 px-3 py-2.5 text-left transition ${mode === m ? 'border-primary bg-primary/10' : 'border-border bg-card/60 hover:bg-muted'}`}>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-muted-foreground">{help}</span>
              </button>
            ))}
          </section>
          {mode === 'pase' && (
            <section className="space-y-2 rounded-2xl bg-muted/40 p-3">
              <div className="flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!anyAccess} onClick={() => setAnyAccess(false)} className={chip(!anyAccess)}>Acceso fijo</button>
                <button type="button" aria-pressed={anyAccess} onClick={() => setAnyAccess(true)} className={chip(anyAccess)}>A elección</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VALIDITY.map((v) => <button key={v.label} type="button" aria-pressed={validDays === v.days} onClick={() => setValidDays(v.days)} className={chip(validDays === v.days)}>{v.label}</button>)}
              </div>
              <p className="text-xs text-muted-foreground">Personal, solo para este evento y se canjea en el checkout con todos sus pasos (incluido el código de Soltero).</p>
            </section>
          )}

          <section className="rounded-3xl border border-border p-3">
            <p className="mb-2 font-semibold">🎟️ Entrada</p>
            <ul className="space-y-1.5">
              {passAny && <Stepper label="Pase de acceso a elección" value={anyQty} onChange={setAnyQty} />}
              {products.entradas.filter((t) => !(passAny && t.category === 'acceso')).map((t) => (
                <Stepper key={t.id} label={`${t.emoji ? `${t.emoji} ` : ''}${t.name}`} value={qty[t.id] ?? 0} onChange={(n) => setQty((s) => ({ ...s, [t.id]: n }))} />
              ))}
              {types && products.entradas.length === 0 && <li className="text-sm text-muted-foreground">Este evento no tiene entradas.</li>}
            </ul>
          </section>
          <section className="rounded-3xl border border-border p-3">
            <p className="mb-2 font-semibold">🍹 Trago</p>
            <ul className="space-y-1.5">
              {products.tragos.map((t) => (
                <Stepper key={t.id} label={`${t.emoji ? `${t.emoji} ` : ''}${t.name}`} value={qty[t.id] ?? 0} onChange={(n) => setQty((s) => ({ ...s, [t.id]: n }))} />
              ))}
              {types && products.tragos.length === 0 && <li className="text-sm text-muted-foreground">La carta de este evento no tiene tragos.</li>}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Los tragos quedan en sus Cupones con un QR para la barra.</p>
          </section>
        </div>
      ) : step === 'confirmar' ? (
        <div className="space-y-4">
          <p className="rounded-2xl bg-primary/10 p-4 text-base leading-relaxed">{summary}</p>
          <section>
            <label htmlFor="gift-message" className="mb-1 block text-sm font-semibold">Mensaje <span className="font-normal text-muted-foreground">(opcional, le llega en el correo y en su app)</span></label>
            <textarea id="gift-message" value={message} maxLength={GIFT_MESSAGE_MAX} rows={3} onChange={(e) => setMessage(e.target.value.slice(0, GIFT_MESSAGE_MAX))}
              placeholder="Ej. ¡Feliz cumpleaños! Te esperamos en la fiesta 💖"
              className="w-full resize-none rounded-2xl border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <p className={`text-right text-xs tabular-nums ${message.length >= GIFT_MESSAGE_MAX ? 'text-amber-500' : 'text-muted-foreground'}`}>{message.length}/{GIFT_MESSAGE_MAX}</p>
          </section>
          <section>
            <label htmlFor="gift-reason" className="mb-1 block text-xs font-semibold text-muted-foreground">Motivo interno (solo lo ves tú, en «Regalos hechos»)</label>
            <Input id="gift-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Ej. compensación, invitado de producción…" />
          </section>
        </div>
      ) : step === 'listo' && result ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-500"><Check className="h-8 w-8" /></span>
          <p className="text-xl font-bold">{result.ok > 0 ? `Le llegó a ${result.ok === 1 ? toLabel : `${result.ok} personas`}` : 'No se pudo regalar'}</p>
          {result.ok > 0 && <p className="text-sm text-muted-foreground">{result.resumen}. Ya tiene el correo y el aviso en su app.</p>}
          {result.bad.length > 0 && (
            <ul className="w-full space-y-1 rounded-2xl bg-destructive/10 p-3 text-left text-sm text-destructive">
              {result.bad.slice(0, 6).map((b) => <li key={b.email}>{b.email}: {b.error}</li>)}
            </ul>
          )}
        </div>
      ) : step === 'historial' ? (
        <div className="space-y-2">
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
                <Button type="button" variant="outline" size="sm" disabled={cancel.isPending} onClick={() => { if (window.confirm(`¿Anular el pase de ${g.buyerEmail}?`)) cancel.mutate({ creditId: g.id }); }}>Anular</Button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  // Pie: la acción del paso.
  const footer = allowed && step !== 'historial' && (
      <div className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        {step === 'listo' ? (
          <>
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={onClose}>Cerrar</Button>
            <Button type="button" className="h-12 flex-1" onClick={anotherPerson}>Regalar a otra persona</Button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {step === 'quien' ? `${count} ${count === 1 ? 'persona' : 'personas'}` : `${giftCount} ${giftCount === 1 ? 'regalo' : 'regalos'}${count > 1 ? ' por persona' : ''}`}
            </p>
            {step === 'confirmar' ? (
              <Button type="button" className="h-12 px-6" disabled={gift.isPending || !event || count === 0 || giftCount === 0} onClick={submit}>{gift.isPending ? 'Regalando…' : '🎁 Regalar'}</Button>
            ) : (
              <Button type="button" className="h-12 px-6" disabled={!canNext} onClick={() => setStep(step === 'quien' ? 'que' : 'confirmar')}>Siguiente</Button>
            )}
          </>
        )}
      </div>
  );

  // Dentro de la App (Mi cuenta): una pantalla más de la App, con su mismo fondo oscuro, tipografía y «Volver», no una hoja
  // clara encima. Entra deslizándose como Staff y Dosier de barra.
  if (variant === 'app') {
    const title = flowStep ? STEP_LABEL[flowStep] : step === 'historial' ? 'Regalos hechos' : '¡Listo!';
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
                  <h2 className="truncate text-body font-bold">🎁 {title}</h2>
                  <p className="truncate text-caption1 text-white/60">{event ? event.title : 'Cargando el evento…'}{flowStep ? ` · Paso ${STEP_NUM[flowStep]} de 3` : ''}</p>
                </div>
                {flowStep && allowed ? (
                  <button type="button" onClick={() => setStep('historial')} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-base interactive" aria-label="Regalos hechos">📋</button>
                ) : <span className="w-10 shrink-0" aria-hidden />}
              </div>
              {flowStep && (
                <div className="mt-3 grid grid-cols-3 gap-1.5 px-1" aria-hidden>
                  {(['quien', 'que', 'confirmar'] as const).map((s) => <span key={s} className={`h-1 rounded-full ${STEP_NUM[s] <= STEP_NUM[flowStep] ? 'bg-pink-400' : 'bg-white/15'}`} />)}
                </div>
              )}
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
      <SheetContent side="bottom" hideClose overlayClassName="z-[100]" className="z-[100] mx-auto flex h-[92dvh] max-w-2xl flex-col gap-0 overflow-hidden rounded-t-3xl border-0 p-0">
        {/* Encabezado: paso, título y cerrar. */}
        <div className="shrink-0 border-b border-border px-5 pb-3 pt-3">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-muted" aria-hidden />
          <div className="flex items-center gap-2">
            {(step === 'que' || step === 'confirmar' || step === 'historial') && (
              <button type="button" onClick={() => setStep(step === 'confirmar' ? 'que' : step === 'que' ? 'quien' : 'quien')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted" aria-label="Atrás"><ArrowLeft className="h-4 w-4" /></button>
            )}
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-lg">{flowStep ? `🎁 ${STEP_LABEL[flowStep]}` : step === 'historial' ? '📋 Regalos hechos' : '🎉 ¡Listo!'}</SheetTitle>
              <SheetDescription className="truncate text-xs">{event ? event.title : 'Cargando el evento…'}{flowStep ? ` · Paso ${STEP_NUM[flowStep]} de 3` : ''}</SheetDescription>
            </div>
            {flowStep && allowed && <button type="button" onClick={() => setStep('historial')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-base" aria-label="Regalos hechos" title="Regalos hechos">📋</button>}
            <button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted" aria-label="Cerrar"><X className="h-4 w-4" /></button>
          </div>
          {flowStep && (
            <div className="mt-3 grid grid-cols-3 gap-1.5" aria-hidden>
              {(['quien', 'que', 'confirmar'] as const).map((s) => <span key={s} className={`h-1 rounded-full ${STEP_NUM[s] <= STEP_NUM[flowStep] ? 'bg-primary' : 'bg-muted'}`} />)}
            </div>
          )}
        </div>

        {body}

        {footer}
      </SheetContent>
    </Sheet>
  );
}
