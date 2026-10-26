import { useState } from 'react';
import { Link } from 'wouter';
import { toast } from 'sonner';
import { ArrowRight, BadgeCheck, BookOpenCheck, Check, ChevronDown, Clock, Copy, KeyRound, Link2, MapPin, MessageCircle, Phone, Shirt, Wrench } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { pinProblem } from '@shared/staffCargos';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../../../server/routers';
import { formatChileDate, formatChileTime } from '@shared/chileDate';
import { dialable } from '@shared/staffPortal';
import { useAmbassadorPanel } from './AmbassadorAccount';

/* La versión de la app para el staff: quien entra a «Mi cuenta» con el correo
 * que se cargó en Admin → Noche → Staff ve su credencial con QR (la puerta la
 * reconoce y anota su llegada), su próximo turno con la hora de citación, la
 * info del evento (lo general y lo de su rol), a quién llamar, sus herramientas
 * y sus turnos con lo que se le paga. */

export type StaffPortal = NonNullable<inferRouterOutputs<AppRouter>['member']['staff']>;
type Shift = StaffPortal['shifts'][number];

export function useStaffPortal(): StaffPortal | null {
  const { data } = trpc.member.staff.useQuery(undefined, { retry: false, staleTime: 60_000 });
  return data ?? null;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const dayLabel = (d: Date | string | null) => (d ? formatChileDate(d, { withWeekday: true }) : 'Fecha por confirmar');

/** El próximo turno (el de la credencial). */
export function nextShift(staff: StaffPortal): Shift | null {
  return staff.shifts.find((s) => s.eventId === staff.credential?.eventId) ?? null;
}

/** Fila corta para la portada de la app: el turno que viene y el acceso a la credencial. */
export function StaffBanner({ staff, onOpen }: { staff: StaffPortal; onOpen: () => void }) {
  const next = nextShift(staff);
  if (!next) return null;
  return (
    <button type="button" onClick={onOpen} className="block w-full shrink-0 rounded-[22px] bg-gradient-to-r from-violet-400/70 via-fuchsia-400/50 to-sky-400/60 p-[1.5px] text-left interactive">
      <span className="flex items-center gap-3 rounded-[21px] bg-[#0d0712] px-3.5 py-2.5">
        <span className="rounded-full bg-violet-300 px-2 py-0.5 text-caption2 font-extrabold tracking-[0.15em] text-black">STAFF</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-subhead font-bold leading-tight">{next.title}</span>
          <span className="block truncate text-footnote text-white/60">{next.callTime ? `Citación ${next.callTime} · ` : ''}Ver mi credencial</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0 text-violet-300" />
      </span>
    </button>
  );
}

/** DJ y RRPP: su link y su código, con lo que han vendido. Cada compra con el link queda a su nombre. */
function SalesLinkCard() {
  const panel = useAmbassadorPanel();
  const [done, setDone] = useState<string | null>(null);
  if (!panel?.salesOnly) return null;
  const copy = (key: string, text: string) => { void navigator.clipboard.writeText(text).then(() => { setDone(key); setTimeout(() => setDone(null), 2000); }).catch(() => {}); };
  const total = panel.sales?.length ?? 0;
  const event = panel.stats?.eventSales ?? 0;
  return (
    <Block icon={<Link2 className="h-4 w-4" />} title="Tu link de ventas">
      <p className="text-subhead text-white/80">Compártelo en tus redes o por WhatsApp: cada entrada que se compre con tu link queda a tu nombre.</p>
      {panel.referralUrl && (
        <button type="button" onClick={() => copy('link', panel.referralUrl!)} className="mt-3 flex w-full min-w-0 items-center justify-between gap-2 rounded-2xl bg-white/[0.08] px-4 py-3 text-left interactive">
          <span className="min-w-0"><span className="block text-caption2 text-white/55">{done === 'link' ? '¡Copiado!' : 'Tu link'}</span><span className="block truncate text-subhead font-semibold">{panel.referralUrl}</span></span>
          {done === 'link' ? <Check className="h-4 w-4 shrink-0 text-emerald-300" /> : <Copy className="h-4 w-4 shrink-0 text-white/60" />}
        </button>
      )}
      <button type="button" onClick={() => copy('code', panel.code)} className="mt-2 flex w-full items-center justify-between gap-2 rounded-2xl bg-white/[0.08] px-4 py-3 text-left interactive">
        <span><span className="block text-caption2 text-white/55">{done === 'code' ? '¡Copiado!' : 'Tu código (para decirlo en persona)'}</span><span className="block font-mono text-subhead font-semibold">{panel.code}</span></span>
        {done === 'code' ? <Check className="h-4 w-4 shrink-0 text-emerald-300" /> : <Copy className="h-4 w-4 shrink-0 text-white/60" />}
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-white/[0.06] px-2 py-2.5"><p className="text-title3 font-bold leading-none">{event}</p><p className="mt-1 text-caption2 text-white/55">ventas{panel.stats?.eventTitle ? ` · ${panel.stats.eventTitle}` : ' de esta fiesta'}</p></div>
        <div className="rounded-2xl bg-white/[0.06] px-2 py-2.5"><p className="text-title3 font-bold leading-none">{total}</p><p className="mt-1 text-caption2 text-white/55">ventas en total</p></div>
      </div>
    </Block>
  );
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="account-glass rounded-[24px] p-4">
      <h3 className="mb-2 flex items-center gap-2 text-footnote font-semibold uppercase tracking-wider text-white/55">{icon}{title}</h3>
      {children}
    </section>
  );
}

