import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { saveTicketImage } from '@/lib/ticketImage';
import { fmtDateTime } from '@/lib/member';
import { formatChileTime } from '@shared/chileDate';
import { TICKET_KIND_META, type TicketKind } from '@shared/ticketKind';

/* Las piezas de las tarjetas de «Mi cuenta» (pestaña PlayCard): el pase de cada entrada o extra, la guardarropía y
 * la cocina de caja, el QR a pantalla completa y los toques «de verdad». */

/** Vibración leve al tocar (Android; Safari en iPhone no la permite a las páginas web). */
export const tapHaptic = () => { try { navigator.vibrate?.(8); } catch { /* sin vibración */ } };

export type MeTicket = {
  ticketCode: string; holderName: string | null; status: string; qrImageUrl: string | null;
  category?: string; kind?: TicketKind; kindLabel?: string; companions?: { nombre: string; rut: string }[];
  /** El código legible con que se canjea en caja (PIS-AB12-CD34). */
  displayCode?: string | null; usedAt?: string | Date | null; typeName?: string;
};
export type MeLocker = { tagNumber: string; status: string; receivedAt?: string | Date | null; retrievedAt?: string | Date | null };
export type MeKitchen = { ticketNumber: string; status: string; items: { name: string; quantity: number }[]; createdAt: string | Date; deliveredAt?: string | Date | null };
export type MeEvent = {
  eventId: number; eventTitle: string; eventSlug: string; eventDate: string | Date; venue: string | null;
  doorsOpen?: string | Date | null; eventEnd?: string | Date | null;
  tickets: MeTicket[]; lockers?: MeLocker[]; kitchen?: MeKitchen[];
};
export type Movement = { type: 'money' | 'points'; label: string; delta: number; createdAt: string | Date };

