/**
 * Campañas aliadas (tabla `partnerCampaigns`): un link privado
 * (`/electronica`) que vende los MISMOS accesos del evento a un precio por
 * persona especial, para traer a la comunidad de un aliado (hoy: la
 * comunidad electrónica del B2B Aldo Medel x German Courtin en la Pista Tech
 * del 2º Aniversario).
 *
 * No hay ticket types nuevos: el precio se fija en el servidor (createOrder)
 * solo cuando la orden trae el `partnerSlug`, así que la web normal nunca ve
 * el descuento y las personas suman al mismo aforo/stock de siempre.
 *
 * Lo que necesitan los dos lados (checkout y servidor) vive acá para que el
 * precio que se muestra y el que se cobra no puedan divergir.
 */

/** Personas por acceso -- mismo dato que `personas` en
 * client/src/config/candyland.ts. Solo los accesos que una campaña aliada
 * puede vender: Soltero (hombre solo) queda fuera a propósito, por la misma
 * regla de seguridad de siempre. */
export const PARTNER_PERSONAS: Record<string, number> = {
  soltera: 1,
  duo_mujeres: 2,
  duo: 2,
  trio: 3,
  grupo: 4,
};

export const PARTNER_DEFAULT_ACCESOS = Object.keys(PARTNER_PERSONAS);

/** Accesos que la campaña deja comprar: lo configurado, acotado siempre a
 * los que tienen `personas` conocido (nunca Soltero, aunque alguien lo cargue
 * a mano en la columna JSON). */
export function partnerAllowedAccesos(configured: unknown): string[] {
  const list = Array.isArray(configured) && configured.length > 0 ? configured : PARTNER_DEFAULT_ACCESOS;
  return list.filter((s): s is string => typeof s === 'string' && s in PARTNER_PERSONAS);
}

/** Precio de UN acceso dentro de la campaña: precio por persona × personas. */
export function partnerAccessPrice(pricePerPerson: number, accesoSlug: string | null | undefined): number | null {
  const personas = accesoSlug ? PARTNER_PERSONAS[accesoSlug] : undefined;
  if (!personas) return null;
  return pricePerPerson * personas;
}

/** Tag que queda en `customers.tags` de quien compra por la campaña. */
export function partnerCustomerTag(slug: string): string {
  return `comunidad-${slug}`;
}

/** Las tres aceptaciones obligatorias del paso "Bienvenid@ a Playroom". El
 * checkout las manda dentro de attendeeData (`partner`) y el servidor las
 * vuelve a exigir: sin las tres, la orden no se crea. */
export type PartnerAcceptance = {
  slug: string;
  sigoPlayroom: boolean;
  aceptaValores: boolean;
  aceptaPermanencia: boolean;
  aceptadoEn: string;
};

export function hasPartnerAcceptance(attendeeDataJson: string | null | undefined): boolean {
  if (!attendeeDataJson) return false;
  try {
    const p = JSON.parse(attendeeDataJson)?.partner;
    return p?.sigoPlayroom === true && p?.aceptaValores === true && p?.aceptaPermanencia === true;
  } catch {
    return false;
  }
}

export const PARTNER_DEFAULT_HEADLINE =
  'B2B Aldo Medel x German Courtin · Pista Tech · por primera vez en Playroom';

/** Borrador del derecho de permanencia -- editable desde el admin
 * (`partnerCampaigns.rulesText`). Una regla por línea. */
export const PARTNER_DEFAULT_RULES = [
  'Respeto ante todo: aquí cada persona decide sobre su cuerpo, su espacio y sus límites. Nadie tiene que justificar un "no".',
  'Consentimiento siempre: se pregunta antes de acercarse o tocar, y un "no" o un silencio se respetan a la primera. Mirar no es invitar.',
  'Fotos y videos: está prohibido grabar o fotografiar a otras personas sin su permiso expreso.',
  'Cuida tu estado: ven a disfrutar, no a pasarte. Si tu consumo de alcohol o de lo que sea te hace perder el control o incomoda al resto, el equipo te pedirá que te retires.',
  'Derecho de permanencia: quien no respete estas reglas será retirado de la fiesta sin devolución, y no podrá volver a ingresar a ningún evento de Mansion Playroom.',
  'Si algo te incomoda, busca al equipo Playroom: estamos para cuidarte.',
].join('\n');

export function partnerRulesList(rulesText: string | null | undefined): string[] {
  return (rulesText?.trim() ? rulesText : PARTNER_DEFAULT_RULES)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export type PartnerCampaignConfig = {
  isActive: number | boolean;
  pricePerPerson: number;
  allowedAccesoSlugs: unknown;
  maxPersons: number | null;
};

export type PartnerOrderLine = {
  ticketTypeId: number;
  category: string | null | undefined;
  accesoSlug: string | null | undefined;
  quantity: number;
};

/** Precio de cada línea de una orden hecha por el link de la campaña. Pura
 * (sin base de datos) para poder testearla: createOrder le pasa las líneas
 * ya resueltas contra ticketTypes y las personas ya vendidas por la campaña.
 * Las líneas `acceso` toman el precio de la campaña; los extras
 * (estacionamiento, carga de saldo...) se cobran a su precio normal, así que
 * para esas devuelve `null` y createOrder usa el de siempre. */
export function priceForPartnerOrder(
  campaign: PartnerCampaignConfig,
  lines: PartnerOrderLine[],
  personasSold: number,
): { unitPrices: Map<number, number | null>; personas: number } {
  if (!campaign.isActive) throw new Error('Este link de la comunidad ya no está disponible. Puedes comprar tu entrada en la web normal.');
  const allowed = partnerAllowedAccesos(campaign.allowedAccesoSlugs);
  const unitPrices = new Map<number, number | null>();
  let personas = 0;
  for (const line of lines) {
    if (line.category !== 'acceso') {
      unitPrices.set(line.ticketTypeId, null);
      continue;
    }
    const slug = line.accesoSlug ?? '';
    const price = allowed.includes(slug) ? partnerAccessPrice(campaign.pricePerPerson, slug) : null;
    if (price == null) throw new Error('Este tipo de acceso no está disponible en el link de la comunidad.');
    unitPrices.set(line.ticketTypeId, price);
    personas += PARTNER_PERSONAS[slug] * line.quantity;
  }
  if (personas === 0) throw new Error('Elige un acceso para continuar.');
  if (campaign.maxPersons != null && personasSold + personas > campaign.maxPersons) {
    throw new Error('Se agotaron los cupos especiales de la comunidad. Puedes comprar tu entrada en la web normal.');
  }
  return { unitPrices, personas };
}

/** Mensaje cuando alguien que ya es cliente de Playroom entra por el link
 * de la comunidad: el checkout lo reconoce (empieza con este prefijo) y le
 * ofrece el botón a la compra normal. */
export const PARTNER_EXISTING_CUSTOMER_MESSAGE =
  'Ya eres parte de Playroom 💜 Este link es solo para quienes vienen por primera vez con la comunidad. Tu entrada la puedes comprar en la web normal.';
