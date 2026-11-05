import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { formatChileTime } from '@shared/chileDate';
import { maskCode, useCountdown, type MeEvent, type MeTicket } from '@/components/site/walletParts';
import type { CoproductionLanding } from '@shared/coproduction';

/* La PlayCard de «Mi cuenta» con la cara de PLAYMORE: la entrada de la colab (negro, dorado y magenta, los dos logos)
 * y, para quien todavía no tiene entrada, la PlayCard de miembro con la invitación a comprar. Misma estética de la
 * landing y de la tarjeta de la portada, para que todo se vea de una pieza. */

const FUSE = 'linear-gradient(90deg,#ffb3e2 0%,#e477ea 22%,#d98fc6 40%,#ecc3a0 54%,#f7e7a8 66%,#d6b25e 82%,#9c7630 100%)';
const GOLD = 'linear-gradient(100deg,#9c7630 0%,#c9a24c 15%,#f7e7a8 35%,#d6b25e 55%,#9c7630 100%)';
const SURFACE = 'radial-gradient(120% 70% at 0% 0%, rgba(150,21,157,0.5), transparent 60%), radial-gradient(110% 70% at 100% 100%, rgba(214,178,94,0.24), transparent 60%), #0c0908';
const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

function Logos() {
  return (
    <span className="flex items-center gap-2.5">
      <img src="/playmore/playroom-logo.png" alt="Mansion Playroom" className="h-6 w-auto" />
      <span className="text-xs text-[#f3e9d2]/70" aria-hidden="true">×</span>
      <img src="/playmore/dalmore-logo.png" alt="Dalmore" className="h-[14px] w-auto" />
    </span>
  );
}

const Field = ({ label, value, cls = '', wrap = false }: { label: string; value: string; cls?: string; wrap?: boolean }) => (
  <div className={`min-w-0 ${cls}`}>
    <p className="text-[9px] font-semibold tracking-[0.28em] text-[#d6b25e]/80">{label}</p>
    <p className={`mt-0.5 text-[13px] font-bold tracking-[0.06em] text-[#f3e9d2] ${wrap ? 'line-clamp-2 leading-tight' : 'truncate'}`}>{value}</p>
  </div>
);

