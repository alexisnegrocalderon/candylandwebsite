/* «Agregar al calendario» desde la app: un archivo .ics que el iPhone abre directo en
 * Calendario (y Android en Google Calendar). Se arma en el teléfono, sin servidor. */

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha en UTC con el formato de iCalendar (20261031T010000Z). */
export function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Comas, punto y coma y saltos de línea se escapan (RFC 5545). */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');

export function buildIcs(ev: { uid: string; title: string; start: Date; end?: Date | null; location?: string | null; url?: string; description?: string | null }, now: Date = new Date()): string {
  // Sin hora de término: 6 horas, lo que dura una fiesta.
  const end = ev.end && ev.end > ev.start ? ev.end : new Date(ev.start.getTime() + 6 * 3_600_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mansion Playroom//App//ES',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.uid}@mansionplayroom.cl`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(ev.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    ...(ev.location ? [`LOCATION:${esc(ev.location)}`] : []),
    ...(ev.description ? [`DESCRIPTION:${esc(ev.description)}`] : []),
    ...(ev.url ? [`URL:${ev.url}`] : []),
    // Aviso el día antes, a la misma hora.
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)} es mañana`, 'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Abre el .ics (el sistema ofrece agregarlo al calendario). */
export function downloadIcs(filename: string, ics: string): void {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
