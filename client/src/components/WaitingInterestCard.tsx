import { ArrowUpRight, BellRing, Instagram, MessageCircle } from 'lucide-react';
import { CANDYLAND } from '@/config/candyland';
import { trackConversion } from '@/lib/analytics';

export default function WaitingInterestCard() {
  const whatsappMessage = encodeURIComponent('Hola, quiero enterarme de la próxima fecha de Mansion Playroom.');
  const whatsappHref = `${CANDYLAND.redes.whatsapp}?text=${whatsappMessage}`;

  return (
    <div className="relative glass-candy rounded-3xl px-6 py-10 md:px-10 md:py-14 flex flex-col items-center gap-5 text-center overflow-hidden border-2 border-primary/30">
      <div aria-hidden className="absolute -top-16 left-1/4 w-64 h-64 rounded-full bg-cherry/25 blur-[90px]" />
      <div aria-hidden className="absolute -bottom-16 right-1/4 w-64 h-64 rounded-full bg-primary/20 blur-[90px]" />
      <div aria-hidden className="relative w-14 h-14 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl candy-glow-pulse" />
        <div className="relative w-11 h-11 rounded-full glass-candy flex items-center justify-center">
          <BellRing className="w-5 h-5 text-primary" />
        </div>
      </div>
      <div className="relative max-w-xl">
        <p className="font-heading font-bold text-2xl md:text-3xl text-gradient-candy">
          La próxima fecha se viene pronto
        </p>
        <p className="text-muted-foreground text-sm md:text-base mt-3 leading-relaxed">
          Todavía no confirmamos día ni venta de entradas. Síguenos para recibir el primer aviso, sin tener que estar revisando la página.
        </p>
      </div>
      <div className="relative flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
        <a
          href={CANDYLAND.redes.instagram}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackConversion('waiting_interest_instagram')}
          data-umami-event="waiting-interest-instagram"
          className="btn-jelly inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-3 font-bold interactive"
        >
          <Instagram className="w-4 h-4" />
          Seguir en Instagram
          <ArrowUpRight className="w-4 h-4" />
        </a>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackConversion('waiting_interest_whatsapp')}
          data-umami-event="waiting-interest-whatsapp"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-primary/40 px-6 py-3 font-bold hover:bg-primary/10 transition-colors interactive"
        >
          <MessageCircle className="w-4 h-4" />
          Avisarme por WhatsApp
        </a>
      </div>
      <p className="relative text-xs text-muted-foreground/80">
        No enviamos mensajes masivos; este enlace abre tu conversación con la cuenta oficial.
      </p>
    </div>
  );
}
