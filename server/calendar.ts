import type { Express, Request, Response } from "express";
import * as db from "./db";

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/** Genera un .ics básico para agregar el evento al calendario del celular —
 * no depende de ninguna cuenta externa (a diferencia de Apple/Google
 * Wallet), así que no hace falta ninguna configuración previa. */
export function registerCalendarRoutes(app: Express) {
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
