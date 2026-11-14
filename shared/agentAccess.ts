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
  { key: 'soltera', re: /(?<!\buna )(?<!\bla )\b(soltera|vengo sola|voy sola|ir sola|iria sola|sola)\b/ },
];

/** Red de seguridad cuando el modelo mandó el botón de compra sin decir el acceso:
 * lo deduce del texto ("somos pareja", "voy sola"). Si calzan dos accesos distintos
 * no adivina: devuelve ''. */
export function inferAccessKey(...texts: Array<string | null | undefined>): AgentAccessKey | '' {
  // «Viene sola/o» o «sola o solo» (lo escribe la ficha del agente cuando no sabe) no dice quién es.
  const t = norm(texts.filter(Boolean).join(' . ')).replace(/\bsol[oa]\s*\/\s*[oa]\b|\bsola o solo\b|\bsolo o sola\b|\bsolo\/a\b/g, ' ');
  let hits = INFER.filter((i) => i.re.test(t)).map((i) => i.key);
  // «Somos dos mujeres» también calza con «somos dos»: gana el más específico.
  if (hits.includes('dos-mujeres') || hits.includes('dos-hombres')) hits = hits.filter((k) => k !== 'pareja');
  return hits.length === 1 ? hits[0] : '';
}

// --- Género y acceso correcto ------------------------------------------------------------------------------------
// Caso real (14/11): alguien escribió «solo» (un hombre) y el agente le ofreció la Soltera. Un acceso individual nunca se
// asume: «sola» es mujer, «solo» es hombre y, si no lo dijo, se le pregunta con respeto.

export type Gender = 'f' | 'm';

const FEMALE = /(?<!\buna )(?<!\bla )\b(sola|soltera|mujer sola|soy (una )?(mujer|chica|nena|senora))\b/;
const MALE = /\b(soltero|hombre solo|soy (un )?(hombre|chico|varon|caballero)|(voy|vengo|ir|iria|ire|iremos|llego|llegaria|asistir|asistiria|asistire) solo)\b/;
/** La respuesta suelta «solo» / «yo solo» a «¿vienes sola…?»: es la forma masculina. */
const BARE_SOLO = /^(si )?(yo )?solo( yo)?$/;

/** El género que la persona dijo de sí misma en sus propios mensajes (nunca lo que escribió el agente ni la ficha). `null`
 * si no lo dijo, o si dijo las dos cosas. */
export function detectGender(userTexts: Array<string | null | undefined>): Gender | null {
  let f = false;
  let m = false;
  for (const raw of userTexts) {
    const t = norm(raw ?? '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (FEMALE.test(t)) f = true;
    if (MALE.test(t) || BARE_SOLO.test(t)) m = true;
  }
  return f === m ? null : f ? 'f' : 'm';
}

export type AccessProblemKind = 'gender_unknown' | 'woman_access_for_man' | 'solo_needs_code';
export interface AccessProblem { kind: AccessProblemKind; instruction: string }

/** ¿El acceso que eligió el agente le corresponde a esta persona? `null` = sí. Si no, qué decirle al agente para que
 * lo corrija (se le pide reescribir una vez) y qué sería de esta persona. */
export function accessProblem(access: AgentAccessKey | '', userTexts: Array<string | null | undefined>, opts: { playmore: boolean }): AccessProblem | null {
  if (access === 'soltera') {
    const gender = detectGender(userTexts);
    if (gender === 'f') return null;
    if (gender === 'm') {
      return {
        kind: 'woman_access_for_man',
        instruction: opts.playmore
          ? 'ATENCIÓN: la persona dijo que viene SOLO, o sea es un hombre. NO le ofrezcas ni le nombres el acceso Soltera (es solo para mujeres). Dile con calidez y sin juicio lo que le corresponde: en su primera vez, el acceso Pareja yendo con una chica acompañante (con el precio real de Pareja de los datos); «Voy solo» es solo para quien ya tiene su código de comunidad. Cierra con el botón: action=buy_link y accessOption=pareja (si dice que ya tiene código, soltero).'
          : 'ATENCIÓN: la persona dijo que viene SOLO, o sea es un hombre. NO le ofrezcas ni le nombres el acceso Soltera (es solo para mujeres): su acceso es «Voy solo» (soltero), con su precio real de los datos. Cierra con el botón: action=buy_link y accessOption=soltero.',
      };
    }
    return {
      kind: 'gender_unknown',
      instruction: 'ATENCIÓN: todavía NO sabes si la persona es mujer u hombre y no lo puedes asumir. NO nombres ni ofrezcas el acceso Soltera ni «Voy solo», ni precios de un acceso individual. Dile con calidez y respeto que, para darle el acceso exacto, necesitas saber si viene como mujer o como hombre, y pregúntaselo. Manda igual el botón general: action=buy_link con accessOption vacío.',
    };
  }
  if (access === 'soltero' && opts.playmore && !/\bcodigo\b/.test(norm((userTexts.filter(Boolean) as string[]).join(' ')))) {
    return {
      kind: 'solo_needs_code',
      instruction: 'ATENCIÓN: «Voy solo» (soltero) en PLAYMORE es solo para quien ya tiene su código de comunidad, y esta persona no ha dicho que lo tiene. Ofrécele lo que le corresponde en su primera vez: el acceso Pareja yendo con una chica acompañante, con su precio real de los datos, y cuéntale con calidez que si ya tiene código de comunidad te avise para mandarle «Voy solo». Cierra con el botón: action=buy_link y accessOption=pareja.',
    };
  }
  return null;
}

/** Último recurso si el agente insiste en un acceso que no le corresponde: un mensaje seguro (sin precios) y el acceso
 * que sí. El botón lleva a la persona al checkout correcto igual. */
export function safeAccessReply(problem: AccessProblem, opts: { playmore: boolean }): { reply: string; accessOption: AgentAccessKey | '' } {
  if (problem.kind === 'gender_unknown') {
    return { reply: 'Para darte el acceso exacto, ¿vienes como mujer o como hombre? 💜\n\nMientras tanto te dejo acá abajo las fechas y entradas 👇', accessOption: '' };
  }
  if (opts.playmore || problem.kind === 'solo_needs_code') {
    return { reply: 'En tu primera vez en PLAYMORE te corresponde el acceso Pareja, yendo con una chica acompañante 💜\n\nSi ya tienes tu código de comunidad, avísame y te mando el acceso «Voy solo». Te dejo abajo el botón 👇', accessOption: 'pareja' };
  }
  return { reply: 'Te dejo abajo el botón para asegurar tu acceso 💜', accessOption: 'soltero' };
}

/** Una respuesta que nombra un precio siempre lleva el botón de compra (regla del dueño), salvo que la persona diga
 * que ya compró. */
export function replyNeedsBuyButton(reply: string, incomingText: string): boolean {
  if (!/\$\s?\d/.test(reply)) return false;
  return !/\bya (compr|pagu|adquir|tengo|tenemos|saque|sacamos)/.test(norm(incomingText));
}
