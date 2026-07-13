import QRCode from 'qrcode';

/**
 * Genera el QR como data URI (PNG embebido en base64) — no depende de storage
 * externo (S3/Forge), así el ticket funciona igual en cualquier hosting.
 * Colores altamente contrastados (negro sobre blanco) para que escanee bien
 * incluso impreso o con brillo bajo de pantalla.
 */
export async function generateTicketQR(ticketCode: string, eventTitle: string): Promise<{ qrData: string; qrImageUrl: string }> {
  const baseUrl = process.env.APP_URL || 'https://mansionplayroom.cl';
  const qrData = `${baseUrl}/verificar/${ticketCode}`;

  const qrImageUrl = await QRCode.toDataURL(qrData, {
    type: 'image/png',
    width: 400,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'H',
  });

  return { qrData, qrImageUrl };
}
