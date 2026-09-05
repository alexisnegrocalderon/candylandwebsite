import { formatChileDate, formatChileDateTime } from '../shared/chileDate';
import { AMBASSADOR_TIERS, tierForCount, nextTierForCount } from '../shared/ambassadorTiers';
import { BRAND, EVENT_BRAND } from '../shared/eventBrand';
import {
  ACCENT, INK, MUTED, FAINT, BORDER, CARD_BG, EMAIL_BASE_URL, LOGO_URL,
  card, sectionTitle, grid, costumeBadge, anniversaryBand, emailShell, emailHero,
} from './emailLayout';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  // Copia visible (ej. la productora en un envío a un proveedor externo) --
  // un solo mensaje con `cc`, no dos envíos separados por request, para no
  // depender de que ambos envíos individuales lleguen bien.
  cc?: string;
  // PDF de cierre de turno (pedido explícito del usuario) -- Resend acepta
  // adjuntos nativamente en base64, no hace falta ningún servicio aparte.
  attachments?: { filename: string; content: Buffer | string }[];
}

export const BRAND_NAME = BRAND.nombre;
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
        ...(input.cc ? { cc: input.cc } : {}),
        ...(input.attachments?.length ? {
          attachments: input.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
          })),
        } : {}),
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

/** Copia estática de reglas/valores/contenido del evento — se mantiene
 * alineada a mano con `client/src/config/candyland.ts` (no se importa
 * directo porque ese archivo vive del lado del cliente). El dress code
 * YA NO se hardcodea acá: antes decía "Candy Sensual..." (el de la fiesta
 * ANTERIOR) sin importar qué evento estuviera vendiendo el sitio en ese
 * momento -- se lee de `shared/eventBrand.ts`, la misma fuente que usa
 * `candyland.ts`, para que los dos lados no puedan volver a desalinearse. */
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
    { emoji: '🎭', titulo: 'Dress Code', texto: EVENT_BRAND.dressCode },
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
  /** Monto de descuento ya aplicado (orders.discount) -- faltaba pasarlo
   * desde webhooks.ts, así que nunca se mostraba en el correo aunque la
   * orden sí lo tuviera guardado: el resumen sumaba items + cargo por
   * servicio y el total no cerraba contra lo realmente cobrado. */
  discount?: number;
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
  const ticketUrl = data.ticketCode ? `${EMAIL_BASE_URL}/verificar/${data.ticketCode}` : '';
  const calendarUrl = data.ticketCode ? `${EMAIL_BASE_URL}/api/calendar/${data.ticketCode}.ics` : '';
  const partyUrl = data.ticketCode ? `${EMAIL_BASE_URL}/fiesta/${data.ticketCode}` : '';
  // El QR se guarda como data: URI (server/qr.ts) para la web, pero muchos
  // clientes de correo no renderizan data: URIs de forma confiable — se usa
  // en cambio la URL real servida por /api/qr/:ticketCode.png (server/calendar.ts).
  const qrUrl = data.ticketCode ? `${EMAIL_BASE_URL}/api/qr/${data.ticketCode}.png` : data.qrImageUrl;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`Usa mi código ${data.ambassadorCode} para comprar tu entrada en Mansion Playroom 🍭 ${EMAIL_BASE_URL}`)}`;

  return emailShell({
    preheader: `Tu ${ticketNames} ya está reservado para ${data.eventTitle}.`,
    hero: emailHero({
      accent: 'pink',
      emoji: '🍭',
      title: '¡Tu compra fue confirmada!',
      subtitle: `La cuenta regresiva para ${data.eventTitle} ya comenzó.`,
      cta: { href: EMAIL_BASE_URL, label: `Ver ${data.eventTitle}` },
      anniversary: true,
      costume: true,
    }),
    body: `
      <!-- SALUDO -->
      <h2 style="color:${INK};font-size:22px;font-weight:800;margin:0 0 6px;">👋 Hola ${data.buyerName}</h2>
      <p style="color:${MUTED};font-size:15px;margin:0 0 28px;">
        Tu <strong style="color:${INK};">${ticketNames}</strong> ya está reservado para ${data.eventTitle} en Mansion Playroom. 🎉
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
        ${data.discount && data.discount > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid ${BORDER};">
          <span style="color:${MUTED};font-size:14px;">Descuento</span>
          <span style="color:${ACCENT.pink.text};font-size:14px;font-weight:600;">-$${data.discount.toLocaleString('es-CL')}</span>
        </div>
        ` : ''}
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
            <p style="color:${ACCENT.pink.text};font-size:11px;font-weight:800;letter-spacing:2px;margin:0 0 10px;">${EVENT_BRAND.ticketLabel}</p>
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
          <a href="${partyUrl}" style="display:inline-block;background:${CARD_BG};color:${INK};text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;font-size:14px;border:1px solid ${BORDER};margin:0 6px 10px;">🍬 Entrar a Playmatch</a>
          <a href="${calendarUrl}" style="display:inline-block;background:${CARD_BG};color:${INK};text-decoration:none;padding:14px 30px;border-radius:999px;font-weight:700;font-size:14px;border:1px solid ${BORDER};margin:0 6px 10px;">📅 Agregar al calendario</a>
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
        <p style="color:${INK};font-size:16px;font-weight:800;margin:0 0 6px;">Nos vemos en ${data.eventTitle}</p>
        <p style="color:${MUTED};font-size:13px;line-height:1.6;margin:0;">
          Ya eres parte de esta edición. Nosotros ponemos la música, el ambiente y la experiencia.<br/>
          Tú solo preocúpate de llegar con ganas de disfrutar.<br/>
          <strong>Equipo Mansion Playroom</strong>
        </p>
      </div>
    `,
  });
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
  return emailShell({
    preheader: `Falta completar tu diferencia para ${data.eventTitle}.`,
    hero: emailHero({
      accent: 'yellow',
      emoji: '🍭',
      title: `¡Casi, ${data.buyerName}!`,
      subtitle: `No juntamos las 300 personas para ${data.eventTitle} — falta completar tu diferencia.`,
    }),
    body: `
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
    `,
  });
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
  const tier = tierForCount(data.referralCount)!;
  const next = nextTierForCount(data.referralCount);

  return emailShell({
    preheader: `Llegaste a nivel ${tier.name} con ${data.referralCount} ventas.`,
    hero: emailHero({
      accent: 'yellow',
      emoji: tier.emoji,
      title: `¡Llegaste a nivel ${tier.name}, ${data.buyerName}!`,
      subtitle: `Ya vendiste ${data.referralCount} entradas con tu código — te lo ganaste.`,
    }),
    body: `
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
    `,
  });
}

