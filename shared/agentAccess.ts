/* Los accesos que el agente puede vender con botón directo al checkout.
 *
 * Las llaves (`key`) y los slugs son los MISMOS de `ACCESO_OPTIONS` en
 * client/src/pages/Checkout.tsx: el checkout tiene un modo express
 * (`?rapida=1&op=<llave>`) que fija el acceso y salta al primer paso que
 * falta, así la persona no vuelve a elegir cómo viene. `soltero` y
 * `dos-hombres` quedan fuera a propósito: piden código de comunidad. */

export const AGENT_ACCESS = [
  { key: 'soltera', slug: 'soltera', label: 'Voy sola', button: 'Comprar Soltera 🔥' },
  { key: 'soltero', slug: 'soltero', label: 'Voy solo', button: 'Comprar Solo 🔥' },
  { key: 'pareja', slug: 'duo', label: 'Pareja', button: 'Comprar Dúo 🔥' },
  { key: 'dos-mujeres', slug: 'duo_mujeres', label: 'Dos mujeres', button: 'Comprar 2 mujeres 🔥' },
  { key: 'dos-hombres', slug: 'duo', label: 'Dos hombres', button: 'Comprar 2 hombres 🔥' },
  { key: 'trio', slug: 'trio', label: 'Somos 3 (mixto)', button: 'Comprar Trío 🔥' },
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

/** Ruta del checkout de una colaboración (PLAYMORE) con el acceso ya elegido: el mismo `?items=` y `?quien=` que usa su
 * landing. «Dos hombres» y «Voy solo» llegan al paso del código de comunidad; Pareja y Dos hombres comparten el acceso
 * `duo` y se distinguen por `quien`. */
export function buildColabCheckoutPath(eventSlug: string, key: AgentAccessKey, quantity = 1): string {
  const access = accessByKey(key);
  const qty = cleanQuantity(quantity);
  return `/checkout/${encodeURIComponent(eventSlug)}?items=${access?.slug ?? key}:${qty}&quien=${key}`;
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
  { key: 'dos-hombres', re: /\b(dos hombres|2 hombres|dos chicos|2 chicos)\b/ },
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
  if (hits.includes('dos-mujeres') || hits.includes('dos-hombres')) hits = hits.filter((k) => k !== 'pareja');
  return hits.length === 1 ? hits[0] : '';
}
