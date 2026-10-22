import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Calendar, Check, Copy, Crown, Gift, LogOut, Sparkles, Ticket as TicketIcon, ArrowRight, Download, Loader2 } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { canRedeem, PLAYCOINS_MIN_REDEEM_BALANCE } from '@shared/playcoins';
import { CUSTOMER_LEVEL_META } from '@shared/customerInsights';
import { isMemberEarlyAccess } from '@shared/memberConfig';
import { WalletCard } from '@/components/wallet/WalletCard';
import { saveTicketImage } from '@/lib/ticketImage';
import { PushPrompt } from '@/components/site/PushPrompt';
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

type MeEvent = { eventId: number; eventTitle: string; eventSlug: string; eventDate: string | Date; venue: string | null; tickets: { ticketCode: string; holderName: string | null; status: string; qrImageUrl: string | null }[] };

type Movement = { type: 'money' | 'points'; label: string; delta: number; createdAt: string | Date };

/** Lo primero que ve quien entra: su PlayCard con el QR de la entrada del próximo evento.
 * Tocar la tarjeta la guarda como imagen (Fotos) para mostrarla en la puerta o en caja sin internet. */
function TicketWallet({ ev, holder, prepaidBalance, playcoins, movements }: { ev: MeEvent | null; holder: string; prepaidBalance: number; playcoins: number; movements: Movement[] }) {
  const [i, setI] = useState(0);
  const [saving, setSaving] = useState(false);
  const t = ev ? ev.tickets[Math.min(i, ev.tickets.length - 1)] : null;
  const canSave = !!(ev && t?.qrImageUrl && t.status !== 'used');

  const save = async () => {
    if (!ev || !t?.qrImageUrl || saving) return;
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
    <div className="space-y-4">
      {ev && <EventStrip ev={ev} />}
      <div className="rounded-[28px] p-5 md:p-8" style={{ background: 'radial-gradient(120% 120% at 20% 0%, #241432, #0d0712 70%)' }}>
        <WalletCard
          eventTitle={ev?.eventTitle ?? ''}
          eventDateShort=""
          holderName={t?.holderName || holder}
          ticketCode={t?.ticketCode ?? null}
          qrImageUrl={t?.status === 'used' ? null : t?.qrImageUrl ?? null}
          prepaidBalance={prepaidBalance}
          playcoins={playcoins}
          movements={movements.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })) as any}
          onCardClick={canSave ? () => { void save(); } : undefined}
        />
        {ev && ev.tickets.length > 1 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {ev.tickets.map((x, n) => (
              <button key={x.ticketCode} type="button" onClick={() => setI(n)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold interactive ${n === i ? 'border-pink-400 bg-pink-500/20 text-white' : 'border-white/15 text-white/70'}`}>
                {x.status === 'used' ? '✅ ' : '🎟️ '}{x.holderName ? x.holderName.split(' ')[0] : `Entrada ${n + 1}`}
              </button>
            ))}
          </div>
        )}
      </div>
      {canSave && t && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { void save(); }} disabled={saving} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-sm font-bold text-white shadow-[0_0_20px_rgba(236,72,153,0.4)] interactive disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Guardar en Fotos
          </button>
          <Link href={`/verificar/${t.ticketCode}`} className="account-glass inline-flex h-12 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-white interactive">
            Ver mi entrada <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
      {canSave && <p className="text-center text-xs text-white/50">Toca tu PlayCard para guardarla: así la muestras en la puerta y en caja aunque no tengas señal.</p>}
    </div>
  );
}

/** Franja del evento: nombre, fecha y cuenta regresiva (sin el QR, que va en la PlayCard). */
function EventStrip({ ev }: { ev: MeEvent }) {
  const countdown = useCountdown(ev.eventDate);
  return (
    <div className={`rounded-3xl p-[1.5px] ${NEON_RING}`}>
      <div className="flex items-center justify-between gap-3 rounded-[23px] bg-[#0d0712]/95 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-pink-300">Tu próximo evento</p>
          <p className="truncate font-heading text-base font-extrabold text-white">{ev.eventTitle}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-white/60"><Calendar className="h-3.5 w-3.5 shrink-0" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
        </div>
        <span className="shrink-0 rounded-full bg-gradient-to-r from-pink-500 to-sky-400 px-3 py-1 text-[11px] font-bold text-white shadow-[0_0_14px_rgba(236,72,153,0.5)]">{countdown}</span>
      </div>
    </div>
  );
}

export default function Cuenta() {
  useSeo({ title: 'Mi cuenta — Mansion Playroom', description: 'Tus Playcoins, saldo, entradas y cupones en Mansion Playroom.', path: '/cuenta', noindex: true });
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.member.me.useQuery(undefined, { retry: false });
  const logout = trpc.member.logout.useMutation({ onSuccess: () => utils.member.invalidate() });
  const [welcome, setWelcome] = useState<LoginDone | null>(null);
  const shell = 'relative min-h-dvh bg-[#0b0612] text-white';

  if (isLoading) return <div className={`${shell} pt-28`}><div className="account-backdrop" /></div>;

  if (!me) {
    return (
      <div className={`${shell} pt-28 pb-16`}>
        <div className="account-backdrop" />
        <div className="container relative z-10 max-w-md">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="text-center">
              <h1 className="font-heading text-3xl font-extrabold text-white">Mi cuenta</h1>
              <p className="mt-2 text-sm text-white/65">Tu entrada, tus Playcoins y tu saldo a un toque. Entras con un código que te mandamos al correo de tu compra: sin contraseñas.</p>
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

  const level = CUSTOMER_LEVEL_META[me.level as keyof typeof CUSTOMER_LEVEL_META];
  const eligible = canRedeem(me.playcoins);
  const missing = Math.max(0, PLAYCOINS_MIN_REDEEM_BALANCE - me.playcoins);
  const pct = Math.min(100, Math.round((me.playcoins / PLAYCOINS_MIN_REDEEM_BALANCE) * 100));
  const active = me.coupons.filter((c) => c.status === 'disponible');
  const earlyOn = me.nextEvent && isMemberEarlyAccess(me.nextEvent);
  const upcoming = me.events as MeEvent[];
  const perks = [
    me.perks.welcome && `${me.perks.welcome}% de bienvenida`,
    me.perks.recurrente && `${me.perks.recurrente}% cada mes si eres cliente recurrente`,
    me.perks.vip && `${me.perks.vip}% cada mes si eres VIP`,
    me.perks.birthday && `${me.perks.birthday}% en tu cumpleaños`,
  ].filter(Boolean) as string[];

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
            <button type="button" onClick={() => logout.mutate()} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/60 interactive"><LogOut className="h-3.5 w-3.5" /> Salir</button>
          </div>

          {welcome && welcome.granted.length > 0 && (
            <div className="rounded-2xl border border-pink-400/40 bg-pink-500/10 p-4 text-sm" role="status">
              <p className="flex items-center gap-2 font-heading font-bold text-white"><Gift className="h-4 w-4 text-pink-400" /> ¡Te regalamos {welcome.granted.length === 1 ? 'un cupón' : `${welcome.granted.length} cupones`}!</p>
              <p className="mt-1 text-white/65">{welcome.granted.map((g) => `${g.percent}% por ${g.days} días`).join(' · ')}. Los tienes más abajo.</p>
            </div>
          )}

          <TicketWallet ev={upcoming[0] ?? null} holder={me.fullName || me.email} prepaidBalance={me.prepaidBalance} playcoins={me.playcoins} movements={me.movements} />

          {!upcoming[0] && me.nextEvent && (
            <Link href={`/checkout/${me.nextEvent.slug}`} className={`block rounded-[28px] p-[1.5px] ${NEON_RING} interactive`}>
              <div className="rounded-[27px] bg-[#0d0712] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-pink-300">Próximo evento</p>
                <p className="mt-1 font-heading text-xl font-extrabold text-white">{me.nextEvent.title}</p>
                <p className="mt-0.5 text-sm text-white/60">{fmtDateTime(me.nextEvent.eventDate)}</p>
                <p className="mt-3 text-sm font-semibold text-pink-300">Comprar mi entrada →</p>
              </div>
            </Link>
          )}

          {/* Avisos: bien arriba y llamativo; desaparece solo al activarlos. */}
          <PushPrompt source="puntos" tone="dark" className="shadow-[0_0_28px_rgba(236,72,153,0.22)]" />

          {earlyOn && me.nextEvent && (
            <Link href={`/checkout/${me.nextEvent.slug}`} className="block rounded-2xl border border-pink-400/40 bg-gradient-to-br from-pink-500/15 to-sky-400/10 p-4 interactive">
              <p className="flex items-center gap-2 font-heading font-bold text-white"><Crown className="h-4 w-4 text-pink-400" /> Preventa para socios abierta</p>
              <p className="mt-0.5 text-sm text-white/65">{me.nextEvent.title}: compra antes que nadie hasta el {fmtDateTime(me.nextEvent.memberEarlyUntil)}.</p>
              <p className="mt-2 text-sm font-semibold text-pink-300">Comprar mi entrada →</p>
            </Link>
          )}

          <div className={`${GLASS} p-4`}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-heading font-bold text-white">Tus Playcoins</span>
              <span className="text-white/60"><b className="text-white">{me.playcoins.toLocaleString('es-CL')}</b> / {PLAYCOINS_MIN_REDEEM_BALANCE.toLocaleString('es-CL')}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-400 to-sky-400 shadow-[0_0_12px_rgba(236,72,153,0.6)] transition-[width] duration-700" style={{ width: `${Math.max(pct, 3)}%` }} />
            </div>
            <p className="mt-2 text-sm text-white/65">
              {eligible
                ? '✅ Ya puedes canjearlos en caja el día del evento: dile a la cajera tu correo y cuántos quieres usar.'
                : `Vas en ${pct}%: te faltan ${missing.toLocaleString('es-CL')} Playcoins para poder canjear. Cada compra y cada amigo que traigas suman.`}
            </p>
          </div>

          {upcoming.length > 1 && (
            <Section icon={<TicketIcon className="h-4 w-4" />} title="Mis otras entradas">
              {upcoming.slice(1).map((ev) => (
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
            </Section>
          )}

          <Section icon={<Gift className="h-4 w-4" />} title="Mis cupones">
            {me.coupons.length === 0 ? (
              <p className="account-glass rounded-2xl p-4 text-sm text-white/55">
                Todavía no tienes cupones.{perks.length ? ' Te vamos regalando según lo que desbloqueas.' : ''}
              </p>
            ) : me.coupons.map((c) => <CouponCard key={c.id} c={c} />)}
            {active.length === 0 && me.coupons.length > 0 && <p className="text-xs text-white/50">No tienes cupones disponibles ahora.</p>}
          </Section>

          <section className={`${GLASS} p-4`}>
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-white"><Sparkles className="h-4 w-4 text-pink-400" /> Lo que tienes como miembro</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-white/65">
              <li>• Tus entradas y su QR siempre a un toque</li>
              <li>• Tus Playcoins y saldo para canjear en caja</li>
              <li>• Aviso del recordatorio del evento, preventas y novedades</li>
              {perks.map((p) => <li key={p}>• {p}</li>)}
              <li>• Preventa anticipada en los eventos que la tengan</li>
            </ul>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
