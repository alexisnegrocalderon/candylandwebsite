/* Lo que el agente de ventas sabe de PLAYMORE: los datos reales del evento (accesos, precios y tanda vigente) y las
 * reglas de venta de esta noche. Todo sale de la base y de la landing; lo único fijo acá son las reglas del dueño. */
import * as db from './db';
import { formatChileDate, formatChileTime } from '../shared/chileDate';
import { dropSupersededTickets } from '../shared/liveTickets';
import { discountPercent, normalizeTandaSchedule, nextPhase, phasePriceFor } from '../shared/tandaSchedule';
import { WHO_OPTIONS } from '../shared/playmoreWho';
import type { PlaymoreFocus } from './playmoreFocus';

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
const when = (iso: string | Date) => `${formatChileDate(new Date(iso), { withYear: true })} a las ${formatChileTime(new Date(iso))}`;

/** El bloque de datos reales de PLAYMORE (reemplaza al de fechas de Playroom mientras la colab está activa). */
export async function buildPlaymoreContext(
  focus: PlaymoreFocus,
  availabilityLabel: (remaining: number | null, soldOut: boolean) => string,
): Promise<string> {
  const { event, landing } = focus;
  const d = new Date(event.eventDate);
  const lines: string[] = [
    'DATOS REALES DE PLAYMORE (el ÚNICO evento que vendes; la única fuente válida de fechas y precios):',
    `- Evento: ${landing.eventName} · Mansion Playroom × Dalmore`,
    `- Fecha: ${formatChileDate(d, { withYear: true })} · ${formatChileTime(d)} hrs`,
  ];
  if (event.eventEnd) lines.push(`- Cierre: ${when(event.eventEnd)}`);
  lines.push(`- Lugar: ${event.venue?.trim() || landing.venueText} (la dirección exacta llega por correo junto con la entrada, después de comprar)`);
  if (landing.subheadline) lines.push(`- De qué se trata: ${landing.subheadline}`);
  if (event.shortDescription) lines.push(`- Descripción: ${event.shortDescription}`);
  lines.push('- Edad: +21. Entrada nominativa, a nombre de quien asiste, y se valida con su documento en la puerta.');
  lines.push('- Cómo se compra: con el botón de compra (`action: "buy_link"` + `accessOption`), nunca escribiendo un link.');

  const tickets = dropSupersededTickets(await db.getTicketTypesByEventId(event.id));
  const accesos = tickets.filter((t) => t.category === 'acceso' && t.status !== 'hidden');
  const schedule = normalizeTandaSchedule((event as any).tandaDiscountSchedule);
  const phaseIndex = Math.min((event as any).tandaPhaseIndex ?? 0, schedule.length - 1);
  const upcoming = nextPhase(phaseIndex, schedule);
  const until = schedule[phaseIndex]?.untilDate;
  const tandaTxt = upcoming
    ? `${phaseIndex + 1}ª de ${schedule.length}${until ? `, cierra el ${when(until)} (o antes si se agota)` : ''}`
    : `${phaseIndex + 1}ª y última: es el precio general final`;
  lines.push(`- Tanda vigente: ${tandaTxt}.`);

  lines.push('- ACCESOS (la llave entre corchetes es la `accessOption` del botón):');
  for (const o of WHO_OPTIONS) {
    const t = accesos.find((x) => x.accesoSlug === o.slug);
    if (!t) continue;
    const remaining = t.poolRemaining ?? (t.totalStock - t.soldCount);
    const label = availabilityLabel(remaining, t.status === 'soldout');
    const price = Number(t.price);
    const general = Number(t.originalPrice ?? 0);
    let l = `  · ${o.label} [${o.key}] (${o.people} ${o.people === 1 ? 'persona' : 'personas'}): ${clp(price)} CLP`;
    if (general > price) l += ` (precio general ${clp(general)}: ${Math.round(discountPercent(general, price))} % menos)`;
    else if (!general) l += ' (precio único, sin tandas)';
    l += ` — ${label}`;
    if (o.key === 'pareja') l += ' — pareja mixta';
    if (o.key === 'dos-hombres') l += ' — mismo precio que la Pareja; SOLO para parejas de hombres; pide código de comunidad';
    if (o.key === 'soltero') l += ' — pide código de comunidad';
    if (label !== 'AGOTADA' && upcoming && general > price) {
      const next = phasePriceFor(upcoming.phase, o.slug, general);
      if (next > price) l += ` — sube a ${clp(next)} en la próxima tanda${until ? ` (el ${when(until)}, o antes si se agota)` : ''}`;
    }
    lines.push(l);
  }
  const extras = tickets.filter((t) => t.category === 'extra' && t.status === 'active');
  if (extras.length > 0) lines.push(`- Extras al comprar: ${extras.map((t) => `${t.name} ${clp(Number(t.price))}`).join(', ')}`);
  return lines.join('\n');
}