/** Se manda cuando al embajador le falta EXACTAMENTE 1 venta para el
 * siguiente nivel -- empuje final, distinto del correo de "ya llegaste"
 * (buildTierUpEmail). Misma lógica de disparo único por igualdad exacta. */
export function buildAlmostTierEmail(data: {
  buyerName: string;
  ambassadorCode: string;
  referralCount: number;
}) {
  const next = nextTierForCount(data.referralCount)!;

  return emailShell({
    preheader: `Una entrada más y desbloqueas nivel ${next.name}.`,
    hero: emailHero({
      accent: 'lilac',
      emoji: '🔥',
      title: `¡Estás a 1 venta, ${data.buyerName}!`,
      subtitle: `Una entrada más y desbloqueas nivel ${next.name}.`,
    }),
    body: `
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
        <a href="https://wa.me/?text=${encodeURIComponent(`Usa mi código ${data.ambassadorCode} para comprar tu entrada en Mansion Playroom 🍭 ${EMAIL_BASE_URL}`)}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Compartir por WhatsApp</a>
      </div>
    `,
  });
}

/** Resumen semanal para un embajador VIP (pedido explícito del dueño): sus
 * números del mes, cuánto le falta para subir de nivel y el material para
 * publicar esa semana. Lo manda el cron diario, solo el día configurado.
 *
 * Todo viene calculado desde server/ambassadorProgram.ts: acá solo se arma el
 * HTML con variables dinámicas. Si no hay material cargado, esa sección se
 * omite en vez de mostrar un bloque vacío. */
