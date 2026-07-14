interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/** Remitente por defecto: dominio de pruebas de Resend hasta que se verifique uno propio. */
const DEFAULT_FROM = 'Candyland <onboarding@resend.dev>';

export async function sendEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

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

export function buildConfirmationEmail(data: {
  buyerName: string;
  eventTitle: string;
  eventDate: string;
  venue: string;
  orderNumber: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  qrImageUrl: string;
  ambassadorCode: string;
  ticketCodes: string[];
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#FBF0F3;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#D9538F;font-size:28px;margin:0;letter-spacing:1px;">CANDYLAND</h1>
      <p style="color:#8A7580;font-size:14px;margin-top:8px;">Confirmación de Compra</p>
    </div>

    <!-- Main Card -->
    <div style="background-color:#FFFFFF;border-radius:20px;padding:32px;border:1px solid #F2D9E4;">
      <h2 style="color:#3D2A35;font-size:22px;margin:0 0 8px;">¡Hola ${data.buyerName}! 🍭</h2>
      <p style="color:#7A6670;font-size:15px;margin:0 0 24px;">Tu compra ha sido confirmada exitosamente.</p>

      <!-- Event Info -->
      <div style="background-color:#FBF0F3;border-radius:14px;padding:20px;margin-bottom:24px;">
        <h3 style="color:#D9538F;font-size:18px;margin:0 0 12px;">${data.eventTitle}</h3>
        <p style="color:#5C4A54;font-size:14px;margin:4px 0;">📅 ${data.eventDate}</p>
        <p style="color:#5C4A54;font-size:14px;margin:4px 0;">📍 ${data.venue}</p>
        <p style="color:#9A8A92;font-size:12px;margin:8px 0 0;">Orden: ${data.orderNumber}</p>
      </div>

      <!-- Items -->
      <div style="margin-bottom:24px;">
        <h4 style="color:#3D2A35;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Detalle de compra</h4>
        ${data.items.map(item => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #F2D9E4;">
            <span style="color:#5C4A54;font-size:14px;">${item.quantity}x ${item.name}</span>
            <span style="color:#3D2A35;font-size:14px;">$${item.price.toLocaleString('es-CL')}</span>
          </div>
        `).join('')}
        <div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:8px;">
          <span style="color:#3D2A35;font-size:16px;font-weight:bold;">Total</span>
          <span style="color:#D9538F;font-size:18px;font-weight:bold;">$${data.total.toLocaleString('es-CL')}</span>
        </div>
      </div>

      <!-- QR Code -->
      <div style="text-align:center;margin-bottom:24px;background-color:#FBF0F3;border-radius:14px;padding:24px;">
        <h4 style="color:#3D2A35;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">Tu Entrada</h4>
        <img src="${data.qrImageUrl}" alt="QR Code" style="width:200px;height:200px;border-radius:8px;background:#fff;padding:8px;" />
        <p style="color:#8A7580;font-size:12px;margin-top:12px;">Presenta este código QR en la entrada del evento</p>
        ${data.ticketCodes.map(code => `<p style="color:#9A8A92;font-size:11px;font-family:monospace;margin:4px 0;">${code}</p>`).join('')}
      </div>

      <!-- Ambassador Code -->
      <div style="background:linear-gradient(135deg,#E8A0C4,#C4A8E0);border-radius:14px;padding:20px;text-align:center;">
        <h4 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Tu Código de Embajador</h4>
        <p style="color:#fff;font-size:28px;font-weight:bold;font-family:monospace;margin:0;">${data.ambassadorCode}</p>
        <p style="color:rgba(255,255,255,0.85);font-size:12px;margin-top:8px;">Comparte este código con tus amigos. Por cada compra con tu código, acumulas premios.</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#9A8A92;font-size:12px;">© ${new Date().getFullYear()} Mansion Playroom. Todos los derechos reservados.</p>
      <p style="color:#9A8A92;font-size:12px;">Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}

/** Confirmación del abono de Misión 300 — todavía no hay ticket ni QR, eso llega recién cuando se resuelve la meta. */
export function buildMissionDepositEmail(data: {
  buyerName: string;
  eventTitle: string;
  eventDate: string;
  orderNumber: string;
  depositTotal: number;
  cutoffDateText: string;
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#FBF0F3;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#D9538F;font-size:28px;margin:0;letter-spacing:1px;">CANDYLAND</h1>
      <p style="color:#8A7580;font-size:14px;margin-top:8px;">Misión 300</p>
    </div>

    <div style="background-color:#FFFFFF;border-radius:20px;padding:32px;border:1px solid #F2D9E4;">
      <h2 style="color:#3D2A35;font-size:22px;margin:0 0 8px;">¡Ya estás dentro, ${data.buyerName}! 🍬</h2>
      <p style="color:#7A6670;font-size:15px;margin:0 0 24px;">
        Tu abono para <strong>${data.eventTitle}</strong> (${data.eventDate}) quedó confirmado. Formas parte de la
        Misión 300: si entre todos juntamos 300 personas antes del <strong>${data.cutoffDateText}</strong>, tu entrada
        queda saldada y no pagas nada más.
      </p>

      <div style="background-color:#FBF0F3;border-radius:14px;padding:20px;margin-bottom:24px;">
        <p style="color:#5C4A54;font-size:14px;margin:4px 0;">Orden: ${data.orderNumber}</p>
        <p style="color:#5C4A54;font-size:14px;margin:4px 0;">Abono pagado: <strong>$${data.depositTotal.toLocaleString('es-CL')}</strong></p>
      </div>

      <div style="background:linear-gradient(135deg,#E8A0C4,#C4A8E0);border-radius:14px;padding:20px;">
        <h4 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">¿Cómo sigue esto?</h4>
        <p style="color:rgba(255,255,255,0.9);font-size:14px;margin:0;">
          El ${data.cutoffDateText} sabremos si se cumplió la meta. Si se cumple, no pagas nada más y te llega tu
          entrada con código QR. Si no se cumple, te escribimos con el link para completar la diferencia (nunca más
          del 60% del valor general de tu entrada) — recién ahí llega tu QR.
        </p>
      </div>
    </div>

    <div style="text-align:center;margin-top:32px;">
      <p style="color:#9A8A92;font-size:12px;">© ${new Date().getFullYear()} Mansion Playroom. Todos los derechos reservados.</p>
      <p style="color:#9A8A92;font-size:12px;">Valparaíso, Chile</p>
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
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#FBF0F3;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#D9538F;font-size:28px;margin:0;letter-spacing:1px;">CANDYLAND</h1>
      <p style="color:#8A7580;font-size:14px;margin-top:8px;">Misión 300 — resultado</p>
    </div>

    <div style="background-color:#FFFFFF;border-radius:20px;padding:32px;border:1px solid #F2D9E4;">
      <h2 style="color:#3D2A35;font-size:22px;margin:0 0 8px;">¡Casi, ${data.buyerName}! 🍭</h2>
      <p style="color:#7A6670;font-size:15px;margin:0 0 24px;">
        No juntamos las 300 personas de la Misión para <strong>${data.eventTitle}</strong> (${data.eventDate}), así
        que para asegurar tu entrada falta completar la diferencia — igual pagaste como máximo el 60% del valor
        general gracias al abono.
      </p>

      <div style="background-color:#FBF0F3;border-radius:14px;padding:20px;margin-bottom:24px;text-align:center;">
        <p style="color:#5C4A54;font-size:14px;margin:0 0 4px;">Orden: ${data.orderNumber}</p>
        <p style="color:#3D2A35;font-size:24px;font-weight:bold;margin:8px 0;">$${data.topupAmount.toLocaleString('es-CL')}</p>
        <p style="color:#8A7580;font-size:12px;margin:0;">Diferencia a pagar para completar tu entrada</p>
      </div>

      <div style="text-align:center;">
        <a href="${data.paymentUrl}" style="display:inline-block;background-color:#D9538F;color:#fff;text-decoration:none;padding:14px 32px;border-radius:999px;font-weight:bold;font-size:15px;">Pagar diferencia</a>
        <p style="color:#8A7580;font-size:12px;margin-top:16px;">Tu ticket con código QR llega apenas se confirme este pago.</p>
      </div>
    </div>

    <div style="text-align:center;margin-top:32px;">
      <p style="color:#9A8A92;font-size:12px;">© ${new Date().getFullYear()} Mansion Playroom. Todos los derechos reservados.</p>
      <p style="color:#9A8A92;font-size:12px;">Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}
