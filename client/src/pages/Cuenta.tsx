import { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Calendar, Check, Copy, Crown, Gift, LogOut, Sparkles, Ticket as TicketIcon } from 'lucide-react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { canRedeem, PLAYCOINS_MIN_REDEEM_BALANCE } from '@shared/playcoins';
import { CUSTOMER_LEVEL_META } from '@shared/customerInsights';
import { isMemberEarlyAccess } from '@shared/memberConfig';
import { WalletCard } from '@/components/wallet/WalletCard';
import { PushPrompt } from '@/components/site/PushPrompt';
import { MemberLogin, type LoginDone } from '@/components/site/MemberLogin';
import { fmtDate, fmtDateTime } from '@/lib/member';
import { firstName } from '@shared/pushText';

/* /cuenta (y /mis-puntos): «Mi cuenta» opcional. Entrar con un código al
 * correo (sin contraseña) y ver saldo, Playcoins, entradas y cupones. Nadie la
 * necesita para comprar: es para quien quiere sus beneficios. */

const KIND_LABEL: Record<string, string> = { bienvenida: 'Bienvenida', nivel: 'Por tu nivel', cumpleanos: 'Cumpleaños', manual: 'De regalo' };

function CouponCard({ c }: { c: { id: number; kind: string; title: string; code: string; validUntil: string | Date | null; status: string } }) {
  const [copied, setCopied] = useState(false);
  const live = c.status === 'disponible';
  const copy = async () => {
    try { await navigator.clipboard.writeText(c.code); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { toast.error('No se pudo copiar'); }
  };
  return (
    <div className={`rounded-2xl border p-4 ${live ? 'border-primary/40 bg-primary/5' : 'border-border opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{KIND_LABEL[c.kind] ?? 'Cupón'}</p>
          <p className="font-heading font-bold leading-snug">{c.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {c.status === 'usado' ? 'Ya lo usaste' : c.status === 'vencido' ? 'Venció' : c.validUntil ? `Vale hasta el ${fmtDate(c.validUntil)}` : ''}
          </p>
        </div>
        {live && (
          <button type="button" onClick={copy} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 font-mono text-sm font-bold tracking-wider interactive" aria-label={`Copiar el código ${c.code}`}>
            {c.code} {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {live && <p className="mt-2 text-xs text-muted-foreground">Pégalo en el campo de código al comprar tu entrada. Es personal: úsalo con el correo de tu cuenta.</p>}
    </div>
  );
}

export default function Cuenta() {
  useSeo({ title: 'Mi cuenta — Mansion Playroom', description: 'Tus Playcoins, saldo, entradas y cupones en Mansion Playroom.', path: '/cuenta', noindex: true });
  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.member.me.useQuery(undefined, { retry: false });
  const logout = trpc.member.logout.useMutation({ onSuccess: () => utils.member.invalidate() });
  const [welcome, setWelcome] = useState<LoginDone | null>(null);

  if (isLoading) return <div className="min-h-dvh pt-28" />;

  if (!me) {
    return (
      <div className="min-h-dvh pt-28 pb-16">
        <div className="container max-w-md">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="text-center">
              <h1 className="font-heading text-3xl font-extrabold">Mi cuenta</h1>
              <p className="mt-2 text-sm text-muted-foreground">Mira tus Playcoins, tu saldo, tus entradas y tus cupones. Entras con un código que te mandamos al correo de tu compra: sin contraseñas.</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <MemberLogin onDone={setWelcome} />
            </div>
            <p className="text-center text-xs text-muted-foreground">Es opcional: para comprar tu entrada no necesitas cuenta. ¿Aún no compras? Cuando lo hagas, ya podrás entrar con ese correo.</p>
          </motion.div>
        </div>
      </div>
    );
  }

  const level = CUSTOMER_LEVEL_META[me.level as keyof typeof CUSTOMER_LEVEL_META];
  const eligible = canRedeem(me.playcoins);
  const missing = Math.max(0, PLAYCOINS_MIN_REDEEM_BALANCE - me.playcoins);
  const active = me.coupons.filter((c) => c.status === 'disponible');
  const earlyOn = me.nextEvent && isMemberEarlyAccess(me.nextEvent);
  const perks = [
    me.perks.welcome && `${me.perks.welcome}% de bienvenida`,
    me.perks.recurrente && `${me.perks.recurrente}% cada mes si eres cliente recurrente`,
    me.perks.vip && `${me.perks.vip}% cada mes si eres VIP`,
    me.perks.birthday && `${me.perks.birthday}% en tu cumpleaños`,
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-dvh pt-28 pb-20">
      <div className="container max-w-lg space-y-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-heading text-3xl font-extrabold leading-tight">Hola{firstName(me.fullName) ? `, ${firstName(me.fullName)}` : ''} 👋</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="truncate">{me.email}</span>
                {level && <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${level.chip}`}>{level.label}</span>}
              </p>
            </div>
            <button type="button" onClick={() => logout.mutate()} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground interactive"><LogOut className="h-3.5 w-3.5" /> Salir</button>
          </div>

          {welcome && welcome.granted.length > 0 && (
            <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 text-sm" role="status">
              <p className="flex items-center gap-2 font-heading font-bold"><Gift className="h-4 w-4 text-primary" /> ¡Te regalamos {welcome.granted.length === 1 ? 'un cupón' : `${welcome.granted.length} cupones`}!</p>
              <p className="mt-1 text-muted-foreground">{welcome.granted.map((g) => `${g.percent}% por ${g.days} días`).join(' · ')}. Los tienes más abajo.</p>
            </div>
          )}

          {earlyOn && me.nextEvent && (
            <Link href={`/checkout/${me.nextEvent.slug}`} className="block rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 to-sky-400/10 p-4 interactive">
              <p className="flex items-center gap-2 font-heading font-bold"><Crown className="h-4 w-4 text-primary" /> Preventa para socios abierta</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{me.nextEvent.title}: compra antes que nadie hasta el {fmtDateTime(me.nextEvent.memberEarlyUntil)}.</p>
              <p className="mt-2 text-sm font-semibold text-primary">Comprar mi entrada →</p>
            </Link>
          )}

          <div className="rounded-[28px] p-6 md:p-8" style={{ background: 'radial-gradient(120% 120% at 20% 0%, #241432, #0d0712 70%)' }}>
            <WalletCard eventTitle="" eventDateShort="" holderName={me.fullName || me.email} ticketCode={null} qrImageUrl={null} prepaidBalance={me.prepaidBalance} playcoins={me.playcoins} movements={me.movements.map((m) => ({ ...m, createdAt: new Date(m.createdAt) })) as any} />
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {eligible
              ? '✅ Ya puedes canjear tus Playcoins en caja el día del evento: dile a la cajera tu correo y cuántos quieres usar.'
              : `Te faltan ${missing.toLocaleString('es-CL')} Playcoins para poder canjear (mínimo ${PLAYCOINS_MIN_REDEEM_BALANCE.toLocaleString('es-CL')}).`}
          </p>

          <PushPrompt source="puntos" />

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold"><TicketIcon className="h-4 w-4 text-primary" /> Mis entradas</h2>
            {me.events.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">No tienes entradas para próximos eventos. <Link href="/eventos" className="text-primary underline">Ver eventos</Link></p>
            ) : me.events.map((ev) => (
              <div key={ev.eventId} className="rounded-2xl border border-border bg-card p-4">
                <p className="font-heading font-bold">{ev.eventTitle}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground"><Calendar className="h-3.5 w-3.5" /> {fmtDateTime(ev.eventDate)}{ev.venue ? ` · ${ev.venue}` : ''}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ev.tickets.map((t, i) => (
                    <Link key={t.ticketCode} href={`/verificar/${t.ticketCode}`} className="rounded-full border border-primary/40 px-3.5 py-1.5 text-sm font-semibold interactive">
                      {t.status === 'used' ? '✅ ' : '🎟️ '}{t.holderName ? t.holderName.split(' ')[0] : `Entrada ${i + 1}`}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold"><Gift className="h-4 w-4 text-primary" /> Mis cupones</h2>
            {me.coupons.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Todavía no tienes cupones.{perks.length ? ' Te vamos regalando según lo que desbloqueas.' : ''}
              </p>
            ) : me.coupons.map((c) => <CouponCard key={c.id} c={c} />)}
            {active.length === 0 && me.coupons.length > 0 && <p className="text-xs text-muted-foreground">No tienes cupones disponibles ahora.</p>}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="flex items-center gap-2 font-heading text-lg font-bold"><Sparkles className="h-4 w-4 text-primary" /> Lo que tienes como miembro</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
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