/** El manual: el reglamento general y el de su cargo, con «Leí y acepto» (queda guardada la versión, la fecha y la hora). */
function StaffManualCard() {
  const utils = trpc.useUtils();
  const { data } = trpc.member.staffManual.useQuery(undefined, { retry: false, staleTime: 60_000 });
  const [open, setOpen] = useState<string | null>(null);
  const accept = trpc.member.staffManualAccept.useMutation({
    onSuccess: () => { toast.success('Listo: quedó registrado que leíste y aceptaste.'); utils.member.staffManual.invalidate(); },
    onError: (e) => toast.error(e.message || 'No se pudo guardar'),
  });
  if (!data || data.documents.length === 0) return null;
  const done = data.status === 'al_dia';
  return (
    <Block icon={<BookOpenCheck className="h-4 w-4" />} title="Tu manual">
      <p className="mb-3 text-subhead text-white/80">
        {data.status === 'desactualizado' ? 'Hubo cambios en tu manual. Léelos y vuelve a aceptar.' : done ? 'Aceptaste el manual vigente. Tenlo a mano cuando lo necesites.' : 'Léelo con calma antes de la fiesta y toca «Leí y acepto».'}
      </p>
      <div className="space-y-2">
        {data.documents.map((d) => {
          const isOpen = open === d.key;
          const stale = d.acceptedVersion == null ? 'Nuevo' : d.acceptedVersion < d.version ? 'Con cambios' : null;
          return (
            <div key={d.key} className="rounded-2xl bg-white/[0.06]">
              <button type="button" onClick={() => setOpen(isOpen ? null : d.key)} aria-expanded={isOpen} className="flex w-full items-center gap-2 px-4 py-3 text-left interactive">
                <span className="min-w-0 flex-1 truncate text-subhead font-semibold">{d.title}</span>
                {stale && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-caption2 font-bold text-amber-200">{stale}</span>}
                <ChevronDown className={`h-4 w-4 shrink-0 text-white/60 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="space-y-4 px-4 pb-4">
                  {d.changeNote && stale === 'Con cambios' && <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-footnote text-amber-100">Qué cambió: {d.changeNote}</p>}
                  {d.sections.map((sec, i) => (
                    <div key={i}>
                      <p className="text-caption1 font-semibold uppercase tracking-wider text-violet-200">{sec.title}</p>
                      {sec.kind === 'text'
                        ? <p className="mt-1 whitespace-pre-line text-subhead leading-relaxed text-white/85">{sec.text}</p>
                        : <ul className="mt-1 space-y-1.5">{sec.items.map((it, j) => <li key={j} className="flex items-start gap-2 text-subhead text-white/85"><Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />{it}</li>)}</ul>}
                    </div>
                  ))}
                  <p className="text-caption2 text-white/50">Versión {d.version}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {done
        ? <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-footnote font-semibold text-emerald-300"><BadgeCheck className="h-4 w-4" /> Manual aceptado</p>
        : (
          <button type="button" disabled={accept.isPending} onClick={() => accept.mutate()} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 text-headline font-bold text-black interactive disabled:opacity-60">
            {accept.isPending ? 'Guardando…' : 'Leí y acepto'}
          </button>
        )}
    </Block>
  );
}

/** El PIN con que entra a su pantalla de trabajo: lo elige la persona, nadie más lo conoce. */
function StaffPinCard({ pin }: { pin: NonNullable<StaffPortal['pin']> }) {
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState(!pin.set);
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const save = trpc.member.staffSetPin.useMutation({
    onSuccess: () => { toast.success(pin.set ? 'PIN cambiado' : 'PIN creado: ya puedes entrar a tu pantalla'); setValue(''); setConfirm(''); setEditing(false); utils.member.staff.invalidate(); },
    onError: (e) => toast.error(e.message || 'No se pudo guardar el PIN'),
  });
  const problem = value ? pinProblem(value) : null;
  const mismatch = confirm.length >= value.length && confirm !== value;
  const ready = !!value && !problem && confirm === value;
  const field = 'h-12 w-full rounded-2xl bg-white/[0.08] px-4 text-center font-mono text-title3 tracking-[0.5em] outline-none placeholder:tracking-normal placeholder:text-white/35 focus:bg-white/[0.12]';
  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);
  return (
    <Block icon={<KeyRound className="h-4 w-4" />} title="Tu PIN de trabajo">
      {!editing ? (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-subhead text-white/80">PIN creado. Con él entras a tu pantalla la noche del evento.</p>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-footnote font-semibold interactive">Cambiar</button>
        </div>
      ) : (
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (ready) save.mutate({ pin: value }); }}>
          <p className="text-subhead text-white/75">{pin.set ? 'Elige tu PIN nuevo.' : 'Crea tu PIN de 4 a 6 números. Lo vas a usar para entrar a tu pantalla (caja, puerta…). No se lo des a nadie.'}</p>
          <input type="password" inputMode="numeric" autoComplete="new-password" aria-label="PIN nuevo" placeholder="PIN" className={field} value={value} onChange={(e) => setValue(digits(e.target.value))} />
          <input type="password" inputMode="numeric" autoComplete="new-password" aria-label="Repite el PIN" placeholder="Repítelo" className={field} value={confirm} onChange={(e) => setConfirm(digits(e.target.value))} />
          {(problem || (value && mismatch)) && <p className="text-footnote text-amber-300">{problem ?? 'Los PIN no coinciden.'}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={!ready || save.isPending} className="h-12 flex-1 rounded-full bg-gradient-to-r from-violet-400 to-fuchsia-400 text-subhead font-bold text-black disabled:opacity-50">{save.isPending ? 'Guardando…' : pin.set ? 'Cambiar PIN' : 'Crear PIN'}</button>
            {pin.set && <button type="button" onClick={() => { setEditing(false); setValue(''); setConfirm(''); }} className="h-12 rounded-full bg-white/10 px-5 text-subhead font-semibold">Cancelar</button>}
          </div>
        </form>
      )}
    </Block>
  );
}

export function StaffAccount({ staff }: { staff: StaffPortal }) {
  const hasCaja = staff.tools.some((t) => t.key === 'caja');
  const { data: device } = trpc.caja.deviceStatus.useQuery(undefined, { enabled: hasCaja, retry: false, staleTime: 300_000 });
  const cajaHere = !!device?.enrolled;
  const next = nextShift(staff);
  const past = staff.shifts.filter((s) => s !== next);
  const mapsHref = next?.address || next?.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([next.venue, next.address].filter(Boolean).join(', '))}` : null;

  return (
    <div className="space-y-3">
      {/* Credencial: la puerta la escanea y sabe quién es (también sin señal). */}
      <div className="rounded-[28px] bg-gradient-to-br from-violet-400/80 via-fuchsia-400/50 to-sky-400/70 p-[1.5px]">
        <div className="rounded-[27px] bg-[#120a1c] px-5 pb-5 pt-4 text-center">
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-violet-300 px-3 py-1 text-caption1 font-extrabold tracking-[0.2em] text-black">STAFF</span>
            <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-8 w-8" />
          </div>
          <p className="mt-3 text-title1 font-bold leading-tight">{staff.name}</p>
          <p className="text-callout font-semibold text-violet-200">{staff.cargo?.emoji ? `${staff.cargo.emoji} ` : ''}{staff.role || 'Equipo'}</p>
          {staff.credential && next ? (
            <>
              <p className="mt-1 text-footnote text-white/60">{next.title} · {dayLabel(next.eventDate)}</p>
              <div className="mx-auto mt-4 w-full max-w-[240px] rounded-3xl bg-white p-3">
                <img src={staff.credential.qrImageUrl ?? ''} alt="QR de tu credencial de staff" className="block aspect-square w-full" />
              </div>
              <p className="mt-2 font-mono text-caption2 tracking-wider text-white/40">{staff.credential.code}</p>
              {next.arrivedAt
                ? <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-footnote font-semibold text-emerald-300"><BadgeCheck className="h-4 w-4" /> Llegaste a las {formatChileTime(next.arrivedAt)}</p>
                : <p className="mt-3 text-footnote text-white/65">Muéstralo en la puerta al llegar: así queda anotada tu llegada.</p>}
            </>
          ) : (
            <p className="mt-4 text-subhead text-white/65">No tienes turnos próximos. Cuando te asignen a una fiesta, tu credencial aparece acá.</p>
          )}
        </div>
      </div>

      <StaffManualCard />

      {next && (
        <Block icon={<Clock className="h-4 w-4" />} title="Tu próximo turno">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-headline font-bold leading-tight">{next.title}</p>
              <p className="text-footnote text-white/60">{dayLabel(next.eventDate)}</p>
            </div>
            {next.callTime && (
              <div className="shrink-0 text-right">
                <p className="text-caption2 uppercase tracking-wider text-white/50">Citación</p>
                <p className="text-title1 font-bold leading-none tabular-nums text-violet-200">{next.callTime}</p>
              </div>
            )}
          </div>
          {next.doorsOpen && <p className="mt-2 text-footnote text-white/60">Abren las puertas a las {formatChileTime(next.doorsOpen)}</p>}
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3 py-2.5 text-subhead interactive">
              <MapPin className="h-4 w-4 shrink-0 text-pink-300" />
              <span className="min-w-0 flex-1 truncate">{[next.venue, next.address].filter(Boolean).join(' · ')}</span>
              <span className="shrink-0 text-footnote font-semibold text-pink-300">Cómo llegar</span>
            </a>
          )}
          {next.dressCode && (
            <p className="mt-2 flex items-start gap-2 text-subhead text-white/80"><Shirt className="mt-0.5 h-4 w-4 shrink-0 text-pink-300" /> {next.dressCode}</p>
          )}
        </Block>
      )}

      {next && (next.general || next.roleNote) && (
        <Block icon={<span aria-hidden>📌</span>} title="Info importante">
          {next.general && <p className="whitespace-pre-line text-subhead leading-relaxed text-white/85">{next.general}</p>}
          {next.roleNote && (
            <div className={`${next.general ? 'mt-3' : ''} rounded-2xl border border-violet-300/25 bg-violet-400/10 p-3`}>
              <p className="text-caption1 font-semibold uppercase tracking-wider text-violet-200">Para {staff.role}</p>
              <p className="mt-1 whitespace-pre-line text-subhead leading-relaxed text-white/85">{next.roleNote}</p>
            </div>
          )}
        </Block>
      )}

      {next && (next.contacts?.length ?? 0) > 0 && (
        <Block icon={<Phone className="h-4 w-4" />} title="Contactos de la noche">
          <div className="divide-y divide-white/10">
            {next.contacts!.map((c, i) => (
              <div key={i} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-subhead font-semibold">{c.label || c.phone}</p>
                  {c.label && <p className="truncate text-footnote text-white/55">{c.phone}</p>}
                </div>
                {c.phone && <>
                  <a href={`tel:${dialable(c.phone)}`} aria-label={`Llamar a ${c.label || c.phone}`} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 interactive"><Phone className="h-4 w-4" /></a>
                  <a href={`https://wa.me/${dialable(c.phone).replace('+', '')}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${c.label || c.phone}`} className="grid h-10 w-10 place-items-center rounded-full bg-emerald-500/20 text-emerald-300 interactive"><MessageCircle className="h-4 w-4" /></a>
                </>}
              </div>
            ))}
          </div>
        </Block>
      )}

      <SalesLinkCard />

      {staff.pin && <StaffPinCard pin={staff.pin} />}

      {staff.tools.length > 0 && (
        <Block icon={<Wrench className="h-4 w-4" />} title="Tus herramientas">
          <div className="grid grid-cols-2 gap-2">
            {staff.tools.map((t) => t.key === 'caja' && !cajaHere ? (
              // La caja solo abre en los equipos enrolados de la barra: en un celular personal no se manda a una pantalla de error.
              <div key={t.key} className="flex min-h-14 items-center gap-2 rounded-2xl bg-white/[0.04] px-3 py-2 text-subhead font-semibold text-white/70">
                <span className="text-xl" aria-hidden>{t.emoji}</span>
                <span className="min-w-0 leading-tight">{t.label}<span className="block text-caption2 font-normal text-white/50">En el equipo de la barra</span></span>
              </div>
            ) : (
              <Link key={t.key} href={t.href} className="flex h-14 items-center gap-2 rounded-2xl bg-white/[0.07] px-3 text-subhead font-semibold interactive">
                <span className="text-xl" aria-hidden>{t.emoji}</span> {t.label}
              </Link>
            ))}
          </div>
          <p className="mt-2 text-caption1 text-white/50">{staff.pin && !staff.pin.set ? 'Primero crea tu PIN: con él entras.' : 'Entras con tu PIN de trabajo.'}</p>
        </Block>
      )}

      {staff.shifts.length > 0 && (
        <Block icon={<span aria-hidden>🗓️</span>} title="Mis turnos">
          <div className="divide-y divide-white/10">
            {(next ? [next, ...past] : past).map((s) => (
              <div key={s.eventId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-subhead font-semibold">{s.title}</p>
                  <p className="truncate text-footnote text-white/55">{dayLabel(s.eventDate)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-subhead font-semibold tabular-nums">{money(s.netClp)}</p>
                  <p className={`text-caption2 font-semibold ${s.upcoming ? 'text-violet-200' : s.paid ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {s.upcoming ? 'Próximo' : s.paid ? 'Pagado' : 'Por pagar'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}