/** «Faltan 8 días», «Faltan 5 h 20 min» o «¡Es hoy!». */
export function useCountdown(date: string | Date) {
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

/** Un toque «de verdad»: tiene que empezar y terminar sobre el mismo botón, y no en el primer instante
 * de la pantalla. Al abrir la app, el toque con que se cierra la bienvenida (o se entra) caía sobre la
 * tarjeta de abajo y abría el QR solo. */
export function useRealTap(handler: () => void) {
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

export function maskCode(code: string): string {
  return code.length > 6 ? `${code.slice(0, 2)} •••• ${code.slice(-4)}` : code;
}

/** El QR a pantalla completa sobre blanco (máximo contraste para el lector de la puerta y de caja),
 * con la pantalla encendida mientras está abierto. Desde acá también se guarda en Fotos. */
export function QrViewer({ ev, t, holder, onClose }: { ev: MeEvent; t: MeTicket; holder: string; onClose: () => void }) {
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
        {t.displayCode && t.kind !== 'acceso' && <p className="mt-1 font-mono text-title3 font-bold tracking-[0.12em]">{t.displayCode}</p>}
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

const field = (label: string, value: string, cls = '') => (
  <div className={`min-w-0 ${cls}`}>
    <p className="text-caption2 font-semibold uppercase tracking-[0.16em] text-white/60">{label}</p>
    <p className="mt-0.5 truncate text-subhead font-semibold text-white">{value}</p>
  </div>
);

const RING: Record<string, string> = {
  acceso: 'from-pink-500/80 via-fuchsia-500/40 to-sky-400/80',
  estacionamiento: 'from-sky-300/80 via-blue-500/40 to-cyan-300/80',
  guardarropia: 'from-amber-300/80 via-orange-400/40 to-pink-300/80',
  cocina: 'from-emerald-300/80 via-teal-400/40 to-sky-300/80',
  extra: 'from-violet-400/80 via-fuchsia-400/40 to-pink-300/80',
};

/** El marco de todas las tarjetas: borde de color, fondo oscuro y los círculos del perforado. */
function PassShell({ ring, header, badge, children, footer }: { ring: string; header: string; badge: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className={`rounded-[26px] bg-gradient-to-br p-[1.5px] shadow-[0_24px_60px_-22px_rgba(0,0,0,0.9)] ${RING[ring] ?? RING.extra}`}>
      <div className="relative overflow-hidden rounded-[25px] bg-[#150a1e] px-5 pb-4 pt-3">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-60 w-60 rounded-full bg-pink-500/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-60 w-60 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex h-[34px] items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-6 w-6 shrink-0" />
            <span className="text-caption1 font-bold uppercase tracking-[0.2em] text-white/80">{header}</span>
          </span>
          <span className="truncate rounded-full bg-amber-200/90 px-2.5 py-1 text-caption2 font-bold uppercase tracking-wider text-[#2a1a05]">{badge}</span>
        </div>
        {children}
        {footer && (
          <>
            <div aria-hidden className="relative -mx-5 my-3 flex items-center [@media(max-height:700px)]:hidden">
              <span className="-ml-2 h-4 w-4 rounded-full bg-[#0b0612]" />
              <span className="h-px flex-1 border-t border-dashed border-white/20" />
              <span className="-mr-2 h-4 w-4 rounded-full bg-[#0b0612]" />
            </div>
            <div className="relative flex items-center justify-between gap-3 text-caption1 [@media(max-height:700px)]:hidden">{footer}</div>
          </>
        )}
      </div>
    </div>
  );
}

const pill = (cls: string, text: string) => <span className={`shrink-0 rounded-full px-3 py-1 text-caption1 font-bold ${cls}`}>{text}</span>;
const PILL_OK = 'bg-emerald-400/15 text-emerald-300';
const PILL_WAIT = 'bg-gradient-to-r from-pink-500 to-sky-400 text-white shadow-[0_0_16px_rgba(236,72,153,0.45)]';

/** La tarjeta de una entrada o de un extra con QR (estacionamiento, piscolón, regalo, guardarropía del web…):
 * evento, fecha, titular y estado. Los extras muestran además el código legible con que se canjean en caja y
 * si ya se canjearon. Tocarla no hace nada: el QR se abre solo con el botón «Mostrar QR». */
export function TicketPass({ ev, t, holder }: { ev: MeEvent; t: MeTicket; holder: string }) {
  const countdown = useCountdown(ev.eventDate);
  const kind = t.kind ?? 'acceso';
  const meta = TICKET_KIND_META[kind];
  const used = t.status === 'used';
  const d = new Date(ev.eventDate);
  const fecha = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (kind === 'acceso') {
    return (
      <PassShell ring="acceso" header="Entrada" badge={`${meta.emoji} ${t.kindLabel ?? meta.label}`}
        footer={<><span className="shrink-0 whitespace-nowrap font-mono tracking-wider text-white/60">{maskCode(t.ticketCode)}</span><span className="truncate text-white/60">{meta.where}</span></>}>
        <p className="relative mt-3 line-clamp-2 text-title1 font-bold leading-[1.08] tracking-tight [@media(max-height:700px)]:mt-1.5 [@media(max-height:700px)]:line-clamp-1 [@media(max-height:700px)]:text-title3">{ev.eventTitle}</p>
        <div className="relative mt-3.5 grid grid-cols-[auto_auto_1fr] gap-x-5 [@media(max-height:700px)]:mt-2.5">
          {field('Fecha', fecha)}
          {field('Hora', hora)}
          {field('Lugar', ev.venue || 'Mansión PlayRoom')}
        </div>
        <div className="relative mt-3 flex items-end justify-between gap-3 [@media(max-height:700px)]:mt-2">
          {field('Titular', t.holderName || holder, 'flex-1')}
          {pill(used ? PILL_OK : PILL_WAIT, used ? `✓ Ya entraste${t.usedAt ? ` · ${formatChileTime(t.usedAt)}` : ''}` : countdown)}
        </div>
        {/* Quienes vienen con el titular: nombre y documento, para no perder esos datos. */}
        {t.companions && t.companions.length > 0 && (
          <div className="relative mt-3 [@media(max-height:700px)]:mt-2">
            <p className="text-caption2 font-semibold uppercase tracking-[0.16em] text-white/60">{t.companions.length > 1 ? 'Acompañantes' : 'Acompañante'}</p>
            {t.companions.map((c) => (
              <p key={c.rut} className="mt-0.5 flex items-baseline justify-between gap-3 text-subhead font-semibold text-white"><span className="min-w-0 truncate">{c.nombre}</span><span className="shrink-0 font-mono text-footnote font-normal text-white/60">{c.rut}</span></p>
            ))}
          </div>
        )}
      </PassShell>
    );
  }

  // Extras: el producto es el protagonista; el evento y la fecha van chicos.
  const product = kind === 'estacionamiento' ? 'Estacionamiento' : t.typeName?.trim() || t.kindLabel || meta.label;
  const paidAtDoor = kind === 'estacionamiento' && used && !t.qrImageUrl;
  const state = used
    ? pill(PILL_OK, paidAtDoor ? '✓ Ya cobrado en la puerta' : `✓ Canjeado${t.usedAt ? ` · ${formatChileTime(t.usedAt)}` : ''}`)
    : pill('bg-amber-300/90 text-[#2a1a05]', 'Pendiente de canjear');
  return (
    <PassShell ring={kind} header={meta.short} badge={`${meta.emoji} ${meta.label}`}
      footer={<><span className="shrink-0 whitespace-nowrap font-mono tracking-wider text-white/60">{maskCode(t.ticketCode)}</span><span className="truncate text-white/60">{meta.where}</span></>}>
      <p className="relative mt-3 line-clamp-2 text-title1 font-bold leading-[1.08] tracking-tight [@media(max-height:700px)]:mt-1.5 [@media(max-height:700px)]:text-title3">{product}</p>
      <p className="relative mt-1 truncate text-subhead text-white/70">{ev.eventTitle} · {fecha}, {hora}</p>
      {t.displayCode && !paidAtDoor && (
        <div className="relative mt-4 rounded-2xl bg-white/[0.07] px-4 py-3 text-center [@media(max-height:700px)]:mt-2.5 [@media(max-height:700px)]:py-2">
          <p className="text-caption2 font-semibold uppercase tracking-[0.18em] text-white/60">Código para canjear en caja</p>
          <p className={`mt-1 font-mono text-title2 font-bold tracking-[0.1em] ${used ? 'text-white/40 line-through decoration-white/30' : 'text-white'}`}>{t.displayCode}</p>
        </div>
      )}
      <div className="relative mt-3 flex items-end justify-between gap-3 [@media(max-height:700px)]:mt-2">
        {field('Titular', t.holderName || holder, 'flex-1')}
        {state}
      </div>
    </PassShell>
  );
}

const LOCKER_STATE: Record<string, string> = { pendiente: 'Entrega tu abrigo en la guardarropía', guardado: 'Guardado', retirado: 'Retirado' };

/** El abrigo que la caja le guardó: el número de percha y en qué va. */
export function LockerPass({ ev, locker }: { ev: MeEvent; locker: MeLocker }) {
  const meta = TICKET_KIND_META.guardarropia;
  const done = locker.status === 'retirado';
  const when = done ? locker.retrievedAt : locker.status === 'guardado' ? locker.receivedAt : null;
  return (
    <PassShell ring="guardarropia" header="Guardarropía" badge={`${meta.emoji} ${meta.label}`}>
      <p className="relative mt-3 text-center text-caption1 font-semibold uppercase tracking-[0.2em] text-white/60">Tu percha</p>
      <p className="relative text-center text-[64px] font-extrabold leading-none tracking-tight text-white [@media(max-height:700px)]:text-[48px]">N° {locker.tagNumber}</p>
      <p className="relative mt-2 truncate text-center text-subhead text-white/70">{ev.eventTitle}</p>
      <div className="relative mt-3 flex justify-center">{pill(done ? PILL_OK : 'bg-amber-300/90 text-[#2a1a05]', `${LOCKER_STATE[locker.status] ?? locker.status}${when ? ` · ${formatChileTime(when)}` : ''}`)}</div>
    </PassShell>
  );
}

const KITCHEN_STATE: Record<string, string> = { pendiente: 'En la cola de cocina', aprobado: 'Se está preparando', entregado: 'Entregado' };

/** El pedido de cocina de la caja: número de comanda, qué pidió y en qué va. */
export function KitchenPass({ ev, order }: { ev: MeEvent; order: MeKitchen }) {
  const done = order.status === 'entregado';
  return (
    <PassShell ring="cocina" header="Cocina" badge="🍔 Tu pedido">
      <p className="relative mt-3 text-center text-caption1 font-semibold uppercase tracking-[0.2em] text-white/60">Comanda</p>
      <p className="relative text-center text-[56px] font-extrabold leading-none tracking-tight text-white [@media(max-height:700px)]:text-[44px]">{order.ticketNumber}</p>
      <ul className="relative mt-3 space-y-0.5 text-center text-subhead text-white/80">
        {order.items.map((i, n) => <li key={n}>{i.quantity}× {i.name}</li>)}
      </ul>
      <p className="relative mt-1 truncate text-center text-footnote text-white/60">{ev.eventTitle}</p>
      <div className="relative mt-3 flex justify-center">{pill(done ? PILL_OK : 'bg-amber-300/90 text-[#2a1a05]', `${KITCHEN_STATE[order.status] ?? order.status}${done && order.deliveredAt ? ` · ${formatChileTime(order.deliveredAt)}` : ''}`)}</div>
    </PassShell>
  );
}

/** Cómo se llama cada entrada en el selector: el primer nombre, y si se repite (varias a nombre de
 * quien compró) se numeran: «Alexis 1», «Alexis 2». */
export function holderLabels(list: { holderName: string | null; kind?: TicketKind }[]): string[] {
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
