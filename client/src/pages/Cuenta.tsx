import { Component, Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, motion, useDragControls } from 'framer-motion';
import { toast } from 'sonner';
import { BadgeCheck, Calendar, Check, Copy, Crown, Gift, LogOut, Sparkles, Ticket as TicketIcon, ArrowRight, Download, Loader2, X, QrCode, CreditCard, Wallet, Plus, RefreshCw, Bell, ChevronLeft, ChevronRight, Heart, User, WifiOff, ScanFace, CircleHelp, Shirt, MessageCircle, FileText } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { useSeo } from '@/hooks/useSeo';
import { CANDYLAND } from '@/config/candyland';
import { BRAND } from '@shared/eventBrand';
import { useHalloweenMode } from '@/lib/halloween';
import { isAppMode } from '@/lib/appMode';
import { canRedeem, PLAYCOINS_MIN_REDEEM_BALANCE } from '@shared/playcoins';
import { CUSTOMER_LEVEL_META } from '@shared/customerInsights';
import { isMemberEarlyAccess } from '@shared/memberConfig';
import { WalletCard } from '@/components/wallet/WalletCard';
import { saveTicketImage } from '@/lib/ticketImage';
import { PushPrompt } from '@/components/site/PushPrompt';
import { useDarkChrome } from '@/lib/darkChrome';
import { Pager } from '@/components/site/Pager';
import { TiltCard } from '@/components/site/TiltCard';
import { BottomSheet, PayInCajaViewer, SavedCardsSection, TopupSheet, useMemberPayConfig } from '@/components/site/AccountPayments';
import { AmbassadorAccount, AppScreen, useAmbassadorPanel } from '@/components/site/AmbassadorAccount';
import { StampsTab } from '@/components/site/StampCard';
import { StaffAccount, StaffBanner, useStaffPortal } from '@/components/site/StaffAccount';
import { PlaymatchTab } from '@/components/site/PlaymatchTab';
import { canEnterParty } from '@shared/party';
import { TICKET_KIND_META, type TicketKind } from '@shared/ticketKind';
import { useCustomerPush } from '@/lib/customerPush';
import { avisosNotice } from '@/lib/pushPromptView';
import { useIsMobile } from '@/hooks/useMobile';
import { MemberLogin, type LoginDone } from '@/components/site/MemberLogin';
import { fmtDate, fmtDateTime, useMemberSession } from '@/lib/member';
import { clearAccountSnapshot, loadAccountSnapshot, saveAccountSnapshot, warmOfflineApp } from '@/lib/offlineAccount';
import { AccountSkeleton } from '@/components/site/AccountSkeleton';
import { PasskeySheet } from '@/components/site/PasskeySheet';
import { InfoSheet, type InfoKind } from '@/components/app/InfoSheets';
import { biometricName, passkeyOfferSeen, passkeyUsedHere, thisDeviceName, usePasskeyAvailable } from '@/lib/memberPasskey';
import { firstName } from '@shared/pushText';

/* /cuenta (y /mis-puntos): «Mi cuenta» opcional. Entrar con un código al
 * correo (sin contraseña) y ver saldo, Playcoins, entradas y cupones. Nadie la
 * necesita para comprar: es para quien quiere sus beneficios. */

const KIND_LABEL: Record<string, string> = { bienvenida: 'Bienvenida', nivel: 'Por tu nivel', cumpleanos: 'Cumpleaños', manual: 'De regalo' };

/* Paleta propia (siempre oscura, como el panel): la página no depende del tema claro/oscuro del teléfono. */
const GLASS = 'account-glass rounded-3xl';
const NEON_RING = 'bg-gradient-to-br from-pink-500/70 via-fuchsia-400/40 to-sky-400/70';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-heading text-title3 font-bold text-white"><span className="text-pink-400">{icon}</span> {title}</h2>
      {children}
    </section>
  );
}

