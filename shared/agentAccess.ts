/* Los accesos que el agente puede vender con botón directo al checkout.
 *
 * Las llaves (`key`) y los slugs son los MISMOS de `ACCESO_OPTIONS` en
 * client/src/pages/Checkout.tsx: el checkout tiene un modo express
 * (`?rapida=1&op=<llave>`) que fija el acceso y salta al primer paso que
 * falta, así la persona no vuelve a elegir cómo viene. `soltero` y
 * `dos-hombres` quedan fuera a propósito: piden código de comunidad. */

export const AGENT_ACCESS = [
  { key: 'soltera', slug: 'soltera', label: 'Soltera', button: 'Comprar Soltera 🔥' },
  { key: 'pareja', slug: 'duo', label: 'Dúo', button: 'Comprar Dúo 🔥' },
  { key: 'dos-mujeres', slug: 'duo_mujeres', label: 'Dos mujeres (2x1)', button: 'Comprar 2x1 🔥' },
  { key: 'trio', slug: 'trio', label: 'Trío', button: 'Comprar Trío 🔥' },
  { key: 'grupo', slug: 'grupo', label: 'Grupo', button: 'Comprar Grupo 🔥' },
] as const;

export type AgentAccessKey = (typeof AGENT_ACCESS)[number]['key'];
export const AGENT_ACCESS_KEYS: AgentAccessKey[] = AGENT_ACCESS.map((a) => a.key);

export function accessByKey(key: string | null | undefined) {
  return AGENT_ACCESS.find((a) => a.key === key) ?? null;
}

/** La llave del acceso al que corresponde el `accesoSlug` de una entrada, o ''. */
export function accessKeyForSlug(slug: string | null | undefined): AgentAccessKey | '' {
  return AGENT_ACCESS.find((a) => a.slug === slug)?.key ?? '';
}

/** Cantidad de entradas del mismo acceso: entero entre 1 y 6. */
export function cleanQuantity(raw: unknown): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : 1;
}

/** Ruta del checkout con el acceso ya elegido (sin dominio ni UTM). */
export function buildCheckoutPath(eventSlug: string, key: AgentAccessKey, quantity = 1): string {
  const access = accessByKey(key);
  const qty = cleanQuantity(quantity);
  const items = access && qty > 1 ? `&items=${access.slug}:${qty}` : '';
  return `/checkout/${encodeURIComponent(eventSlug)}?rapida=1&op=${key}${items}`;
}

function norm(text: string): string {
  return text.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase();
}

const INFER: { key: AgentAccessKey; re: RegExp }[] = [
  { key: 'dos-mujeres', re: /\b(dos mujeres|2 mujeres|dos amigas|2x1)\b/ },
  { key: 'trio', re: /\b(trio|tres personas|3 personas|somos tres|somos 3|los tres)\b/ },
  { key: 'grupo', re: /\b(grupo|cuatro personas|4 personas|somos cuatro|somos 4)\b/ },
  { key: 'pareja', re: /\b(pareja|duo|mi novi[oa]|mi espos[oa]|mi marido|los dos|somos dos|somos 2|dos personas|2 personas)\b/ },
  { key: 'soltera', re: /\b(soltera|vengo sola|voy sola|ir sola|iria sola|sola)\b/ },
];

/** Red de seguridad cuando el modelo mandó el botón de compra sin decir el acceso:
 * lo deduce del texto ("somos pareja", "voy sola"). Si calzan dos accesos distintos
 * no adivina: devuelve ''. */
export function inferAccessKey(...texts: Array<string | null | undefined>): AgentAccessKey | '' {
  const t = norm(texts.filter(Boolean).join(' . '));
  let hits = INFER.filter((i) => i.re.test(t)).map((i) => i.key);
  // «Somos dos mujeres» también calza con «somos dos»: gana el más específico.
  if (hits.includes('dos-mujeres')) hits = hits.filter((k) => k !== 'pareja');
  return hits.length === 1 ? hits[0] : '';
}
