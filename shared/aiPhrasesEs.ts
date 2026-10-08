/* Muletillas que delatan un texto escrito por IA en español (Chile). Se usan
 * para AVISAR (shared/captionCheck.ts → humanizeEs) y para pedirle a la IA que
 * no las escriba (Plan de contenido, agente de DMs). No se reemplazan solas:
 * cambiar una frase necesita criterio, un reemplazo automático la deja peor.
 *
 * Idea tomada del humanizador de github.com/Jakeschincariol/instagram-agent-skill
 * (MIT), que trae la lista en inglés; esta es propia, pensada para cómo escribe
 * Playroom. Es para editarla: si una palabra sí la usan de verdad, se saca. */

export interface AiPhrase {
  /** Cómo se busca (sin importar mayúsculas ni tildes). */
  pattern: RegExp;
  /** Cómo se muestra en el aviso. */
  label: string;
  /** Qué poner en su lugar, en corto. */
  suggestion: string;
}

const w = (body: string) => new RegExp(`(^|[^\\p{L}])(${body})(?=$|[^\\p{L}])`, 'iu');

export const AI_PHRASES_ES: AiPhrase[] = [
  { pattern: w('sum[eé]rgete|sumergirte'), label: 'sumérgete', suggestion: 'ven, entra, vive' },
  { pattern: w('en el mundo actual|en la era digital|hoy m[aá]s que nunca|en los tiempos que corren'), label: 'en el mundo actual', suggestion: 'decirlo directo, sin introducción' },
  { pattern: w('experiencia (?:[uú]nica|inolvidable|incre[ií]ble|inigualable)'), label: 'experiencia única/inolvidable', suggestion: 'decir qué pasa de verdad (la pista, el jacuzzi, el show)' },
  { pattern: w('(?:noche|momentos?|velada) (?:inolvidable|m[aá]gic[oa])s?'), label: 'noche inolvidable / mágica', suggestion: 'un detalle concreto de la noche' },
  { pattern: w('pr[eé]parate para|prep[aá]rate'), label: 'prepárate para…', suggestion: 'ir al grano' },
  { pattern: w('¿?est[aá]s list[oa]s? para'), label: '¿estás listo/a para…?', suggestion: 'una pregunta real, ej. ¿te tinca?' },
  { pattern: w('sin (?:lugar a )?dudas?'), label: 'sin duda', suggestion: 'borrarlo' },
  { pattern: w('cabe (?:destacar|mencionar|se[nñ]alar)|es importante (?:destacar|mencionar|se[nñ]alar)|vale la pena (?:destacar|mencionar)'), label: 'cabe destacar', suggestion: 'decirlo y ya' },
  { pattern: w('potenciar|potencia tu'), label: 'potenciar', suggestion: 'mejorar, subir' },
  { pattern: w('eleva(?:r|) (?:tu|la|el)|(?:al|a otro) (?:siguiente |otro )?nivel'), label: 'elevar / llevar al siguiente nivel', suggestion: 'decir qué cambia en concreto' },
  { pattern: w('un viaje de|un viaje hacia'), label: 'un viaje de…', suggestion: 'decir qué pasa' },
  { pattern: w('vibrante'), label: 'vibrante', suggestion: 'buena onda, prendida' },
  { pattern: w('(?:la )?(?:fusi[oó]n|combinaci[oó]n) perfecta'), label: 'la combinación perfecta', suggestion: 'nombrar las cosas' },
  { pattern: w('desbloquea(?:r|)'), label: 'desbloquear', suggestion: 'conseguir, tener' },
  { pattern: w('explora(?:r|) tu|explora (?:tus|el|la)'), label: 'explora tu…', suggestion: 'atrévete, prueba' },
  { pattern: w('en resumen|en definitiva|en conclusi[oó]n|para concluir'), label: 'en resumen / en definitiva', suggestion: 'borrarlo' },
  { pattern: w('la magia de|un mundo de posibilidades'), label: 'la magia de…', suggestion: 'algo concreto' },
  { pattern: w('(?:atm[oó]sfera|ambiente) [uú]nic[oa]'), label: 'ambiente único', suggestion: 'describir el ambiente' },
  { pattern: w('[uú]nete a nosotros|[uú]nete a la experiencia'), label: 'únete a nosotros', suggestion: 'ven, súmate' },
  { pattern: w('no te pierdas esta (?:incre[ií]ble|[uú]nica) oportunidad'), label: 'no te pierdas esta increíble oportunidad', suggestion: 'el dato real: fecha, precio, cupos' },
  { pattern: w('d[eé]jate llevar'), label: 'déjate llevar', suggestion: 'algo más propio' },
];

/** "No es solo una fiesta, es una experiencia": la estructura más típica. */
export const NOT_JUST_PATTERN = new RegExp(String.raw`\bno (?:es|son) s[oó]lo\b[^.!?\n]{0,80}?,?\s*(?:es|son)\b`, 'iu');

/** La lista en una línea, para pedirle a la IA que no use estas muletillas. */
export const AI_PHRASES_PROMPT_LINE = `Escribe como una persona de Playroom, no como un folleto: NO uses estas muletillas que suenan a IA: ${AI_PHRASES_ES.map((p) => `"${p.label}"`).join(', ')}, ni la estructura "no es solo X, es Y", ni rayas largas (—). Di las cosas concretas: qué pasa, cuándo, dónde, cuánto.`;
