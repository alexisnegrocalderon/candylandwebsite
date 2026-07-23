import { AMBASSADOR_TIERS, tierForCount, nextTierForCount } from '../shared/ambassadorTiers';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

const BRAND_NAME = 'Mansion Playroom';
const DEFAULT_FROM_ADDRESS = 'onboarding@resend.dev';

/** Arma el header `from` con el nombre de marca siempre fijo, sin depender de
 * que RESEND_FROM_EMAIL esté tipeada con el formato "Nombre <email>" -- si
 * viene así se toma solo la dirección de adentro, si viene pelada se usa tal
 * cual. Antes, una RESEND_FROM_EMAIL sin nombre hacía que varios clientes de
 * correo mostraran el local-part de la dirección (ej. "noreply") en vez de
 * la marca. */
function resolveFromHeader(): string {
  const raw = process.env.RESEND_FROM_EMAIL?.trim();
  if (!raw) return `${BRAND_NAME} <${DEFAULT_FROM_ADDRESS}>`;
  const match = raw.match(/<([^>]+)>/);
  const address = (match ? match[1] : raw).trim();
  return `${BRAND_NAME} <${address}>`;
}

export async function sendEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = resolveFromHeader();

  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY no configurada, no se envía el correo');
    return { success: false, reason: 'No API configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      console.error('[Email] Resend error:', await response.text());
      return { success: false, reason: 'API error' };
    }

    return { success: true };
  } catch (error) {
    console.error('[Email] Error:', error);
    return { success: false, reason: 'Network error' };
  }
}

/** Base para links/imágenes del email. `mansionplayroom.cl` (el valor por
 * defecto de APP_URL en el resto del server, ver server/qr.ts) todavía no
 * está conectado a este proyecto de Vercel — devuelve 404 — así que se usa
 * el dominio de Vercel que sí sirve los assets, hasta que se conecte el
 * dominio propio (ahí alcanza con setear APP_URL en Vercel). */
const EMAIL_BASE_URL = process.env.APP_URL && process.env.APP_URL !== 'https://mansionplayroom.cl'
  ? process.env.APP_URL
  : 'https://candylandwebsite.vercel.app';

/** Paleta pastel para los acentos de cada sección (rosa/celeste/amarillo/lila). */
const ACCENT = {
  pink: { bg: '#FCEEF4', text: '#D9538F', solid: '#EC5FA3' },
  blue: { bg: '#EAF6FA', text: '#3AA0BE', solid: '#5FC2DE' },
  yellow: { bg: '#FEF8E4', text: '#C89A2E', solid: '#F0C24B' },
  lilac: { bg: '#F3EDFB', text: '#8B6FC9', solid: '#A98CE0' },
} as const;

const INK = '#3D2A35';
const MUTED = '#7A6670';
const FAINT = '#9A8A92';
const BORDER = '#F2D9E4';

function card(inner: string, opts?: { bg?: string; border?: boolean; padding?: string }) {
  return `<div style="background:${opts?.bg ?? '#FFFFFF'};border-radius:20px;padding:${opts?.padding ?? '24px'};${opts?.border === false ? '' : `border:1px solid ${BORDER};`}margin-bottom:20px;">${inner}</div>`;
}

function sectionTitle(emoji: string, text: string) {
  return `<h3 style="color:${INK};font-size:19px;font-weight:800;margin:0 0 14px;">${emoji} ${text}</h3>`;
}

/** Grilla de N columnas usando <table> (no flex/grid) — mucho más confiable
 * en Outlook/clientes de correo viejos que no soportan CSS moderno. */