/** Aviso interno al dueño de que alguien postuló para ser embajador. Asunto
 * con prefijo entre corchetes, igual que el registro de ventas, para poder
 * armar un filtro de Gmail una sola vez. */
export function buildAmbassadorApplicationEmail(data: {
  name: string;
  email: string;
  whatsapp: string;
  instagram: string;
  followers: number | null;
  message: string;
  whatsappLink: string;
  instagramLink: string;
}) {
  // Interno (el dueño se lo manda a sí mismo) -- sin hero ni pie, mismo
  // criterio que el resto de los avisos operativos de más abajo.
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">👑 Nueva postulación a embajador</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">${data.name}</p>

    ${card(`
      <div style="padding:6px 0;border-bottom:1px solid ${BORDER};">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">Instagram</p>
        <p style="margin:0;"><a href="${data.instagramLink}" style="color:${ACCENT.pink.text};font-size:15px;font-weight:700;text-decoration:none;">@${data.instagram}</a>
        ${data.followers !== null ? `<span style="color:${MUTED};font-size:13px;"> · ${data.followers.toLocaleString('es-CL')} seguidores</span>` : ''}</p>
      </div>
      <div style="padding:6px 0;border-bottom:1px solid ${BORDER};">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">WhatsApp</p>
        <p style="margin:0;"><a href="${data.whatsappLink}" style="color:${ACCENT.blue.text};font-size:15px;font-weight:700;text-decoration:none;">${data.whatsapp}</a></p>
      </div>
      <div style="padding:6px 0;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 2px;">Correo</p>
        <p style="color:${INK};font-size:14px;margin:0;">${data.email}</p>
      </div>
    `)}

    ${data.message ? card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Lo que escribió</p>
      <p style="color:${INK};font-size:14px;margin:0;line-height:1.6;">${data.message}</p>
    `) : ''}

    <p style="color:${MUTED};font-size:13px;margin:0;">
      Revísala en el panel: Embajadores VIP → Postulaciones. Desde ahí la apruebas y se crea el embajador con su código.
    </p>
  </div>
    `,
  });
}

/** Confirmación al postulante. Repite requisitos y tareas a propósito: así le
 * queda por escrito a qué se está comprometiendo, y salen de las mismas
 * constantes que muestra la página (shared/ambassadorApplication.ts). */
export function buildApplicationReceivedEmail(data: {
  name: string;
  requirements: string[];
  tasks: string[];
}) {
  const lista = (items: string[]) => items
    .map((t) => `<p style="color:${INK};font-size:14px;margin:0 0 6px;">• ${t}</p>`)
    .join('');

  return emailShell({
    preheader: `Recibimos tu postulación a embajador, ${data.name}.`,
    footer: false,
    hero: emailHero({
      accent: 'lilac',
      emoji: '👑',
      title: `Recibimos tu postulación, ${data.name}`,
      subtitle: 'Te vamos a escribir por WhatsApp para contarte cómo sigue.',
    }),
    body: `
      ${sectionTitle('✅', 'Lo que pedimos')}
      ${card(lista(data.requirements))}

      ${sectionTitle('📱', 'A lo que te comprometes')}
      ${card(lista(data.tasks), { bg: ACCENT.yellow.bg, border: false })}

      ${card(`
        <p style="color:${INK};font-size:14px;margin:0;line-height:1.6;">
          Si quedas seleccionado te llega tu <strong>código personal</strong> y un panel donde vas a ver, en vivo, cuántas
          ventas hiciste y cuánto llevas ganado. No tienes que pedirle el número a nadie.
        </p>
      `)}

      <p style="color:${FAINT};font-size:12px;text-align:center;margin:24px 0 0;">
        Si no postulaste tú, ignora este correo y no pasa nada.
      </p>
    `,
  });
}

/** Bienvenida al aprobar: su código y el link a su panel. Sin esto el admin
 * tendría que mandarle el código a mano por WhatsApp. */
