import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, MotionConfig, motion, useDragControls } from 'framer-motion';
import { toast } from 'sonner';
import { Calendar, Check, Copy, Crown, Gift, LogOut, Sparkles, Ticket as TicketIcon, ArrowRight, Download, Loader2, X, QrCode, CreditCard, Coins, MoreHorizontal, Home, Wallet, Plus, RefreshCw, Bell, ChevronLeft, ChevronRight, Heart, Stamp as StampIcon } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { useSeo } from '@/hooks/useSeo';
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
import { AmbassadorAccount, useAmbassadorPanel } from '@/components/site/AmbassadorAccount';
import { StampsTab } from '@/components/site/StampCard';
import { canEnterParty, isPartyWindowOpen } from '@shared/party';
import { useCustomerPush } from '@/lib/customerPush';
import { avisosNotice } from '@/lib/pushPromptView';
import { useIsMobile } from '@/hooks/useMobile';
import { MemberLogin, type LoginDone } from '@/components/site/MemberLogin';
import { fmtDate, fmtDateTime } from '@/lib/member';
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
      <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-white"><span className="text-pink-400">{icon}</span> {title}</h2>
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
          <p className="text-[11px] uppercase tracking-wider text-white/50">{KIND_LABEL[c.kind] ?? 'Cupón'}</p>
          <p className="font-heading font-bold leading-snug text-white">{c.title}</p>
          <p className="mt-0.5 text-xs text-white/55">
            {c.status === 'usado' ? 'Ya lo usaste' : c.status === 'vencido' ? 'Venció' : c.validUntil ? `Vale hasta el ${fmtDate(c.validUntil)}` : ''}
          </p>
        </div>
        {live && (
          <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-pink-400/50 px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-white interactive" aria-label={`Copiar el código ${c.code}`}>
            {c.code} {copied ? <Check className="h-3.5 w-3.5 text-pink-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {live && <p className="mt-2 text-xs text-white/55">Pégalo en el campo de código al comprar tu entrada. Es personal: úsalo con el correo de tu cuenta.</p>}
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

type MeEvent = { eventId: number; eventTitle: string; eventSlug: string; eventDate: string | Date; venue: string | null; doorsOpen?: string | Date | null; eventEnd?: string | Date | null; tickets: { ticketCode: string; holderName: string | null; status: string; qrImageUrl: string | null; category?: string }[] };

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
      const r = await saveTicketImage({ qrImageUrl: t.qrImageUrl, ticketCode: t.ticketCode, holderName: t.holderName || holder, eventTitle: ev.eventTitle, eventDateText: fmtDateTime(ev.eventDate), venue: ev.venue });
      if (r === 'downloaded') toast.success('Listo: la imagen de tu entrada quedó descargada.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar la imagen');
    } finally {
      setSaving(false);
    }
  };
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.22 }} className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 bg-white px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(24px,env(safe-area-inset-top))] text-[#0d0712]" role="dialog" aria-label="Código QR de tu entrada">
      <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-[max(16px,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-black/5"><X className="h-5 w-5" /></button>
      <p className="text-center font-heading text-lg font-extrabold leading-tight">{ev.eventTitle}</p>
      {t.qrImageUrl && <img src={t.qrImageUrl} alt="Código QR de tu entrada" className="aspect-square w-[min(86vw,58vh)] [image-rendering:pixelated]" />}
      <div className="text-center">
        <p className="font-heading text-xl font-bold">{t.holderName || holder}</p>
        <p className="font-mono text-sm text-black/50">{t.ticketCode}</p>
      </div>
      <p className="text-center text-xs text-black/50">Sube el brillo de la pantalla. Muestra tu carnet en la entrada.</p>
      <button type="button" onClick={() => { void save(); }} disabled={saving} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#0d0712] px-6 text-sm font-bold text-white interactive disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Guardar en Fotos
      </button>
    </motion.div>
  );
}

/** Cómo se llama cada entrada en el selector: el primer nombre, y si se repite (varias a nombre de
 * quien compró) se numeran: «Alexis 1», «Alexis 2». */
function holderLabels(list: { holderName: string | null }[]): string[] {
  const first = list.map((x, n) => (x.holderName?.trim().split(/\s+/)[0] || `Entrada ${n + 1}`));
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
function TicketWallet({ ev, holder, prepaidBalance, playcoins, movements, compact = false, onTopup, onPayCaja }: { ev: MeEvent | null; holder: string; prepaidBalance: number; playcoins: number; movements: Movement[]; compact?: boolean; onTopup?: () => void; onPayCaja?: () => void }) {
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
      />
    </TiltCard>
  );
  // Hasta 3 entradas: píldoras. Más: selector con flechas («‹ Persona 2 · 2/6 ›»), que siempre cabe en una línea.
  const many = !!ev && ev.tickets.length > 3;
  const step = (d: number) => { if (!ev) return; tapHaptic(); setI((v) => (v + d + ev.tickets.length) % ev.tickets.length); };
  const labels = ev ? holderLabels(ev.tickets) : [];
  const holderPills = ev && ev.tickets.length > 1 && (many ? (
    <div className="flex h-9 items-center gap-1 px-1 text-sm font-semibold">
      <button type="button" onClick={() => step(-1)} aria-label="Entrada anterior" className="grid h-8 w-8 place-items-center rounded-full text-white/70"><ChevronLeft className="h-4 w-4" /></button>
      <span className="max-w-[120px] truncate px-1">{labels[i]} <span className="text-white/45">· {i + 1}/{ev.tickets.length}</span></span>
      <button type="button" onClick={() => step(1)} aria-label="Entrada siguiente" className="grid h-8 w-8 place-items-center rounded-full text-white/70"><ChevronRight className="h-4 w-4" /></button>
    </div>
  ) : ev.tickets.map((x, n) => (
    <button key={x.ticketCode} type="button" onClick={() => { tapHaptic(); setI(n); }} className={`h-9 max-w-[124px] truncate rounded-full px-4 text-sm font-semibold interactive ${n === i ? 'lg-pill text-white' : 'text-white/60'} ${x.status === 'used' ? 'line-through decoration-white/40' : ''}`}>
      {labels[n]}
    </button>
  )));
  const evWindow = ev ? { eventDate: ev.eventDate, doorsOpen: ev.doorsOpen, eventEnd: ev.eventEnd } : null;
  const playmatchCode = ev && evWindow ? ev.tickets.find((x) => x.category === 'acceso' && canEnterParty({ status: x.status, eventId: ev.eventId }, evWindow))?.ticketCode ?? null : null;
  const actions = [
    // La noche de la fiesta, ya escaneada en la puerta: Playmatch a un toque (sin escribir el código).
    playmatchCode ? { key: 'playmatch', label: 'Playmatch', icon: Heart, href: `/fiesta/${playmatchCode}`, primary: true } : null,
    usable ? { key: 'qr', label: 'Mostrar QR', icon: QrCode, onClick: () => setShowQr(true), primary: !playmatchCode } : null,
    onPayCaja ? { key: 'caja', label: 'Pagar', icon: Wallet, onClick: onPayCaja } : null,
    onTopup ? { key: 'recarga', label: 'Recargar', icon: Plus, onClick: onTopup } : null,
  ].filter(Boolean) as { key: string; label: string; icon: typeof Wallet; href?: string; onClick?: () => void; primary?: boolean }[];

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 [@media(max-height:700px)]:gap-2">
        {ev && <EventStrip ev={ev} hero />}
        {card}
        {(holderPills || t) && (
          <div className="flex items-center justify-center gap-2">
            {holderPills && <div className="flex min-w-0 items-center gap-1 rounded-full bg-white/[0.06] p-1">{holderPills}</div>}
            {t && (
              <button type="button" onClick={() => { tapHaptic(); setFlipSignal((n) => n + 1); }} aria-label="Ver el reverso de la tarjeta" className="lg-pill grid h-11 w-11 place-items-center rounded-full text-white/80 interactive">
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {/* Acciones estilo Apple Wallet: círculos iguales, repartidos en todo el ancho, con el nombre debajo. */}
        {actions.length > 0 && (
          <div className="grid pt-1" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
            {actions.map(({ key, label, icon: Icon, href, onClick, primary }) => {
              const circle = `grid h-[62px] w-[62px] place-items-center rounded-full [@media(max-height:700px)]:h-[50px] [@media(max-height:700px)]:w-[50px] ${primary ? 'bg-gradient-to-br from-pink-500 via-fuchsia-500 to-sky-500 shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.4)]' : 'lg-pill'}`;
              const inner = (<><span className={circle}><Icon className="h-6 w-6 text-white" /></span><span className="text-[12px] font-medium text-white/85">{label}</span></>);
              return href ? (
                <Link key={key} href={href} className="flex flex-col items-center gap-2 interactive">{inner}</Link>
              ) : (
                <button key={key} type="button" onClick={() => { tapHaptic(); onClick?.(); }} className="flex flex-col items-center gap-2 interactive">{inner}</button>
              );
            })}
          </div>
        )}
        {createPortal(<AnimatePresence>{showQr && ev && t && <QrViewer ev={ev} t={t} holder={holder} onClose={() => setShowQr(false)} />}</AnimatePresence>, document.body)}
      </div>
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
              <button key={x.ticketCode} type="button" onClick={() => setI(n)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold interactive ${n === i ? 'border-pink-400 bg-pink-500/20 text-white' : 'border-white/15 text-white/70'}`}>
                {x.status === 'used' ? '✅ ' : '🎟️ '}{x.holderName ? x.holderName.split(' ')[0] : `Entrada ${n + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>
      {usable && t && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setShowQr(true)} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-sm font-bold text-white shadow-[0_0_20px_rgba(236,72,153,0.4)] interactive">
            <QrCode className="h-4 w-4" /> Mostrar QR
          </button>
          <Link href={`/verificar/${t.ticketCode}`} className="account-glass inline-flex h-12 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-white interactive">
            Ver mi entrada <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
      {(onTopup || onPayCaja) && (
        <div className="grid grid-cols-2 gap-2">
          {onPayCaja && (
            <button type="button" onClick={onPayCaja} className="account-glass inline-flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white interactive">
              <Wallet className="h-4 w-4 text-pink-300" /> Pagar en caja
            </button>
          )}
          {onTopup && (
            <button type="button" onClick={onTopup} className={`account-glass inline-flex h-11 items-center justify-center gap-2 rounded-full text-sm font-semibold text-white interactive ${onPayCaja ? '' : 'col-span-2'}`}>
              <Plus className="h-4 w-4 text-pink-300" /> Recargar saldo
            </button>
          )}
        </div>
      )}
      {usable && !compact && <p className="text-center text-xs text-white/50">Toca tu PlayCard para ver el QR en grande y guardarlo en Fotos: así entras aunque no tengas señal.</p>}
      {/* Portal: por encima de la barra de abajo y del resto de la pantalla. */}
      {createPortal(<AnimatePresence>{showQr && ev && t && <QrViewer ev={ev} t={t} holder={holder} onClose={() => setShowQr(false)} />}</AnimatePresence>, document.body)}
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-pink-300">Tu próximo evento</p>
            <p className="mt-1 font-heading text-[26px] font-extrabold leading-tight text-white [@media(max-height:700px)]:truncate [@media(max-height:700px)]:text-base">{ev.eventTitle}</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/65 [@media(max-height:700px)]:hidden"><Calendar className="h-4 w-4 shrink-0" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
          </div>
          <span className="w-fit shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-sky-400 px-4 py-1.5 text-sm font-bold text-white shadow-[0_0_18px_rgba(236,72,153,0.5)] [@media(max-height:700px)]:px-3 [@media(max-height:700px)]:py-1 [@media(max-height:700px)]:text-[11px]">{countdown}</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`rounded-3xl p-[1.5px] ${NEON_RING}`}>
      <div className="flex items-center justify-between gap-3 rounded-[23px] bg-[#0d0712]/55 px-4 py-3 backdrop-blur-xl">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pink-300">Tu próximo evento</p>
          <p className="truncate font-heading text-base font-extrabold text-white">{ev.eventTitle}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-white/60 [@media(max-height:700px)]:hidden"><Calendar className="h-3.5 w-3.5 shrink-0" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
        </div>
        <span className="shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-sky-400 px-3 py-1 text-[11px] font-bold text-white shadow-[0_0_14px_rgba(236,72,153,0.5)]">{countdown}</span>
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

/** Playmatch (la fiesta en el celular) desde la app: la noche del evento, con su acceso ya escaneado en la
 * puerta, entra directo con su propia entrada, sin escribir ningún código. Antes de entrar, un aviso
 * de que se abre al pasar por la puerta. El servidor de Playmatch revalida todo igual. */
function PartyEntryCard({ events }: { events: MeEvent[] }) {
  const now = new Date();
  const ev = events.find((e) => isPartyWindowOpen({ eventDate: e.eventDate, doorsOpen: e.doorsOpen, eventEnd: e.eventEnd }, now));
  if (!ev) return null;
  const access = ev.tickets.filter((t) => t.category === 'acceso');
  const inside = access.find((t) => canEnterParty({ status: t.status, eventId: ev.eventId }, { eventDate: ev.eventDate, doorsOpen: ev.doorsOpen, eventEnd: ev.eventEnd }, now));
  if (inside) {
    return (
      <Link href={`/fiesta/${inside.ticketCode}`} onClick={tapHaptic} className={`block shrink-0 rounded-[26px] p-[1.5px] ${NEON_RING} interactive`}>
        <div className="flex items-center gap-3 rounded-[25px] bg-[#0d0712] px-4 py-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-sky-500 text-xl">🍬</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-bold leading-tight">Entrar a Playmatch</span>
            <span className="block truncate text-[12.5px] text-white/60">Mira quién está, conecta y chatea esta noche</span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-pink-300" />
        </div>
      </Link>
    );
  }
  if (access.length === 0) return null;
  return (
    <div className="account-glass flex shrink-0 items-center gap-3 rounded-[22px] px-4 py-3">
      <span className="text-xl">🍬</span>
      <p className="text-[13px] leading-snug text-white/70"><b className="text-white">Playmatch</b> se abre apenas te escaneen en la puerta.</p>
    </div>
  );
}

function BuyNextCard({ me }: { me: Me }) {
  if ((me.events as MeEvent[])[0]) return null;
  // Sin entrada y sin fiesta anunciada: igual se invita a mirar lo que viene (nunca una tarjeta vacía sola).
  if (!me.nextEvent) {
    return (
      <Link href="/eventos" onClick={tapHaptic} className="account-glass block rounded-[28px] p-5 interactive">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-300">Tu próxima fiesta</p>
        <p className="mt-1 text-xl font-bold text-white">Se anuncia muy pronto</p>
        <p className="mt-0.5 text-sm text-white/60">Activa los avisos y te contamos apenas abra la preventa.</p>
        <p className="mt-3 text-sm font-semibold text-pink-300">Ver eventos →</p>
      </Link>
    );
  }
  return (
    <Link href={`/checkout/${me.nextEvent.slug}`} className={`block rounded-[28px] p-[1.5px] ${NEON_RING} interactive`}>
      <div className="rounded-[27px] bg-[#0d0712] p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-300">Próximo evento</p>
        <p className="mt-1 font-heading text-xl font-extrabold text-white">{me.nextEvent.title}</p>
        <p className="mt-0.5 text-sm text-white/60">{fmtDateTime(me.nextEvent.eventDate)}</p>
        <p className="mt-3 text-sm font-semibold text-pink-300">Comprar mi entrada →</p>
      </div>
    </Link>
  );
}

function EarlyCard({ me }: { me: Me }) {
  if (!me.nextEvent || !isMemberEarlyAccess(me.nextEvent)) return null;
  return (
    <Link href={`/checkout/${me.nextEvent.slug}`} className="block rounded-2xl border border-pink-400/40 bg-gradient-to-br from-pink-500/15 to-sky-400/10 p-4 interactive">
      <p className="flex items-center gap-2 font-heading font-bold text-white"><Crown className="h-4 w-4 text-pink-400" /> Preventa para socios abierta</p>
      <p className="mt-0.5 text-sm text-white/65">{me.nextEvent.title}: compra antes que nadie hasta el {fmtDateTime(me.nextEvent.memberEarlyUntil)}.</p>
      <p className="mt-2 text-sm font-semibold text-pink-300">Comprar mi entrada →</p>
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
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-white/80">Tus Playcoins</span>
        <span className="text-white/50">meta {PLAYCOINS_MIN_REDEEM_BALANCE.toLocaleString('es-CL')}</span>
      </div>
      <p className="num-apple mt-1 text-5xl text-white">{coins.toLocaleString('es-CL')}</p>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-400 to-sky-400 shadow-[0_0_12px_rgba(236,72,153,0.6)] transition-[width] duration-700" style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
      <p className="mt-2 text-sm text-white/65">
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
      {me.movements.length === 0 ? <p className="mt-2 text-sm text-white/55">Todavía no hay movimientos.</p> : (
        <ul className="mt-2 divide-y divide-white/10 text-sm">
          {me.movements.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-white/75">{m.label}<span className="block text-[11px] text-white/40">{fmtDate(m.createdAt)}</span></span>
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
  if (list.length === 0) return <p className="account-glass rounded-2xl p-4 text-sm text-white/55">No tienes entradas para próximos eventos. <Link href="/eventos" className="text-pink-300 underline">Ver eventos</Link></p>;
  return (
    <>
      {list.map((ev) => (
        <div key={ev.eventId} className={`${GLASS} p-4`}>
          <p className="font-heading font-bold text-white">{ev.eventTitle}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-white/55"><Calendar className="h-3.5 w-3.5" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ev.tickets.map((t, i) => (
              <Link key={t.ticketCode} href={`/verificar/${t.ticketCode}`} className="rounded-full border border-pink-400/40 px-3.5 py-1.5 text-sm font-semibold text-white interactive">
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
        <p className="account-glass rounded-2xl p-4 text-sm text-white/55">
          Todavía no tienes cupones.{perkList(me).length ? ' Te vamos regalando según lo que desbloqueas.' : ''}
        </p>
      ) : me.coupons.map((c) => <CouponCard key={c.id} c={c} />)}
      {active.length === 0 && me.coupons.length > 0 && <p className="text-xs text-white/50">No tienes cupones disponibles ahora.</p>}
    </>
  );
}

function PerksCard({ me }: { me: Me }) {
  return (
    <section className={`${GLASS} p-4`}>
      <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-white"><Sparkles className="h-4 w-4 text-pink-400" /> Lo que tienes como miembro</h2>
      <ul className="mt-2 space-y-1.5 text-sm text-white/65">
        <li>• Tus entradas y su QR siempre a un toque</li>
        <li>• Tus Playcoins y saldo para canjear en caja</li>
        <li>• Aviso del recordatorio del evento, preventas y novedades</li>
        {perkList(me).map((p) => <li key={p}>• {p}</li>)}
        <li>• Preventa anticipada en los eventos que la tengan</li>
      </ul>
    </section>
  );
}

function WelcomeBanner({ welcome }: { welcome: LoginDone | null }) {
  if (!welcome || welcome.granted.length === 0) return null;
  return (
    <div className="rounded-2xl border border-pink-400/40 bg-pink-500/10 p-4 text-sm" role="status">
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
      <div className="account-glass space-y-3 rounded-2xl p-4 text-sm">
        <p className="font-heading font-bold text-white">No pudimos mostrar esta sección</p>
        <p className="text-white/65">Tu cuenta y tus entradas están a salvo.</p>
        <pre className="max-h-32 overflow-auto whitespace-break-spaces text-[11px] text-white/45">{`${this.state.error.name}: ${this.state.error.message}`}</pre>
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
        <p className="font-heading text-lg font-bold">Aún no tienes entradas</p>
        <p className="text-sm text-white/60">Cuando compres, aparecen acá con su QR.</p>
        <Link href="/eventos" className="mt-1 inline-flex h-11 items-center rounded-full bg-gradient-to-r from-pink-500 to-sky-500 px-6 text-sm font-bold">Ver eventos</Link>
      </div>
    );
  }
  return (
    <Pager>
      {pages.map(({ ev, tickets, offset }) => (
        <div key={`${ev.eventId}-${offset}`} className="account-glass m-auto flex w-full flex-col gap-4 rounded-[28px] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pink-300">Tu entrada</p>
            <p className="mt-1 font-heading text-2xl font-extrabold leading-tight">{ev.eventTitle}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/60"><Calendar className="h-4 w-4 shrink-0" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
          </div>
          <div className="space-y-2">
            {tickets.map((t, i) => (
              <button key={t.ticketCode} type="button" disabled={t.status !== 'valid' || !t.qrImageUrl} onClick={() => { tapHaptic(); setOpen({ ev, t }); }} className="lg-pill flex h-14 w-full items-center gap-3 rounded-2xl px-4 text-left interactive disabled:opacity-70">
                <TicketIcon className="h-5 w-5 shrink-0 text-pink-300" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{t.holderName || `Entrada ${offset + i + 1}`}</span>
                <span className={`shrink-0 text-xs font-medium ${t.status === 'used' ? 'text-white/50' : 'text-emerald-300'}`}>{t.status === 'used' ? 'Usada' : 'Ver QR'}</span>
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
        <p className="font-heading text-lg font-bold">Todavía no tienes cupones</p>
        <p className="text-sm text-white/60">{perkList(me).length ? 'Te vamos regalando según lo que desbloqueas.' : 'Cuando haya uno para ti, aparece acá.'}</p>
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pink-300">{KIND_LABEL[c.kind] ?? 'Cupón'}</p>
            <p className="font-heading text-2xl font-extrabold leading-tight">{c.title}</p>
            <p className="text-sm text-white/60">{c.status === 'usado' ? 'Ya lo usaste' : c.status === 'vencido' ? 'Venció' : c.validUntil ? `Vale hasta el ${fmtDate(c.validUntil)}` : ''}</p>
            {live && (
              <>
                <button type="button" onClick={() => { void copy(c.id, c.code); }} className="lg-pill flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-mono text-xl font-bold tracking-[0.2em] interactive" aria-label={`Copiar el código ${c.code}`}>
                  {c.code} {copied === c.id ? <Check className="h-5 w-5 text-pink-300" /> : <Copy className="h-5 w-5 text-white/60" />}
                </button>
                <p className="text-xs text-white/50">Pégalo en el campo de código al comprar. Es personal: úsalo con el correo de tu cuenta.</p>
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
        {me.movements.length > 3 && <button type="button" onClick={onAll} className="text-xs font-semibold text-pink-300">Ver todos</button>}
      </div>
      {last.length === 0 ? <p className="mt-2 text-sm text-white/55">Todavía no hay movimientos.</p> : (
        <ul className="mt-1 divide-y divide-white/10 text-sm">
          {last.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate text-white/75">{m.label}<span className="block text-[11px] text-white/40">{fmtDate(m.createdAt)}</span></span>
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

type Tab = 'card' | 'embajador' | 'sellos' | 'puntos' | 'cupones';
const TABS: { key: Tab; label: string; icon: typeof CreditCard }[] = [
  { key: 'card', label: 'PlayCard', icon: CreditCard },
  { key: 'sellos', label: 'Sellos', icon: StampIcon },
  { key: 'puntos', label: 'Puntos', icon: Coins },
  { key: 'cupones', label: 'Cupones', icon: Gift },
];

const TAB_KEY = 'cuenta.tab';
const SCROLL_KEY = 'cuenta.embajador.scroll';

/** La pestaña «Embajador» es larga: se recuerda hasta dónde bajó, para volver ahí. */
function RememberScroll({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let saved = 0;
    try { saved = Number(sessionStorage.getItem(SCROLL_KEY) || 0); } catch { /* nada */ }
    // Espera a que el contenido tenga alto antes de bajar.
    const t = window.setTimeout(() => { el.scrollTop = saved; }, 60);
    const onScroll = () => { try { sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop)); } catch { /* nada */ } };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.clearTimeout(t); el.removeEventListener('scroll', onScroll); };
  }, []);
  return <div ref={ref} className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4">{children}</div>;
}

// Solo para quien entra con el correo de un embajador: su pestaña va segunda.
const AMBASSADOR_TAB: { key: Tab; label: string; icon: typeof CreditCard } = { key: 'embajador', label: 'Embajador', icon: Crown };

function AccountApp({ me, welcome, onLogout }: { me: Me; welcome: LoginDone | null; onLogout: () => void }) {
  // Al volver de otra pantalla (comprar, un evento…) se abre en la misma pestaña donde estaba.
  const [tab, setTabState] = useState<Tab>(() => {
    try {
      const saved = sessionStorage.getItem(TAB_KEY) as Tab | null;
      return saved && (['card', 'embajador', 'sellos', 'puntos', 'cupones'] as Tab[]).includes(saved) ? saved : 'card';
    } catch { return 'card'; }
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    try { sessionStorage.setItem(TAB_KEY, next); } catch { /* sin almacenamiento: parte en PlayCard */ }
  };
  const ambassador = useAmbassadorPanel();
  // Pestaña guardada de «Embajador» pero ya no lo es (o es otra cuenta): vuelve a PlayCard.
  const ambassadorChecked = trpc.member.ambassador.useQuery(undefined, { retry: false, staleTime: 60_000 }).isFetched;
  useEffect(() => { if (tab === 'embajador' && ambassadorChecked && !ambassador) setTab('card'); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, ambassadorChecked, ambassador]);
  const tabs = ambassador ? [TABS[0], AMBASSADOR_TAB, ...TABS.slice(1)] : TABS;
  const [more, setMore] = useState(false);
  const sheetDrag = useDragControls();
  const pay = useMemberPayConfig();
  const [topupOpen, setTopupOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const push = useCustomerPush({ source: 'puntos' });
  const level = CUSTOMER_LEVEL_META[me.level as keyof typeof CUSTOMER_LEVEL_META];
  const upcoming = me.events as MeEvent[];
  const activeCoupons = me.coupons.filter((c) => c.status === 'disponible').length;
  const pushPending = push.state === 'ask' || push.state === 'ios-install';
  const earlyOn = !!(me.nextEvent && isMemberEarlyAccess(me.nextEvent));
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [dir, setDir] = useState(1);
  // Sub-hojas de «Más» y de «Puntos» (cada tema grande abre la suya, para que ninguna pantalla crezca).
  const [sheet, setSheet] = useState<null | 'tarjetas' | 'beneficios' | 'avisos' | 'movimientos' | 'entradas'>(null);
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
    <div className="account-font account-tokens fixed inset-0 z-[60] flex flex-col bg-[#0b0612] text-white">
      <div className="account-backdrop" />
      {/* Una pantalla fija: cabecera compacta arriba, contenido que reparte el alto y la barra flotante abajo.
          Nada se desplaza en vertical; lo que no cabe se reparte en páginas (Pager). */}
      <header className="relative z-10 flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] [@media(max-height:700px)]:pb-1">
        <Link href="/" aria-label="Ir al sitio" className="shrink-0"><img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-9 w-9 [@media(max-height:700px)]:h-8 [@media(max-height:700px)]:w-8" /></Link>
        <h1 className="min-w-0 flex-1 truncate text-[26px] font-bold leading-tight tracking-tight [@media(max-height:700px)]:text-[22px]">{title}</h1>
        {tab === 'card' && level && <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-medium text-emerald-300">{level.label}</span>}
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-[calc(env(safe-area-inset-bottom)+92px)] [@media(max-height:700px)]:pb-[calc(env(safe-area-inset-bottom)+84px)]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <TabBoundary key={tab} onBack={() => go('card')}>
        <motion.div initial={{ opacity: 0, x: dir * 28 }} animate={{ opacity: 1, x: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 300 }} className="flex min-h-0 flex-1 flex-col gap-3">
          {tab === 'card' && (
            <>
              <WelcomeBanner welcome={welcome} />
              <TicketWallet compact ev={upcoming[0] ?? null} holder={me.fullName || me.email} prepaidBalance={me.prepaidBalance} playcoins={me.playcoins} movements={me.movements}
                onTopup={pay.accountTopup ? () => setTopupOpen(true) : undefined} onPayCaja={pay.cajaPay ? () => setPayOpen(true) : undefined} />
              <BuyNextCard me={me} />
            </>
          )}
          {tab === 'embajador' && ambassador && (
            // Lo único que se desplaza en vertical: el contenido para compartir es largo.
            <RememberScroll><AmbassadorAccount panel={ambassador} /></RememberScroll>
          )}
          {tab === 'sellos' && (
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4"><StampsTab buySlug={me.nextEvent?.slug ?? null} /></div>
          )}
          {tab === 'puntos' && (<>
            <PlaycoinsCard me={me} />
            {pay.accountTopup && <button type="button" onClick={() => setTopupOpen(true)} className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Recargar saldo (hoy {`$${me.prepaidBalance.toLocaleString('es-CL')}`})</button>}
            <MovementsPreview me={me} onAll={() => setSheet('movimientos')} />
          </>)}
          {tab === 'cupones' && <CouponsPager me={me} />}
        </motion.div>
        </TabBoundary>
      </main>

      <nav className={`lg-pill fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 z-20 grid -translate-x-1/2 ${ambassador ? 'grid-cols-6' : 'grid-cols-5'} rounded-full p-1.5 transition-all duration-300 w-[calc(100vw-24px)] max-w-md`} aria-label="Secciones de mi cuenta">
        {tabs.map(({ key, label, icon: Icon }) => {
          const badge = key === 'cupones' ? activeCoupons : 0;
          return (
            <button key={key} type="button" onClick={() => go(key)} aria-current={tab === key ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-medium transition-all duration-300 py-2 ${tab === key ? 'bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]' : 'text-white/60'}`}>
              <Icon className="h-[22px] w-[22px]" />
              {label}
              {badge > 0 && <span className="absolute right-2 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-[#0d0712]">{badge}</span>}
            </button>
          );
        })}
        <button type="button" onClick={() => { tapHaptic(); setMore(true); }} className={`relative flex flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-medium text-white/60 py-2`}>
          <MoreHorizontal className="h-[22px] w-[22px]" />
          Más
          {(pushPending || earlyOn) && <span className="absolute right-4 top-1.5 h-2.5 w-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.9)]" />}
        </button>
      </nav>

      <AnimatePresence>
        {more && (
          <>
            <motion.div className="fixed inset-0 z-30 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMore(false)} />
            <motion.div
              className="lg-sheet fixed inset-x-0 bottom-0 z-40 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[32px] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              drag="y" dragControls={sheetDrag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }} onDragEnd={(_, info) => { if (info.offset.y > 80) setMore(false); }}
            >
              {/* Solo la manija arrastra la hoja: el resto se desliza normal (si no, no se podía hacer scroll hasta «Cerrar sesión»). */}
              <div onPointerDown={(e) => sheetDrag.start(e)} className="-mx-4 mb-2 flex h-8 cursor-grab touch-none items-center justify-center"><div className="h-1.5 w-10 rounded-full bg-white/25" /></div>
              <div className="mb-4 flex items-center justify-between gap-3 [@media(max-height:700px)]:mb-2">
                <div className="min-w-0">
                  <p className="truncate font-heading text-lg font-bold">{me.fullName || 'Mi cuenta'}</p>
                  <p className="truncate text-xs text-white/55">{me.email}</p>
                </div>
                <button type="button" onClick={() => setMore(false)} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-full bg-white/10"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3">
                <EarlyCard me={me} />
                {me.nextEvent && (
                  <Link href={`/checkout/${me.nextEvent.slug}`} className="flex min-h-[60px] items-center gap-3 rounded-[22px] bg-gradient-to-r from-pink-500/90 via-fuchsia-500/90 to-sky-500/90 px-4 py-2.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                    <TicketIcon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold leading-tight">Comprar entrada</span>
                      <span className="block truncate text-xs text-white/85">{me.nextEvent.title}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" />
                  </Link>
                )}
                {/* Mosaicos iguales: cada tema abre su propia hoja, así esta nunca crece. */}
                <div className="grid grid-cols-3 gap-2.5">
                  {([
                    { key: 'avisos', label: 'Avisos', icon: Bell, dot: pushPending, onClick: () => { setMore(false); setSheet('avisos'); } },
                    ...(pay.savedCards ? [{ key: 'tarjetas', label: 'Mis tarjetas', icon: CreditCard, dot: false, onClick: () => { setMore(false); setSheet('tarjetas'); } }] : []),
                    { key: 'entradas', label: 'Mis entradas', icon: TicketIcon, dot: false, onClick: () => { setMore(false); setSheet('entradas'); } },
                    { key: 'beneficios', label: 'Beneficios', icon: Sparkles, dot: false, onClick: () => { setMore(false); setSheet('beneficios'); } },
                    { key: 'eventos', label: 'Eventos', icon: Calendar, dot: false, href: '/eventos' },
                    { key: 'sitio', label: 'Ir al sitio', icon: Home, dot: false, href: '/' },
                  ] as { key: string; label: string; icon: typeof Bell; dot: boolean; onClick?: () => void; href?: string }[]).map(({ key, label, icon: Icon, dot, onClick, href }) => {
                    const cls = 'account-glass relative flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-[22px] text-[12.5px] font-semibold text-white interactive [@media(max-height:700px)]:h-[66px] [@media(max-height:700px)]:gap-1';
                    const inner = (<><Icon className="h-5 w-5 text-pink-300" />{label}{dot && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.9)]" />}</>);
                    return href ? <Link key={key} href={href} onClick={tapHaptic} className={cls}>{inner}</Link> : <button key={key} type="button" onClick={() => { tapHaptic(); onClick?.(); }} className={cls}>{inner}</button>;
                  })}
                </div>
                <button type="button" onClick={() => { tapHaptic(); onLogout(); }} className="flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-rose-300/90"><LogOut className="h-4 w-4" /> Cerrar sesión</button>
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
        {avisosNotice(push.state) === 'enabled' && <p className="account-glass rounded-2xl p-4 text-sm text-white/75">✓ Avisos activados: te avisamos del recordatorio del evento, preventas y novedades.</p>}
        {avisosNotice(push.state) === 'denied' && <p className="account-glass rounded-2xl p-4 text-sm text-white/65">Bloqueaste los avisos de este sitio. Si los quieres, actívalos en los ajustes del teléfono o del navegador.</p>}
        {avisosNotice(push.state) === 'unsupported' && (
          <p className="account-glass rounded-2xl p-4 text-sm text-white/65">
            Este navegador no permite recibir avisos. Abre Playroom en Chrome (en Android) o en Safari y agrégalo a tu inicio, y vuelve a entrar acá para activarlos.
          </p>
        )}
        {avisosNotice(push.state) === 'loading' && <p className="account-glass rounded-2xl p-4 text-sm text-white/65">Revisando tus avisos…</p>}
      </BottomSheet>
      <BottomSheet open={sheet === 'tarjetas'} onClose={() => setSheet(null)} title="Mis tarjetas"><SavedCardsSection /></BottomSheet>
      <BottomSheet open={sheet === 'beneficios'} onClose={() => setSheet(null)} title="Beneficios"><PerksCard me={me} /></BottomSheet>
      <BottomSheet open={sheet === 'movimientos'} onClose={() => setSheet(null)} title="Movimientos"><Movements me={me} /></BottomSheet>
      {/* Todas las entradas de los próximos eventos (PlayCard muestra la de la próxima fiesta). */}
      <BottomSheet open={sheet === 'entradas'} onClose={() => setSheet(null)} title="Mis entradas"><div className="flex min-h-[260px] flex-col"><TicketsPager events={upcoming} holder={me.fullName || me.email} /></div></BottomSheet>
    </div>
    </MotionConfig>
  );
}

export default function Cuenta() {
  useSeo({ title: 'Mi cuenta — Mansion Playroom', description: 'Tus Playcoins, saldo, entradas y cupones en Mansion Playroom.', path: '/cuenta', noindex: true });
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.member.me.useQuery(undefined, { retry: false });
  const logout = trpc.member.logout.useMutation({ onSuccess: () => utils.member.invalidate() });
  const [welcome, setWelcome] = useState<LoginDone | null>(null);
  const isMobile = useIsMobile();
  // La pantalla es oscura: barra de estado y fondo oscuros mientras estás acá (sin franja blanca arriba).
  useDarkChrome();
  const shell = 'account-font account-tokens relative min-h-dvh bg-[#0b0612] text-white';

  if (isLoading) return <div className={`${shell} pt-28`}><div className="account-backdrop" /></div>;

  if (!me) {
    return (
      <div className={`${shell} pt-28 pb-16`}>
        <div className="account-backdrop" />
        <div className="container relative z-10 max-w-md">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="text-center">
              <h1 className="font-heading text-3xl font-extrabold text-white">Mi cuenta</h1>
              <p className="mt-2 text-sm text-white/65">Tu entrada, tus Playcoins y tu saldo a un toque. Entras con un código que te mandamos al correo de tu compra (o tu correo de embajador): sin contraseñas.</p>
            </div>
            <div className={`${GLASS} p-5`}>
              <MemberLogin tone="dark" onDone={setWelcome} />
            </div>
            <p className="text-center text-xs text-white/50">Es opcional: para comprar tu entrada no necesitas cuenta. ¿Aún no compras? Cuando lo hagas, ya podrás entrar con ese correo.</p>
          </motion.div>
        </div>
      </div>
    );
  }

  if (isMobile) return <AccountApp me={me} welcome={welcome} onLogout={() => logout.mutate()} />;

  return <DesktopAccount me={me} welcome={welcome} onLogout={() => logout.mutate()} shell={shell} />;
}

function DesktopAccount({ me, welcome, onLogout, shell }: { me: Me; welcome: LoginDone | null; onLogout: () => void; shell: string }) {
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
              <h1 className="font-heading text-3xl font-extrabold leading-tight text-white">Hola{firstName(me.fullName) ? `, ${firstName(me.fullName)}` : ''} 👋</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/55">
                <span className="truncate">{me.email}</span>
                {level && <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">{level.label}</span>}
              </p>
            </div>
            <button type="button" onClick={onLogout} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 interactive"><LogOut className="h-3.5 w-3.5" /> Salir</button>
          </div>

          <WelcomeBanner welcome={welcome} />
          <TicketWallet ev={upcoming[0] ?? null} holder={me.fullName || me.email} prepaidBalance={me.prepaidBalance} playcoins={me.playcoins} movements={me.movements}
            onTopup={pay.accountTopup ? () => setTopupOpen(true) : undefined} onPayCaja={pay.cajaPay ? () => setPayOpen(true) : undefined} />
          <PartyEntryCard events={upcoming} />
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
