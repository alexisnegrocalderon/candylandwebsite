/* Correo de booking a un artista (DJ) para un evento en colaboración: con el look PLAYMORE, sin pie de marketing (es un
 * correo uno a uno) y con la firma de las dos productoras. Primer contacto: pregunta disponibilidad y deja las condiciones
 * para la segunda conversación. */
import { buildAnniversaryBlastEmail } from './emailAniversario';

export interface ArtistBookingInput {
  /** A quién se saluda («Martina y equipo de booking»). */
  greetingName: string;
  /** Nombre artístico, tal como aparece en su perfil. */
  artistName: string;
  /** Fecha límite de respuesta, ya escrita («viernes 13 de noviembre»). */
  replyBy: string;
  /** Link a la página del evento. */
  eventUrl: string;
  /** Su rol y horario, ya escritos («de 2:00 a 4:00 AM»). */
  setText: string;
  setHighlight: string;
  producers: { name: string; role: string; phone?: string }[];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function artistBookingSubject(): string {
  return 'Booking · PLAYMORE (Playroom × Dalmore) · Viernes 4 de diciembre, Providencia';
}

export function buildArtistBookingEmail(input: ArtistBookingInput): string {
  const first = input.producers.map((p) => esc(p.name.split(' ')[0]));
  const signature = `
    <div style="border-top:1px solid #4A2A4E;padding:22px 4px 8px;margin-top:6px;">
      <p style="color:#C4B3A6;font-size:15px;line-height:1.5;margin:0 0 12px;">Un saludo,</p>
      ${input.producers.map((p) => `<p style="color:#F3E9D2;font-size:15px;line-height:1.5;margin:0 0 8px;"><strong>${esc(p.name)}</strong><br /><span style="color:#C4B3A6;">${esc(p.role)}${p.phone ? ` · ${esc(p.phone)}` : ''}</span></p>`).join('')}
    </div>`;
  return buildAnniversaryBlastEmail({
    theme: 'playmore',
    buyerName: input.greetingName,
    preheader: `Propuesta de booking: cierre de la noche, ${input.setText}. ¿Estás disponible el 4 de diciembre? Responde antes del ${input.replyBy}.`,
    headline: `Nos gustaría que ${esc(input.artistName)} sea parte de nuestro Line Up`,
    highlightLabel: 'Tu set · cierre de la noche',
    highlightValue: input.setHighlight,
    paragraphs: [
      `Somos <strong>${first[0]}</strong> y <strong>${first[1]}</strong>, productores de Playroom y Dalmore. El <strong>viernes 4 de diciembre</strong> juntamos por primera vez a las dos fiestas liberales más grandes de la Región Metropolitana y la V Región en <strong>PLAYMORE</strong>: una sola noche, un line up pensado a medida y un spot nuevo y exclusivo en Providencia, Santiago, pensado solo para esta fecha.`,
      `Queremos que seas el <strong>plato fuerte de Playroom</strong> con un set de <strong>perreo old school</strong>, y que cierres la noche: <strong>${esc(input.setText)}</strong>.`,
      `Para que tengas todo claro desde el inicio: PLAYMORE es una <strong>fiesta liberal para mayores de 21 años</strong>, con código de vestimenta y un ambiente cuidado y de respeto. Es una noche exclusiva, distinta a un evento común.`,
      `¿Estás <strong>disponible el viernes 4 de diciembre</strong>? Si es así, coordinamos con calma el resto de los detalles. Nos ayudaría mucho tu respuesta <strong>antes del ${esc(input.replyBy)}</strong>, porque la fecha se acerca. Puedes responder directamente a este correo.`,
    ],
    ctaText: 'Ver PLAYMORE',
    ctaUrl: input.eventUrl,
    eventInfo: { title: 'PLAYMORE · Playroom × Dalmore', dateText: 'Viernes 4 de diciembre · 23:00 hrs', venue: 'Nuevo spot exclusivo', address: 'Providencia, Santiago' },
    footer: false,
    closing: signature,
  });
}
