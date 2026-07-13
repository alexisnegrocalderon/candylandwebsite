import { ENV } from './_core/env';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput) {
  // Use the built-in notification API
  const apiUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;

  if (!apiUrl || !apiKey) {
    console.warn('[Email] No API configured, skipping email send');
    return { success: false, reason: 'No API configured' };
  }

  try {
    const response = await fetch(`${apiUrl}/notification/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        to: input.to,
        subject: input.subject,
        html: input.html,
      }),
    });

    if (!response.ok) {
      console.error('[Email] Failed to send:', await response.text());
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
<body style="margin:0;padding:0;background-color:#0D0D1A;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#FF1493;font-size:28px;margin:0;">MANSION PLAYROOM</h1>
      <p style="color:#888;font-size:14px;margin-top:8px;">Confirmación de Compra</p>
    </div>

    <!-- Main Card -->
    <div style="background-color:#1A1A2E;border-radius:16px;padding:32px;border:1px solid #333;">
      <h2 style="color:#fff;font-size:22px;margin:0 0 8px;">¡Hola ${data.buyerName}!</h2>
      <p style="color:#aaa;font-size:15px;margin:0 0 24px;">Tu compra ha sido confirmada exitosamente.</p>

      <!-- Event Info -->
      <div style="background-color:#0D0D1A;border-radius:12px;padding:20px;margin-bottom:24px;">
        <h3 style="color:#FF1493;font-size:18px;margin:0 0 12px;">${data.eventTitle}</h3>
        <p style="color:#ccc;font-size:14px;margin:4px 0;">📅 ${data.eventDate}</p>
        <p style="color:#ccc;font-size:14px;margin:4px 0;">📍 ${data.venue}</p>
        <p style="color:#888;font-size:12px;margin:8px 0 0;">Orden: ${data.orderNumber}</p>
      </div>

      <!-- Items -->
      <div style="margin-bottom:24px;">
        <h4 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Detalle de compra</h4>
        ${data.items.map(item => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #333;">
            <span style="color:#ccc;font-size:14px;">${item.quantity}x ${item.name}</span>
            <span style="color:#fff;font-size:14px;">$${item.price.toLocaleString('es-CL')}</span>
          </div>
        `).join('')}
        <div style="display:flex;justify-content:space-between;padding:12px 0;margin-top:8px;">
          <span style="color:#fff;font-size:16px;font-weight:bold;">Total</span>
          <span style="color:#FF1493;font-size:18px;font-weight:bold;">$${data.total.toLocaleString('es-CL')}</span>
        </div>
      </div>

      <!-- QR Code -->
      <div style="text-align:center;margin-bottom:24px;background-color:#0D0D1A;border-radius:12px;padding:24px;">
        <h4 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 16px;">Tu Entrada</h4>
        <img src="${data.qrImageUrl}" alt="QR Code" style="width:200px;height:200px;border-radius:8px;" />
        <p style="color:#888;font-size:12px;margin-top:12px;">Presenta este código QR en la entrada del evento</p>
        ${data.ticketCodes.map(code => `<p style="color:#666;font-size:11px;font-family:monospace;margin:4px 0;">${code}</p>`).join('')}
      </div>

      <!-- Ambassador Code -->
      <div style="background:linear-gradient(135deg,#FF1493,#4169E1);border-radius:12px;padding:20px;text-align:center;">
        <h4 style="color:#fff;font-size:14px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Tu Código de Embajador</h4>
        <p style="color:#fff;font-size:28px;font-weight:bold;font-family:monospace;margin:0;">${data.ambassadorCode}</p>
        <p style="color:rgba(255,255,255,0.8);font-size:12px;margin-top:8px;">Comparte este código con tus amigos. Por cada compra con tu código, acumulas premios.</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#666;font-size:12px;">© ${new Date().getFullYear()} Mansion Playroom. Todos los derechos reservados.</p>
      <p style="color:#666;font-size:12px;">Valparaíso, Chile</p>
    </div>
  </div>
</body>
</html>`;
}