function grid(cells: string[], cols: number) {
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
  const width = Math.floor(100 / cols);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:8px 8px;margin:0 -8px 8px;">
    ${rows.map(row => `<tr>${row.map(c => `<td width="${width}%" valign="top" style="padding:0;">${c}</td>`).join('')}${row.length < cols ? `<td width="${(cols - row.length) * width}%"></td>` : ''}</tr>`).join('')}
  </table>`;
}

/** Copia estática de reglas/valores/contenido del evento — se mantiene
 * alineada a mano con `client/src/config/candyland.ts` (no se importa
 * directo porque ese archivo vive del lado del cliente). */
const CONTENT = {
  valores: ['❤️ Respeto', '🤝 Consentimiento', '🕊️ Libertad'],
  edadMinima: 18,
  quienesSomos: [
    { emoji: '✨', label: 'Conocer gente' },
    { emoji: '🎶', label: 'Bailar' },
    { emoji: '🍸', label: 'Disfrutar del ambiente' },
    { emoji: '💬', label: 'Conectar' },
    { emoji: '🛝', label: 'Explorar si así lo deseas' },
  ],
  encontraras: [
    { emoji: '🚗', label: 'Estacionamiento privado' },
    { emoji: '🧥', label: 'Guardarropía' },
    { emoji: '🍸', label: 'Terraza Bar Lounge' },
    { emoji: '🍔', label: 'PlayBites para recargar energía' },
    { emoji: '🎧', label: 'Dos pistas de baile (Tech + Reggaetón)' },
    { emoji: '🛝', label: 'Playground XXL' },
    { emoji: '⛓️', label: 'Kink Room' },
    { emoji: '🚬', label: 'Zona de fumadores' },
  ],
  antesDeVenir: [
    { emoji: '🪪', titulo: 'Documento', texto: 'Carnet o pasaporte vigente. Evento exclusivo para mayores de 18 años.' },
    { emoji: '👗', titulo: 'Dress Code', texto: 'Candy Sensual: brillos, colores pastel, rosa, accesorios, lencería, vinilo o lo que te haga sentir increíble. Deja la ropa deportiva para otro día. 🍭✨' },
    { emoji: '🚗', titulo: 'Estacionamiento', texto: 'Contamos con estacionamiento privado dentro del recinto.' },
    { emoji: '🚕', titulo: 'Cómo llegar', texto: 'En tu vehículo, o fácil en Uber, Didi o taxi.' },
  ],
  faq: [
    { q: '¿Puedo llegar más tarde?', a: 'Sí.' },
    { q: '¿Puedo ir solo/a?', a: 'Claro. Muchas personas vienen solas y nuestro ambiente está pensado para conocer gente.' },
    { q: '¿Puedo salir y volver a entrar?', a: 'No. Una vez validado el ingreso, las salidas son definitivas.' },
    { q: '¿Tengo que entrar al Playground o al Kink Room?', a: 'No. Todos los espacios son completamente opcionales.' },
  ],
};

/** Extrae los nombres de todas las personas asociadas a una orden (titular +
 * acompañantes) desde el `attendeeData` guardado en el checkout. Duplicado
 * intencional del mismo parseo en server/db.ts (evita import cruzado
 * cliente/servidor innecesario) — mismo criterio: cualquier campo cuya clave
 * contenga "nombre". */
function attendeeNamesList(names: string[]): string {
  if (names.length === 0) return '';
  return names.map(n => `<p style="color:${INK};font-size:15px;font-weight:600;margin:2px 0;">👤 ${n}</p>`).join('');
}

export function buildOrderEmail(data: {
  buyerName: string;
  eventTitle: string;
  eventDate: string;
  doorsOpenText?: string;
  venue: string;
  address?: string;
  mapsUrl?: string;
  orderNumber: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  serviceFee?: number;
  ambassadorCode: string;
  isMissionDeposit?: boolean;
  /** true = ya hay QR (compra normal, o Misión 300 ya resuelta); false = todavía no hay QR (abono Misión 300 en curso). */
  ticketReady: boolean;
  qrImageUrl?: string;
  ticketCode?: string;
  attendeeNames?: string[];
  extras?: { name: string; quantity: number; codes: string[] }[];
}) {
  const ticketNames = data.items.map(i => i.name).join(', ');
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const ticketUrl = data.ticketCode ? `${EMAIL_BASE_URL}/verificar/${data.ticketCode}` : '';
  const calendarUrl = data.ticketCode ? `${EMAIL_BASE_URL}/api/calendar/${data.ticketCode}.ics` : '';
  // El QR se guarda como data: URI (server/qr.ts) para la web, pero muchos
  // clientes de correo no renderizan data: URIs de forma confiable — se usa
  // en cambio la URL real servida por /api/qr/:ticketCode.png (server/calendar.ts).
  const qrUrl = data.ticketCode ? `${EMAIL_BASE_URL}/api/qr/${data.ticketCode}.png` : data.qrImageUrl;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`Usa mi código ${data.ambassadorCode} para comprar tu entrada a Candyland en Mansion Playroom 🍭 ${EMAIL_BASE_URL}`)}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Le dice a los clientes de correo compatibles (Apple Mail, Outlook) que
       este email está diseñado para verse en claro y que NO lo reprocesen en
       modo oscuro automático — sin esto, algunos clientes invierten fondos
       pero no ajustan bien el texto, dejando texto oscuro sobre fondo oscuro. -->
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.pink.bg},${ACCENT.lilac.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">🍭</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">¡Tu compra fue confirmada!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0 0 24px;">La cuenta regresiva para Candyland ya comenzó.</p>
      <a href="${EMAIL_BASE_URL}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;letter-spacing:0.3px;box-shadow:0 8px 20px rgba(236,95,163,0.35);">Ver Candyland</a>
    </div>

    <div style="padding:32px 24px 0;">

      <!-- SALUDO -->
      <h2 style="color:${INK};font-size:22px;font-weight:800;margin:0 0 6px;">👋 Hola ${data.buyerName}</h2>
      <p style="color:${MUTED};font-size:15px;margin:0 0 28px;">
        Tu <strong style="color:${INK};">${ticketNames}</strong> ya está reservado para Candyland en Mansion Playroom. 🎉
        Prepárate para vivir una noche llena de música, conexión y una experiencia completamente distinta.
      </p>

      <!-- TU EVENTO -->
      ${sectionTitle('📅', 'Tu evento')}
      ${card(`
        <h3 style="color:${ACCENT.pink.text};font-size:20px;font-weight:800;margin:0 0 14px;">${data.eventTitle}</h3>
        <p style="color:${INK};font-size:15px;margin:6px 0;">📅 ${data.eventDate}</p>
        ${data.doorsOpenText ? `<p style="color:${INK};font-size:15px;margin:6px 0;">🕘 ${data.doorsOpenText} hrs</p>` : ''}
        <p style="color:${INK};font-size:15px;margin:6px 0;">📍 ${data.venue}${data.address ? ` — ${data.address}` : ''}</p>
        ${data.ticketReady && data.mapsUrl ? `<a href="${data.mapsUrl}" style="display:inline-block;color:${ACCENT.pink.text};font-size:13px;font-weight:700;text-decoration:none;margin:4px 0 0;">📍 Ver en Google Maps →</a>` : ''}
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid ${BORDER};">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Código de reserva</p>
          <p style="color:${INK};font-size:15px;font-weight:700;font-family:monospace;margin:0;">${data.orderNumber}</p>
        </div>
        ${!data.ticketReady ? `<p style="color:${FAINT};font-size:12px;margin:14px 0 0;">La dirección exacta será enviada unos días antes del evento.</p>` : ''}
      `)}

      <!-- MISIÓN 300 -->
      ${data.isMissionDeposit ? `
      ${sectionTitle('🍬', 'Misión 300')}
      ${card(`
        <p style="color:${INK};font-size:16px;font-weight:800;margin:0 0 10px;">¡Eres parte de la Misión 300!</p>
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0 0 10px;">
          Compraste tu acceso antes de que se agotaran los primeros 300 asistentes, por lo que obtuviste el valor
          especial de lanzamiento.
        </p>
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0;">
          Cuando la misión finalice, recibirás automáticamente un nuevo correo con tu código QR definitivo.
        </p>
      `, { bg: ACCENT.pink.bg, border: false })}
      ` : ''}

      <!-- RESUMEN DE COMPRA -->
      ${sectionTitle('🧾', 'Tu compra')}
      ${card(`
        ${data.items.map(item => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${BORDER};">
            <span style="color:${INK};font-size:14px;">${item.quantity}x ${item.name}</span>
            <span style="color:${INK};font-size:14px;font-weight:600;">$${item.price.toLocaleString('es-CL')}</span>
          </div>
        `).join('')}
        ${data.serviceFee && data.serviceFee > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${BORDER};">
          <span style="color:${MUTED};font-size:14px;">Cargo por servicio</span>
          <span style="color:${INK};font-size:14px;font-weight:600;">$${data.serviceFee.toLocaleString('es-CL')}</span>
        </div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;padding-top:14px;margin-top:6px;">
          <span style="color:${INK};font-size:16px;font-weight:800;">Total pagado</span>
          <span style="color:${ACCENT.pink.text};font-size:18px;font-weight:800;">$${data.total.toLocaleString('es-CL')}</span>
        </div>
      `)}

      <!-- TU ENTRADA -->
      ${sectionTitle('🎟', 'Tu entrada')}
      ${!data.ticketReady ? card(`
        <p style="color:${INK};font-size:15px;font-weight:700;margin:0 0 8px;">Mientras la Misión 300 siga activa...</p>
        <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 10px;">Tu QR aún no ha sido emitido.</p>
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0;">📩 Apenas finalice la misión, lo recibirás automáticamente por este mismo medio. No necesitas hacer nada más.</p>
      `, { bg: ACCENT.yellow.bg, border: false }) : card(`
        <div style="text-align:center;">
          <!-- Marco temático: borde grueso color marca + etiqueta arriba del QR --
               sin degradé CSS (Outlook desktop no lo soporta), un borde sólido
               grueso es el tratamiento más seguro entre clientes de correo. -->
          <div style="display:inline-block;background:${ACCENT.pink.bg};border:3px solid ${ACCENT.pink.solid};border-radius:20px;padding:16px;">
            <p style="color:${ACCENT.pink.text};font-size:11px;font-weight:800;letter-spacing:2px;margin:0 0 10px;">🍭 CANDYLAND</p>
            <img src="${qrUrl}" alt="Código QR de tu entrada" style="width:200px;height:200px;border-radius:12px;background:#fff;padding:8px;display:block;" />
          </div>
          <p style="color:${MUTED};font-size:12px;margin:14px 0 20px;">Presenta este código QR y tu carnet en la entrada</p>
        </div>
        <div style="margin-bottom:18px;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Asistentes</p>
          ${attendeeNamesList(data.attendeeNames ?? [])}
        </div>
        ${data.extras && data.extras.length > 0 ? `
        <div style="margin-bottom:18px;padding-top:14px;border-top:1px solid ${BORDER};">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Incluye</p>
          ${data.extras.map(e => `
            <p style="color:${ACCENT.pink.text};font-size:14px;font-weight:700;margin:2px 0;">✅ ${e.quantity > 1 ? `${e.quantity}× ` : ''}${e.name}</p>
            ${e.codes.map(code => `<p style="color:${MUTED};font-size:12px;font-family:monospace;letter-spacing:0.5px;margin:0 0 4px 20px;">${code}</p>`).join('')}
          `).join('')}
          <p style="color:${FAINT};font-size:11px;margin:8px 0 0;">Presenta estos códigos en caja el día del evento para canjearlos.</p>
        </div>
        ` : ''}
        <div style="text-align:center;">
          <a href="${ticketUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:800;font-size:14px;margin:0 6px 10px;">Ver mi entrada</a>
          <a href="${calendarUrl}" style="display:inline-block;background:#fff;color:${INK};text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;font-size:14px;border:1px solid ${BORDER};margin:0 6px 10px;">📅 Agregar al calendario</a>
        </div>
      `)}

      <!-- QUÉ ES MANSION PLAYROOM -->
      ${sectionTitle('✨', '¿Qué es Mansion Playroom?')}
      <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0 0 16px;">
        Más que una fiesta, somos un venue y una comunidad para adultos donde cada persona vive la experiencia a su manera.
      </p>
      ${grid(CONTENT.quienesSomos.map(x => `
        <div style="background:${ACCENT.blue.bg};border-radius:16px;padding:16px;text-align:center;">
          <p style="font-size:26px;margin:0 0 6px;">${x.emoji}</p>
          <p style="color:${INK};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
        </div>
      `), 3)}
      <p style="color:${MUTED};font-size:13px;margin:6px 0 24px;">Todo ocurre siempre bajo nuestros tres pilares: ${CONTENT.valores.join(' · ')}</p>

      <!-- QUÉ ENCONTRARÁS -->
      ${sectionTitle('🛝', '¿Qué encontrarás?')}
      ${grid(CONTENT.encontraras.map(x => `
        <div style="background:${ACCENT.lilac.bg};border-radius:16px;padding:14px;">
          <p style="font-size:22px;margin:0 0 4px;">${x.emoji}</p>
          <p style="color:${INK};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
        </div>
      `), 2)}
      <div style="margin-bottom:8px;"></div>

      <!-- ANTES DE VENIR -->
      ${sectionTitle('🎒', 'Antes de venir')}
      ${grid(CONTENT.antesDeVenir.map(x => `
        <div style="background:${ACCENT.yellow.bg};border-radius:16px;padding:16px;">
          <p style="font-size:24px;margin:0 0 6px;">${x.emoji}</p>
          <p style="color:${INK};font-size:13px;font-weight:800;margin:0 0 4px;">${x.titulo}</p>
          <p style="color:${MUTED};font-size:12px;line-height:1.5;margin:0;">${x.texto}</p>
        </div>
      `), 2)}

      <!-- NUESTROS VALORES -->
      ${sectionTitle('❤️', 'Nuestros valores')}
      ${card(`
        <p style="color:${INK};font-size:16px;font-weight:700;margin:0;">${CONTENT.valores.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>
      `, { bg: ACCENT.pink.bg, border: false })}

      <!-- EMBAJADOR -->
      ${sectionTitle('🏆', 'Tu Código de Embajador')}
      ${card(`
        <div style="text-align:center;margin-bottom:16px;">
          <p style="color:${INK};font-size:30px;font-weight:800;font-family:monospace;margin:0;">${data.ambassadorCode}</p>
          <p style="color:${MUTED};font-size:13px;margin:8px 0 0;">Compártelo con tus amigos — cada compra realizada con tu código suma recompensas.</p>
        </div>
        ${AMBASSADOR_TIERS.map(t => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${BORDER};">
            <span style="color:${INK};font-size:13px;font-weight:700;">${t.emoji} ${t.min} compras</span>
            <span style="color:${MUTED};font-size:13px;text-align:right;">${t.reward}</span>
          </div>
        `).join('')}
        <div style="text-align:center;margin-top:18px;">
          <a href="${whatsappShareUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:800;font-size:13px;">Compartir por WhatsApp</a>
        </div>
      `)}

      <!-- FAQ -->
      ${sectionTitle('❓', 'Preguntas rápidas')}
      ${card(CONTENT.faq.map((f, i) => `
        <div style="${i > 0 ? `border-top:1px solid ${BORDER};padding-top:12px;margin-top:12px;` : ''}">
          <p style="color:${INK};font-size:14px;font-weight:700;margin:0 0 4px;">${f.q}</p>
          <p style="color:${MUTED};font-size:13px;margin:0;">${f.a}</p>
        </div>
      `).join(''))}

      <!-- INFO IMPORTANTE -->
      <p style="color:${FAINT};font-size:12px;line-height:1.6;margin:0 0 24px;">
        📌 Consulta nuestra
        <a href="${EMAIL_BASE_URL}/politica-de-reembolso" style="color:${ACCENT.pink.text};">política de reembolso y condiciones de compra</a>.
        Si no puedes asistir, puedes transferir tu acceso a otra persona escribiéndonos por Instagram antes del evento.
      </p>

      <!-- DESPEDIDA -->
      <div style="text-align:center;padding:24px 0;">
        <p style="font-size:32px;margin:0 0 8px;">🍭</p>
        <p style="color:${INK};font-size:16px;font-weight:800;margin:0 0 6px;">Nos vemos en Candyland</p>
        <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0;">
          Ya eres parte de esta edición. Nosotros ponemos la música, el ambiente y la experiencia.<br/>
          Tú solo preocúpate de llegar con ganas de disfrutar.<br/>
          <strong>Equipo Mansion Playroom</strong>
        </p>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:8px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">© ${new Date().getFullYear()} Mansion Playroom · Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}

/** Se manda cuando NO se cumple la meta de 300: pide completar la diferencia con un link de pago. */
export function buildMissionTopupEmail(data: {
  buyerName: string;
  eventTitle: string;
  eventDate: string;
  orderNumber: string;
  topupAmount: number;
  paymentUrl: string;
}) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.yellow.bg},${ACCENT.pink.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">🍭</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">¡Casi, ${data.buyerName}!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">No juntamos las 300 personas para ${data.eventTitle} — falta completar tu diferencia.</p>
    </div>

    <div style="padding:32px 24px 0;">
      <p style="color:${MUTED};font-size:15px;line-height:1.6;margin:0 0 24px;">
        Para <strong style="color:${INK};">${data.eventTitle}</strong> (${data.eventDate}) no llegamos a las 300 personas de la Misión,
        así que para asegurar tu entrada falta completar la diferencia — igual pagaste como máximo el 60% del valor
        general gracias a tu abono.
      </p>

      ${sectionTitle('🧾', 'Diferencia a pagar')}
      ${card(`
        <div style="text-align:center;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Orden ${data.orderNumber}</p>
          <p style="color:${ACCENT.pink.text};font-size:32px;font-weight:800;margin:0 0 6px;">$${data.topupAmount.toLocaleString('es-CL')}</p>
          <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">Máximo el 60% del valor general — tu abono ya cuenta como parte de este monto.</p>
          <a href="${data.paymentUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;box-shadow:0 8px 20px rgba(236,95,163,0.35);">Pagar diferencia</a>
          <p style="color:${FAINT};font-size:12px;margin:16px 0 0;">Tu entrada con código QR llega automáticamente apenas se confirme este pago.</p>
        </div>
      `)}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:8px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">© ${new Date().getFullYear()} Mansion Playroom · Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}

/** Se manda una sola vez a quienes compraron por la ticketera anterior (antes
 * de tener sitio propio) -- junto con el correo final normal (buildOrderEmail),
 * para avisarles que la venta ahora es por este sitio y que su entrada ya
 * quedó migrada sin que tengan que hacer nada. */
export function buildMigrationAnnouncementEmail(data: {
  buyerName: string;
  eventTitle: string;
  eventDate: string;
  ticketCode: string;
  total: number;
}) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const ticketUrl = `${EMAIL_BASE_URL}/verificar/${data.ticketCode}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.lilac.bg},${ACCENT.blue.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">✨</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">¡Tenemos novedades, ${data.buyerName}!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">Tu entrada a ${data.eventTitle} sigue 100% asegurada.</p>
    </div>

    <div style="padding:32px 24px 0;">
      <p style="color:${MUTED};font-size:15px;line-height:1.6;margin:0 0 24px;">
        Compraste tu entrada cuando todavía vendíamos por la plataforma anterior — y queremos contarte que
        <strong style="color:${INK};">ya tenemos nuestro propio sitio de venta de entradas</strong>. Tu compra ya está
        migrada acá, al mismo valor que pagaste (<strong style="color:${INK};">$${data.total.toLocaleString('es-CL')}</strong>),
        sin que tengas que hacer nada ni pagar diferencia. La fecha del evento sigue exactamente igual.
      </p>

      ${sectionTitle('🎟', 'Tu entrada ya está lista')}
      ${card(`
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0 0 16px;">
          Junto a este correo te llegó otro con tu código QR definitivo — guárdalo, es lo único que necesitas
          presentar en la puerta.
        </p>
        <div style="text-align:center;">
          <a href="${ticketUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:800;font-size:14px;">Ver mi entrada</a>
        </div>
      `, { bg: ACCENT.pink.bg, border: false })}

      ${sectionTitle('🌐', 'Nuestro nuevo sitio')}
      ${card(`
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0 0 16px;">
          Desde ahora, todas las próximas fiestas de Mansion Playroom se venden directo desde nuestra propia web —
          entradas, código de embajador y tu QR, todo en un solo lugar.
        </p>
        <div style="text-align:center;">
          <a href="${EMAIL_BASE_URL}" style="display:inline-block;background:#fff;color:${INK};text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;font-size:14px;border:1px solid ${BORDER};">Conocer el sitio</a>
        </div>
      `)}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:8px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">© ${new Date().getFullYear()} Mansion Playroom · Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}

/** Se manda cuando el conteo de referidos de un embajador cruza EXACTO un
 * umbral de nivel (3/5/10) -- la igualdad exacta garantiza que se dispara
 * una sola vez, sin necesitar una columna de "ya avisado" (ver el llamado
 * en processApprovedOrder, server/webhooks.ts). */
export function buildTierUpEmail(data: {
  buyerName: string;
  ambassadorCode: string;
  referralCount: number;
}) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const tier = tierForCount(data.referralCount)!;
  const next = nextTierForCount(data.referralCount);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.yellow.bg},${ACCENT.pink.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">${tier.emoji}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">¡Llegaste a nivel ${tier.name}, ${data.buyerName}!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">Ya vendiste ${data.referralCount} entradas con tu código — te lo ganaste.</p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle('🎁', 'Tu premio')}
      ${card(`
        <p style="color:${INK};font-size:18px;font-weight:800;margin:0 0 6px;">${tier.reward}</p>
        <p style="color:${MUTED};font-size:13px;margin:0;">Escríbenos por Instagram para coordinar cómo lo recibes.</p>
      `, { bg: ACCENT.yellow.bg, border: false })}

      ${next ? `
      ${sectionTitle('🚀', 'Sigue subiendo')}
      ${card(`
        <p style="color:${INK};font-size:14px;line-height:1.6;margin:0 0 10px;">
          Te faltan <strong style="color:${ACCENT.pink.text};">${next.min - data.referralCount}</strong> ventas más para nivel
          <strong style="color:${INK};">${next.emoji} ${next.name}</strong>:
        </p>
        <p style="color:${INK};font-size:15px;font-weight:700;margin:0;">${next.reward}</p>
      `)}
      ` : `
      ${sectionTitle('👑', 'Llegaste al tope')}
      ${card(`<p style="color:${INK};font-size:14px;line-height:1.6;margin:0;">Eres nivel Oro, el más alto del programa. Sigue vendiendo para mantenerte arriba en el Hall de la Fama.</p>`)}
      `}

      <div style="text-align:center;margin-top:24px;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Tu código</p>
        <p style="color:${INK};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.ambassadorCode}</p>
        <a href="${EMAIL_BASE_URL}/mis-referidos" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver Hall de la Fama</a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:24px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">© ${new Date().getFullYear()} Mansion Playroom · Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}

/** Se manda cuando al embajador le falta EXACTAMENTE 1 venta para el
 * siguiente nivel -- empuje final, distinto del correo de "ya llegaste"
 * (buildTierUpEmail). Misma lógica de disparo único por igualdad exacta. */
export function buildAlmostTierEmail(data: {
  buyerName: string;
  ambassadorCode: string;
  referralCount: number;
}) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const next = nextTierForCount(data.referralCount)!;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.lilac.bg},${ACCENT.pink.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">🔥</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">¡Estás a 1 venta, ${data.buyerName}!</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">Una entrada más y desbloqueas nivel ${next.name}.</p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle(next.emoji, `Te espera nivel ${next.name}`)}
      ${card(`
        <p style="color:${INK};font-size:18px;font-weight:800;margin:0 0 10px;">${next.reward}</p>
        <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0;">
          Ya vendiste ${data.referralCount} entradas con tu código — comparte tu código una vez más y lo tienes asegurado.
        </p>
      `, { bg: ACCENT.pink.bg, border: false })}

      <div style="text-align:center;margin-top:24px;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Tu código</p>
        <p style="color:${INK};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.ambassadorCode}</p>
        <a href="https://wa.me/?text=${encodeURIComponent(`Usa mi código ${data.ambassadorCode} para comprar tu entrada a Candyland en Mansion Playroom 🍭 ${EMAIL_BASE_URL}`)}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Compartir por WhatsApp</a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:24px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">© ${new Date().getFullYear()} Mansion Playroom · Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}

