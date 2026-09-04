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
 */
import { BRAND, EVENT_BRAND } from '../shared/eventBrand';

/** El dominio propio todavía no sirve los assets, así que las imágenes de los
 * correos (logo, QR) salen por el dominio de Vercel. Apenas se conecte
 * `mansionplayroom.cl` alcanza con setear `APP_URL` en Vercel. */
export const EMAIL_BASE_URL = process.env.APP_URL && process.env.APP_URL !== 'https://mansionplayroom.cl'
  ? process.env.APP_URL
  : 'https://candylandwebsite.vercel.app';

export const LOGO_URL = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;

/** Paleta pastel para los acentos de cada sección.
 *
 * `gold` es el agregado del 2º aniversario: los cuatro pasteles de siempre
 * (rosa/celeste/amarillo/lila) siguen intactos a propósito, así ningún correo
 * cambia de color por accidente -- el dorado es un acento NUEVO que solo usa
 * la banda de aniversario y el chip de disfraz. El tono sale del perfil
 * "rosa romántico + dorado elegante", que es el que mejor calza con la paleta
 * candy que los correos ya tenían. */
export const ACCENT = {
  pink: { bg: '#FCEEF4', text: '#D9538F', solid: '#EC5FA3' },
  blue: { bg: '#EAF6FA', text: '#3AA0BE', solid: '#5FC2DE' },
  yellow: { bg: '#FEF8E4', text: '#C89A2E', solid: '#F0C24B' },
  lilac: { bg: '#F3EDFB', text: '#8B6FC9', solid: '#A98CE0' },
  gold: { bg: '#FBF5E6', text: '#A16207', solid: '#D4A537' },
} as const;

export type AccentName = keyof typeof ACCENT;

/** Ciruela profundo: el único color oscuro del sistema. Se reserva para la
 * banda de aniversario y el chip de disfraz -- es lo que hace que el correo
 * se lea "fecha especial" sin abandonar la identidad candy del resto. */
export const PLUM = '#4A1D3F';

export const INK = '#3D2A35';
export const MUTED = '#7A6670';
export const FAINT = '#9A8A92';
export const BORDER = '#F2D9E4';

export function card(inner: string, opts?: { bg?: string; border?: boolean; padding?: string }) {
  return `<div style="background:${opts?.bg ?? '#FFFFFF'};border-radius:20px;padding:${opts?.padding ?? '24px'};${opts?.border === false ? '' : `border:1px solid ${BORDER};`}margin-bottom:20px;">${inner}</div>`;
}

export function sectionTitle(emoji: string, text: string) {
  return `<h3 style="color:${INK};font-size:19px;font-weight:800;margin:0 0 14px;">${emoji} ${text}</h3>`;
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

/** Botón píldora, el único estilo de CTA del sistema. */
export function button(href: string, label: string, accent: AccentName = 'pink') {
  const a = ACCENT[accent];
  return `<a href="${href}" style="display:inline-block;background:${a.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;letter-spacing:0.3px;">${label}</a>`;
}

/** El guiño de disfraz: chip dorado sobre ciruela. Se usa donde aporta
 * (compra, recordatorio, campaña), NO en todos los correos -- en un aviso de
 * "subiste de nivel" o en un regalo de trago no viene al caso. */
export function costumeBadge() {
  return `<span style="display:inline-block;background:${PLUM};color:${ACCENT.gold.solid};font-size:12px;font-weight:800;letter-spacing:0.6px;padding:7px 16px;border-radius:999px;">${EVENT_BRAND.costumeBadge}</span>`;
}

/** La banda de aniversario: franja ciruela con el kicker en dorado,
 * mayúsculas espaciadas. Va pegada arriba del encabezado. Exportada además
 * de usarse dentro de `emailHero` -- `buildMailingBlastEmail` arma su propio
 * hero a medida (con un banner de imagen opcional antes) y la necesita
 * suelta. */
export function anniversaryBand() {
  return `<div style="background-color:${PLUM};padding:11px 20px;text-align:center;">
      <p style="color:${ACCENT.gold.solid};font-size:11px;font-weight:800;letter-spacing:3px;margin:0;">${EVENT_BRAND.kicker}</p>
    </div>`;
}

export interface HeroOptions {
  /** Color pastel del fondo del encabezado. */
  accent?: AccentName;
  emoji: string;
  title: string;
  subtitle?: string;
  cta?: { href: string; label: string };
  /** Banda ciruela + dorada de "2 AÑOS · 30 DE OCTUBRE" arriba del encabezado. */
  anniversary?: boolean;
  /** Chip "🎭 Disfraz obligatorio" bajo el título. */
  costume?: boolean;
}

export function emailHero(o: HeroOptions) {
  const a = ACCENT[o.accent ?? 'pink'];
  return `${o.anniversary ? anniversaryBand() : ''}
    <div style="background-color:${a.bg};padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">${o.emoji}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">${o.title}</h1>
      ${o.subtitle ? `<p style="color:${MUTED};font-size:15px;margin:0 0 ${o.cta || o.costume ? '24px' : '0'};">${o.subtitle}</p>` : ''}
      ${o.costume ? `<p style="margin:0 0 ${o.cta ? '20px' : '0'};">${costumeBadge()}</p>` : ''}
      ${o.cta ? `<a href="${o.cta.href}" style="display:inline-block;background:${a.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;letter-spacing:0.3px;">${o.cta.label}</a>` : ''}
    </div>`;
}

/** Pie con logo, redes y copyright. Ahora va en TODOS los correos de cliente
 * -- antes faltaba en 5 de ellos (bienvenida, semanal, regalo, recordatorio,
 * postulación recibida), que terminaban sin ningún link de vuelta al sitio. */
export function emailFooter() {
  return `<div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:8px;">
      <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="${BRAND.instagram}" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="${BRAND.web}" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
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
 * ⚠️ NO USAR `linear-gradient` DE FONDO EN NINGÚN LADO. Gmail ignora el
 * `color-scheme` de abajo y aplica su propia inversión a modo oscuro igual:
 * sabe invertir el color del TEXTO pero no un gradiente, y esa mezcla dejaba
 * el título del encabezado casi del mismo tono que su fondo (invisible). Con
 * `background-color` sólido, fondo y texto se invierten juntos y el texto
 * sigue legible tanto en claro como en oscuro. Es un bug real ya resuelto:
 * no reintroducir gradientes.
 */
export function emailShell(o: ShellOptions) {
  const body = o.rawBody ? o.body : `<div style="padding:32px 24px 0;">${o.body}</div>`;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    /* El @import va PRIMERO: el CSS lo exige, si no el navegador/cliente lo
       descarta entero. Syne es la tipografía de títulos del sitio; Gmail
       descarta el @import y cae a Helvetica/Arial sin romperse, mientras que
       Apple Mail (la mayor parte del tráfico móvil en Chile) sí la carga y
       ahí el correo pasa a hablar el mismo idioma tipográfico que
       mansionplayroom.cl. Degradación limpia: si no carga, no se nota. */
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
    :root { color-scheme: light only; }
    h1, h2, h3 { font-family: 'Syne', 'Helvetica Neue', Arial, sans-serif; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  ${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</div>` : ''}
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">
    ${o.beforeContainer ?? ''}
    ${o.hero ?? ''}
    ${body}
    ${o.footer === false ? '' : emailFooter()}
  </div>
</body>
</html>`;
}
