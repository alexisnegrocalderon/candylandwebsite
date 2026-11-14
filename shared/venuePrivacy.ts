/* Privacidad del lugar: el agente NUNCA dice el nombre del recinto ni la dirección en el chat (Instagram y WhatsApp).
 * Solo la ciudad o el sector («Providencia, Santiago»); la ubicación exacta le llega a cada persona en el correo de
 * confirmación de su compra. Caso real (14/11): el agente contó «es en el Hipódromo de Santiago», un dato viejo
 * guardado en el evento que además ya no es el lugar. Por eso el lugar ni siquiera se le entrega al modelo (ver
 * server/instagramAgent.ts y server/playmoreAgent.ts) y, por si se le cuela desde el historial o una nota, esto lo revisa. */

/** Lo que sí se puede decir de dónde es. */
export const PUBLIC_PLACE = 'Providencia, Santiago';

/** Lo que se le dice a quien pregunta dónde queda, si hay que escribirlo sin el modelo. */
export const ADDRESS_SAFE_REPLY = `Es en ${PUBLIC_PLACE} 💜\n\nLa ubicación exacta te llega en el correo de confirmación de tu compra.`;

/** Un nombre de recinto conocido o algo con forma de dirección («Av. Siempre Viva 742», «calle Los Olmos 1234»). */
const LEAKS = [
  new RegExp('hip[oó]dromo', 'iu'),
  new RegExp('(?<![\\p{L}\\p{N}])(?:av(?:enida|\\.)?|calle|pasaje|camino)\\s+[\\p{L}\\p{N} .\'-]{2,40}?\\s+(?:n[°º.]?\\s*)?\\d{2,5}(?![\\p{L}\\p{N}])', 'iu'),
];

/** ¿El texto dice un lugar exacto? */
export function leaksVenue(text: string): boolean {
  return LEAKS.some((re) => re.test(text));
}

/** Saca las frases que dicen un lugar exacto. Si no queda nada que valga, devuelve la respuesta segura. */
export function scrubVenue(text: string): string {
  const parts = text.split(/(?<=[.!?…])\s+|\n+/).map((p) => p.trim()).filter(Boolean);
  const kept = parts.filter((p) => !leaksVenue(p));
  const body = kept.join('\n\n').trim();
  if (!body) return ADDRESS_SAFE_REPLY;
  return /ubicaci[oó]n exacta|direcci[oó]n exacta/i.test(body) ? body : `${body}\n\nLa ubicación exacta te llega en el correo de confirmación de tu compra.`;
}

/** La instrucción para reescribir cuando se le escapó el lugar. */
export const VENUE_RETRY = `REESCRIBE TU RESPUESTA: dijiste el nombre del recinto o una dirección, y eso NUNCA se dice por el chat (privacidad del espacio y de quienes van). Del lugar solo puedes decir "${PUBLIC_PLACE}" (o la ciudad). Cuéntale con cariño, en una frase, que la ubicación exacta le llega en el correo de confirmación de su compra, y sigue con lo demás (botón, pregunta) igual que antes.`;