export function buildAmbassadorWelcomeEmail(data: {
  name: string;
  code: string;
  panelUrl: string;
  tasks: string[];
}) {
  return emailShell({
    preheader: `Ya eres embajador de Mansion Playroom, ${data.name}.`,
    footer: false,
    hero: emailHero({
      accent: 'yellow',
      emoji: '🎉',
      title: `¡Quedaste, ${data.name}!`,
      subtitle: 'Ya eres embajador de Mansion Playroom.',
    }),
    body: `
      ${sectionTitle('🎟', 'Tu código')}
      ${card(`
        <p style="color:${INK};font-size:32px;font-weight:800;font-family:monospace;margin:0 0 8px;text-align:center;">${data.code}</p>
        <p style="color:${MUTED};font-size:13px;margin:0;text-align:center;">
          Cada persona que lo ponga al comprar su entrada te genera comisión, automáticamente.
        </p>
      `, { bg: ACCENT.pink.bg, border: false })}

      ${sectionTitle('📱', 'Lo que esperamos de ti')}
      ${card(data.tasks.map((t) => `<p style="color:${INK};font-size:14px;margin:0 0 6px;">• ${t}</p>`).join(''))}

      ${card(`
        <p style="color:${INK};font-size:14px;margin:0;line-height:1.6;">
          Todos los lunes te mandamos un resumen con tus ventas, cuánto llevas ganado y el material para publicar
          esa semana. No tienes que preguntarle nada a nadie.
        </p>
      `)}

      <div style="text-align:center;margin-top:24px;">
        <a href="${data.panelUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver mi panel</a>
      </div>
    `,
  });
}