/** Copia interna de cada venta a contacto@mansionplayroom.cl -- distinto de
 * los correos al comprador (sin branding/QR/FAQ), pensado para copiar/pegar
 * rápido a la caja de Shopify POS: cada ítem con su código individual si
 * corresponde (entradas y cada extra ya tienen su propio ticketCode).
 * `isFinal` distingue el abono de Misión 300 (sin códigos de extras aún,
 * porque los tickets no existen hasta que se resuelve) del correo final. */
export function buildSalesRecordEmail(data: {
  eventTitle: string;
  orderNumber: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  items: { name: string; quantity: number; price: number; codes?: string[] }[];
  total: number;
  isFinal: boolean;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">${data.isFinal ? '🎟' : '🍬'} ${data.eventTitle} — Orden ${data.orderNumber}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">${data.isFinal ? 'Ticket final generado' : 'Abono Misión 300 aprobado -- todavía sin códigos de extras'}</p>

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 4px;">Comprador</p>
      <p style="color:${INK};font-size:15px;font-weight:700;margin:0 0 2px;">${data.buyerName}</p>
      <p style="color:${MUTED};font-size:13px;margin:0 0 2px;">${data.buyerEmail}</p>
      ${data.buyerPhone ? `<p style="color:${MUTED};font-size:13px;margin:0;">${data.buyerPhone}</p>` : ''}
    `)}

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Ítems</p>
      ${data.items.map(item => `
        <div style="padding:8px 0;border-bottom:1px solid ${BORDER};">
          <div style="display:flex;justify-content:space-between;">
            <span style="color:${INK};font-size:14px;">${item.quantity}x ${item.name}</span>
            <span style="color:${INK};font-size:14px;font-weight:600;">$${item.price.toLocaleString('es-CL')}</span>
          </div>
          ${item.codes && item.codes.length > 0 ? `<p style="color:${ACCENT.pink.text};font-size:12px;font-family:monospace;margin:4px 0 0;">${item.codes.join(' · ')}</p>` : ''}
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;padding-top:12px;margin-top:4px;">
        <span style="color:${INK};font-size:15px;font-weight:800;">Total</span>
        <span style="color:${ACCENT.pink.text};font-size:16px;font-weight:800;">$${data.total.toLocaleString('es-CL')}</span>
      </div>
    `)}
  </div>
</body>
</html>`;
}

/** Cuadre de caja al cerrar un turno (pedido explícito del usuario): muestra
 * lo declarado por la cajera vs. lo esperado según las ventas registradas en
 * el sistema (solo canal caja, dentro de la ventana del turno), y "cómo
 * terminó la fiesta" (top clientes/productos del evento completo). */
export function buildShiftCloseEmail(data: {
  eventTitle: string;
  registerName: string;
  operatorName: string;
  openedAt: Date;
  closedAt: Date;
  openingCash: number;
  countedCash: number;
  countedDebit: number;
  countedCredit: number;
  expectedCash: number;
  expectedDebit: number;
  expectedCredit: number;
  cashDiff: number;
  debitDiff: number;
  creditDiff: number;
  salesCount: number;
  redeemsCount: number;
  topCustomers: { name: string; email: string; total: number }[];
  topProducts: { name: string; quantity: number; revenue: number }[];
}) {
  const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
  const diffRow = (label: string, counted: number, expected: number, diff: number) => `
    <div style="padding:8px 0;border-bottom:1px solid ${BORDER};">
      <div style="display:flex;justify-content:space-between;">
        <span style="color:${INK};font-size:14px;">${label}</span>
        <span style="color:${INK};font-size:14px;font-weight:600;">${money(counted)} contado / ${money(expected)} esperado</span>
      </div>
      <p style="color:${Math.abs(diff) < 1 ? ACCENT.blue.text : diff > 0 ? ACCENT.yellow.text : '#D9538F'};font-size:12px;font-weight:700;margin:4px 0 0;">
        ${Math.abs(diff) < 1 ? '✓ Cuadra' : diff > 0 ? `▲ Sobran ${money(diff)}` : `▼ Faltan ${money(Math.abs(diff))}`}
      </p>
    </div>
  `;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">🔒 Turno cerrado — ${data.eventTitle}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">${data.registerName} · ${data.operatorName} · ${data.closedAt.toLocaleString('es-CL', { timeZone: 'America/Santiago' })}</p>

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Cuadre de caja</p>
      <p style="color:${MUTED};font-size:12px;margin:0 0 10px;">Efectivo inicial: ${money(data.openingCash)} · ${data.salesCount} ventas · ${data.redeemsCount} canjes</p>
      ${diffRow('💵 Efectivo', data.countedCash, data.expectedCash + data.openingCash, data.cashDiff)}
      ${diffRow('💳 Débito', data.countedDebit, data.expectedDebit, data.debitDiff)}
      ${diffRow('💳 Crédito', data.countedCredit, data.expectedCredit, data.creditDiff)}
    `)}

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">🏆 Top 3 clientes (todo el evento)</p>
      ${data.topCustomers.length === 0 ? `<p style="color:${MUTED};font-size:13px;margin:0;">Sin ventas web registradas.</p>` : data.topCustomers.map((c, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span style="color:${INK};font-size:14px;">${i + 1}. ${c.name} <span style="color:${FAINT};font-size:12px;">(${c.email})</span></span>
          <span style="color:${INK};font-size:14px;font-weight:600;">${money(c.total)}</span>
        </div>
      `).join('')}
    `)}

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">🥇 Top 3 productos más vendidos</p>
      ${data.topProducts.length === 0 ? `<p style="color:${MUTED};font-size:13px;margin:0;">Sin ventas registradas.</p>` : data.topProducts.map((p, i) => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;">
          <span style="color:${INK};font-size:14px;">${i + 1}. ${p.name}</span>
          <span style="color:${INK};font-size:14px;font-weight:600;">${p.quantity}x · ${money(p.revenue)}</span>
        </div>
      `).join('')}
    `)}
  </div>
</body>
</html>`;
}

