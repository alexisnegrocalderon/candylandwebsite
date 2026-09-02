import { z } from "zod";
import { invokeLLM, extractContent } from "./_core/llm";

/* Descripción de evento con IA (pedido explícito del dueño, 02/09): reusa el
 * mismo molde que server/mailing.ts (system prompt + json_schema + zod) pero
 * para el texto que se muestra en la página de venta del evento, no para un
 * correo. Se generan la corta y la larga JUNTAS en un solo llamado -- para
 * que ambas cuenten la misma historia en vez de sonar escritas por separado. */

export const EventDescriptionSchema = z.object({
  shortDescription: z.string().min(4).max(160),
  description: z.string().min(10).max(1200),
});
export type EventDescriptionResult = z.infer<typeof EventDescriptionSchema>;

const EVENT_DESCRIPTION_JSON_SCHEMA = {
  name: "event_description",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["shortDescription", "description"],
    properties: {
      shortDescription: { type: "string", description: "Una frase corta y llamativa (menos de 160 caracteres), para tarjetas/preview del evento." },
      description: { type: "string", description: "Descripción completa para la página de venta: varios párrafos, cuenta qué se va a vivir esa noche, sin exagerar ni prometer lo que no se sabe (aforo, artistas, etc. si no se dieron como dato)." },
    },
  },
} as const;

const SYSTEM_PROMPT = `Eres quien escribe las descripciones de los eventos de Mansion Playroom / Candyland, una productora de fiestas en Valparaíso/Viña del Mar, Chile.
Tono: cercano, conversacional, en español chileno, sin ser vulgar ni gritar en mayúsculas. Nada de lenguaje corporativo genérico ni de agencia de turismo.
Escribes DOS textos que cuentan la misma historia, no dos historias distintas: una versión corta (una frase, para una tarjeta) y una versión completa (varios párrafos, para la página de venta del evento).
No inventes datos concretos que no te dieron (line-up, aforo exacto, sorpresas específicas) -- si no te los dan, habla en términos generales de la experiencia (ambiente, pistas, luces, la gente que va).
Responde ÚNICAMENTE con el JSON pedido, sin explicaciones adicionales.`;

/** Genera shortDescription + description juntas a partir de los datos ya
 * cargados del evento más una idea/tema libre y opcional del dueño (campo
 * transitorio del form, no se guarda en la base -- no existe hoy una columna
 * de "tema" por evento, ver drizzle/schema.ts). */
export async function generateEventDescription(input: {
  title: string;
  venue?: string;
  address?: string;
  eventDateISO?: string;
  idea?: string;
}): Promise<EventDescriptionResult> {
  const datos = [
    `Título: ${input.title}`,
    input.venue ? `Venue: ${input.venue}` : null,
    input.address ? `Dirección: ${input.address}` : null,
    input.eventDateISO ? `Fecha: ${new Date(input.eventDateISO).toLocaleDateString("es-CL", { timeZone: "America/Santiago", weekday: "long", day: "numeric", month: "long" })}` : null,
    input.idea?.trim() ? `Idea/tema que quiero para este evento: ${input.idea.trim()}` : null,
  ].filter(Boolean).join("\n");

  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: datos },
    ],
    responseFormat: { type: "json_schema", json_schema: EVENT_DESCRIPTION_JSON_SCHEMA },
  });

  const raw = extractContent(result.choices[0]?.message ?? { content: "" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvió un JSON válido. Intenta de nuevo.");
  }

  const validated = EventDescriptionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`La descripción generada no tiene el formato esperado: ${validated.error.issues[0]?.message ?? "error desconocido"}.`);
  }
  return validated.data;
}
