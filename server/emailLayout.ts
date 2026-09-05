/**
 * El layout compartido de TODOS los correos del sitio.
 *
 * ⚠️ POR QUÉ EXISTE — antes cada `build*Email()` de `server/email.ts` repetía
 * a mano su propio `<!DOCTYPE>`, `<head>`, `<body>`, contenedor de 600px,
 * encabezado y pie. El bloque `<head>` estaba duplicado literalmente 14 veces
 * y el pie 6 veces; peor todavía, 10 de los 16 correos NO tenían pie, así que
 * el correo de bienvenida de embajador o el de recordatorio terminaban sin
 * Instagram, sin web y sin copyright. Cambiar cualquier cosa del aspecto
 * general significaba editar 16 funciones a mano y acordarse de las 16.
 *
 * Ahora el aspecto vive acá una sola vez y los 16 correos lo heredan.
 *
 * ⚠️ POR QUÉ ES OSCURO (04/09) — el dueño abrió el correo de compra en la app
 * de Gmail en modo oscuro y era ilegible: Gmail invierte los correos claros
 * por su cuenta (fondos sí, texto no siempre), así que las tarjetas pastel
 * quedaban marrón sucio y varias secciones directamente en blanco, con el
 * texto oscuro sobre fondo oscuro. No hay meta ni CSS que lo impida: la app
 * de Gmail ignora `color-scheme`. La única defensa real es que el correo YA
 * sea oscuro -- Gmail no invierte lo que ya está oscuro. De paso pega con la
 * marca: el logo es rosa y celeste con contorno blanco, o sea un cartel de
 * neón, y sobre negro por fin se lee como tal.
 */
import { BRAND, EVENT_BRAND } from '../shared/eventBrand';

/** El dominio propio todavía no sirve los assets, así que las imágenes de los
 * correos (logo, QR) salen por el dominio de Vercel. Apenas se conecte
 * `mansionplayroom.cl` alcanza con setear `APP_URL` en Vercel. */
export const EMAIL_BASE_URL = process.env.APP_URL && process.env.APP_URL !== 'https://mansionplayroom.cl'
  ? process.env.APP_URL
  : 'https://candylandwebsite.vercel.app';

export const LOGO_URL = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;

/* ─── Paleta "neón en la oscuridad" ────────────────────────────
 *
 * Negro mate de fondo, tinta clara, acentos pastel encendidos. Los fondos de
 * las tarjetas son hex SÓLIDOS (no `rgba`) a propósito: son exactamente el
 * mismo tono que daría el pastel al 9% sobre el negro, pero renderizan igual
 * en TODOS los clientes, incluido Outlook de escritorio, que no soporta
 * `rgba`. El efecto "vidrio flotante" no viene de la transparencia (el
 * `backdrop-filter` no existe en ningún cliente de correo) sino del borde de
 * un pelo + el halo de color de `card({ glow })`. */

/** Negro mate del lienzo. Misma familia que las pantallas oscuras que la app
 * ya usa en /caja (`#0d0810`), no un negro puro que resulta duro. */
export const BG = '#0B0A0D';
/** Piso neutro de una tarjeta: blanco al ~5% sobre el negro. */
export const SURFACE = '#16151A';
/** Borde de un pelo: blanco al ~10% sobre el negro. */
export const BORDER = '#272430';

/** La tinta del sistema. Sobre papel negro, la tinta es clara -- el nombre se
 * mantiene para no renombrar sus ~50 usos en `server/email.ts`. Blanco cálido,
 * no puro: el blanco puro sobre negro vibra y cansa a los ojos. */
export const INK = '#F4EFF5';
export const MUTED = '#A99FB0';
export const FAINT = '#6F6779';

/** Acentos pastel encendidos.
 * - `bg`: el tinte sólido de la tarjeta de esa sección.
 * - `text`: el pastel brillante, para títulos y cifras sobre el negro.
 * - `solid`: el relleno de un botón (texto blanco encima).
 * Los tonos salen del logo mismo (rosa y celeste de neón) más el dorado que
 * ya identifica al 2º aniversario. */