/** Las reglas de venta de PLAYMORE. Van en el prompt fijo del agente y PISAN el contexto de marca editable. */
export const PLAYMORE_RULES = [
  'FOCO EXCLUSIVO: PLAYMORE (esto pisa cualquier otra cosa del contexto de marca, de las guías o de los ejemplos):',
  '- Vendes SOLO PLAYMORE, la noche de Mansion Playroom × Dalmore (los datos reales están en el bloque «DATOS REALES DE PLAYMORE»). Si preguntan por otras fiestas, dilo con simpatía: ahora todo el foco está en PLAYMORE y las demás fechas se anuncian por Instagram; y vuelve a PLAYMORE. Nunca vendas ni nombres otras fechas.',
  '- Para PLAYMORE la fiesta es en Santiago (sector Providencia, un nuevo spot especial) y es +21. Si el contexto de marca dice Valparaíso, Viña o mayores de 18, NO aplica a este evento: nunca digas +18 ni Valparaíso. La dirección exacta sigue siendo por correo, después de comprar; Providencia sí lo puedes decir.',
  '- La entrada es nominativa: cada acceso se compra con el nombre y el documento (RUT o pasaporte) de quien asiste, y se valida con el documento en la puerta.',
  '- En PLAYMORE no se usa el sistema de pago de Playroom: la PlayCard solo sirve como QR de ingreso. El saldo y los Playcoins no se pueden usar esa noche, y por la web solo se compran entradas y estacionamiento.',
  '- EMBUDO: (1) Descubre cuántos son (1, 2 o 3) y quiénes (sola, solo, pareja, dos mujeres, dos hombres, trío mixto); (2) dale el precio exacto de SU acceso, con el precio general y cuánto se ahorra, y cuándo cierra la tanda si los datos lo traen; (3) manda el botón directo (`buy_link`) con su `accessOption`; (4) acompáñala durante la compra. Si la conversación ya trae cómo vienen, no lo vuelvas a preguntar. Si es un grupo de 4, no hay acceso para cuatro: ofrece dos Pareja (`accessOption` pareja, `quantity` 2) o un Trío mixto más un acceso individual.',
  '- QUIÉN NECESITA QUÉ (explícalo con calidez y sin juicio, solo cuando corresponda a la persona):',
  '  · Mujer sola (`soltera`), pareja (`pareja`), dos mujeres (`dos-mujeres`) y trío mixto (`trio`): sin código, botón directo.',
  '  · Hombre solo: en su PRIMERA vez debe ir acompañado de una chica acompañante, así que lo que le corresponde es el acceso Pareja (`pareja`) yendo con ella. «Voy solo» (`soltero`) es solo para quien ya tiene su código de comunidad: si dice que lo tiene, mándale el botón con `soltero`; si no lo tiene, no lo mandes y ofrécele ir acompañado (Pareja), sin presionar. Cuéntale también que el código de comunidad se pide por WhatsApp al equipo.',
  '  · Dos hombres (`dos-hombres`): es para vínculos de PAREJA, no para amigos, y pide código de comunidad. Si son pareja y tienen código, botón con `dos-hombres`. Si son amigos, explícalo con respeto y ofrece una alternativa (sumar a una chica con el Trío mixto, o que alguno vaya con una acompañante en Pareja). Nunca acuses ni cuestiones: solo aclara para qué es el acceso.',
  '- En PLAYMORE Soltero y Dos hombres SÍ tienen botón directo (esta regla pisa la de «sin botón directo»): el checkout les pide el código de comunidad.',
  '- Urgencia solo real: la tanda cierra en la fecha que traen los datos o se agota el cupo, y el precio sube a la cifra que traen los datos. En la última tanda el precio ya es el general, sin más alzas: dilo con naturalidad, sin inventar urgencia. «Voy solo» es de pocos cupos: puedes decir que quedan pocas, nunca un número.',
].join('\n');
