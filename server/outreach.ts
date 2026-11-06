/* Correos uno a uno que el sistema deja listos y el dueño aprueba en Cross check («Reportar») antes de que salgan.
 * Cada borrador se define acá; `ensureOutreachDrafts` lo deja como pedido (una sola vez) y `sendOutreach` lo manda al
 * reportarlo. El correo se arma en el momento de enviar, así que lo que se ve en la vista previa es lo que sale. */
import { sendEmail } from "./email";
import { artistBookingSubject, buildArtistBookingEmail } from "./artistBookingEmail";
import { CrossCheckRetry, requestCrossCheck } from "./crossCheck";

export interface OutreachDraft {
  key: string;
  to: string;
  /** Adónde llegan las respuestas. */
  replyTo: string;
  title: string;
  summary: string;
  /** Pasada esta fecha ya no tiene sentido mandarlo. */
  expiresAt: Date;
  build(): { subject: string; html: string };
}

/** Booking de FaeDior para PLAYMORE (el contacto de booking es público en su perfil de Instagram). */
export const OUTREACH_DRAFTS: OutreachDraft[] = [
  {
    key: "booking-faedior-playmore-2026",
    to: "faediorbooking@gmail.com",
    replyTo: "contacto@mansionplayroom.cl",
    title: "Enviar correo de booking a FaeDior (PLAYMORE)",
    summary: "Propuesta para que FaeDior cierre PLAYMORE el viernes 4 de diciembre, de 2:00 a 4:00 AM. Pregunta disponibilidad, aclara que es una fiesta liberal +21 y pide respuesta antes del viernes 13 de noviembre. Las respuestas llegan a contacto@mansionplayroom.cl. Toca «Ver el correo» para leerlo completo antes de reportar.",
    // Con la fecha límite del correo (13 de nov) ya no sirve: se vence el jueves 12 a fin del día (hora de Chile).
    expiresAt: new Date("2026-11-13T02:59:59Z"),
    build: () => ({
      subject: artistBookingSubject(),
      html: buildArtistBookingEmail({
        greetingName: "Martina y equipo de booking",
        artistName: "FaeDior",
        eventUrl: "https://playmore.mansionplayroom.cl",
        setText: "de 2:00 a 4:00 AM",
        setHighlight: "2:00 – 4:00 AM",
        replyBy: "viernes 13 de noviembre",
        producers: [
          { name: "Alexis Calderon", role: "Productor de PlayRoom", phone: "+56 9 3313 5140" },
          { name: "Gino Perez", role: "Productor de Dalmore" },
        ],
      }),
    }),
  },
];

const findDraft = (key: string) => OUTREACH_DRAFTS.find((d) => d.key === key);

let lastEnsure = 0;
/** Deja cada borrador como pedido de Cross check (una sola vez por borrador, aunque se descarte o se envíe). */
export async function ensureOutreachDrafts(now: Date = new Date()): Promise<number> {
  if (now.getTime() - lastEnsure < 60_000) return 0;
  lastEnsure = now.getTime();
  let created = 0;
  for (const d of OUTREACH_DRAFTS) {
    if (d.expiresAt.getTime() <= now.getTime()) continue;
    const ok = await requestCrossCheck({
      kind: "outreach", dedupeKey: `outreach:${d.key}`, title: d.title, summary: d.summary,
      payload: { key: d.key }, expiresAt: d.expiresAt, pushBody: `${d.title}: revísalo y toca Reportar`,
    });
    if (ok) created++;
  }
  return created;
}

export function getOutreachPreview(key: string) {
  const d = findDraft(key);
  if (!d) return null;
  const { subject, html } = d.build();
  return { to: d.to, replyTo: d.replyTo, subject, html };
}

/** Manda el correo. Si Resend falla, el pedido sigue esperando para poder reintentar con «Reportar». */
export async function sendOutreach(key: string): Promise<string> {
  const d = findDraft(key);
  if (!d) throw new Error("Ese correo ya no existe en el sistema.");
  const { subject, html } = d.build();
  const res = await sendEmail({ to: d.to, subject, html, replyTo: d.replyTo });
  if (!res.success) throw new CrossCheckRetry(`No se pudo enviar (${"reason" in res && res.reason ? res.reason : "error de envío"}). Toca Reportar para reintentar.`);
  return `Enviado a ${d.to}. Si responde, te llega a ${d.replyTo}.`;
}