/** Tarjeta opcional de "próximo evento destacado" para el mailing masivo
 * (pedido explícito del usuario) -- se arma en server/mailing.ts
 * (getMailingEventInfo) y llega ya resuelta, buildMailingBlastEmail no
 * consulta la base de datos. */
export type MailingEventInfo = {
  title: string;
  imageUrl?: string;
  dateText: string;
  venue: string;
  address?: string;
  mapsUrl?: string;
  mission300: { confirmed: number; goal: number; depositPrice: number } | null;
};

/** Qué bloques de la tarjeta de evento mostrar en el mailing masivo (pedido
 * explícito del usuario: un checkbox por sección en vez de uno solo). */
export type MailingEventSections = { banner: boolean; details: boolean; mission300: boolean; venueGrid: boolean };

/** Mailing masivo generado desde /admin (sección Clientes → "Mailing masivo",
 * pedido explícito del usuario): el contenido (asunto/título/párrafos) lo
 * arma la IA a partir del objetivo que escribe el admin, pero el HTML final
 * siempre se arma acá con los mismos helpers de marca que el resto de los
 * emails -- así la IA nunca controla estilos/HTML crudo, solo texto. La
 * tarjeta de evento (fecha/lugar/Misión 300/espacios) es igual de fija,
 * reusando los mismos bloques que ya usa buildOrderEmail. */
