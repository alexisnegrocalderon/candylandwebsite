import { useRoute, Link } from 'wouter';
import { motion } from 'framer-motion';
import { CalendarPlus, MapPin, Calendar, User, ShieldCheck, TicketX, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/** Página pública "Mi entrada" — a donde apunta el QR de cada ticket
 * (server/qr.ts). De solo lectura: muestra el QR, los nombres de todos los
 * asistentes asociados y los datos del evento. No marca nada como usado —
 * eso queda para la futura pantalla de staff (tarea aparte). */
export default function Ticket() {
  const [, params] = useRoute('/verificar/:ticketCode');
  const ticketCode = params?.ticketCode ?? '';
  const { data: ticket, isLoading } = trpc.tickets.getByCode.useQuery({ ticketCode }, { enabled: !!ticketCode, retry: false });

  if (isLoading) {
    return (
      <div className="min-h-dvh pt-24 pb-16 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-dvh pt-24 pb-16 flex items-center justify-center">
        <div className="container max-w-md text-center">
          <TicketX className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-2">No encontramos esta entrada</h1>
          <p className="text-muted-foreground text-sm mb-8">Revisa el link de tu email o escríbenos por Instagram si crees que es un error.</p>
          <Link href="/" className="inline-flex h-13 items-center justify-center px-8 rounded-full border border-border text-sm font-semibold hover:border-primary/50 interactive">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const eventDateText = ticket.eventDate
    ? new Date(ticket.eventDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const doorsOpenText = ticket.doorsOpen
    ? new Date(ticket.doorsOpen).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="min-h-dvh pt-20 pb-16">
      <div className="container max-w-md">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="text-center mb-6 pt-4">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
              ticket.status === 'valid' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}>
              <ShieldCheck className="w-3.5 h-3.5" />
              {ticket.status === 'valid' ? 'Entrada válida' : ticket.status === 'used' ? 'Ya utilizada' : 'Cancelada'}
            </span>
          </div>

          <div className="glass-candy rounded-3xl p-6 text-center mb-5">
            {ticket.qrImageUrl && (
              <img src={ticket.qrImageUrl} alt="Código QR de tu entrada" className="w-56 h-56 mx-auto rounded-xl bg-white p-2.5" />
            )}
            <p className="text-xs text-muted-foreground mt-4">Presenta este código QR y tu carnet en la entrada</p>
          </div>

          <div className="glass-candy rounded-2xl p-5 mb-5">
            <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-1">{ticket.eventTitle}</h1>
            <p className="text-sm text-primary font-semibold mb-4">{ticket.ticketTypeName}</p>
            <div className="space-y-2 text-sm">
              {eventDateText && (
                <p className="flex items-center gap-2 text-muted-foreground"><Calendar className="w-4 h-4 shrink-0" /> {eventDateText}{doorsOpenText && ` · ${doorsOpenText} hrs`}</p>
              )}
              {(ticket.venue || ticket.address) && (
                <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="w-4 h-4 shrink-0" /> {[ticket.venue, ticket.address].filter(Boolean).join(' — ')}</p>
              )}
            </div>

            {ticket.attendeeNames.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/40">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Asistentes</p>
                {ticket.attendeeNames.map((name, i) => (
                  <p key={i} className="flex items-center gap-2 text-sm font-semibold"><User className="w-3.5 h-3.5 text-primary shrink-0" /> {name}</p>
                ))}
              </div>
            )}

            {ticket.extras.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/40">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Incluye</p>
                <div className="space-y-1.5">
                  {ticket.extras.map((extra) => (
                    <p key={extra.name} className="flex items-center gap-2 text-sm font-semibold text-primary">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {extra.quantity > 1 ? `${extra.quantity}× ` : ''}{extra.name}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          <a
            href={`/api/calendar/${ticket.ticketCode}.ics`}
            className="btn-jelly w-full h-13 rounded-full border border-border text-sm font-semibold inline-flex items-center justify-center gap-2 interactive"
          >
            <CalendarPlus className="w-4 h-4" /> Agregar al calendario
          </a>
        </motion.div>
      </div>
    </div>
  );
}