export const ACCENT = {
  pink: { bg: '#21151D', text: '#FF7FC3', solid: '#EC5FA3' },
  blue: { bg: '#141B23', text: '#6FC9FF', solid: '#3AA0BE' },
  yellow: { bg: '#201B16', text: '#F3CC70', solid: '#D4A537' },
  lilac: { bg: '#1C1823', text: '#C9A9FF', solid: '#A98CE0' },
  gold: { bg: '#201B16', text: '#F3CC70', solid: '#D4A537' },
} as const;

export type AccentName = keyof typeof ACCENT;

/** Halos de neón por acento -- es lo que da la sensación de "alumbrado".
 * `box-shadow` lo soportan Gmail y Apple Mail; Outlook de escritorio lo
 * ignora y deja la tarjeta plana, que sigue siendo correcta. */
const GLOW: Record<AccentName, string> = {
  pink: '0 18px 50px -22px rgba(236,95,163,0.55)',
  blue: '0 18px 50px -22px rgba(58,160,190,0.45)',
  yellow: '0 18px 50px -22px rgba(212,165,55,0.45)',
  lilac: '0 18px 50px -22px rgba(169,140,224,0.45)',
  gold: '0 18px 50px -22px rgba(212,165,55,0.45)',
};

export function card(inner: string, opts?: { bg?: string; border?: boolean; padding?: string; glow?: AccentName }) {
  const glow = opts?.glow ? `box-shadow:${GLOW[opts.glow]};` : '';
  return `<div style="background:${opts?.bg ?? SURFACE};border-radius:20px;padding:${opts?.padding ?? '24px'};${opts?.border === false ? '' : `border:1px solid ${BORDER};`}${glow}margin-bottom:20px;">${inner}</div>`;
}

export function sectionTitle(emoji: string, text: string) {
  return `<h3 style="color:${INK};font-size:19px;font-weight:800;margin:0 0 14px;">${emoji} ${text}</h3>`;
}

/** Etiqueta chica en mayúsculas espaciadas. Es el recurso tipográfico que le
 * da carácter al correo sin depender de una fuente que Gmail no va a bajar. */
export function eyebrow(text: string, color: string = FAINT) {
  return `<p style="color:${color};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:2.5px;margin:0 0 8px;">${text}</p>`;
}

/**
 * Una fila de dos columnas (etiqueta a la izquierda, valor a la derecha)
 * usando `<table>`.
 *
 * ⚠️ NUNCA usar `display:flex` para esto. Gmail lo elimina, y los dos lados
 * quedan pegados sin separación: así se leía `1x ACCESO SOLTERA$10.000` y
 * `Total pagado$1.100` en el correo real (reportado por el dueño el 04/09,
 * eran 11 filas repartidas por todo el archivo). La tabla de dos celdas es
 * la única forma confiable en correo.
 */
export function row(left: string, right: string, opts?: { divider?: boolean; padding?: string }) {
  const cell = `padding:${opts?.padding ?? '9px 0'};${opts?.divider === false ? '' : `border-bottom:1px solid ${BORDER};`}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;">
    <tr>
      <td align="left" valign="top" style="${cell}">${left}</td>
      <td align="right" valign="top" style="${cell}">${right}</td>
    </tr>
  </table>`;
}

/** Grilla de N columnas usando <table> (no flex/grid) — mucho más confiable
 * en Outlook/clientes de correo viejos que no soportan CSS moderno. */
