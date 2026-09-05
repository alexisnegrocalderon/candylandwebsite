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

/** Paleta candy, ahora en versión oscura (ver el porqué en el comentario de
 * `emailShell` más abajo: el correo nace oscuro en vez de quedar claro y
 * depender de que el cliente de correo lo invierta bien).
 *
 * Los cuatro acentos de siempre (rosa/celeste/amarillo/lila) mantienen el
 * mismo `text`/`solid` vívido de antes -- son los que ya se leían bien y
 * siguen leyéndose igual de bien sobre un fondo oscuro. Lo único que cambia
 * es `bg`: pasa de pastel clarito a una versión oscura teñida del mismo tono,
 * pensada como una "tarjeta con tinte de color" flotando sobre el fondo
 * oscuro general, no como una tarjeta clara de por sí -- mismo criterio que
 * ya usan /puerta y /caja en el sitio. `gold` es el agregado del 2º
 * aniversario, para la banda y el chip de disfraz. */
export const ACCENT = {
  pink: { bg: '#3A1F2E', text: '#F395C2', solid: '#EC5FA3' },
  blue: { bg: '#1B2E36', text: '#7FD3EC', solid: '#5FC2DE' },
  yellow: { bg: '#332A18', text: '#F0C24B', solid: '#F0C24B' },
  lilac: { bg: '#2A2138', text: '#C4AEF0', solid: '#A98CE0' },
  gold: { bg: '#332A14', text: '#E0BE6B', solid: '#D4A537' },
} as const;

export type AccentName = keyof typeof ACCENT;

/** Ciruela profundo: el color de la banda de aniversario y el chip de
 * disfraz -- ahora un poco más oscuro que el fondo general para que la
 * banda siga marcando su propio bloque en vez de fundirse con él. */
export const PLUM = '#2E1327';

/** Fondo del correo entero (antes blanco) -- mismo tono base oscuro que ya
 * usan /puerta y /caja en el sitio, así la marca se siente consistente
 * entre lo que se ve en el celular y lo que llega al correo. */
export const PAGE_BG = '#150d13';
/** Fondo de una tarjeta "neutra" (sin tinte de color) -- una superficie
 * apenas más clara que el fondo general, para que se note el relieve sin
 * dejar de ser oscura. */
export const CARD_BG = '#221520';

export const INK = '#F7EEF3';
export const MUTED = '#B79AAB';
export const FAINT = '#8C7186';
export const BORDER = '#3A2436';

export function card(inner: string, opts?: { bg?: string; border?: boolean; padding?: string }) {
  return `<div style="background:${opts?.bg ?? CARD_BG};border-radius:20px;padding:${opts?.padding ?? '24px'};${opts?.border === false ? '' : `border:1px solid ${BORDER};`}margin-bottom:20px;">${inner}</div>`;
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
 * ⚠️ EL CORREO NACE OSCURO A PROPÓSITO -- antes declaraba `color-scheme:
 * light` para pedirle a los clientes de correo que NO lo reprocesaran en
 * modo oscuro, pero Gmail ignora esa meta etiqueta y aplica su propia
 * inversión algorítmica igual: invierte fondos que detecta claros, pero no
 * siempre el texto que va encima, dejando secciones enteras en blanco o con
 * texto invisible. Declarar el correo YA oscuro de fábrica evita el problema
 * de raíz -- Gmail solo re-invierte fondos que detecta claros, así que si ya
 * es oscuro no tiene nada que tocar.
 *
 * ⚠️ NO USAR `linear-gradient` DE FONDO EN NINGÚN LADO. Un cliente que sí
 * reprocesara el correo (o un futuro tema con degradé) invierte el color del
 * TEXTO pero no un gradiente de fondo, y esa mezcla puede dejar un título
 * casi del mismo tono que su fondo (invisible). Con `background-color`
 * sólido, fondo y texto se invierten juntos si algo llega a re-procesarlos.
 */
export function emailShell(o: ShellOptions) {
  const body = o.rawBody ? o.body : `<div style="padding:32px 24px 0;">${o.body}</div>`;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <style>
    /* El @import va PRIMERO: el CSS lo exige, si no el navegador/cliente lo
       descarta entero. Syne es la tipografía de títulos del sitio; Gmail
       descarta el @import y cae a Helvetica/Arial sin romperse, mientras que
       Apple Mail (la mayor parte del tráfico móvil en Chile) sí la carga y
       ahí el correo pasa a hablar el mismo idioma tipográfico que
       mansionplayroom.cl. Degradación limpia: si no carga, no se nota. */
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&display=swap');
    :root { color-scheme: dark; }
    h1, h2, h3 { font-family: 'Syne', 'Helvetica Neue', Arial, sans-serif; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:'Helvetica Neue',Arial,sans-serif;">
  ${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</div>` : ''}
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:${PAGE_BG};">
    ${o.beforeContainer ?? ''}
    ${o.hero ?? ''}
    ${body}
    ${o.footer === false ? '' : emailFooter()}
  </div>
</body>
</html>`;
}
