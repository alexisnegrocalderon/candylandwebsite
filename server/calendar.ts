import type { Express, Request, Response } from "express";
import * as db from "./db";

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/** Rutas de archivos descargables asociados a un ticket: el .ics para
 * agregar al calendario, y el QR como imagen real (ver abajo). */
export function registerTicketAssetRoutes(app: Express) {
  // QR como PNG real servido por URL — el QR se genera como data: URI
  // (server/qr.ts) para guardarlo en la base y mostrarlo en la web (los
  // navegadores lo soportan sin problema), pero muchos clientes de correo
  // (Gmail entre ellos) NO renderizan de forma confiable imágenes data: URI
  // embebidas en el HTML recibido — por eso el QR no se veía en el email.
  // Acá se decodifica ese mismo data URI ya guardado y se sirve como una
  // imagen real, algo que cualquier cliente de correo sabe cargar.
  app.get("/api/qr/:ticketCode.png", async (req: Request, res: Response) => {
    const { ticketCode } = req.params;
    const ticket = await db.getTicketByCode(ticketCode);
    if (!ticket?.qrImageUrl?.startsWith('data:image/png;base64,')) {
      res.status(404).send("QR not found");
      return;
    }

    const base64 = ticket.qrImageUrl.slice('data:image/png;base64,'.length);
    const buffer = Buffer.from(base64, 'base64');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  });

  app.get("/api/calendar/:ticketCode.ics", async (req: Request, res: Response) => {
    const { ticketCode } = req.params;
    const ticket = await db.getTicketByCode(ticketCode);
    if (!ticket || !ticket.eventDate) {
      res.status(404).send("Ticket not found");
      return;
    }

    const start = ticket.doorsOpen ? new Date(ticket.doorsOpen) : new Date(ticket.eventDate);
    const end = ticket.eventEnd ? new Date(ticket.eventEnd) : new Date(start.getTime() + 7 * 60 * 60 * 1000);
    const location = [ticket.venue, ticket.address].filter(Boolean).join(', ');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Mansion Playroom//Candyland//ES',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${ticket.ticketCode}@mansionplayroom.cl`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${icsEscape(ticket.eventTitle)}`,
      `LOCATION:${icsEscape(location)}`,
      `DESCRIPTION:${icsEscape(`Tu acceso: ${ticket.ticketTypeName}. Código: ${ticket.ticketCode}`)}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ticket.eventTitle.replace(/[^a-z0-9]/gi, '-')}.ics"`);
    res.send(ics);
  });
}