export function grid(cells: string[], cols: number) {
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const width = Math.floor(100 / cols);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 8px;margin:0 -8px 8px;">
    ${rows.map(row => `<tr>${row.map(c => `<td width="${width}%" valign="top" style="padding:0;">${c}</td>`).join('')}${row.length < cols ? `<td width="${(cols - row.length) * width}%"></td>` : ''}</tr>`).join('')}
  </table>`;
}

/** Botón píldora, el único estilo de CTA del sistema. Con halo propio: sobre
 * negro, un botón sin resplandor se ve apagado. */
export function button(href: string, label: string, accent: AccentName = 'pink') {
  const a = ACCENT[accent];
  return `<a href="${href}" style="display:inline-block;background:${a.solid};color:#FFFFFF;text-decoration:none;padding:15px 34px;border-radius:999px;font-weight:800;font-size:14px;letter-spacing:0.3px;box-shadow:${GLOW[accent]};">${label}</a>`;
}

/** Botón secundario: contorno pastel sobre el negro, sin relleno. */
export function buttonGhost(href: string, label: string, accent: AccentName = 'pink') {
  const a = ACCENT[accent];
  return `<a href="${href}" style="display:inline-block;background:${SURFACE};color:${a.text};text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;font-size:14px;border:1px solid ${BORDER};">${label}</a>`;
}

/** El guiño de disfraz: chip dorado sobre vidrio. */
export function costumeBadge() {
  return `<span style="display:inline-block;background:${ACCENT.gold.bg};color:${ACCENT.gold.text};font-size:12px;font-weight:800;letter-spacing:0.6px;padding:8px 16px;border-radius:999px;border:1px solid ${BORDER};">${EVENT_BRAND.costumeBadge}</span>`;
}

/** La banda de aniversario: el kicker en dorado sobre el negro, mayúsculas
 * bien espaciadas, con un hilo dorado abajo. Exportada además de usarse
 * dentro de `emailHero` -- `buildMailingBlastEmail` arma su propio hero a
 * medida (con un banner de imagen opcional antes) y la necesita suelta. */
export function anniversaryBand() {
  return `<div style="background-color:${BG};padding:14px 20px 12px;text-align:center;border-bottom:1px solid ${ACCENT.gold.bg};">
      <p style="color:${ACCENT.gold.text};font-size:11px;font-weight:800;letter-spacing:3.5px;margin:0;">${EVENT_BRAND.kicker}</p>
    </div>`;
}

export interface HeroOptions {
  /** Color del halo y del CTA del encabezado. */
  accent?: AccentName;
  emoji: string;
  title: string;
  subtitle?: string;
  cta?: { href: string; label: string };
  /** Banda dorada de "2 AÑOS · 30 DE OCTUBRE" arriba del encabezado. */
  anniversary?: boolean;
  /** Chip "🎭 Disfraz obligatorio" bajo el título. */
  costume?: boolean;
}

/** El encabezado: logo de neón sobre negro, con un resplandor de color detrás
 * -- el `radial-gradient` es decoración pura (siempre hay un
 * `background-color` sólido debajo), así que si un cliente no lo soporta
 * queda el negro mate y no se pierde nada legible. */
export function emailHero(o: HeroOptions) {
  const a = ACCENT[o.accent ?? 'pink'];
  const glowRgba = o.accent === 'blue' ? 'rgba(58,160,190,0.30)'
    : o.accent === 'yellow' || o.accent === 'gold' ? 'rgba(212,165,55,0.26)'
    : o.accent === 'lilac' ? 'rgba(169,140,224,0.28)'
    : 'rgba(236,95,163,0.32)';
  return `${o.anniversary ? anniversaryBand() : ''}
    <div style="background-color:${BG};background-image:radial-gradient(600px 260px at 50% -40px, ${glowRgba}, transparent 72%);padding:38px 24px 34px;text-align:center;">
      <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:58px;width:auto;margin-bottom:22px;" />
      <p style="font-size:46px;margin:0 0 10px;">${o.emoji}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;line-height:1.15;margin:0 0 8px;">${o.title}</h1>
      ${o.subtitle ? `<p style="color:${MUTED};font-size:15px;margin:0 0 ${o.cta || o.costume ? '22px' : '0'};">${o.subtitle}</p>` : ''}
      ${o.costume ? `<p style="margin:0 0 ${o.cta ? '20px' : '0'};">${costumeBadge()}</p>` : ''}
      ${o.cta ? button(o.cta.href, o.cta.label, o.accent ?? 'pink') : ''}
    </div>`;
}

/** Pie con logo, redes y copyright. Ahora va en TODOS los correos de cliente
 * -- antes faltaba en 5 de ellos (bienvenida, semanal, regalo, recordatorio,
 * postulación recibida), que terminaban sin ningún link de vuelta al sitio. */
export function emailFooter() {
  return `<div style="text-align:center;padding:26px 24px;border-top:1px solid ${BORDER};margin-top:8px;">
      <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:22px;width:auto;margin-bottom:12px;opacity:0.65;" />
      <p style="margin:0 0 8px;">
        <a href="${BRAND.instagram}" style="color:${MUTED};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="${BRAND.web}" style="color:${MUTED};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">© ${new Date().getFullYear()} ${BRAND.nombre} · ${BRAND.ciudad}</p>
    </div>`;
}

export interface ShellOptions {
  /** Texto de vista previa (lo que se lee en la bandeja antes de abrir). */
  preheader?: string;
  /** HTML que va antes del contenedor de 600px (ej. banner full-width). */
  beforeContainer?: string;
  /** El encabezado ya armado con `emailHero`. Los correos internos no llevan. */
  hero?: string;
  /** El cuerpo. Se envuelve en el padding estándar salvo `rawBody`. */
  body: string;
  /** `false` en los correos internos (reportes que el dueño se manda a sí
   * mismo): un pie de marca ahí es ruido, no información. */
  footer?: boolean;
  /** No envolver el cuerpo en el padding estándar (para layouts a medida). */
  rawBody?: boolean;
}

/**
 * El `<!DOCTYPE>` + `<head>` + `<body>` + contenedor, una sola vez.
 *
 * ⚠️ TODO COLOR DE TEXTO VA EXPLÍCITO, SIEMPRE, y todo fondo tiene un
 * `background-color` sólido. Un correo oscuro que se apoya en el color por
 * defecto del cliente termina con texto negro sobre negro en cuanto alguien
 * lo abre en un cliente que asume fondo blanco. Los `radial-gradient` que hay
 * son decoración encima de un color sólido: si el cliente no los soporta, no
 * se pierde nada legible.
 */
export function emailShell(o: ShellOptions) {
  const body = o.rawBody ? o.body : `<div style="padding:30px 22px 0;">${o.body}</div>`;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- El correo ya es oscuro, así que se declara compatible con los dos
       esquemas: los clientes que respetan esto (Apple Mail, Outlook.com) lo
       dejan tal cual en vez de intentar adaptarlo, y la app de Gmail, que
       ignora la meta, tampoco tiene nada que invertir. -->
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <style>
    /* El @import va PRIMERO: el CSS lo exige, si no el cliente lo descarta
       entero. Syne es la tipografía de títulos del sitio; Gmail descarta el
       @import y cae a Helvetica/Arial sin romperse, mientras que Apple Mail
       (la mayor parte del tráfico móvil en Chile) sí la carga. Degradación
       limpia: si no carga, no se nota. */
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
    h1, h2, h3 { font-family: 'Syne', 'Helvetica Neue', Arial, sans-serif; }
    /* Los clientes que sí respetan el esquema no necesitan tocar nada -- el
       correo ya nace oscuro. Esta regla solo evita que alguno "ayude"
       aclarando el fondo y dejando la tinta clara sobre blanco. */
    @media (prefers-color-scheme: light) {
      .mp-canvas { background-color: ${BG} !important; }
      .mp-ink { color: ${INK} !important; }
    }
  </style>
</head>
<body class="mp-canvas" style="margin:0;padding:0;background-color:${BG};font-family:'Helvetica Neue',Arial,sans-serif;">
  ${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</div>` : ''}
  <div class="mp-canvas mp-ink" style="max-width:600px;margin:0 auto;padding:0 0 32px;background-color:${BG};color:${INK};">
    ${o.beforeContainer ?? ''}
    ${o.hero ?? ''}
    ${body}
    ${o.footer === false ? '' : emailFooter()}
  </div>
</body>
</html>`;
}
