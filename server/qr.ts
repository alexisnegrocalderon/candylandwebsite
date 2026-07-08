import QRCode from 'qrcode';
import { storagePut } from './storage';

export async function generateTicketQR(ticketCode: string, eventTitle: string): Promise<{ qrData: string; qrImageUrl: string }> {
  // QR data contains the ticket verification URL
  const baseUrl = process.env.APP_URL || 'https://mansionplayroom.cl';
  const qrData = `${baseUrl}/verificar/${ticketCode}`;

  // Generate QR as PNG buffer with branding colors
  const qrBuffer = await QRCode.toBuffer(qrData, {
    type: 'png',
    width: 400,
    margin: 2,
    color: {
      dark: '#FF1493', // Mansion Playroom pink
      light: '#0D0D1A', // Dark background
    },
    errorCorrectionLevel: 'H',
  });

  // Upload to S3
  const key = `qr/ticket-${ticketCode}.png`;
  const { url } = await storagePut(key, qrBuffer, 'image/png');

  return { qrData, qrImageUrl: url };
}