/** La entrada de PLAYMORE: titular, acceso, fecha, hora y lugar, con la cuenta regresiva o «Ya entraste». */
export function PlaymorePass({ ev, t, holder, landing }: { ev: MeEvent; t: MeTicket; holder: string; landing?: CoproductionLanding | null }) {
  const countdown = useCountdown(ev.eventDate);
  const used = t.status === 'used';
  const d = new Date(ev.eventDate);
  const fecha = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Santiago' }).replace(/\./g, '');
  const hora = formatChileTime(d);
  // El acceso comprado sin la palabra «acceso» repetida («Pareja», «Soltera»).
  const access = (t.typeName || t.kindLabel || 'Entrada').replace(/^acceso\s+/i, '');
  return (
    <article className="relative overflow-hidden rounded-[26px] border border-[#d6b25e]/45 p-5 uppercase shadow-[0_18px_50px_-18px_rgba(150,21,157,0.6)]" style={{ background: SURFACE }}>
      <div className="flex items-center justify-between gap-3">
        <Logos />
        <span className="shrink-0 rounded-full border border-[#d6b25e]/50 px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] text-[#f7e7a8]">{access}</span>
      </div>
      <p className="mt-3 text-[40px] font-extrabold leading-none tracking-[-0.01em]" style={{ background: FUSE, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{landing?.eventName ?? ev.eventTitle}</p>
      <p className="mt-1.5 whitespace-nowrap text-[9px] font-semibold tracking-[0.18em] text-[#e9d9b0]/80">UNA NOCHE. DOS MUNDOS. NINGUNA IGUAL.</p>
      {/* Perforación, como los tickets de la landing */}
      <div className="relative my-4 border-t border-dashed border-[#d6b25e]/40">
        <span className="absolute -left-[26px] -top-3 h-6 w-6 rounded-full bg-[#0b0612]" aria-hidden="true" />
        <span className="absolute -right-[26px] -top-3 h-6 w-6 rounded-full bg-[#0b0612]" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-[auto_auto_1fr] gap-x-5">
        <Field label="FECHA" value={fecha} />
        <Field label="HORA" value={hora} />
        <Field label="LUGAR" value={ev.venue || landing?.venueText || 'Nuevo spot especial'} wrap />
      </div>
      <div className="mt-3.5 flex items-end justify-between gap-3">
        <Field label="TITULAR" value={t.holderName || holder} cls="flex-1" />
        <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold tracking-[0.12em] ${used ? 'bg-emerald-400/15 text-emerald-300' : 'text-[#141210]'}`} style={used ? undefined : { background: GOLD }}>
          {used ? `✓ YA ENTRASTE${t.usedAt ? ` · ${formatChileTime(t.usedAt)}` : ''}` : countdown}
        </span>
      </div>
      <p className="mt-3 flex items-center justify-between gap-3 whitespace-nowrap text-[9px] font-semibold tracking-[0.14em] text-[#e9d9b0]/55">
        <span className="font-mono tracking-wider">{maskCode(t.ticketCode)}</span><span>ENTRADA NOMINATIVA · +21</span>
      </p>
    </article>
  );
}

/** La PlayCard de miembro (saldo y Playcoins) con la cara de PLAYMORE, para quien todavía no tiene entrada: invita a comprar. */
export function PlaymoreMemberCard({ holder, prepaidBalance, playcoins, landing, buyHref, isPreview }: {
  holder: string; prepaidBalance: number; playcoins: number; landing: CoproductionLanding; buyHref: string; isPreview: boolean;
}) {
  return (
    <article className="relative overflow-hidden rounded-[26px] border border-[#d6b25e]/45 p-5 uppercase shadow-[0_18px_50px_-18px_rgba(150,21,157,0.6)]" style={{ background: SURFACE }}>
      <div className="flex items-center justify-between gap-3">
        <Logos />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#e477ea]/50 px-2.5 py-1 text-[9px] font-bold tracking-[0.2em] text-[#ffb3e2]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e477ea]" aria-hidden="true" />{isPreview ? 'Vista previa' : 'Venta abierta'}
        </span>
      </div>
      <p className="mt-3 text-[40px] font-extrabold leading-none tracking-[-0.01em]" style={{ background: FUSE, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{landing.eventName}</p>
      <p className="mt-2 text-[11px] font-semibold tracking-[0.2em] text-[#e9d9b0]/85">{landing.dateText} · {landing.timeText} · {landing.venueText}</p>
      <div className="mt-4 grid grid-cols-[1fr_auto_auto] items-end gap-x-5 border-t border-dashed border-[#d6b25e]/40 pt-3.5">
        <Field label="TITULAR" value={holder} />
        <Field label="SALDO" value={clp(prepaidBalance)} />
        <Field label="PLAYCOINS" value={String(playcoins)} />
      </div>
      <Link href={buyHref} className="mt-4 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[12px] font-bold tracking-[0.16em] text-[#141210] shadow-[0_14px_40px_-12px_rgba(247,231,168,0.55)]" style={{ background: GOLD }}>
        COMPRAR ENTRADA <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}

/** El botón destacado de compra de PLAYMORE (menú del «+»): negro y dorado, con el nombre en degradado, la fecha y un
 * botón dorado. Con entrada ya comprada pasa a «Ver mi entrada». */
export function PlaymoreBuyButton({ landing, buyHref, isPreview, owned = false, onNavigate, onOpenTicket }: {
  landing: CoproductionLanding; buyHref: string; isPreview: boolean; owned?: boolean; onNavigate?: () => void; onOpenTicket?: () => void;
}) {
  const body = (
    <span className="flex w-full flex-col gap-1.5">
      <span className="flex items-center justify-between gap-3">
        <span className="text-[27px] font-extrabold leading-none tracking-[-0.01em]" style={{ background: FUSE, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{landing.eventName}</span>
        <span className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[11px] font-bold tracking-[0.14em] text-[#141210] shadow-[0_12px_32px_-10px_rgba(247,231,168,0.6)]" style={{ background: GOLD }}>
          {owned ? 'VER ENTRADA' : 'COMPRAR'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
      <span className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.16em] text-[#e9d9b0]/85">
        <span className="min-w-0 truncate">{landing.dateText} · {landing.timeText}</span>
        {isPreview && <span className="shrink-0 rounded-full border border-[#e477ea]/50 px-2 py-0.5 text-[8px] font-bold tracking-[0.18em] text-[#ffb3e2]">VISTA PREVIA</span>}
      </span>
    </span>
  );
  const cls = 'flex min-h-[72px] w-full items-center overflow-hidden rounded-[24px] border border-[#d6b25e]/50 px-4 py-3 text-left uppercase shadow-[0_14px_40px_-16px_rgba(150,21,157,0.7)]';
  return owned
    ? <button type="button" onClick={onOpenTicket} className={cls} style={{ background: SURFACE }} aria-label={`Ver mi entrada de ${landing.eventName}`}>{body}</button>
    : <Link href={buyHref} onClick={onNavigate} className={cls} style={{ background: SURFACE }} aria-label={`Comprar entrada para ${landing.eventName}`}>{body}</Link>;
}
