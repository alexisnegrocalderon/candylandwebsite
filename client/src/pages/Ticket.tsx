import { useEffect, useRef, useState } from 'react';
import { useRoute, Link } from 'wouter';
import { motion } from 'framer-motion';
import { CalendarPlus, MapPin, Calendar, ShieldCheck, TicketX, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { MARCA } from '@/config/candyland';
import { useSeo } from '@/hooks/useSeo';
import { canEnterParty, isPartyWindowOpen } from '@shared/party';
import { toast } from 'sonner';
import { rememberTicketCode } from '@/lib/lastTicketCode';
import { WalletCard } from '@/components/wallet/WalletCard';
import { TopupPanel } from '@/components/wallet/TopupPanel';
import { AddonPanel } from '@/components/wallet/AddonPanel';
import './Ticket.wallet.css';

/** Página pública "Mi entrada" / tarjeta digital — a donde apunta el QR de
 * cada ticket (server/qr.ts). De solo lectura: muestra el QR, el saldo y
 * Playcoins reales del comprador (si tiene cuenta ligada por email), los
 * asistentes y los datos del evento. No marca nada como usado — eso queda
 * para la futura pantalla de staff (tarea aparte). */
export default function Ticket() {
  const [, params] = useRoute('/verificar/:ticketCode');
  const ticketCode = params?.ticketCode ?? '';
  useSeo({
    title: 'Mi tarjeta — Mansion Playroom',
    description: 'Tu tarjeta digital de acceso, saldo y puntos para las fiestas de Mansion Playroom.',
    path: `/verificar/${ticketCode}`,
    noindex: true,
  });
  // Al volver de pagar un extra en Mercado Pago (?extra=ok|pending|error) el
  // pago se confirma por el webhook unos segundos después: se refresca la tarjeta
  // cada 4 s, hasta 90 s, para que el extra aparezca solo en "Incluye".
  const [extraStatus] = useState(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('extra')));
  const [watching, setWatching] = useState(extraStatus === 'ok' || extraStatus === 'pending');
  useEffect(() => {
    if (!watching) return;
    const t = setTimeout(() => setWatching(false), 90_000);
    return () => clearTimeout(t);
  }, [watching]);
  const { data: ticket, isLoading } = trpc.tickets.getByCode.useQuery(
    { ticketCode },
    {
      enabled: !!ticketCode,
      retry: false,
      // Esta es la pantalla que la persona le muestra al anfitrión en la
      // puerta. Mientras la entrada siga válida y la fiesta esté abierta, se
      // consulta cada 5s (solo con la pestaña a la vista) para que en cuanto
      // escaneen el QR aparezca "Entrar a Playmatch" sin recargar nada.
      refetchInterval: (query) => {
        if (watching) return 4000;
        const t = query.state.data;
        if (t?.status === 'valid' && t.eventDate
          && isPartyWindowOpen({ eventDate: t.eventDate, doorsOpen: t.doorsOpen, eventEnd: t.eventEnd })) return 5000;
        return false;
      },
    },
  );
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!ticket) return;
    if (prevStatus.current === 'valid' && ticket.status === 'used') {
      toast.success('¡Ya estás adentro! 🍬 Entra a Playmatch y conoce gente.', { duration: 8000 });
    }
    prevStatus.current = ticket.status;
  }, [ticket?.status]);
  const { data: addonView } = trpc.playcardTopup.getAddonOptions.useQuery({ ticketCode }, { enabled: !!ticketCode, retry: false });
  const [addonOpen, setAddonOpen] = useState(false);
  const { data: wallet } = trpc.wallet.getByTicketCode.useQuery({ ticketCode }, { enabled: !!ticketCode, retry: false });
  const { data: pendingExtras } = trpc.wallet.getPendingExtras.useQuery({ ticketCode }, { enabled: !!ticketCode, retry: false });

  // /verificar/<código>?recargar=1 (lo que manda /recargar) abre el panel solo.
  const [topupOpen, setTopupOpen] = useState(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('recargar') === '1',
  );

  useEffect(() => {
    if (ticket?.ticketCode) rememberTicketCode(ticket.ticketCode);
  }, [ticket?.ticketCode]);

  if (isLoading) {
    return (
      <div className="wcard-page min-h-dvh flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="wcard-page min-h-dvh flex items-center justify-center">
        <div className="max-w-md text-center mx-auto">
          <TicketX className="w-12 h-12 mx-auto mb-4 opacity-70" />
          <h1 className="font-heading font-extrabold text-2xl tracking-tight mb-2">No encontramos esta entrada</h1>
          <p className="text-sm opacity-70 mb-8">Revisa el link de tu email o escríbenos por Instagram si crees que es un error.</p>
          <Link href="/" className="wcard-btn wcard-btn-ghost inline-flex px-8">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  const eventDateShort = ticket.eventDate
    ? new Date(ticket.eventDate).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'America/Santiago' }).toUpperCase()
    : '';
  const eventDateFull = ticket.eventDate
    ? new Date(ticket.eventDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Santiago' })
    : '';
  const doorsOpenText = ticket.doorsOpen
    ? new Date(ticket.doorsOpen).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
    : '';

  const statusClass = ticket.status === 'valid' ? '' : ticket.status === 'used' ? 'is-used' : 'is-cancelled';
  const statusLabel = ticket.status === 'valid' ? 'Entrada válida' : ticket.status === 'used' ? 'Ya utilizada' : 'Cancelada';

  return (
    <div className="wcard-page min-h-dvh">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="text-center mb-6">
          <span className={`wcard-status ${statusClass}`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            {statusLabel}
          </span>
        </div>

        {(extraStatus === 'ok' || extraStatus === 'pending') && (
          <p className="wcard-hint text-center mb-4" style={{ marginTop: 0 }}>
            🎉 Recibimos tu pago. En unos segundos tu extra aparece en "Incluye" y te llega la confirmación por correo.
          </p>
        )}
        {extraStatus === 'error' && (
          <p className="wcard-error text-center mb-4">No se completó el pago. Puedes intentarlo de nuevo cuando quieras.</p>
        )}

        <WalletCard
          eventTitle={ticket.eventTitle}
          eventDateShort={eventDateShort}
          holderName={ticket.holderName || ticket.attendeeNames[0] || 'Invitado'}
          ticketCode={ticket.ticketCode}
          qrImageUrl={ticket.qrImageUrl}
          prepaidBalance={wallet?.prepaidBalance ?? 0}
          playcoins={wallet?.playcoins ?? 0}
          movements={wallet?.movements ?? []}
        />

        {ticket.qrImageUrl && (
          <p className="text-center text-xs opacity-60 mt-3">Presenta este código QR y tu carnet en la entrada</p>
        )}

        {ticket.status !== 'cancelled' && (
          <div className="wcard-section">
            <p className="wcard-section-label">Saldo de tu PlayCard</p>
            {topupOpen ? (
              <>
                <TopupPanel access={{ ticketCode: ticket.ticketCode }} />
                <div className="text-center mt-4">
                  <button type="button" className="wcard-link" onClick={() => setTopupOpen(false)}>Cerrar</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm opacity-80 mb-3">Carga saldo cuando quieras y paga en la barra sin efectivo.</p>
                <button type="button" className="wcard-btn wcard-btn-primary wcard-btn-block" onClick={() => setTopupOpen(true)}>
                  💳 Cargar saldo
                </button>
              </>
            )}
          </div>
        )}

        {ticket.status !== 'cancelled' && addonView?.available && (
          <div className="wcard-section">
            <p className="wcard-section-label">Estacionamiento y extras</p>
            {addonOpen ? (
              <>
                <AddonPanel ticketCode={ticket.ticketCode} />
                <div className="text-center mt-4">
                  <button type="button" className="wcard-link" onClick={() => setAddonOpen(false)}>Cerrar</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm opacity-80 mb-3">¿Se te olvidó el estacionamiento u otro extra? Agrégalo a tu compra y paga online.</p>
                <button type="button" className="wcard-btn wcard-btn-primary wcard-btn-block" onClick={() => setAddonOpen(true)}>
                  🚗 Agregar estacionamiento o extras
                </button>
              </>
            )}
          </div>
        )}

        <div className="wcard-section">
          <p className="wcard-section-label">{ticket.ticketTypeName}</p>
          <div className="space-y-2 text-sm">
            {eventDateFull && (
              <p className="flex items-center gap-2 opacity-80"><Calendar className="w-4 h-4 shrink-0" /> {eventDateFull}{doorsOpenText && ` · ${doorsOpenText} hrs`}</p>
            )}
            {(ticket.venue || ticket.address) && (
              <p className="flex items-center gap-2 opacity-80"><MapPin className="w-4 h-4 shrink-0" /> {[ticket.venue, ticket.address].filter(Boolean).join(' — ')}</p>
            )}
          </div>

          {ticket.extras.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--wcard-line)' }}>
              <p className="wcard-section-label">Incluye</p>
              {ticket.extras.map((extra) => (
                <p key={extra.name} className="wcard-extra-row">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {extra.quantity > 1 ? `${extra.quantity}× ` : ''}{extra.name}
                </p>
              ))}
            </div>
          )}

          {/* Extras que compró en otra fiesta y nunca alcanzó a canjear --
              quedan reservados: se pueden retirar en caja en la próxima
              fiesta, una vez que el evento de origen ya haya terminado. */}
          {pendingExtras && pendingExtras.length > 0 && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--wcard-line)' }}>
              <p className="wcard-section-label">Pendiente de otra fiesta</p>
              {pendingExtras.map((extra) => (
                <p key={`${extra.name}-${extra.eventTitle}`} className="wcard-extra-row">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {extra.quantity > 1 ? `${extra.quantity}× ` : ''}{extra.name}
                  {extra.eventTitle && <span className="opacity-60"> · {extra.eventTitle}</span>}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="wcard-actions">
          {/* La fiesta en el celular. Solo aparece cuando la persona ya
              entró de verdad (QR escaneado en la puerta) y el evento está en
              curso -- el servidor revalida ambas cosas igual. */}
          {ticket.eventDate && canEnterParty(
            { status: ticket.status, eventId: 0 },
            { eventDate: ticket.eventDate, doorsOpen: ticket.doorsOpen, eventEnd: ticket.eventEnd },
          ) && (
            <Link href={`/fiesta/${ticket.ticketCode}`} className="wcard-btn wcard-btn-primary">
              🍬 Entrar a la fiesta
            </Link>
          )}

          <a href={`/api/calendar/${ticket.ticketCode}.ics`} className="wcard-btn wcard-btn-ghost">
            <CalendarPlus className="w-4 h-4" /> Agregar al calendario
          </a>
        </div>

        <p className="text-center text-[11px] opacity-40 mt-6">🍭 {MARCA.nombre}</p>
      </motion.div>
    </div>
  );
}
