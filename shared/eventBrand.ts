/**
 * Los datos de marca y de evento que necesitan LOS DOS lados: el sitio
 * (`client/src/config/candyland.ts`) y los correos (`server/email.ts`).
 *
 * ⚠️ POR QUÉ EXISTE ESTE ARCHIVO — no es una abstracción de más.
 * Hasta el lanzamiento del 2º aniversario, `server/email.ts` tenía una copia
 * MANUAL de estos textos (la constante `CONTENT`, con el comentario "se
 * mantiene alineada a mano con client/src/config/candyland.ts"). Se
 * desalineó, como era cuestión de tiempo: los correos de compra salieron
 * anunciando el dress code de Candyland ("Candy Sensual: brillos, colores
 * pastel...") a gente que venía al aniversario, donde el disfraz es
 * obligatorio, y el ticket con el QR salió rotulado "CANDYLAND". Los dos
 * datos equivocados en el correo más importante que manda el sitio.
 *
 * Con esto, el sitio y el correo leen exactamente el mismo texto: si se
 * cambia acá, cambian los dos. No hay forma de que vuelvan a divergir.
 *
 * 👉 PARA MONTAR LA PRÓXIMA FIESTA se edita `EVENT_BRAND` (y el resto de
 * `EVENTO` en candyland.ts). `BRAND` es lo permanente y casi nunca se toca.
 */

/** Lo permanente de Mansion Playroom -- sobrevive al cambio de evento. */
export const BRAND = {
  nombre: 'Mansion Playroom',
  ciudad: 'Valparaíso, Chile',
  lugar: 'La Mansión — dirección exacta al comprar',
  valores: ['Respeto', 'Consentimiento', 'Libertad'],
  edadMinima: 18,
  instagram: 'https://instagram.com/mansionplayroom.cl',
  web: 'https://www.mansionplayroom.cl',
} as const;

/** Lo que cambia con cada fiesta y que además viaja en los correos. */
export const EVENT_BRAND = {
  /** Nombre corto del evento (título grande del Hero y asuntos de correo). */
  nombre: 'ANIVERSARIO',
  fechaTexto: 'Viernes 30 de octubre',
  /** ⚠️ Reemplazar por la hora real apenas se defina (ver EVENTO en candyland.ts). */
  horarioTexto: 'Hora por confirmar',
  dressCode:
    'Disfraz obligatorio: es nuestro 2º aniversario y lo celebramos en grande. ' +
    'Además de tu disfraz, que te haga sentir irresistible -- nada de tenida deportiva.',

  // ── Solo correo ────────────────────────────────────────────
  /** Banda de aniversario del encabezado. Mayúsculas espaciadas, va en dorado. */
  kicker: '2 AÑOS · VIERNES 30 DE OCTUBRE',
  /** Chip corto del guiño de disfraz. Se usa donde aporta (compra,
   * recordatorio, campaña), no en todos los correos. */
  costumeBadge: '🎭 Disfraz obligatorio',
  /** Rótulo arriba del QR, en el marco del ticket. Antes decía "🍭 CANDYLAND"
   * hardcodeado, o sea el nombre de la fiesta ANTERIOR. */
  ticketLabel: '🎭 2º ANIVERSARIO',
} as const;