export function buildAmbassadorWeeklyEmail(data: {
  name: string;
  code: string;
  monthlySales: number;
  monthlyExistingSales: number;
  monthlyCommission: number;
  totalCommission: number;
  currentPercent: number;
  nextTarget: { target: number; salesNeeded: number; nextPercent: number } | null;
  benefitItems: string[];
  benefitBonusClp: number;
  exclusiveClientsCount: number;
  panelUrl: string;
  material?: {
    title?: string | null;
    storiesText?: string | null;
    reelText?: string | null;
    postText?: string | null;
    countdownText?: string | null;
    linkUrl?: string | null;
  } | null;
}) {
  const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
  const m = data.material;
  const tieneMaterial = !!m && !!(m.storiesText || m.reelText || m.postText || m.countdownText || m.linkUrl);

  const progreso = data.nextTarget
    ? Math.min(100, Math.round((data.monthlySales / data.nextTarget.target) * 100))
    : 100;

  const materialRow = (label: string, value?: string | null) => value
    ? `<div style="padding:8px 0;border-bottom:1px solid ${BORDER};">
         <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 3px;">${label}</p>
         <p style="color:${INK};font-size:14px;margin:0;line-height:1.5;">${value}</p>
       </div>`
    : '';

  // Hero a medida (kicker de texto en vez del emoji gigante de siempre) --
  // se arma entero acá con `rawBody` en vez de usar `emailHero`, que asume
  // un emoji como elemento central.
  return emailShell({
    preheader: `Tu semana como embajador, ${data.name}.`,
    footer: false,
    rawBody: true,
    body: `
    <div style="background-color:${ACCENT.lilac.bg};padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
      <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:64px;width:auto;margin-bottom:24px;" />
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Tu semana como embajador</p>
      <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 8px;">Hola ${data.name}</h1>
      <p style="color:${MUTED};font-size:15px;margin:0;">
        ${data.monthlySales === 0
          ? 'Este mes todavía no registras ventas — cualquier venta que traigas empieza al 30%.'
          : `Llevas ${data.monthlySales} venta${data.monthlySales === 1 ? '' : 's'} este mes y estás cobrando el ${data.currentPercent}%.`}
      </p>
    </div>

    <div style="padding:32px 24px 0;">
      ${sectionTitle('📊', 'Tus números del mes')}
      ${card(`
        ${grid([
          `<div style="background:${ACCENT.pink.bg};border-radius:14px;padding:14px;text-align:center;">
            <p style="color:${ACCENT.pink.text};font-size:24px;font-weight:800;margin:0;">${data.monthlySales}</p>
            <p style="color:${MUTED};font-size:11px;margin:4px 0 0;">Ventas a tus clientes</p>
          </div>`,
          `<div style="background:${ACCENT.blue.bg};border-radius:14px;padding:14px;text-align:center;">
            <p style="color:${ACCENT.blue.text};font-size:24px;font-weight:800;margin:0;">${data.currentPercent}%</p>
            <p style="color:${MUTED};font-size:11px;margin:4px 0 0;">Tu comisión actual</p>
          </div>`,
        ], 2)}
        <div style="padding:10px 0 0;">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${BORDER};">
            <span style="color:${MUTED};font-size:13px;">Comisión de este mes</span>
            <span style="color:${INK};font-size:14px;font-weight:700;">${money(data.monthlyCommission)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${BORDER};">
            <span style="color:${MUTED};font-size:13px;">Comisión acumulada (histórica)</span>
            <span style="color:${ACCENT.pink.text};font-size:14px;font-weight:800;">${money(data.totalCommission)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;">
            <span style="color:${MUTED};font-size:13px;">Tus clientes exclusivos</span>
            <span style="color:${INK};font-size:14px;font-weight:700;">${data.exclusiveClientsCount}</span>
          </div>
          ${data.monthlyExistingSales > 0 ? `
          <p style="color:${FAINT};font-size:11px;margin:10px 0 0;line-height:1.5;">
            Además hiciste ${data.monthlyExistingSales} venta${data.monthlyExistingSales === 1 ? '' : 's'} a clientes que ya estaban
            en la base: esas pagan 10% y no suben tu nivel.
          </p>` : ''}
        </div>
      `)}

      ${data.nextTarget ? `
      ${sectionTitle('🎯', 'Tu próximo objetivo')}
      ${card(`
        <p style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">${data.monthlySales} / ${data.nextTarget.target} ventas</p>
        <p style="color:${MUTED};font-size:14px;margin:0 0 12px;">
          Te faltan <strong>${data.nextTarget.salesNeeded}</strong> para subir al <strong>${data.nextTarget.nextPercent}%</strong>.
        </p>
        <div style="background:${BORDER};border-radius:999px;height:10px;overflow:hidden;">
          <div style="background:${ACCENT.pink.solid};height:10px;width:${progreso}%;border-radius:999px;"></div>
        </div>
      `, { bg: ACCENT.lilac.bg, border: false })}
      ` : `
      ${sectionTitle('🏆', 'Nivel máximo')}
      ${card(`<p style="color:${INK};font-size:16px;font-weight:700;margin:0;">Estás en el tramo más alto de la escala. Imposible subir más.</p>`, { bg: ACCENT.yellow.bg, border: false })}
      `}

      ${data.benefitItems.length > 0 || data.benefitBonusClp > 0 ? `
      ${sectionTitle('🎁', 'Lo que ya desbloqueaste este mes')}
      ${card(`
        ${data.benefitItems.map((b) => `<p style="color:${INK};font-size:15px;font-weight:600;margin:0 0 6px;">• ${b}</p>`).join('')}
        ${data.benefitBonusClp > 0 ? `<p style="color:${ACCENT.pink.text};font-size:17px;font-weight:800;margin:8px 0 0;">+ Bono de ${money(data.benefitBonusClp)}</p>` : ''}
        <p style="color:${MUTED};font-size:12px;margin:10px 0 0;">Escríbenos por Instagram para coordinar cómo lo recibes.</p>
      `, { bg: ACCENT.yellow.bg, border: false })}
      ` : `
      ${card(`<p style="color:${MUTED};font-size:14px;margin:0;">Con tu primera venta del mes se activan tus beneficios: entrada liberada y un acompañante.</p>`)}
      `}

      ${tieneMaterial ? `
      ${sectionTitle('📱', m?.title || 'Material de la semana')}
      ${card(`
        ${materialRow('Historias', m?.storiesText)}
        ${materialRow('Reel', m?.reelText)}
        ${materialRow('Publicación', m?.postText)}
        ${materialRow('Cuenta regresiva', m?.countdownText)}
        ${m?.linkUrl ? `<p style="margin:12px 0 0;"><a href="${m.linkUrl}" style="color:${ACCENT.pink.text};font-size:13px;font-weight:700;">Descargar el material →</a></p>` : ''}
      `)}
      ` : ''}

      <div style="text-align:center;margin-top:28px;">
        <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Tu código</p>
        <p style="color:${INK};font-size:26px;font-weight:800;font-family:monospace;margin:0 0 20px;">${data.code}</p>
        <a href="${data.panelUrl}" style="display:inline-block;background:${ACCENT.pink.solid};color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:800;font-size:14px;">Ver mi panel</a>
      </div>
    </div>
    `,
  });
}

/** Resumen de ingresos del día del evento, enviado por el cron de las 3am
 * (server/cronRoutes.ts) -- el mismo número que se ve en vivo en Ajustes,
 * por si el dueño quiere revisarlo sin abrir el celular temprano. */
export function buildCheckinSummaryEmail(data: {
  eventTitle: string;
  eventDate: Date | string;
  insideCount: number;
  expectedCount: number;
}) {
  const fecha = formatChileDate(data.eventDate, { withYear: true, withWeekday: false });
  const pct = data.expectedCount > 0 ? Math.round((data.insideCount / data.expectedCount) * 100) : 0;
  // Interno (cron 3am, el dueño se lo manda a sí mismo) -- sin hero ni pie.
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">🚪 ${data.eventTitle}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">Resumen de ingresos — ${fecha}</p>

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Personas adentro</p>
      <p style="color:${INK};font-size:32px;font-weight:800;margin:0 0 2px;">${data.insideCount.toLocaleString('es-CL')} <span style="color:${MUTED};font-size:16px;font-weight:600;">/ ${data.expectedCount.toLocaleString('es-CL')}</span></p>
      <p style="color:${MUTED};font-size:13px;margin:0;">${pct}% de las entradas vendidas ya hicieron check-in en la puerta.</p>
    `)}
  </div>
    `,
  });
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
  countedQr?: number;
  expectedCash: number;
  expectedDebit: number;
  expectedCredit: number;
  expectedQr?: number;
  cashDiff: number;
  debitDiff: number;
  creditDiff: number;
  qrDiff?: number;
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

  // Interno (el dueño se lo manda a sí mismo al cerrar turno) -- sin hero ni pie.
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">🔒 Turno cerrado — ${data.eventTitle}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">${data.registerName} · ${data.operatorName} · ${formatChileDateTime(data.closedAt)}</p>

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Cuadre de caja</p>
      <p style="color:${MUTED};font-size:12px;margin:0 0 10px;">Efectivo inicial: ${money(data.openingCash)} · ${data.salesCount} ventas · ${data.redeemsCount} canjes</p>
      ${diffRow('💵 Efectivo', data.countedCash, data.expectedCash + data.openingCash, data.cashDiff)}
      ${diffRow('💳 Débito', data.countedDebit, data.expectedDebit, data.debitDiff)}
      ${diffRow('💳 Crédito', data.countedCredit, data.expectedCredit, data.creditDiff)}
      ${data.expectedQr || data.countedQr ? diffRow('📲 QR / Transferencia', data.countedQr ?? 0, data.expectedQr ?? 0, data.qrDiff ?? 0) : ''}
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
    `,
  });
}

/** Tarjeta opcional de "próximo evento destacado" para el mailing masivo
 * (pedido explícito del usuario) -- se arma en server/mailing.ts
 * (getMailingEventInfo) y llega ya resuelta, buildMailingBlastEmail no
 * consulta la base de datos. */
/** Email genérico para los reportes consolidados de Ventas/Gastos (pedido
 * explícito del usuario: un solo botón por sub-tab que arma PDF+email con
 * todo). `lines` son pares label/valor ya formateados por el caller. */
export function buildSimpleReportEmail(data: { title: string; subtitle: string; lines: { label: string; value: string }[] }) {
  // Interno -- sin hero ni pie.
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">${data.title}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">${data.subtitle} — el detalle completo va en el PDF adjunto.</p>

    ${card(data.lines.map((l) => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;">
        <span style="color:${MUTED};font-size:13px;">${l.label}</span>
        <span style="color:${INK};font-size:13px;font-weight:600;">${l.value}</span>
      </div>
    `).join(''))}
  </div>
    `,
  });
}

/** Rendición con el proveedor de cocina (pedido explícito del usuario):
 * cuánto se vendió de productos `toKitchen`, cuánto le corresponde a él y
 * cuánto a la productora. El PDF adjunto (buildKitchenVendorPdf) trae el
 * detalle producto por producto; este correo es solo el resumen. */
export function buildKitchenVendorEmail(data: {
  eventTitle: string;
  vendorName: string;
  totalRevenue: number;
  vendorShare: number;
  venueShare: number;
}) {
  const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
  // Interno (va a cc del proveedor de cocina, no a un cliente) -- sin hero ni pie.
  return emailShell({
    footer: false,
    rawBody: true,
    body: `
  <div style="max-width:600px;margin:0 auto;padding:24px;background-color:#FFFFFF;">
    <h1 style="color:${INK};font-size:20px;font-weight:800;margin:0 0 4px;">🍽️ Rendición de cocina — ${data.eventTitle}</h1>
    <p style="color:${MUTED};font-size:13px;margin:0 0 20px;">Para ${data.vendorName} — el detalle completo por producto va en el PDF adjunto.</p>

    ${card(`
      <p style="color:${FAINT};font-size:11px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 10px;">Resumen del evento</p>
      <p style="color:${MUTED};font-size:13px;margin:0 0 6px;">Ingresos totales: <strong style="color:${INK};">${money(data.totalRevenue)}</strong></p>
      <p style="color:${MUTED};font-size:13px;margin:0 0 6px;">Le corresponde a ${data.vendorName}: <strong style="color:${INK};">${money(data.vendorShare)}</strong></p>
      <p style="color:${MUTED};font-size:13px;margin:0;">Le corresponde a ${BRAND_NAME}: <strong style="color:${INK};">${money(data.venueShare)}</strong></p>
    `)}
  </div>
    `,
  });
}

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
  const greeting = data.buyerName ? `¡Hola, ${data.buyerName}!` : '¡Hola!';
  const eventInfo = data.eventInfo;
  const showBanner = data.eventSections?.banner ?? true;
  const showDetails = data.eventSections?.details ?? true;
  const showMission300 = data.eventSections?.mission300 ?? true;
  const showVenueGrid = data.eventSections?.venueGrid ?? true;

  return emailShell({
    preheader: data.preheader,
    beforeContainer: eventInfo?.imageUrl && showBanner
      ? `<img src="${eventInfo.imageUrl}" alt="${eventInfo.title}" style="display:block;width:100%;height:auto;" />`
      : undefined,
    // Hero a medida (saludo chico arriba del titular, sin subtítulo ni CTA
    // en el encabezado -- el CTA de la campaña va más abajo, después de los
    // párrafos) -- no usa `emailHero`, que asume ese otro orden.
    hero: `
      ${anniversaryBand()}
      <div style="background-color:${ACCENT.pink.bg};padding:40px 24px;text-align:center;border-radius:0 0 32px 32px;">
        <img src="${LOGO_URL}" alt="${BRAND.nombre}" style="height:64px;width:auto;margin-bottom:24px;" />
        <p style="font-size:52px;margin:0 0 12px;">🍬</p>
        <p style="color:${MUTED};font-size:14px;margin:0 0 4px;">${greeting}</p>
        <h1 style="color:${INK};font-size:26px;font-weight:800;margin:0 0 16px;">${data.headline}</h1>
        ${costumeBadge()}
      </div>
    `,
    body: `
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
    `,
  });
}

/** Se manda al DESTINATARIO cuando alguien le invitó un trago y el pago se
 * aprobó. Es el respaldo del código: la app de la fiesta se cierra cuando
 * termina el evento, pero el trago sigue válido para la próxima (decisión
 * del dueño), así que el código tiene que sobrevivir en algún lado.
 *
 * Nunca revela quién es la persona: solo su alias, igual que en la fiesta. */
export function buildGiftEmail(data: {
  toAlias: string;
  fromAlias: string;
  drinkName: string;
  displayCode: string;
  message?: string | null;
  eventTitle: string;
}) {
  return emailShell({
    preheader: `${data.fromAlias} te invitó un ${data.drinkName}.`,
    footer: false,
    hero: emailHero({
      accent: 'pink',
      emoji: '🍹',
      title: `${data.fromAlias} te invitó un trago`,
      subtitle: data.drinkName,
    }),
    body: `
      ${data.message ? card(
        `<p style="color:${INK};font-size:15px;font-style:italic;margin:0;text-align:center;">"${data.message}"</p>`,
        { bg: ACCENT.yellow.bg, border: false },
      ) : ''}

      ${card(`
        <p style="color:${FAINT};font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;text-align:center;">Muestra este código en la barra</p>
        <p style="color:${INK};font-size:32px;font-weight:800;letter-spacing:3px;margin:0;text-align:center;font-family:monospace;">${data.displayCode}</p>
      `, { bg: ACCENT.pink.bg, border: false })}

      ${card(`
        <p style="color:${MUTED};font-size:14px;line-height:1.6;margin:0;">
          Es para <strong style="color:${INK};">${data.toAlias}</strong>, en ${data.eventTitle}.
          Si no alcanzas a cobrarlo esta noche, no se pierde: <strong style="color:${INK};">queda válido para la próxima fiesta</strong>.
        </p>
      `)}

      <p style="color:${FAINT};font-size:12px;text-align:center;margin:24px 0 0;line-height:1.6;">
        Recibiste este correo porque alguien te invitó un trago en la fiesta.<br>
        ${BRAND.nombre}
      </p>
    `,
  });
}

/** Recordatorio a quien dejó la compra a medio camino.
 *
 * Tono definido por el dueño: recordar y motivar, NO vender de forma
 * agresiva. Por eso no hay cuenta regresiva, ni "última oportunidad", ni
 * descuentos -- solo el recordatorio y el camino de vuelta al checkout.
 *
 * `customBody` permite reemplazar los párrafos por los que generó la IA
 * manteniendo intacta la estructura visual del correo. */
export function buildPendingReminderEmail(data: {
  buyerName: string;
  eventTitle: string;
  eventDate: Date | null;
  total: number;
  checkoutUrl: string;
  customBody?: string;
}) {
  const primerNombre = data.buyerName.split(' ')[0];

  const fechaTexto = data.eventDate
    ? formatChileDate(data.eventDate)
    : null;

  const parrafosPorDefecto = [
    `Vimos que empezaste a sacar tu acceso para ${data.eventTitle} y quedó a medio camino. Puede pasar 🍬`,
    'Tu lugar todavía no está confirmado, pero retomar toma menos de un minuto: el formulario te espera con todo lo que ya habías llenado.',
  ];
  const cuerpo = data.customBody
    ? data.customBody.split('\n').filter((p) => p.trim())
    : parrafosPorDefecto;

  return emailShell({
    preheader: `${data.eventTitle} te está esperando.`,
    footer: false,
    hero: emailHero({
      accent: 'pink',
      emoji: '🎟️',
      title: `${primerNombre}, quedó pendiente tu acceso`,
      subtitle: fechaTexto ? `${data.eventTitle} · ${fechaTexto}` : undefined,
      anniversary: true,
      costume: true,
    }),
    body: `
      ${cuerpo.map((p) => `<p style="color:${INK};font-size:15px;line-height:1.6;margin:0 0 16px;">${p}</p>`).join('')}

      <div style="text-align:center;margin:28px 0 8px;">
        <a href="${data.checkoutUrl}" style="display:inline-block;background:${ACCENT.pink.text};color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:999px;">
          Completar mi compra
        </a>
      </div>

      <p style="color:${FAINT};font-size:12px;text-align:center;margin:16px 0 0;line-height:1.5;">
        Si ya compraste o cambiaste de idea, puedes ignorar este correo.
      </p>
    `,
  });
}
