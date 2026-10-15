/* Clasificador de comentarios públicos de Instagram, por reglas (sin IA, sin
 * costo). Decide qué se hace con cada uno: el spam se oculta, lo delicado
 * queda para que lo escriba el dueño, y el resto recibe un borrador. */

export type CommentCategory = 'spam' | 'emoji' | 'praise' | 'question' | 'sensitive' | 'other';

export interface CommentTriage {
  category: CommentCategory;
  /** Pregunta por precio, entradas o cómo comprar: además del borrador público
   * se prepara un DM con el botón al evento. */
  purchaseIntent: boolean;
}

function norm(text: string): string {
  return text.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase();
}

const SPAM = [
  /https?:\/\//, /www\./, /\b[a-z0-9-]+\.(com|cl|net|ru|xyz|io|me)\b/, /t\.me\//, /wa\.me\//,
  /seguidores/, /followers/, /ganar dinero|gana dinero|ganancias|inversion|crypto|bitcoin|forex/,
  /trabajo desde casa|ingresos extra|sorteo falso/, /escribeme al privado|manda dm|whatsapp\s*\+?\d{6,}/,
  /promocion de (likes|seguidores)|compra (likes|seguidores)/,
];

const SENSITIVE = [
  /estafa|fraude|robo|robaron|me robaron|denuncia|demanda|abogado|sernac/,
  /reembolso|devolucion|devuelvan|plata de vuelta|no me llego|cobraron|cobro doble/,
  /acoso|abuso|violaron|violacion|agresion|me tocaron|menor de edad|menores/,
  /droga|pasta base|policia|carabineros/, /mentira|vergüenza de empresa|verguenza de empresa|pesimo|asco/,
];

const PURCHASE = [
  /precio|valor|cuanto (sale|cuesta|vale|es)|cuesta|cuanto/, /entrada|ticket|boleto|cupo|reserv/,
  /comprar|compra|donde (compro|las compro)|como (compro|entro|reservo)|link/, /quiero ir|quiero entrar|quiero asistir/,
];

const QUESTION = [
  /\?/, /\b(cuando|donde|como|que hora|a que hora|horario|hasta que hora|desde que hora)\b/,
  /\b(hay|queda|quedan|puedo|pueden|se puede|aceptan|dejan)\b.*\b(entrada|cupo|ir|entrar|parejas|solos|solas|menores|tarjeta|transferencia)\b/,
  /\b(direccion|ubicacion|donde queda|como llego)\b/, /\bdress ?code|que me pongo|que ropa\b/,
];

const PRAISE = [
  /\b(amo|amé|ame|encanta|encantó|encanto|genial|increible|hermos[oa]|lind[oa]|bacan|brigido|buenisimo|top|wow|espectacular|crack|fantastic[oa]|perfect[oa]|felicitaciones|felicidades|exito|exitos)\b/,
  /\bme (gusta|gustó|gusto)\b/, /\bque (lindo|linda|bueno|buena|bacan|genial)\b/,
];

const EMOJI_RE = new RegExp(String.raw`[\p{Extended_Pictographic}\p{Emoji_Component}‍️]`, 'gu');

export function triageComment(raw: string): CommentTriage {
  const text = norm(raw);
  const purchaseIntent = PURCHASE.some((r) => r.test(text));
  if (SPAM.some((r) => r.test(text))) return { category: 'spam', purchaseIntent: false };
  if (SENSITIVE.some((r) => r.test(text))) return { category: 'sensitive', purchaseIntent: false };

  const stripped = raw.replace(EMOJI_RE, '').replace(/@[\w.]+/g, '').replace(/[\s.,!¡?¿\-_*+~]+/g, '');
  if (stripped.length === 0) return { category: 'emoji', purchaseIntent: false };

  if (purchaseIntent || QUESTION.some((r) => r.test(text))) return { category: 'question', purchaseIntent };
  if (PRAISE.some((r) => r.test(text))) return { category: 'praise', purchaseIntent: false };
  return { category: 'other', purchaseIntent: false };
}