function CouponCard({ c }: { c: { id: number; kind: string; title: string; code: string; validUntil: string | Date | null; status: string } }) {
  const [copied, setCopied] = useState(false);
  const live = c.status === 'disponible';
  const copy = async () => {
    try { await navigator.clipboard.writeText(c.code); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { toast.error('No se pudo copiar'); }
  };
  return (
    <div className={`rounded-2xl border p-4 ${live ? 'border-pink-400/40 bg-gradient-to-br from-pink-500/15 to-sky-400/10' : 'border-white/10 bg-white/[0.03] opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption2 uppercase tracking-wider text-white/60">{KIND_LABEL[c.kind] ?? 'Cupón'}</p>
          <p className="font-heading font-bold leading-snug text-white">{c.title}</p>
          <p className="mt-0.5 text-caption1 text-white/60">
            {c.status === 'usado' ? 'Ya lo usaste' : c.status === 'vencido' ? 'Venció' : c.validUntil ? `Vale hasta el ${fmtDate(c.validUntil)}` : ''}
          </p>
        </div>
        {live && (
          <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-pink-400/50 px-3 py-1.5 font-mono text-subhead font-bold tracking-wider text-white interactive" aria-label={`Copiar el código ${c.code}`}>
            {c.code} {copied ? <Check className="h-3.5 w-3.5 text-pink-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {live && <p className="mt-2 text-caption1 text-white/60">Pégalo en el campo de código al comprar tu entrada. Es personal: úsalo con el correo de tu cuenta.</p>}
    </div>
  );
}

/** Vibración leve al tocar (Android; Safari en iPhone no la permite a las páginas web). */
const tapHaptic = () => { try { navigator.vibrate?.(8); } catch { /* sin vibración */ } };

/** Números que cuentan hacia arriba al aparecer (saldo, Playcoins). */
function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(value); return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/** «Faltan 8 días», «Faltan 5 h 20 min» o «¡Es hoy!». */
function useCountdown(date: string | Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const ms = new Date(date).getTime() - now;
  if (ms <= 0) return '¡Es hoy! 🎉';
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  if (days >= 2) return `Faltan ${days} días`;
  const hours = Math.floor(mins / 60);
  if (days === 1 && hours >= 24) return `Falta 1 día ${hours - 24} h`;
  return `Faltan ${hours} h ${mins % 60} min`;
}

type MeEvent = { eventId: number; eventTitle: string; eventSlug: string; eventDate: string | Date; venue: string | null; doorsOpen?: string | Date | null; eventEnd?: string | Date | null; tickets: { ticketCode: string; holderName: string | null; status: string; qrImageUrl: string | null; category?: string; kind?: TicketKind; kindLabel?: string; companions?: { nombre: string; rut: string }[] }[] };

type Movement = { type: 'money' | 'points'; label: string; delta: number; createdAt: string | Date };

/** El QR a pantalla completa sobre blanco (máximo contraste para el lector de la puerta y de caja),
 * con la pantalla encendida mientras está abierto. Desde acá también se guarda en Fotos. */
function QrViewer({ ev, t, holder, onClose }: { ev: MeEvent; t: MeEvent['tickets'][number]; holder: string; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => { /* sin wake lock */ });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); void lock?.release().catch(() => {}); };
  }, [onClose]);
  const save = async () => {
    if (!t.qrImageUrl || saving) return;
    setSaving(true);
    try {
      const r = await saveTicketImage({ qrImageUrl: t.qrImageUrl, ticketCode: t.ticketCode, holderName: t.holderName || holder, eventTitle: ev.eventTitle, eventDateText: fmtDateTime(ev.eventDate), venue: ev.venue, companions: t.companions });
      if (r === 'downloaded') toast.success('Listo: la imagen de tu entrada quedó descargada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la imagen');
    } finally {
      setSaving(false);
    }
  };
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.22 }} className="account-font fixed inset-0 z-[90] flex flex-col items-center gap-5 overflow-y-auto bg-white px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-[#0d0712] [&>*:first-child]:shrink-0" role="dialog" aria-label="Código QR de tu entrada">
      <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
      {t.kind && (
        <p className={`rounded-full px-4 py-1.5 text-center text-subhead font-bold ${t.kind === 'estacionamiento' ? 'bg-sky-100 text-sky-900' : t.kind === 'acceso' ? 'bg-pink-100 text-pink-900' : 'bg-violet-100 text-violet-900'}`}>
          {TICKET_KIND_META[t.kind].emoji} {t.kindLabel ?? TICKET_KIND_META[t.kind].label}
        </p>
      )}
      <p className="text-center text-title2 font-bold leading-tight tracking-tight">{ev.eventTitle}</p>
      {t.kind && <p className="-mt-3 text-center text-footnote text-black/60">{TICKET_KIND_META[t.kind].where}</p>}
      {t.qrImageUrl && <img src={t.qrImageUrl} alt="Código QR de tu entrada" className={`aspect-square [image-rendering:pixelated] ${t.companions && t.companions.length > 0 ? 'w-[min(80vw,40vh)]' : 'w-[min(86vw,58vh)]'}`} />}
      <div className="text-center">
        <p className="text-title3 font-semibold">{t.holderName || holder}</p>
        <p className="font-mono text-subhead text-black/60">{t.ticketCode}</p>
      </div>
      {t.companions && t.companions.length > 0 && (
        <div className="w-full max-w-sm rounded-2xl bg-black/[0.04] px-4 py-3 text-center">
          <p className="text-caption2 font-semibold uppercase tracking-[0.18em] text-black/60">{t.companions.length > 1 ? 'Acompañantes' : 'Acompañante'}</p>
          {t.companions.map((c) => (
            <p key={c.rut} className="mt-1 text-subhead font-semibold leading-tight">{c.nombre} <span className="font-mono text-footnote font-normal text-black/60">· {c.rut}</span></p>
          ))}
        </div>
      )}
      <p className="text-center text-caption1 text-black/60">Sube el brillo de la pantalla. Muestra tu carnet en la entrada.</p>
      <button type="button" onClick={() => { void save(); }} disabled={saving} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0712] px-6 text-subhead font-bold text-white interactive disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Guardar en Fotos
      </button>
    </motion.div>
  );
}

/** Cómo se llama cada entrada en el selector: el primer nombre, y si se repite (varias a nombre de
 * quien compró) se numeran: «Alexis 1», «Alexis 2». */
function holderLabels(list: { holderName: string | null; kind?: TicketKind }[]): string[] {
  // Accesos: 🎟️ + primer nombre. Extras: su emoji y para qué son («🚗 Auto»), así no parecen otra entrada.
  const first = list.map((x, n) => {
    const kind = x.kind ?? 'acceso';
    if (kind !== 'acceso') return `${TICKET_KIND_META[kind].emoji} ${TICKET_KIND_META[kind].short}`;
    return `🎟️ ${x.holderName?.trim().split(/\s+/)[0] || `Entrada ${n + 1}`}`;
  });
  const count = new Map<string, number>();
  first.forEach((f) => count.set(f, (count.get(f) ?? 0) + 1));
  const seen = new Map<string, number>();
  return first.map((f) => {
    if ((count.get(f) ?? 0) < 2) return f;
    const k = (seen.get(f) ?? 0) + 1;
    seen.set(f, k);
    return `${f} ${k}`;
  });
}

/** Lo primero que ve quien entra: su PlayCard con el QR de la entrada del próximo evento.
 * Tocar la tarjeta abre el QR a pantalla completa (y desde ahí se guarda en Fotos). */
function TicketWallet({ ev, holder, prepaidBalance, playcoins, movements, compact = false, onTopup, onPayCaja, onPlaymatch }: { ev: MeEvent | null; holder: string; prepaidBalance: number; playcoins: number; movements: Movement[]; compact?: boolean; onTopup?: () => void; onPayCaja?: () => void; onPlaymatch?: () => void }) {
  const [i, setI] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const t = ev ? ev.tickets[Math.min(i, ev.tickets.length - 1)] : null;
  const usable = !!(ev && t?.qrImageUrl && t.status !== 'used');

  const [flipSignal, setFlipSignal] = useState(0);
  const card = (
    <TiltCard>
      <WalletCard
        eventTitle={ev?.eventTitle ?? ''}
        eventDateShort=""
        holderName={t?.holderName || holder}
        ticketCode={t?.ticketCode ?? null}
        qrImageUrl={t?.status === 'used' ? null : t?.qrImageUrl ?? null}
        prepaidBalance={prepaidBalance}
        playcoins={playcoins}
        movements={movements.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })) as any}
        onCardClick={usable ? () => { tapHaptic(); setShowQr(true); } : undefined}
        hideFlipHint={compact}
        flipSignal={flipSignal}
        kind={t?.kind ? { label: `${TICKET_KIND_META[t.kind].emoji} ${t.kindLabel ?? TICKET_KIND_META[t.kind].label}`, tone: t.kind === 'acceso' ? 'acceso' : t.kind === 'estacionamiento' ? 'auto' : 'extra' } : undefined}
      />
    </TiltCard>
  );
  // Hasta 3 entradas: píldoras. Más: selector con flechas («‹ Persona 2 · 2/6 ›»), que siempre cabe en una línea.
  const many = !!ev && ev.tickets.length > 3;
  const step = (d: number) => { if (!ev) return; tapHaptic(); setI((v) => (v + d + ev.tickets.length) % ev.tickets.length); };
  const labels = ev ? holderLabels(ev.tickets) : [];
  const holderPills = ev && ev.tickets.length > 1 && (many ? (
    <div className="flex h-9 items-center gap-1 px-1 text-subhead font-semibold">
      <button type="button" onClick={() => step(-1)} aria-label="Entrada anterior" className="grid h-8 w-8 place-items-center rounded-full text-white/70"><ChevronLeft className="h-4 w-4" /></button>
      <span className="max-w-[120px] truncate px-1">{labels[i]} <span className="text-white/60">· {i + 1}/{ev.tickets.length}</span></span>
      <button type="button" onClick={() => step(1)} aria-label="Entrada siguiente" className="grid h-8 w-8 place-items-center rounded-full text-white/70"><ChevronRight className="h-4 w-4" /></button>
    </div>
  ) : ev.tickets.map((x, n) => (
    <Fragment key={x.ticketCode}>
    {n > 0 && (x.kind ?? 'acceso') !== 'acceso' && (ev.tickets[n - 1].kind ?? 'acceso') === 'acceso' && <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-white/20" />}
    <button type="button" onClick={() => { tapHaptic(); setI(n); }} className={`h-9 max-w-[124px] truncate rounded-full px-4 text-subhead font-semibold interactive ${n === i ? 'lg-pill text-white' : 'text-white/60'} ${x.status === 'used' ? 'line-through decoration-white/40' : ''}`}>
      {labels[n]}
    </button>
    </Fragment>
  )));
  const evWindow = ev ? { eventDate: ev.eventDate, doorsOpen: ev.doorsOpen, eventEnd: ev.eventEnd } : null;
  const playmatchCode = ev && evWindow ? ev.tickets.find((x) => x.category === 'acceso' && canEnterParty({ status: x.status, eventId: ev.eventId }, evWindow))?.ticketCode ?? null : null;
  const actions = [
    // La noche de la fiesta, ya escaneada en la puerta: Playmatch a un toque (sin escribir el código).
    playmatchCode ? { key: 'playmatch', label: 'Playmatch', icon: Heart, ...(onPlaymatch ? { onClick: onPlaymatch } : { href: `/fiesta/${playmatchCode}` }), primary: true } : null,
    usable ? { key: 'qr', label: 'Mostrar QR', icon: QrCode, onClick: () => setShowQr(true), primary: !playmatchCode } : null,
    onPayCaja ? { key: 'caja', label: 'Pagar', icon: Wallet, onClick: onPayCaja } : null,
    onTopup ? { key: 'recarga', label: 'Recargar', icon: Plus, onClick: onTopup } : null,
  ].filter(Boolean) as { key: string; label: string; icon: typeof Wallet; href?: string; onClick?: () => void; primary?: boolean }[];

  if (compact) {
    return (
      <WalletStack
        ev={ev} t={t} holder={holder} prepaidBalance={prepaidBalance} playcoins={playcoins} movements={movements}
        holderPills={holderPills || null} usable={usable} playmatch={actions.find((x) => x.key === 'playmatch') ?? null}
        onShowQr={() => setShowQr(true)} onPayCaja={onPayCaja} onTopup={onTopup}
        qrViewer={createPortal(<AnimatePresence>{showQr && ev && t && <QrViewer ev={ev} t={t} holder={holder} onClose={() => setShowQr(false)} />}</AnimatePresence>, document.body)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {ev && <EventStrip ev={ev} />}
      <div className={`rounded-[28px] ${compact ? 'p-3' : 'p-5 md:p-8'}`} style={{ background: 'radial-gradient(120% 120% at 20% 0%, #241432, #0d0712 70%)' }}>
        {card}
        {ev && ev.tickets.length > 1 && (
          <div className={`flex flex-wrap justify-center gap-2 ${compact ? 'mt-2' : 'mt-4'}`}>
            {ev.tickets.map((x, n) => (
              <button key={x.ticketCode} type="button" onClick={() => setI(n)} className={`rounded-full border px-3.5 py-1.5 text-subhead font-semibold interactive ${n === i ? 'border-pink-400 bg-pink-500/20 text-white' : 'border-white/15 text-white/70'}`}>
                {x.status === 'used' ? '✅ ' : '🎟️ '}{x.holderName ? x.holderName.split(' ')[0] : `Entrada ${n + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>
      {usable && t && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setShowQr(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-subhead font-bold text-white shadow-[0_0_20px_rgba(236,72,153,0.4)] interactive">
            <QrCode className="h-4 w-4" /> Mostrar QR
          </button>
          <Link href={`/verificar/${t.ticketCode}`} className="account-glass inline-flex h-12 items-center justify-center gap-1.5 rounded-full text-subhead font-semibold text-white interactive">
            Ver mi entrada <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
      {(onTopup || onPayCaja) && (
        <div className="grid grid-cols-2 gap-2">
          {onPayCaja && (
            <button type="button" onClick={onPayCaja} className="account-glass inline-flex h-11 items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white interactive">
              <Wallet className="h-4 w-4 text-pink-300" /> Pagar en caja
            </button>
          )}
          {onTopup && (
            <button type="button" onClick={onTopup} className={`account-glass inline-flex h-11 items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white interactive ${onPayCaja ? '' : 'col-span-2'}`}>
              <Plus className="h-4 w-4 text-pink-300" /> Recargar saldo
            </button>
          )}
        </div>
      )}
      {usable && !compact && <p className="text-center text-caption1 text-white/60">Toca tu PlayCard para ver el QR en grande y guardarlo en Fotos: así entras aunque no tengas señal.</p>}
      {/* Portal: por encima de la barra de abajo y del resto de la pantalla. */}
      {createPortal(<AnimatePresence>{showQr && ev && t && <QrViewer ev={ev} t={t} holder={holder} onClose={() => setShowQr(false)} />}</AnimatePresence>, document.body)}
    </div>
  );
}

/** Un toque «de verdad»: tiene que empezar y terminar sobre el mismo botón, y no en el primer instante
 * de la pantalla. Al abrir la app, el toque con que se cierra la bienvenida (o se entra) caía sobre la
 * tarjeta de abajo y abría el QR solo. */
function useRealTap(handler: () => void) {
  const shownAt = useRef(Date.now());
  const down = useRef(0);
  return {
    onPointerDown: () => { down.current = Date.now(); },
    onClick: () => {
      const now = Date.now();
      const real = down.current > 0 && now - down.current < 1200 && now - shownAt.current > 700;
      down.current = 0;
      if (real) handler();
    },
  };
}

/** Cuánto asoma la tarjeta de atrás (su encabezado), como en Apple Wallet. */
const STACK_PEEK = 58;

/** La entrada del evento como un pase de Apple Wallet: evento, fecha, hora, lugar, titular y tipo de
 * acceso. Tocarla no hace nada: el QR se abre solo con el botón «Mostrar QR». */
function EntradaPass({ ev, t, holder }: { ev: MeEvent; t: MeEvent['tickets'][number]; holder: string }) {
  const countdown = useCountdown(ev.eventDate);
  const kind = t.kind ?? 'acceso';
  const meta = TICKET_KIND_META[kind];
  const ring = kind === 'acceso' ? 'from-pink-500/80 via-fuchsia-500/40 to-sky-400/80' : kind === 'estacionamiento' ? 'from-sky-300/80 via-blue-500/40 to-cyan-300/80' : 'from-violet-400/80 via-fuchsia-400/40 to-pink-300/80';
  const used = t.status === 'used';
  const d = new Date(ev.eventDate);
  const fecha = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const field = (label: string, value: string, cls = '') => (
    <div className={`min-w-0 ${cls}`}>
      <p className="text-caption2 font-semibold uppercase tracking-[0.16em] text-white/60">{label}</p>
      <p className="mt-0.5 truncate text-subhead font-semibold text-white">{value}</p>
    </div>
  );
  return (
    <div className={`rounded-[26px] bg-gradient-to-br p-[1.5px] shadow-[0_24px_60px_-22px_rgba(0,0,0,0.9)] ${ring}`}>
      <div className="relative overflow-hidden rounded-[25px] bg-[#150a1e] px-5 pb-4 pt-3">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-pink-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-60 w-60 rounded-full bg-sky-500/20 blur-3xl" />
        {/* Encabezado: es lo que asoma cuando la entrada queda detrás de la PlayCard. */}
        <div className="relative flex h-[34px] items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-6 w-6 shrink-0" />
            <span className="text-caption1 font-bold uppercase tracking-[0.2em] text-white/80">Entrada</span>
          </span>
          <span className="truncate rounded-full bg-amber-200/90 px-2.5 py-1 text-caption2 font-bold uppercase tracking-wider text-[#2a1a05]">{meta.emoji} {t.kindLabel ?? meta.label}</span>
        </div>
        <p className="relative mt-3 line-clamp-2 text-title1 font-bold leading-[1.08] tracking-tight [@media(max-height:700px)]:mt-1.5 [@media(max-height:700px)]:line-clamp-1 [@media(max-height:700px)]:text-title3">{ev.eventTitle}</p>
        <div className="relative mt-3.5 grid grid-cols-[auto_auto_1fr] gap-x-5 [@media(max-height:700px)]:mt-2.5">
          {field('Fecha', fecha)}
          {field('Hora', hora)}
          {field('Lugar', ev.venue || 'Mansión PlayRoom')}
        </div>
        <div className="relative mt-3 flex items-end justify-between gap-3 [@media(max-height:700px)]:mt-2">
          {field('Titular', t.holderName || holder, 'flex-1')}
          <span className={`shrink-0 rounded-full px-3 py-1 text-caption1 font-bold ${used ? 'bg-emerald-400/15 text-emerald-300' : 'bg-gradient-to-r from-pink-500 to-sky-400 text-white shadow-[0_0_16px_rgba(236,72,153,0.45)]'}`}>
            {used ? '✓ Ya entraste' : countdown}
          </span>
        </div>
        {/* Quienes vienen con el titular: nombre y documento, para no perder esos datos. */}
        {(t.kind ?? 'acceso') === 'acceso' && t.companions && t.companions.length > 0 && (
          <div className="relative mt-3 [@media(max-height:700px)]:mt-2">
            <p className="text-caption2 font-semibold uppercase tracking-[0.16em] text-white/60">{t.companions.length > 1 ? 'Acompañantes' : 'Acompañante'}</p>
            {t.companions.map((c) => (
              <p key={c.rut} className="mt-0.5 flex items-baseline justify-between gap-3 text-subhead font-semibold text-white"><span className="min-w-0 truncate">{c.nombre}</span><span className="shrink-0 font-mono text-footnote font-normal text-white/60">{c.rut}</span></p>
            ))}
          </div>
        )}
        {/* Perforado de entrada. */}
        <div aria-hidden className="relative -mx-5 my-3 flex items-center [@media(max-height:700px)]:hidden">
          <span className="-ml-2 h-4 w-4 rounded-full bg-[#0b0612]" />
          <span className="h-px flex-1 border-t border-dashed border-white/20" />
          <span className="-mr-2 h-4 w-4 rounded-full bg-[#0b0612]" />
        </div>
        <div className="relative flex items-center justify-between gap-3 text-caption1 [@media(max-height:700px)]:hidden">
          <span className="shrink-0 whitespace-nowrap font-mono tracking-wider text-white/60">{maskCode(t.ticketCode)}</span>
          <span className="truncate text-white/60">{meta.where}</span>
        </div>
      </div>
    </div>
  );
}

function maskCode(code: string): string {
  return code.length > 6 ? `${code.slice(0, 2)} •••• ${code.slice(-4)}` : code;
}

/** PlayCard al estilo Apple Wallet: la entrada del próximo evento adelante y la PlayCard (saldo y
 * Playcoins) detrás, asomando su encabezado. Tocar la de atrás la trae al frente. El QR se abre solo
 * con el botón grande, nunca tocando una tarjeta. */
function WalletStack({ ev, t, holder, prepaidBalance, playcoins, movements, holderPills, usable, playmatch, onShowQr, onPayCaja, onTopup, qrViewer }: {
  ev: MeEvent | null; t: MeEvent['tickets'][number] | null; holder: string; prepaidBalance: number; playcoins: number; movements: Movement[];
  holderPills: ReactNode; usable: boolean; playmatch: { href?: string; onClick?: () => void } | null;
  onShowQr: () => void; onPayCaja?: () => void; onTopup?: () => void; qrViewer: ReactNode;
}) {
  const hasPass = !!(ev && t);
  const [front, setFront] = useState<'entrada' | 'playcard'>('entrada');
  const shown = hasPass ? front : 'playcard';
  const swap = useRealTap(() => { tapHaptic(); setFront((f) => (f === 'entrada' ? 'playcard' : 'entrada')); });
  const qrTap = useRealTap(() => { tapHaptic(); onShowQr(); });
  const playmatchTap = useRealTap(() => { tapHaptic(); playmatch?.onClick?.(); });

  const playcard = (
    <WalletCard
      eventTitle="" eventDateShort="" holderName={holder} ticketCode={t?.ticketCode ?? null} qrImageUrl={null}
      prepaidBalance={prepaidBalance} playcoins={playcoins}
      movements={movements.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })) as any}
      hideFlipHint
    />
  );
  const pass = hasPass ? <EntradaPass ev={ev!} t={t!} holder={holder} /> : null;
  const frontNode = shown === 'entrada' ? pass : <TiltCard>{playcard}</TiltCard>;
  const backNode = shown === 'entrada' ? playcard : pass;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
    <div className="my-auto flex flex-col gap-3 [@media(max-height:700px)]:gap-2">
      <div className="relative" style={{ paddingTop: hasPass ? STACK_PEEK : 0 }}>
        {hasPass && (
          <motion.button
            key={`back-${shown}`}
            type="button"
            {...swap}
            aria-label={shown === 'entrada' ? 'Ver mi PlayCard' : 'Ver mi entrada'}
            // Solo asoma el encabezado: el resto se recorta, así no se transparenta detrás de la PlayCard (que es de vidrio).
            className="absolute inset-x-0 top-0 z-0 block origin-top overflow-hidden rounded-t-[26px] text-left"
            style={{ height: STACK_PEEK - 4 }}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, scale: 0.94, opacity: 0.92 }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          >
            {backNode}
          </motion.button>
        )}
        <motion.div
          key={`front-${shown}`}
          className="relative z-10"
          initial={hasPass ? { y: -STACK_PEEK, scale: 0.94, opacity: 0.6 } : false}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 26, stiffness: 260 }}
        >
          {frontNode}
        </motion.div>
      </div>
      {shown === 'entrada' && holderPills && (
        <div className="flex justify-center"><div className="flex min-w-0 items-center gap-1 rounded-full bg-white/[0.06] p-1">{holderPills}</div></div>
      )}
      {hasPass && (
        <p className="-mt-1 text-center text-caption1 text-white/60 [@media(max-height:700px)]:hidden">{shown === 'entrada' ? 'Toca la tarjeta de atrás para ver tu PlayCard' : 'Toca la tarjeta de atrás para volver a tu entrada'}</p>
      )}
      {playmatch && (
        playmatch.href
          ? <Link href={playmatch.href} className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-bold text-white shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7)] interactive"><Heart className="h-5 w-5" /> Entrar a Playmatch</Link>
          : <button type="button" {...playmatchTap} className="flex h-14 shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-bold text-white shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7)] interactive"><Heart className="h-5 w-5" /> Entrar a Playmatch</button>
      )}
      {usable && (
        <button type="button" {...qrTap} className={`flex h-14 shrink-0 items-center justify-center gap-2 rounded-full text-headline font-bold text-white interactive [@media(max-height:700px)]:h-12 ${playmatch ? 'lg-pill' : 'bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.4)]'}`}>
          <QrCode className="h-5 w-5" /> Mostrar QR
        </button>
      )}
      {(onPayCaja || onTopup) && (
        <div className={`grid shrink-0 gap-2 [@media(max-height:700px)]:hidden ${onPayCaja && onTopup ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {onPayCaja && <button type="button" onClick={() => { tapHaptic(); onPayCaja(); }} className="lg-pill flex h-11 items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white interactive"><Wallet className="h-4 w-4 text-pink-300" /> Pagar</button>}
          {onTopup && <button type="button" onClick={() => { tapHaptic(); onTopup(); }} className="lg-pill flex h-11 items-center justify-center gap-2 rounded-full text-subhead font-semibold text-white interactive"><Plus className="h-4 w-4 text-pink-300" /> Recargar</button>}
        </div>
      )}
      {qrViewer}
    </div>
    </div>
  );
}

/** Franja del evento: nombre, fecha y cuenta regresiva (sin el QR, que va en la PlayCard). */
function EventStrip({ ev, hero = false }: { ev: MeEvent; hero?: boolean }) {
  const countdown = useCountdown(ev.eventDate);
  if (hero) {
    // Versión amplia de la pantalla del celular: crece para llenar el alto que sobra y deja la tarjeta centrada.
    return (
      <div className={`min-h-[96px] flex-1 rounded-[28px] p-[1.5px] [@media(min-height:900px)]:max-h-[300px] max-h-[240px] [@media(max-height:700px)]:min-h-0 [@media(max-height:700px)]:flex-none ${NEON_RING}`}>
        <div className="flex h-full flex-col justify-center gap-2 rounded-[27px] bg-[#0d0712]/55 px-5 py-4 backdrop-blur-xl [@media(max-height:700px)]:flex-row [@media(max-height:700px)]:items-center [@media(max-height:700px)]:justify-between [@media(max-height:700px)]:gap-3 [@media(max-height:700px)]:py-3">
          <div className="min-w-0">
            <p className="text-caption2 font-semibold uppercase tracking-[0.2em] text-pink-300">Tu próximo evento</p>
            <p className="mt-1 font-heading text-title1 font-extrabold leading-tight text-white [@media(max-height:700px)]:truncate [@media(max-height:700px)]:text-callout">{ev.eventTitle}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-subhead text-white/65 [@media(max-height:700px)]:hidden"><Calendar className="h-4 w-4 shrink-0" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
          </div>
          <span className="w-fit shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-sky-400 px-4 py-1.5 text-subhead font-bold text-white shadow-[0_0_18px_rgba(236,72,153,0.5)] [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:py-1 [@media(max-height:700px)]:text-caption2">{countdown}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`rounded-3xl p-[1.5px] ${NEON_RING}`}>
      <div className="flex items-center justify-between gap-3 rounded-[23px] bg-[#0d0712]/55 px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <p className="text-caption2 font-semibold uppercase tracking-[0.18em] text-pink-300">Tu próximo evento</p>
          <p className="truncate font-heading text-callout font-extrabold text-white">{ev.eventTitle}</p>
          <p className="flex items-center gap-1.5 truncate text-caption1 text-white/60 [@media(max-height:700px)]:hidden"><Calendar className="h-3.5 w-3.5 shrink-0" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
        </div>
        <span className="shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-sky-400 px-3 py-1 text-caption2 font-bold text-white shadow-[0_0_14px_rgba(236,72,153,0.5)]">{countdown}</span>
      </div>
    </div>
  );
}

type Me = NonNullable<inferRouterOutputs<AppRouter>['member']['me']>;

function perkList(me: Me): string[] {
  return [
    me.perks.welcome && `${me.perks.welcome}% de bienvenida`,
    me.perks.recurrente && `${me.perks.recurrente}% cada mes si eres cliente recurrente`,
    me.perks.vip && `${me.perks.vip}% cada mes si eres VIP`,
    me.perks.birthday && `${me.perks.birthday}% en tu cumpleaños`,
  ].filter(Boolean) as string[];
}

/** Link de compra: con su entrada de siempre va directo al resumen (recompra en un toque). */
function useBuyHref(slug: string | null | undefined): { href: string | null; last: import('@shared/repurchase').LastPurchase | null } {
  const repurchase = trpc.member.repurchase.useQuery(undefined, { retry: false, staleTime: 60_000 });
  if (!slug) return { href: null, last: null };
  const last = repurchase.data?.last ?? null;
  if (!last?.option) return { href: `/checkout/${slug}`, last: null };
  return { href: `/checkout/${slug}?items=${encodeURIComponent(last.accesoSlug)}:${last.qty}&rapida=1&op=${encodeURIComponent(last.option)}`, last };
}

const OPTION_EMOJI: Record<string, string> = { soltera: '🍭', pareja: '💑', 'dos-mujeres': '👭', trio: '🎭', grupo: '🌈' };

function BuyNextCard({ me }: { me: Me }) {
  const { href, last } = useBuyHref(me.nextEvent?.slug);
  if ((me.events as MeEvent[])[0]) return null;
  // Sin entrada y sin fiesta anunciada: igual se invita a mirar lo que viene (nunca una tarjeta vacía sola).
  if (!me.nextEvent) {
    return (
      <Link href="/eventos" onClick={tapHaptic} className="account-glass block rounded-[28px] p-5 interactive">
        <p className="text-caption2 font-semibold uppercase tracking-[0.18em] text-pink-300">Tu próxima fiesta</p>
        <p className="mt-1 text-title3 font-bold text-white">Se anuncia muy pronto</p>
        <p className="mt-0.5 text-subhead text-white/60">Activa los avisos y te contamos apenas abra la preventa.</p>
        <p className="mt-3 text-subhead font-semibold text-pink-300">Ver eventos →</p>
      </Link>
    );
  }
  // Ya compró antes: su misma entrada, con sus datos y sus acompañantes, en un toque.
  if (last && href) {
    const withWho = last.companions.map((c) => c.nombre.split(' ')[0]).filter(Boolean);
    return (
      <div className={`shrink-0 rounded-[28px] p-[1.5px] ${NEON_RING}`}>
        <div className="rounded-[27px] bg-[#0d0712] p-5">
          <p className="text-caption2 font-semibold uppercase tracking-[0.18em] text-pink-300">Tu entrada de siempre</p>
          <p className="mt-1 text-title3 font-bold leading-tight text-white">{OPTION_EMOJI[last.option ?? ''] ?? '🎟️'} {last.accesoName ?? 'Tu acceso'}{last.qty > 1 ? ` × ${last.qty}` : ''}</p>
          <p className="mt-0.5 truncate text-subhead text-white/60">{me.nextEvent.title} · {fmtDateTime(me.nextEvent.eventDate)}</p>
          {withWho.length > 0 && <p className="mt-0.5 truncate text-subhead text-white/60">Con {withWho.join(', ')}</p>}
          <Link href={href} onClick={tapHaptic} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-subhead font-bold text-white interactive">
            Comprar en 1 toque <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href={`/checkout/${me.nextEvent.slug}`} className="mt-2 block text-center text-footnote font-semibold text-white/60 interactive">Elegir otra entrada</Link>
        </div>
      </div>
    );
  }
  return (
    <Link href={`/checkout/${me.nextEvent.slug}`} className={`block rounded-[28px] p-[1.5px] ${NEON_RING} interactive`}>
      <div className="rounded-[27px] bg-[#0d0712] p-5">
        <p className="text-caption2 font-semibold uppercase tracking-[0.18em] text-pink-300">Próximo evento</p>
        <p className="mt-1 font-heading text-title3 font-extrabold text-white">{me.nextEvent.title}</p>
        <p className="mt-0.5 text-subhead text-white/60">{fmtDateTime(me.nextEvent.eventDate)}</p>
        <p className="mt-3 text-subhead font-semibold text-pink-300">Comprar mi entrada →</p>
      </div>
    </Link>
  );
}

function EarlyCard({ me }: { me: Me }) {
  if (!me.nextEvent || !isMemberEarlyAccess(me.nextEvent)) return null;
  return (
    <Link href={`/checkout/${me.nextEvent.slug}`} className="block rounded-2xl border border-pink-400/40 bg-gradient-to-br from-pink-500/15 to-sky-400/10 p-4 interactive">
      <p className="flex items-center gap-2 font-heading font-bold text-white"><Crown className="h-4 w-4 text-pink-400" /> Preventa para socios abierta</p>
      <p className="mt-0.5 text-subhead text-white/65">{me.nextEvent.title}: compra antes que nadie hasta el {fmtDateTime(me.nextEvent.memberEarlyUntil)}.</p>
      <p className="mt-2 text-subhead font-semibold text-pink-300">Comprar mi entrada →</p>
    </Link>
  );
}

function PlaycoinsCard({ me }: { me: Me }) {
  const coins = useCountUp(me.playcoins);
  const eligible = canRedeem(me.playcoins);
  const missing = Math.max(0, PLAYCOINS_MIN_REDEEM_BALANCE - me.playcoins);
  const pct = Math.min(100, Math.round((me.playcoins / PLAYCOINS_MIN_REDEEM_BALANCE) * 100));
  return (
    <div className={`${GLASS} p-4`}>
      <div className="flex items-baseline justify-between text-subhead">
        <span className="font-semibold text-white/80">Tus Playcoins</span>
        <span className="text-white/60">meta {PLAYCOINS_MIN_REDEEM_BALANCE.toLocaleString('es-CL')}</span>
      </div>
      <p className="num-apple mt-1 text-5xl text-white">{coins.toLocaleString('es-CL')}</p>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-400 to-sky-400 shadow-[0_0_12px_rgba(236,72,153,0.6)] transition-[width] duration-700" style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
      <p className="mt-2 text-subhead text-white/65">
        {eligible
          ? '✅ Ya puedes canjearlos en caja el día del evento: dile a la cajera tu correo y cuántos quieres usar.'
          : `Vas en ${pct}%: te faltan ${missing.toLocaleString('es-CL')} Playcoins para poder canjear. Cada compra y cada amigo que traigas suman.`}
      </p>
    </div>
  );
}

function Movements({ me }: { me: Me }) {
  return (
    <div className={`${GLASS} p-4`}>
      <p className="font-heading font-bold text-white">Últimos movimientos</p>
      {me.movements.length === 0 ? <p className="mt-2 text-subhead text-white/60">Todavía no hay movimientos.</p> : (
        <ul className="mt-2 divide-y divide-white/10 text-subhead">
          {me.movements.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-white/75">{m.label}<span className="block text-caption2 text-white/60">{fmtDate(m.createdAt)}</span></span>
              <span className={`shrink-0 font-semibold ${m.type === 'money' ? (m.delta >= 0 ? 'text-emerald-300' : 'text-rose-300') : 'text-violet-300'}`}>
                {m.delta >= 0 ? '+' : '−'}{m.type === 'money' ? `$${Math.abs(m.delta).toLocaleString('es-CL')}` : `${Math.abs(m.delta).toLocaleString('es-CL')} pc`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TicketsList({ events, from = 0 }: { events: MeEvent[]; from?: number }) {
  const list = events.slice(from);
  if (list.length === 0) return <p className="account-glass rounded-2xl p-4 text-subhead text-white/60">No tienes entradas para próximos eventos. <Link href="/eventos" className="text-pink-300 underline">Ver eventos</Link></p>;
  return (
    <>
      {list.map((ev) => (
        <div key={ev.eventId} className={`${GLASS} p-4`}>
          <p className="font-heading font-bold text-white">{ev.eventTitle}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-caption1 text-white/60"><Calendar className="h-3.5 w-3.5" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ev.tickets.map((t, i) => (
              <Link key={t.ticketCode} href={`/verificar/${t.ticketCode}`} className="rounded-full border border-pink-400/40 px-3.5 py-1.5 text-subhead font-semibold text-white interactive">
                {t.status === 'used' ? '✅ ' : '🎟️ '}{t.holderName ? t.holderName.split(' ')[0] : `Entrada ${i + 1}`}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function CouponsList({ me }: { me: Me }) {
  const active = me.coupons.filter((c) => c.status === 'disponible');
  return (
    <>
      {me.coupons.length === 0 ? (
        <p className="account-glass rounded-2xl p-4 text-subhead text-white/60">
          Todavía no tienes cupones.{perkList(me).length ? ' Te vamos regalando según lo que desbloqueas.' : ''}
        </p>
      ) : me.coupons.map((c) => <CouponCard key={c.id} c={c} />)}
      {active.length === 0 && me.coupons.length > 0 && <p className="text-caption1 text-white/60">No tienes cupones disponibles ahora.</p>}
    </>
  );
}

function PerksCard({ me }: { me: Me }) {
  return (
    <section className={`${GLASS} p-4`}>
      <h2 className="flex items-center gap-2 font-heading text-title3 font-bold text-white"><Sparkles className="h-4 w-4 text-pink-400" /> Lo que tienes como miembro</h2>
      <ul className="mt-2 space-y-1.5 text-subhead text-white/65">
        <li>• Tus entradas y su QR siempre a un toque</li>
        <li>• Tus Playcoins y saldo para canjear en caja</li>
        <li>• Aviso del recordatorio del evento, preventas y novedades</li>
        {perkList(me).map((p) => <li key={p}>• {p}</li>)}
        <li>• Preventa anticipada en los eventos que la tengan</li>
      </ul>
    </section>
  );
}

/** Sin red: la cuenta se muestra con lo último guardado en el teléfono, y se dice de cuándo es. */
function OfflinePill({ savedAt }: { savedAt: number | null }) {
  if (savedAt == null) return null;
  const when = new Date(savedAt);
  const sameDay = when.toDateString() === new Date().toDateString();
  const label = sameDay
    ? `de las ${when.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : `del ${when.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace(/\./g, '')}`;
  return (
    <p role="status" className="lg-pill mx-auto flex w-fit shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-footnote font-semibold text-white/85">
      <WifiOff className="h-3.5 w-3.5 text-amber-300" /> Sin conexión · datos {label}
    </p>
  );
}

function WelcomeBanner({ welcome }: { welcome: LoginDone | null }) {
  if (!welcome || welcome.granted.length === 0) return null;
  return (
    <div className="rounded-2xl border border-pink-400/40 bg-pink-500/10 p-4 text-subhead" role="status">
      <p className="flex items-center gap-2 font-heading font-bold text-white"><Gift className="h-4 w-4 text-pink-400" /> ¡Te regalamos {welcome.granted.length === 1 ? 'un cupón' : `${welcome.granted.length} cupones`}!</p>
      <p className="mt-1 text-white/65">{welcome.granted.map((g) => `${g.percent}% por ${g.days} días`).join(' · ')}. Los tienes en Cupones.</p>
    </div>
  );
}

/** Si una pestaña falla, el error queda dentro de la pestaña (con el detalle) y la barra de abajo sigue funcionando. */
class TabBoundary extends Component<{ children: ReactNode; onBack: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack: string }) { console.error('[Cuenta]', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="account-glass space-y-3 rounded-2xl p-4 text-subhead">
        <p className="font-heading font-bold text-white">No pudimos mostrar esta sección</p>
        <p className="text-white/65">Tu cuenta y tus entradas están a salvo.</p>
        <pre className="max-h-32 overflow-auto whitespace-break-spaces text-caption2 text-white/60">{`${this.state.error.name}: ${this.state.error.message}`}</pre>
        <button type="button" onClick={() => { this.setState({ error: null }); this.props.onBack(); }} className="h-11 w-full rounded-full bg-white/10 font-semibold text-white">Volver a la PlayCard</button>
      </div>
    );
  }
}

/** Entradas en páginas: una por evento (y de a 4 entradas por página). */
function TicketsPager({ events, holder }: { events: MeEvent[]; holder: string }) {
  // El QR se abre dentro de la app (antes llevaba a la página /verificar del sitio).
  const [open, setOpen] = useState<{ ev: MeEvent; t: MeEvent['tickets'][number] } | null>(null);
  const pages: { ev: MeEvent; tickets: MeEvent['tickets']; offset: number }[] = [];
  for (const ev of events) {
    for (let o = 0; o < Math.max(1, ev.tickets.length); o += 4) pages.push({ ev, tickets: ev.tickets.slice(o, o + 4), offset: o });
  }
  if (pages.length === 0) {
    return (
      <div className="account-glass m-auto flex w-full flex-col items-center gap-3 rounded-[28px] p-8 text-center">
        <TicketIcon className="h-10 w-10 text-pink-300" />
        <p className="font-heading text-title3 font-bold">Aún no tienes entradas</p>
        <p className="text-subhead text-white/60">Cuando compres, aparecen acá con su QR.</p>
        <Link href="/eventos" className="mt-1 inline-flex h-11 items-center rounded-full bg-gradient-to-r from-pink-500 to-sky-500 px-6 text-subhead font-bold">Ver eventos</Link>
      </div>
    );
  }
  return (
    <Pager>
      {pages.map(({ ev, tickets, offset }) => (
        <div key={`${ev.eventId}-${offset}`} className="account-glass m-auto flex w-full flex-col gap-4 rounded-[28px] p-5">
          <div>
            <p className="text-caption2 font-semibold uppercase tracking-[0.18em] text-pink-300">Tu entrada</p>
            <p className="mt-1 font-heading text-title2 font-extrabold leading-tight">{ev.eventTitle}</p>
            <p className="mt-1 flex items-center gap-1.5 text-subhead text-white/60"><Calendar className="h-4 w-4 shrink-0" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
          </div>
          <div className="space-y-2">
            {tickets.map((t, i) => (
              <button key={t.ticketCode} type="button" disabled={t.status !== 'valid' || !t.qrImageUrl} onClick={() => { tapHaptic(); setOpen({ ev, t }); }} className="lg-pill flex h-14 w-full items-center gap-3 rounded-2xl px-4 text-left interactive disabled:opacity-70">
                <span className="w-6 shrink-0 text-center text-title3">{TICKET_KIND_META[t.kind ?? 'acceso'].emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-subhead font-semibold leading-tight">{(t.kind ?? 'acceso') === 'acceso' ? (t.holderName || `Entrada ${offset + i + 1}`) : (t.kindLabel ?? TICKET_KIND_META[t.kind!].label)}</span>
                  <span className="block truncate text-caption1 text-white/60">{t.kindLabel ?? 'Acceso'}{t.companions && t.companions.length > 0 ? ` · con ${t.companions.map((c) => c.nombre.split(' ')[0]).join(', ')}` : ''}</span>
                </span>
                <span className={`shrink-0 text-caption1 font-medium ${t.status === 'used' ? 'text-white/60' : 'text-emerald-300'}`}>{t.status === 'used' ? 'Usada' : 'Ver QR'}</span>
                {t.status === 'valid' && <QrCode className="h-4 w-4 shrink-0 text-white/50" />}
              </button>
            ))}
          </div>
        </div>
      ))}
      {createPortal(<AnimatePresence>{open && <QrViewer ev={open.ev} t={open.t} holder={holder} onClose={() => setOpen(null)} />}</AnimatePresence>, document.body)}
    </Pager>
  );
}

/** Cupones en páginas: uno por página, con el código grande. */
function CouponsPager({ me }: { me: Me }) {
  const [copied, setCopied] = useState<number | null>(null);
  if (me.coupons.length === 0) {
    return (
      <div className="account-glass m-auto flex w-full flex-col items-center gap-3 rounded-[28px] p-8 text-center">
        <Gift className="h-10 w-10 text-pink-300" />
        <p className="font-heading text-title3 font-bold">Todavía no tienes cupones</p>
        <p className="text-subhead text-white/60">{perkList(me).length ? 'Te vamos regalando según lo que desbloqueas.' : 'Cuando haya uno para ti, aparece acá.'}</p>
      </div>
    );
  }
  const copy = async (id: number, code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(id); tapHaptic(); window.setTimeout(() => setCopied(null), 1800); } catch { toast.error('No se pudo copiar'); }
  };
  return (
    <Pager>
      {me.coupons.map((c) => {
        const live = c.status === 'disponible';
        return (
          <div key={c.id} className={`account-glass m-auto flex w-full flex-col items-center gap-4 rounded-[28px] p-6 text-center ${live ? '' : 'opacity-60'}`}>
            <p className="text-caption2 font-semibold uppercase tracking-[0.18em] text-pink-300">{KIND_LABEL[c.kind] ?? 'Cupón'}</p>
            <p className="font-heading text-title2 font-extrabold leading-tight">{c.title}</p>
            <p className="text-subhead text-white/60">{c.status === 'usado' ? 'Ya lo usaste' : c.status === 'vencido' ? 'Venció' : c.validUntil ? `Vale hasta el ${fmtDate(c.validUntil)}` : ''}</p>
            {live && (
              <>
                <button type="button" onClick={() => { void copy(c.id, c.code); }} className="lg-pill flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-mono text-title3 font-bold tracking-[0.2em] interactive" aria-label={`Copiar el código ${c.code}`}>
                  {c.code} {copied === c.id ? <Check className="h-5 w-5 text-pink-300" /> : <Copy className="h-5 w-5 text-white/60" />}
                </button>
                <p className="text-caption1 text-white/60">Pégalo en el campo de código al comprar. Es personal: úsalo con el correo de tu cuenta.</p>
              </>
            )}
          </div>
        );
      })}
    </Pager>
  );
}

/** Movimientos: solo los 3 últimos; el resto en una hoja. */
function MovementsPreview({ me, onAll }: { me: Me; onAll: () => void }) {
  const last = me.movements.slice(0, 3);
  return (
    <div className={`${GLASS} p-4`}>
      <div className="flex items-center justify-between">
        <p className="font-semibold text-white/80">Últimos movimientos</p>
        {me.movements.length > 3 && <button type="button" onClick={onAll} className="text-caption1 font-semibold text-pink-300">Ver todos</button>}
      </div>
      {last.length === 0 ? <p className="mt-2 text-subhead text-white/60">Todavía no hay movimientos.</p> : (
        <ul className="mt-1 divide-y divide-white/10 text-subhead">
          {last.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-white/75">{m.label}<span className="block text-caption2 text-white/60">{fmtDate(m.createdAt)}</span></span>
              <span className={`shrink-0 font-semibold ${m.type === 'money' ? (m.delta >= 0 ? 'text-emerald-300' : 'text-rose-300') : 'text-violet-300'}`}>
                {m.delta >= 0 ? '+' : '−'}{m.type === 'money' ? `$${Math.abs(m.delta).toLocaleString('es-CL')}` : `${Math.abs(m.delta).toLocaleString('es-CL')} pc`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Celular: una pantalla fija tipo app, con barra de íconos abajo como el panel ── */

/* La barra de abajo: 4 secciones y un «+» al centro con todo lo demás. Sellos, Puntos y Cupones
 * viven juntos en «Premios»; «Embajador», Avisos y Cerrar sesión, en «Perfil». */
type Tab = 'card' | 'playmatch' | 'premios' | 'perfil';
type Prize = 'sellos' | 'puntos' | 'cupones';
const TABS: { key: Tab; label: string; icon: typeof CreditCard }[] = [
  { key: 'card', label: 'PlayCard', icon: CreditCard },
  { key: 'playmatch', label: 'Playmatch', icon: Heart },
  { key: 'premios', label: 'Premios', icon: Gift },
  { key: 'perfil', label: 'Perfil', icon: User },
];
const PRIZES: { key: Prize; label: string }[] = [
  { key: 'sellos', label: 'Sellos' },
  { key: 'puntos', label: 'Playcoins' },
  { key: 'cupones', label: 'Cupones' },
];

/** Una pestaña guardada (o la de un aviso: `?tab=`) a la barra nueva; las viejas se acomodan solas. */
function resolveTab(raw: string | null | undefined): { tab: Tab; prize?: Prize; open?: 'embajador' } | null {
  if (!raw) return null;
  if ((['card', 'playmatch', 'premios', 'perfil'] as string[]).includes(raw)) return { tab: raw as Tab };
  if (raw === 'sellos' || raw === 'puntos' || raw === 'cupones') return { tab: 'premios', prize: raw };
  if (raw === 'embajador') return { tab: 'perfil', open: 'embajador' };
  return null;
}

const TAB_KEY = 'cuenta.tab';
const PRIZE_KEY = 'cuenta.premios';

const BRAND_VALUES = BRAND.valores.join(' · ');

type SettingsRow = { key: string; label: string; sub?: string; icon: typeof Bell; tint: string; dot?: boolean; onClick?: () => void; href?: string; external?: string };

/** Un grupo de filas como en Ajustes del iPhone: ícono en un cuadradito de color, texto y flecha. */
function SettingsGroup({ title, rows }: { title?: string; rows: SettingsRow[] }) {
  return (
    <section>
      {title && <h2 className="mb-1.5 px-4 text-footnote font-semibold uppercase tracking-wide text-white/50">{title}</h2>}
      <div className="account-glass divide-y divide-white/[0.08] overflow-hidden rounded-[22px]">
        {rows.map(({ key, label, sub, icon: Icon, tint, dot, onClick, href, external }) => {
          const inner = (
            <>
              <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-[9px] ${tint} shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]`}><Icon className="h-[18px] w-[18px] text-white" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-body leading-tight">{label}</span>
                {sub && <span className="mt-0.5 block truncate text-footnote text-white/55">{sub}</span>}
              </span>
              {dot && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.9)]" />}
              <ChevronRight className="h-4 w-4 shrink-0 text-white/35" />
            </>
          );
          const cls = 'relative flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/10';
          if (href) return <Link key={key} href={href} onClick={tapHaptic} className={cls}>{inner}</Link>;
          if (external) return <a key={key} href={external} target="_blank" rel="noopener noreferrer" onClick={tapHaptic} className={cls}>{inner}</a>;
          return <button key={key} type="button" onClick={() => { tapHaptic(); onClick?.(); }} className={cls}>{inner}</button>;
        })}
      </div>
    </section>
  );
}

function AccountApp({ me, welcome, onLogout, offlineAt }: { me: Me; welcome: LoginDone | null; onLogout: () => void; offlineAt: number | null }) {
  const halloween = useHalloweenMode();
  // Al volver de otra pantalla (comprar, un evento…) se abre en la misma pestaña donde estaba.
  const initial = (() => {
    // Un aviso puede abrir una pestaña (?tab=playmatch, al escanear la entrada).
    try {
      const fromUrl = resolveTab(new URLSearchParams(window.location.search).get('tab'));
      if (fromUrl) return fromUrl;
    } catch { /* nada */ }
    try { return resolveTab(sessionStorage.getItem(TAB_KEY)) ?? { tab: 'card' as Tab }; } catch { return { tab: 'card' as Tab }; }
  })();
  const [tab, setTabState] = useState<Tab>(initial.tab);
  const [prize, setPrizeState] = useState<Prize>(() => {
    if (initial.prize) return initial.prize;
    try { const saved = sessionStorage.getItem(PRIZE_KEY); return saved === 'puntos' || saved === 'cupones' ? saved : 'sellos'; } catch { return 'sellos'; }
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    try { sessionStorage.setItem(TAB_KEY, next); } catch { /* sin almacenamiento: parte en PlayCard */ }
  };
  const setPrize = (next: Prize) => {
    tapHaptic();
    setPrizeState(next);
    try { sessionStorage.setItem(PRIZE_KEY, next); } catch { /* nada */ }
  };
  const ambassador = useAmbassadorPanel();
  // Solo para quien entra con el correo de alguien del staff (Admin → Noche → Staff).
  const staff = useStaffPortal();
  const tabs = TABS;
  // El aviso de contenido nuevo (`?tab=embajador`) abre directo la pantalla Embajador, una sola vez.
  const openEmb = useRef(initial.open === 'embajador' && new URLSearchParams(window.location.search).get('tab') === 'embajador');
  const [more, setMore] = useState(false);
  useEffect(() => { if (openEmb.current && ambassador) { openEmb.current = false; setSheet('embajador'); } }, [ambassador]);
  // El correo y el aviso de bienvenida al staff (`?staff=1`) abren directo la pantalla Staff, una sola vez.
  const openStaff = useRef(new URLSearchParams(window.location.search).get('staff') === '1');
  useEffect(() => { if (openStaff.current && staff) { openStaff.current = false; setSheet('staff'); } }, [staff]);
  const sheetDrag = useDragControls();
  const pay = useMemberPayConfig();
  const [topupOpen, setTopupOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const push = useCustomerPush({ source: 'puntos' });
  const level = CUSTOMER_LEVEL_META[me.level as keyof typeof CUSTOMER_LEVEL_META];
  const upcoming = me.events as MeEvent[];
  const activeCoupons = me.coupons.filter((c) => c.status === 'disponible').length;
  const { href: buyHref, last: lastBuy } = useBuyHref(me.nextEvent?.slug);
  // La noche de la fiesta, ya escaneada: un punto en la pestaña Playmatch.
  const playmatchLive = upcoming.some((e) => e.tickets.some((x) => (x.category ?? 'acceso') === 'acceso' && canEnterParty({ status: x.status, eventId: e.eventId }, { eventDate: e.eventDate, doorsOpen: e.doorsOpen, eventEnd: e.eventEnd })));
  const pushPending = push.state === 'ask' || push.state === 'ios-install';
  const earlyOn = !!(me.nextEvent && isMemberEarlyAccess(me.nextEvent));
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [dir, setDir] = useState(1);
  // Sub-hojas de «Más» y de «Puntos» (cada tema grande abre la suya, para que ninguna pantalla crezca).
  const [sheet, setSheet] = useState<null | 'tarjetas' | 'beneficios' | 'avisos' | 'movimientos' | 'entradas' | 'embajador' | 'staff' | 'faceid'>(null);
  // Preguntas frecuentes, dress code, etc. en hojas de la app (antes había que ir al sitio).
  const [info, setInfo] = useState<InfoKind | null>(null);
  // Face ID: recién entró con el código y este teléfono puede → se le ofrece una vez, después de ver su app.
  const passkeyOk = usePasskeyAvailable();
  const [faceIdOffer, setFaceIdOffer] = useState(false);
  useEffect(() => {
    if (!passkeyOk || welcome?.via !== 'codigo' || passkeyUsedHere() || passkeyOfferSeen()) return;
    const t = window.setTimeout(() => { setFaceIdOffer(true); setSheet('faceid'); }, 1200);
    return () => window.clearTimeout(t);
  }, [passkeyOk, welcome]);
  const go = (next: Tab) => {
    if (next === tab) return;
    tapHaptic();
    setDir(tabs.findIndex((t) => t.key === next) > tabs.findIndex((t) => t.key === tab) ? 1 : -1);
    setTab(next);
  };

  // Deslizar a los lados cambia de pestaña.
  const onTouchStart = (e: React.TouchEvent) => {
    // Dentro de un pager con varias páginas, deslizar de lado cambia de página, no de pestaña.
    if ((e.target as HTMLElement).closest('[data-pager="multi"]')) { touch.current = null; return; }
    const p = e.touches[0]; touch.current = { x: p.clientX, y: p.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current; touch.current = null;
    if (!start) return;
    const p = e.changedTouches[0];
    const dx = p.clientX - start.x, dy = p.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const idx = tabs.findIndex((t) => t.key === tab);
    const next = tabs[idx + (dx < 0 ? 1 : -1)];
    if (next) go(next.key);
  };

  const title = tab === 'card' ? `Hola${firstName(me.fullName) ? `, ${firstName(me.fullName)}` : ''} 👋` : tabs.find((t) => t.key === tab)?.label;

  return (
    <MotionConfig reducedMotion="user">
    <div className={`account-font account-tokens fixed inset-0 z-[60] flex flex-col bg-[#0b0612] text-white ${halloween ? 'pm-halloween' : ''}`}>
      <div className="account-backdrop" />
      {/* Una pantalla fija: cabecera compacta arriba, contenido que reparte el alto y la barra flotante abajo.
          Nada se desplaza en vertical; lo que no cabe se reparte en páginas (Pager). */}
      <header className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] [@media(max-height:700px)]:pb-1">
        <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-9 w-9 shrink-0 [@media(max-height:700px)]:h-8 [@media(max-height:700px)]:w-8" />
        <h1 className="min-w-0 flex-1 truncate text-title1 font-bold leading-tight tracking-tight [@media(max-height:700px)]:text-title2">{title}</h1>
        {tab === 'card' && me.isAdmin && <span className="shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-2.5 py-1 text-caption2 font-bold tracking-wide text-white">ADMIN</span>}
        {tab === 'card' && !me.isAdmin && level && <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-caption2 font-medium text-emerald-300">{level.label}</span>}
      </header>
      <div className="relative z-10 px-4 empty:hidden"><OfflinePill savedAt={offlineAt} /></div>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+92px)] [@media(max-height:700px)]:pb-[calc(env(safe-area-inset-bottom)+84px)]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <TabBoundary key={tab} onBack={() => go('card')}>
        <motion.div initial={{ opacity: 0, x: dir * 28 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="flex min-h-0 flex-1 flex-col gap-3">
          {tab === 'card' && (
            <>
              <WelcomeBanner welcome={welcome} />
              {staff && <StaffBanner staff={staff} onOpen={() => { tapHaptic(); setSheet('staff'); }} />}
              <TicketWallet compact ev={upcoming[0] ?? null} holder={me.fullName || me.email} prepaidBalance={me.prepaidBalance} playcoins={me.playcoins} movements={me.movements}
                onTopup={pay.accountTopup ? () => setTopupOpen(true) : undefined} onPayCaja={pay.cajaPay ? () => setPayOpen(true) : undefined} onPlaymatch={() => go('playmatch')} />
              <BuyNextCard me={me} />
            </>
          )}
          {tab === 'playmatch' && (
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4"><PlaymatchTab events={upcoming} buyHref={buyHref} /></div>
          )}
          {tab === 'premios' && (<>
            {/* Sellos, Puntos y Cupones en una sola sección. */}
            <div role="tablist" aria-label="Premios" className="account-glass grid shrink-0 grid-cols-3 gap-1 rounded-full p-1">
              {PRIZES.map(({ key, label }) => (
                <button key={key} type="button" role="tab" aria-selected={prize === key} onClick={() => setPrize(key)}
                  className={`relative h-9 rounded-full text-footnote font-semibold transition-all duration-300 ${prize === key ? 'bg-white/[0.18] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]' : 'text-white/60'}`}>
                  {label}
                  {key === 'cupones' && activeCoupons > 0 && <span className="ml-1.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-white px-1 align-middle text-caption2 font-bold text-[#0d0712]">{activeCoupons}</span>}
                </button>
              ))}
            </div>
            {prize === 'sellos' && (
              <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4"><StampsTab buySlug={me.nextEvent?.slug ?? null} /></div>
            )}
            {prize === 'puntos' && (<>
              <PlaycoinsCard me={me} />
              {pay.accountTopup && <button type="button" onClick={() => setTopupOpen(true)} className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-subhead font-bold text-white"><Plus className="h-4 w-4" /> Recargar saldo (hoy {`$${me.prepaidBalance.toLocaleString('es-CL')}`})</button>}
              <MovementsPreview me={me} onAll={() => setSheet('movimientos')} />
            </>)}
            {prize === 'cupones' && <CouponsPager me={me} />}
          </>)}
          {tab === 'perfil' && (
            <div className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1 pb-4">
              <div className="account-glass flex items-center gap-3.5 rounded-[26px] px-4 py-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-sky-500 text-title2 font-bold">{(firstName(me.fullName) || me.email).charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-title3 font-bold leading-tight">{me.fullName || 'Mi cuenta'}</p>
                  <p className="truncate text-footnote text-white/60">{me.email}</p>
                </div>
                {me.isAdmin && <span className="shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-fuchsia-500 px-2.5 py-1 text-caption2 font-bold tracking-wide text-white">ADMIN</span>}
                {!me.isAdmin && level && <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-caption2 font-medium text-emerald-300">{level.label}</span>}
              </div>
              {staff && (
                <button type="button" onClick={() => { tapHaptic(); setSheet('staff'); }} className="block w-full rounded-[24px] bg-gradient-to-r from-violet-400/70 via-fuchsia-400/50 to-sky-400/60 p-[1.5px] text-left interactive">
                  <span className="flex items-center gap-3 rounded-[23px] bg-[#0d0712] px-4 py-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-violet-300/15 text-violet-300"><BadgeCheck className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-callout font-bold leading-tight">Staff</span>
                      <span className="block truncate text-footnote text-white/60">Tu credencial, tus turnos y la info del evento</span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-violet-300" />
                  </span>
                </button>
              )}
              {/* Solo para el correo del dueño (ADMIN_EMAILS): acceso al panel; ahí pide el segundo factor. */}
              {me.isAdmin && (
                <a href="/admin" onClick={tapHaptic} className="block w-full rounded-[24px] bg-gradient-to-r from-pink-500/80 via-fuchsia-500/60 to-sky-500/70 p-[1.5px] text-left interactive">
                  <span className="flex items-center gap-3 rounded-[23px] bg-[#0d0712] px-4 py-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pink-400/15 text-pink-300"><Crown className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-callout font-bold leading-tight">Administrar la fiesta</span>
                      <span className="block truncate text-footnote text-white/60">Entra al panel: ventas, caja, staff y más</span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-pink-300" />
                  </span>
                </a>
              )}
              {/* Solo para quien entra con el correo de un embajador. */}
              {ambassador && (
                <button type="button" onClick={() => { tapHaptic(); setSheet('embajador'); }} className="block w-full rounded-[24px] bg-gradient-to-r from-amber-300/70 via-pink-400/50 to-fuchsia-400/60 p-[1.5px] text-left interactive">
                  <span className="flex items-center gap-3 rounded-[23px] bg-[#0d0712] px-4 py-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-300/15 text-amber-300"><Crown className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-callout font-bold leading-tight">Embajador</span>
                      <span className="block truncate text-footnote text-white/60">Tu contenido para compartir y tus ventas</span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-amber-300" />
                  </span>
                </button>
              )}
              <SettingsGroup rows={[
                ...(passkeyOk ? [{ key: 'faceid', label: `Entrar con ${biometricName()}`, sub: passkeyUsedHere() ? `Activado en ${thisDeviceName()}` : 'Con un toque, sin esperar el código', icon: ScanFace, tint: 'bg-emerald-500', onClick: () => { setFaceIdOffer(false); setSheet('faceid'); } }] : []),
                { key: 'avisos', label: 'Avisos', sub: pushPending ? 'Actívalos para no perderte nada' : 'Recordatorios, preventas y novedades', icon: Bell, tint: 'bg-rose-500', dot: pushPending, onClick: () => setSheet('avisos') },
                { key: 'entradas', label: 'Mis entradas', sub: 'Las próximas y las de fiestas pasadas', icon: TicketIcon, tint: 'bg-fuchsia-500', onClick: () => setSheet('entradas') },
                ...(pay.savedCards ? [{ key: 'tarjetas', label: 'Mis tarjetas', sub: 'Tus tarjetas guardadas', icon: CreditCard, tint: 'bg-sky-500', onClick: () => setSheet('tarjetas') }] : []),
              ]} />
              <SettingsGroup title="La fiesta" rows={[
                { key: 'eventos', label: 'Eventos', icon: Calendar, tint: 'bg-violet-500', href: '/eventos' },
                { key: 'fiesta', label: 'Pistas, line-up y la mansión', icon: Sparkles, tint: 'bg-pink-500', onClick: () => setInfo('fiesta') },
                { key: 'dresscode', label: 'Dress code', icon: Shirt, tint: 'bg-orange-500', onClick: () => setInfo('dresscode') },
              ]} />
              <SettingsGroup title="Ayuda" rows={[
                { key: 'faq', label: 'Preguntas frecuentes', icon: CircleHelp, tint: 'bg-sky-500', onClick: () => setInfo('faq') },
                { key: 'whatsapp', label: 'Escríbenos por WhatsApp', icon: MessageCircle, tint: 'bg-green-500', external: CANDYLAND.redes.whatsapp },
                { key: 'legal', label: 'Políticas', icon: FileText, tint: 'bg-slate-500', onClick: () => setInfo('legal') },
              ]} />
              <div className="account-glass overflow-hidden rounded-[22px]">
                <button type="button" onClick={() => { tapHaptic(); try { sessionStorage.removeItem(TAB_KEY); sessionStorage.removeItem(PRIZE_KEY); } catch { /* nada */ } onLogout(); }} className="flex h-12 w-full items-center justify-center gap-2 text-body font-semibold text-rose-400 active:bg-white/10"><LogOut className="h-4 w-4" /> Cerrar sesión</button>
              </div>
              <p className="pb-2 text-center text-caption1 text-white/40">Mansion PlayRoom · {BRAND_VALUES} · +18</p>
            </div>
          )}
        </motion.div>
        </TabBoundary>
      </main>

      {/* Barra de vidrio partida en dos con el «+» al centro: lo más usado a los lados y el resto en el «+». */}
      <nav className={`fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 flex w-[calc(100vw-24px)] max-w-md -translate-x-1/2 items-end gap-1 ${more ? 'z-[50]' : 'z-20'}`} aria-label="Secciones de mi cuenta">
        {[tabs.slice(0, 2), tabs.slice(2)].map((group, g) => (
          <Fragment key={g}>
          {/* Hueco del centro: ahí queda el «+», sin tapar ningún botón. */}
          {g === 1 && <div aria-hidden className="w-[68px] shrink-0" />}
          <div className={`lg-pill grid min-w-0 flex-1 grid-cols-2 rounded-full p-1.5 transition-all duration-300 ${more ? 'pointer-events-none translate-y-2 opacity-0' : ''}`}>
            {group.map(({ key, label, icon: Icon }) => {
              const badge = key === 'premios' ? activeCoupons : 0;
              const live = key === 'playmatch' && playmatchLive;
              const dot = key === 'perfil' && pushPending;
              return (
                <button key={key} type="button" onClick={() => go(key)} aria-current={tab === key ? 'page' : undefined}
                  className={`relative flex flex-col items-center justify-center gap-0.5 rounded-full py-2 text-caption2 font-medium transition-all duration-300 ${tab === key ? 'bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]' : 'text-white/60'}`}>
                  <Icon className="h-[22px] w-[22px]" />
                  {label}
                  {(live || dot) && <span className="absolute right-3 top-1.5 h-2.5 w-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.9)]" />}
                  {badge > 0 && <span className="absolute right-1 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-caption2 font-bold text-[#0d0712]">{badge}</span>}
                </button>
              );
            })}
          </div>
          </Fragment>
        ))}
        <button type="button" onClick={() => { tapHaptic(); setMore((v) => !v); }} aria-label={more ? 'Cerrar' : 'Más acciones'} aria-expanded={more}
          className="absolute bottom-3 left-1/2 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-gradient-to-br from-pink-500 via-fuchsia-500 to-sky-500 text-white shadow-[0_10px_30px_-4px_rgba(236,72,153,0.65),inset_0_1px_0_rgba(255,255,255,0.45)] ring-[5px] ring-[#0b0612]/70 transition-transform duration-300 active:scale-95">
          <Plus className={`h-7 w-7 transition-transform duration-300 ${more ? 'rotate-45' : ''}`} strokeWidth={2.4} />
          {earlyOn && !more && <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full border-2 border-[#0b0612] bg-amber-300" />}
        </button>
      </nav>

      <AnimatePresence>
        {more && (
          <>
            <motion.div className="fixed inset-0 z-30 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMore(false)} />
            <motion.div
              className="lg-sheet fixed inset-x-0 bottom-0 z-40 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[32px] px-4 pb-[calc(env(safe-area-inset-bottom)+104px)] pt-3"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              drag="y" dragControls={sheetDrag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, info) => { if (info.offset.y > 80) setMore(false); }}
            >
              {/* Solo la manija arrastra la hoja: el resto se desliza normal. */}
              <div onPointerDown={(e) => sheetDrag.start(e)} className="-mx-4 mb-2 flex h-8 cursor-grab touch-none items-center justify-center"><div className="h-1.5 w-10 rounded-full bg-white/25" /></div>
              <div className="mb-4 [@media(max-height:700px)]:mb-2">
                <p className="font-heading text-title3 font-bold">¿Qué quieres hacer?</p>
              </div>
              <div className="space-y-3">
                <EarlyCard me={me} />
                {me.nextEvent && buyHref && (
                  <Link href={buyHref} className="flex min-h-[60px] items-center gap-3 rounded-[22px] bg-gradient-to-r from-pink-500/90 via-fuchsia-500/90 to-sky-500/90 px-4 py-2.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                    <TicketIcon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-subhead font-bold leading-tight">{lastBuy ? 'Comprar en 1 toque' : 'Comprar entrada'}</span>
                      <span className="block truncate text-caption1 text-white/85">{lastBuy ? `Tu entrada de siempre · ${me.nextEvent.title}` : me.nextEvent.title}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </Link>
                )}
                {/* Mosaicos iguales: cada tema abre su propia hoja, así esta nunca crece. */}
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    // El correo del administrador tiene su acceso al panel acá también (además de la tarjeta de Perfil).
                    ...(me.isAdmin ? [{ key: 'admin', label: 'Panel admin', icon: Crown, href: '/admin' }] : []),
                    { key: 'entradas', label: 'Mis entradas', icon: TicketIcon, onClick: () => { setMore(false); setSheet('entradas'); } },
                    ...(pay.cajaPay ? [{ key: 'caja', label: 'Pagar en caja', icon: Wallet, onClick: () => { setMore(false); setPayOpen(true); } }] : []),
                    ...(pay.accountTopup ? [{ key: 'recarga', label: 'Recargar saldo', icon: Plus, onClick: () => { setMore(false); setTopupOpen(true); } }] : []),
                    { key: 'beneficios', label: 'Beneficios', icon: Sparkles, onClick: () => { setMore(false); setSheet('beneficios'); } },
                    { key: 'eventos', label: 'Eventos', icon: Calendar, href: '/eventos' },
                    { key: 'ayuda', label: 'Ayuda', icon: CircleHelp, onClick: () => { setMore(false); setInfo('faq'); } },
                  ] as { key: string; label: string; icon: typeof Bell; onClick?: () => void; href?: string }[]).map(({ key, label, icon: Icon, onClick, href }) => {
                    const cls = 'account-glass relative flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-[22px] text-footnote font-semibold text-white interactive [@media(max-height:700px)]:h-[66px] [@media(max-height:700px)]:gap-1';
                    const inner = (<><Icon className="h-5 w-5 text-pink-300" />{label}</>);
                    return href ? <Link key={key} href={href} onClick={tapHaptic} className={cls}>{inner}</Link> : <button key={key} type="button" onClick={() => { tapHaptic(); onClick?.(); }} className={cls}>{inner}</button>;
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <TopupSheet open={topupOpen} onClose={() => setTopupOpen(false)} />
      <AnimatePresence>{payOpen && <PayInCajaViewer onClose={() => setPayOpen(false)} prepaidBalance={me.prepaidBalance} playcoins={me.playcoins} />}</AnimatePresence>
      <BottomSheet open={sheet === 'avisos'} onClose={() => setSheet(null)} title="Avisos">
        {/* `alwaysShow`: la persona abrió «Avisos» a propósito, así que el aviso no se esconde aunque lo haya cerrado antes. */}
        <PushPrompt source="puntos" tone="dark" alwaysShow />
        {avisosNotice(push.state) === 'enabled' && <p className="account-glass rounded-2xl p-4 text-subhead text-white/75">✓ Avisos activados: te avisamos del recordatorio del evento, preventas y novedades.</p>}
        {avisosNotice(push.state) === 'denied' && <p className="account-glass rounded-2xl p-4 text-subhead text-white/65">Bloqueaste los avisos de este sitio. Si los quieres, actívalos en los ajustes del teléfono o del navegador.</p>}
        {avisosNotice(push.state) === 'unsupported' && (
          <p className="account-glass rounded-2xl p-4 text-subhead text-white/65">
            Este navegador no permite recibir avisos. Abre Playroom en Chrome (en Android) o en Safari y agrégalo a tu inicio, y vuelve a entrar acá para activarlos.
          </p>
        )}
        {avisosNotice(push.state) === 'loading' && <p className="account-glass rounded-2xl p-4 text-subhead text-white/65">Revisando tus avisos…</p>}
      </BottomSheet>
      <PasskeySheet open={sheet === 'faceid'} offer={faceIdOffer} onClose={() => setSheet(null)} />
      <InfoSheet kind={info} onClose={() => setInfo(null)} />
      <BottomSheet open={sheet === 'tarjetas'} onClose={() => setSheet(null)} title="Mis tarjetas"><SavedCardsSection /></BottomSheet>
      {staff && <AppScreen open={sheet === 'staff'} title="Staff" onClose={() => setSheet(null)}><StaffAccount staff={staff} /></AppScreen>}
      {ambassador && <AppScreen open={sheet === 'embajador'} title="Embajador" onClose={() => setSheet(null)}><AmbassadorAccount panel={ambassador} /></AppScreen>}
      <BottomSheet open={sheet === 'beneficios'} onClose={() => setSheet(null)} title="Beneficios"><PerksCard me={me} /></BottomSheet>
      <BottomSheet open={sheet === 'movimientos'} onClose={() => setSheet(null)} title="Movimientos"><Movements me={me} /></BottomSheet>
      {/* Todas las entradas de los próximos eventos (PlayCard muestra la de la próxima fiesta). */}
      <BottomSheet open={sheet === 'entradas'} onClose={() => setSheet(null)} title="Mis entradas"><div className="flex min-h-[260px] flex-col"><TicketsPager events={upcoming} holder={me.fullName || me.email} /></div></BottomSheet>
    </div>
    </MotionConfig>
  );
}

export default function Cuenta() {
  const halloween = useHalloweenMode();
  const { data: openEvents } = trpc.events.listPublished.useQuery(undefined, { enabled: isAppMode() });
  useSeo({ title: 'Mi cuenta — Mansion Playroom', description: 'Tus Playcoins, saldo, entradas y cupones en Mansion Playroom.', path: '/cuenta', noindex: true });
  const utils = trpc.useUtils();
  // Lo último guardado en este teléfono: la app abre al instante con eso y sin señal se queda con eso.
  const [snapshot, setSnapshot] = useState(() => loadAccountSnapshot<Me>());
  const { data, isLoading, isError, refetch, isFetching } = trpc.member.me.useQuery(undefined, { retry: false });
  const session = useMemberSession();
  const logout = trpc.member.logout.useMutation({ onSuccess: () => utils.member.invalidate() });
  const [welcome, setWelcome] = useState<LoginDone | null>(null);
  const isMobile = useIsMobile();
  // La pantalla es oscura: barra de estado y fondo oscuros mientras estás acá (sin franja blanca arriba).
  useDarkChrome();
  const shell = `account-font account-tokens relative min-h-dvh bg-[#0b0612] text-white ${halloween ? 'pm-halloween' : ''}`;

  useEffect(() => {
    if (data) { saveAccountSnapshot(data); setSnapshot({ me: data, savedAt: Date.now() }); }
    // `null` = el servidor dice que no hay sesión: no se deja la cuenta guardada en el teléfono.
    else if (data === null) { clearAccountSnapshot(); setSnapshot(null); }
  }, [data]);
  const signedIn = !!data;
  useEffect(() => { if (signedIn) warmOfflineApp(); }, [signedIn]);

  const onLogout = () => {
    clearAccountSnapshot();
    setSnapshot(null);
    logout.mutate();
  };
  // undefined = todavía cargando o sin red: se usa lo guardado.
  const me = data === undefined ? snapshot?.me ?? null : data;
  const offlineAt = data === undefined && isError && snapshot ? snapshot.savedAt : null;

  // Para quien no ha entrado: el próximo evento con su botón de comprar (solo en la app).
  const nextOpen = (openEvents as { id: number; slug: string; title: string; eventDate: string | Date; status?: string | null }[] | undefined)
    ?.filter((e) => new Date(e.eventDate).getTime() >= Date.now() - 12 * 3_600_000 && e.status !== 'soldout')
    .sort((x, y) => new Date(x.eventDate).getTime() - new Date(y.eventDate).getTime())[0];
  const login = (
    <div className={`${shell} pt-[max(20px,env(safe-area-inset-top))] pb-16`}>
      <div className="account-backdrop" />
      <div className="container relative z-10 max-w-md">
        <div className="flex h-12 items-center">
          <Link href="/" className="lg-pill inline-flex h-10 items-center gap-0.5 rounded-full pl-2 pr-4 text-subhead font-semibold text-pink-300 interactive">
            <ChevronLeft className="h-5 w-5" /> Inicio
          </Link>
        </div>
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pt-8">
          <div className="text-center">
            <h1 className="text-large-title font-bold tracking-tight text-white">Mi cuenta</h1>
            <p className="mt-2 text-subhead text-white/70">Tu entrada, tus Playcoins y tu saldo a un toque. Entras con un código que te mandamos al correo de tu compra (o tu correo de embajador o de staff): sin contraseñas.</p>
          </div>
          <div className={`${GLASS} p-5`}>
            <MemberLogin tone="dark" onDone={setWelcome} />
          </div>
          <p className="px-2 text-center text-footnote leading-relaxed text-white/65">Es opcional: para comprar tu entrada no necesitas cuenta. ¿Aún no compras? Cuando lo hagas, ya podrás entrar con ese correo.</p>
          {nextOpen && (
            <Link href={`/checkout/${nextOpen.slug}`} className="account-glass flex items-center gap-3 rounded-[22px] px-4 py-3.5 interactive">
              <span className="lg-pill grid h-11 w-11 shrink-0 place-items-center rounded-[14px]"><TicketIcon className="h-5 w-5 text-pink-300" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-footnote text-white/60">Próxima fiesta</span>
                <span className="block truncate text-body font-semibold">{nextOpen.title}</span>
              </span>
              <span className="shrink-0 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 px-4 py-2 text-subhead font-semibold text-white">Comprar</span>
            </Link>
          )}
        </motion.div>
      </div>
    </div>
  );

  if (!me && isLoading) {
    // Si ya se sabe que no hay sesión, el formulario sale al tiro; si no, la forma de la app mientras carga.
    if (session.data && !session.data.loggedIn) return login;
    return isMobile ? <AccountSkeleton /> : <div className={`${shell} pt-28`}><div className="account-backdrop" /></div>;
  }

  // Sin red y sin nada guardado: no se muestra el formulario de entrar (no serviría), se ofrece reintentar.
  if (!me && isError) {
    return (
      <div className={`${shell} flex items-center justify-center px-6`}>
        <div className="account-backdrop" />
        <div className={`${GLASS} relative z-10 flex w-full max-w-sm flex-col items-center gap-3 p-8 text-center`}>
          <WifiOff className="h-10 w-10 text-pink-300" />
          <p className="text-title3 font-bold">Sin conexión</p>
          <p className="text-subhead text-white/65">No pudimos cargar tu cuenta. Revisa tu señal o el wifi y vuelve a intentar.</p>
          <button type="button" onClick={() => { void refetch(); }} disabled={isFetching} className="mt-1 inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 to-sky-500 px-6 text-subhead font-bold text-white interactive disabled:opacity-60">
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!me) return login;

  if (isMobile) return <AccountApp me={me} welcome={welcome} onLogout={onLogout} offlineAt={offlineAt} />;

  return <DesktopAccount me={me} welcome={welcome} onLogout={onLogout} shell={shell} offlineAt={offlineAt} />;
}

function DesktopAccount({ me, welcome, onLogout, shell, offlineAt }: { me: Me; welcome: LoginDone | null; onLogout: () => void; shell: string; offlineAt: number | null }) {
  const { href: buyHref } = useBuyHref(me.nextEvent?.slug);
  const ambassador = useAmbassadorPanel();
  const level = CUSTOMER_LEVEL_META[me.level as keyof typeof CUSTOMER_LEVEL_META];
  const upcoming = me.events as MeEvent[];
  const pay = useMemberPayConfig();
  const [topupOpen, setTopupOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  return (
    <div className={`${shell} pt-28 pb-20`}>
      <div className="account-backdrop" />
      <div className="container relative z-10 max-w-lg space-y-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-heading text-title1 font-extrabold leading-tight text-white">Hola{firstName(me.fullName) ? `, ${firstName(me.fullName)}` : ''} 👋</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-subhead text-white/60">
                <span className="truncate">{me.email}</span>
                {level && <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-caption1 font-medium text-emerald-300">{level.label}</span>}
              </p>
            </div>
            <button type="button" onClick={onLogout} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-caption1 text-white/60 interactive"><LogOut className="h-3.5 w-3.5" /> Salir</button>
          </div>

          <OfflinePill savedAt={offlineAt} />
          <WelcomeBanner welcome={welcome} />
          <TicketWallet ev={upcoming[0] ?? null} holder={me.fullName || me.email} prepaidBalance={me.prepaidBalance} playcoins={me.playcoins} movements={me.movements}
            onTopup={pay.accountTopup ? () => setTopupOpen(true) : undefined} onPayCaja={pay.cajaPay ? () => setPayOpen(true) : undefined} />
          <section className="space-y-3">
            <h2 className="font-heading text-title3 font-bold text-white">Playmatch 🍬</h2>
            <PlaymatchTab events={upcoming} buyHref={buyHref} />
          </section>
          <BuyNextCard me={me} />
          {ambassador && <AmbassadorAccount panel={ambassador} />}

          {/* Avisos: bien arriba y llamativo; desaparece solo al activarlos. */}
          <PushPrompt source="puntos" tone="dark" className="shadow-[0_0_28px_rgba(236,72,153,0.22)]" />
          <EarlyCard me={me} />
          <StampsTab buySlug={me.nextEvent?.slug ?? null} />
          <PlaycoinsCard me={me} />

          {upcoming.length > 1 && (
            <Section icon={<TicketIcon className="h-4 w-4" />} title="Mis otras entradas">
              <TicketsList events={upcoming} from={1} />
            </Section>
          )}

          <Section icon={<Gift className="h-4 w-4" />} title="Mis cupones">
            <CouponsList me={me} />
          </Section>

          {pay.savedCards && <SavedCardsSection />}
          <PerksCard me={me} />
        </motion.div>
      </div>
      <TopupSheet open={topupOpen} onClose={() => setTopupOpen(false)} />
      <AnimatePresence>{payOpen && <PayInCajaViewer onClose={() => setPayOpen(false)} prepaidBalance={me.prepaidBalance} playcoins={me.playcoins} />}</AnimatePresence>
    </div>
  );
}