export function buildMailingBlastEmail(data: {
  buyerName: string;
  preheader?: string;
  headline: string;
  paragraphs: string[];
  ctaText?: string;
  ctaUrl: string;
  highlightLabel?: string;
  highlightValue?: string;
  eventInfo?: MailingEventInfo | null;
  /** Permite prender/apagar cada bloque de la tarjeta de evento por separado
   * (pedido explícito del usuario) -- todos activos por defecto para no
   * romper llamadas existentes que no pasen este parámetro. */
  eventSections?: Partial<MailingEventSections>;
}) {
  const logoUrl = `${EMAIL_BASE_URL}/candyland/logo-wordmark-email.png`;
  const greeting = data.buyerName ? `¡Hola, ${data.buyerName}!` : '¡Hola!';
  const eventInfo = data.eventInfo;
  const showBanner = data.eventSections?.banner ?? true;
  const showDetails = data.eventSections?.details ?? true;
  const showMission300 = data.eventSections?.mission300 ?? true;
  const showVenueGrid = data.eventSections?.venueGrid ?? true;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;font-family:'Helvetica Neue',Arial,sans-serif;">
  ${data.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${data.preheader}</div>` : ''}
  <div style="max-width:600px;margin:0 auto;padding:0 0 40px;background-color:#FFFFFF;">

    ${eventInfo?.imageUrl && showBanner ? `<img src="${eventInfo.imageUrl}" alt="${eventInfo.title}" style="display:block;width:100%;height:auto;" />` : ''}

    <!-- HERO -->
    <div style="background:linear-gradient(160deg,${ACCENT.pink.bg},${ACCENT.yellow.bg});padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="font-size:52px;margin:0 0 12px;">🍬</p>
      <p style="color:${MUTED};font-size:14px;margin:0 0 4px;">${greeting}</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0;">${data.headline}</h1>
    </div>

    <div style="padding:32px 24px 0;">
      ${data.paragraphs.map((p) => `
        <p style="color:${MUTED};font-size:15px;line-height:1.6;margin:0 0 20px;">${p}</p>
      `).join('')}

      ${eventInfo && showDetails ? `
      ${sectionTitle('📅', eventInfo.title)}
      ${card(`
        <p style="color:${INK};font-size:15px;margin:6px 0;">📅 ${eventInfo.dateText}</p>
        <p style="color:${INK};font-size:15px;margin:6px 0;">📍 ${eventInfo.venue}${eventInfo.address ? ` — ${eventInfo.address}` : ''}</p>
        ${eventInfo.mapsUrl ? `<a href="${eventInfo.mapsUrl}" style="display:inline-block;color:${ACCENT.pink.text};font-size:13px;font-weight:700;text-decoration:none;margin:4px 0 0;">📍 Ver en Google Maps →</a>` : ''}
      `)}
      ` : ''}

      ${eventInfo?.mission300 && showMission300 ? card(`
        <div style="text-align:center;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Misión 300</p>
          <p style="color:${ACCENT.pink.text};font-size:28px;font-weight:800;margin:0 0 10px;">${eventInfo.mission300.confirmed}/${eventInfo.mission300.goal} ya confirmados</p>
          <p style="color:${INK};font-size:15px;font-weight:700;margin:0;">🍬 Tu entrada sigue a $${eventInfo.mission300.depositPrice.toLocaleString('es-CL')} por persona mientras dure la Misión 300</p>
        </div>
      `, { bg: ACCENT.pink.bg, border: false }) : ''}

      ${eventInfo && showVenueGrid ? `
      ${sectionTitle('🛝', '¿Qué encontrarás?')}
      ${grid(CONTENT.encontraras.map((x) => `
        <div style="background:${ACCENT.lilac.bg};border-radius:16px;padding:14px;">
          <p style="font-size:22px;margin:0 0 4px;">${x.emoji}</p>
          <p style="color:${INK};font-size:12px;font-weight:700;margin:0;">${x.label}</p>
        </div>
      `), 2)}
      ` : ''}

      ${data.highlightLabel && data.highlightValue ? card(`
        <div style="text-align:center;">
          <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">${data.highlightLabel}</p>
          <p style="color:${ACCENT.pink.text};font-size:32px;font-weight:800;margin:0;">${data.highlightValue}</p>
        </div>
      `, { bg: ACCENT.pink.bg, border: false }) : ''}

      <div style="text-align:center;padding:${data.highlightLabel && data.highlightValue ? '24px' : '8px'} 0 8px;">
        <a href="${data.ctaUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;box-shadow:0 8px 20px rgba(236,95,163,0.35);">${data.ctaText || 'Ver más'}</a>
      </div>
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;padding:24px;border-top:1px solid ${BORDER};margin-top:8px;">
      <img src="${logoUrl}" alt="Mansion Playroom" style="height:24px;width:auto;margin-bottom:12px;opacity:0.7;" />
      <p style="margin:0 0 8px;">
        <a href="https://instagram.com/mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Instagram</a>
        <a href="https://www.mansionplayroom.cl" style="color:${FAINT};font-size:12px;text-decoration:none;margin:0 8px;">Web</a>
      </p>
      <p style="color:${FAINT};font-size:11px;margin:0;">© ${new Date().getFullYear()} Mansion Playroom · Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}
