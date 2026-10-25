import { Calendar, CalendarClock } from 'lucide-react';

/* Portada del link de la comunidad en la app: quién te invita, la fiesta, la cuenta regresiva y lo
 * importante en filas de vidrio. El precio especial NO sale acá: se ve recién después de validar el
 * correo y el documento (ver partner.checkEligibility). */

const NEON_RING = 'bg-gradient-to-br from-pink-500/70 via-fuchsia-400/40 to-sky-400/70';

type Fact = { emoji: string; title: string; text: string };

function facts(edadMinima: number): Fact[] {
  return [
    { emoji: '🎧', title: 'Pista 1 · Tech', text: 'El B2B de Aldo Medel y German Courtin, toda la noche.' },
    { emoji: '🔥', title: 'Pista 2', text: 'El mejor perreo y bailable para no parar.' },
    { emoji: '🚗', title: 'Estacionamiento privado', text: 'Dentro del recinto, con cupos limitados: lo reservas al final de la compra.' },
    { emoji: '🍔', title: 'Comida y barra', text: 'Stand de comida, tiendas y barra completa toda la noche.' },
    { emoji: '🛡️', title: 'Un espacio seguro', text: 'Respeto y consentimiento son la regla. Nada es obligatorio.' },
    { emoji: '🎭', title: 'Disfraz obligatorio', text: 'Es Halloween y nuestro aniversario.' },
    { emoji: '🪪', title: `Evento +${edadMinima}`, text: 'Trae tu carnet o pasaporte.' },
  ];
}

function daysLeft(date: string | Date | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.ceil((t - now.getTime()) / 86_400_000);
  return days >= 0 ? days : null;
}

export function PartnerIntro({ emoji, label, inviter, eventTitle, eventDate, edadMinima }: {
  emoji: string; label: string;
  /** Quién compartió el link («Aldo Medel»), si la firma del link es conocida. */
  inviter: string | null;
  eventTitle: string; eventDate: string | Date | null | undefined; edadMinima: number;
}) {
  const days = daysLeft(eventDate);
  const dateLabel = eventDate ? new Date(eventDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Santiago' }) : null;
  return (
    <div className="space-y-4">
      <div className={`rounded-[28px] p-[1.5px] ${NEON_RING}`}>
        <div className="rounded-[27px] bg-[#0d0712]/90 px-5 pb-5 pt-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-caption1 font-semibold uppercase tracking-[0.14em] text-pink-200">{emoji} {label}</span>
          {inviter && <p className="mt-3 text-subhead text-white/70">Te invita <b className="text-white">{inviter}</b></p>}
          <h1 className="mt-2 text-large-title font-bold leading-tight tracking-tight">Pista Tech</h1>
          <p className="mt-1 text-subhead text-white/65">B2B Aldo Medel x German Courtin</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {dateLabel && <span className="account-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-footnote font-semibold first-letter:uppercase"><Calendar className="h-3.5 w-3.5 text-pink-300" /> {dateLabel}</span>}
            {days != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-pink-500 to-sky-400 px-3 py-1.5 text-footnote font-bold text-white">
                <CalendarClock className="h-3.5 w-3.5" /> {days === 0 ? '¡Es hoy!' : days === 1 ? 'Falta 1 día' : `Faltan ${days} días`}
              </span>
            )}
          </div>
          <p className="mt-3 text-footnote text-white/50">{eventTitle}</p>
        </div>
      </div>

      <p className="px-1 text-subhead leading-relaxed text-white/75">
        Esta invitación es para ti, que vienes de la escena electrónica y quizás nunca has estado en una fiesta de Playroom. Te contamos lo importante:
      </p>

      <div className="account-glass divide-y divide-white/[0.08] overflow-hidden rounded-[22px]">
        {facts(edadMinima).map((f) => (
          <div key={f.title} className="flex items-start gap-3 px-4 py-3">
            <span className="mt-0.5 text-xl" aria-hidden>{f.emoji}</span>
            <p className="min-w-0 text-subhead leading-snug"><b className="block text-white">{f.title}</b><span className="text-white/65">{f.text}</span></p>
          </div>
        ))}
      </div>

      <p className="px-4 text-center text-footnote text-white/50">Con tu correo y tu documento revisamos tu acceso y recién ahí ves tu precio especial de comunidad.</p>
    </div>
  );
}
