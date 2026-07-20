import { z } from "zod";
import { invokeLLM } from "./_core/llm";
import { sendEmail, buildMailingBlastEmail } from "./email";
import * as db from "./db";

/** Mailing masivo desde /admin (sección Clientes, pedido explícito del
 * usuario): la IA solo devuelve texto estructurado, nunca HTML -- el HTML
 * final siempre se arma con buildMailingBlastEmail() en server/email.ts,
 * que reusa los mismos helpers de marca que el resto de los emails. */
export const MailingContentSchema = z.object({
  subject: z.string().min(4).max(90),
  preheader: z.string().max(140).optional(),
  headline: z.string().min(4).max(80),
  paragraphs: z.array(z.string().min(4).max(500)).min(1).max(4),
  ctaText: z.string().max(40).optional(),
  highlightLabel: z.string().max(60).optional(),
  highlightValue: z.string().max(60).optional(),
});
export type MailingContent = z.infer<typeof MailingContentSchema>;

const MAILING_JSON_SCHEMA = {
  name: "mailing_template",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["subject", "headline", "paragraphs"],
    properties: {
      subject: { type: "string", description: "Asunto del email, corto y directo, sin emojis excesivos." },
      preheader: { type: "string", description: "Texto de preview que se ve junto al asunto en la bandeja de entrada (una frase corta)." },
      headline: { type: "string", description: "Título grande dentro del email." },
      paragraphs: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 4,
        description: "Uno a cuatro párrafos cortos con el cuerpo del mensaje, tono cercano y conversacional.",
      },
      ctaText: { type: "string", description: "Texto del botón de acción, ej. 'Comprar mi entrada'." },
      highlightLabel: { type: "string", description: "Etiqueta chica de un dato destacado, ej. 'Solo por hoy'. Opcional, solo si el objetivo tiene un dato numérico o urgente que resaltar." },
      highlightValue: { type: "string", description: "El dato destacado en sí, ej. '41 entradas' o '$50.000 en consumos'. Opcional, va junto a highlightLabel." },
    },
  },
} as const;

const SYSTEM_PROMPT = `Eres quien escribe los emails de marketing de Mansion Playroom / Candyland, una productora de fiestas en Valparaíso/Viña del Mar, Chile.
Tono: cercano, conversacional, en español chileno, sin ser vulgar ni gritar en mayúsculas. Nada de lenguaje corporativo genérico.
La marca usa una paleta pastel (rosa/celeste/amarillo/lila) y emojis con moderación (🍬🎉✨), pero el contenido que generas es solo texto, no HTML ni estilos.
Responde ÚNICAMENTE con el JSON pedido, sin explicaciones adicionales. Usa "highlightLabel"/"highlightValue" solo si el objetivo menciona un dato concreto que valga la pena destacar en grande (un número de entradas, un precio, un premio); si no aplica, omítelos.`;

function extractContent(message: { content: string | Array<{ type: string; text?: string }> }): string {
  if (typeof message.content === "string") return message.content;
  return message.content
    .map((part) => (part.type === "text" ? part.text ?? "" : ""))
    .join("");
}

export async function generateMailingTemplate(objective: string, audienceDescription: string): Promise<MailingContent> {
  const result = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Objetivo del mail: ${objective}\n\nA quién se le manda: ${audienceDescription}` },
    ],
    responseFormat: { type: "json_schema", json_schema: MAILING_JSON_SCHEMA },
  });

  const raw = extractContent(result.choices[0]?.message ?? { content: "" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvió un JSON válido. Intenta de nuevo con un objetivo más claro.");
  }

  const validated = MailingContentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`La plantilla generada no tiene el formato esperado: ${validated.error.issues[0]?.message ?? "error desconocido"}.`);
  }
  return validated.data;
}

/** Tope duro por request tRPC -- el cliente trocea en lotes más chicos (25)
 * para dejar margen bajo el maxDuration:30 de la función serverless de
 * Vercel (ver vercel.json); esto es el límite máximo que el server acepta
 * aunque alguien mande más desde afuera. */
export const MAILING_BATCH_MAX = 50;

export type MailingSendResult = {
  customerId: number;
  email: string;
  success: boolean;
  reason?: string;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sin rate limiting conocido/confirmado del plan de Resend en este proyecto
 * -- se deja como env var configurable en vez de un número fijo hardcodeado. */
const THROTTLE_MS = Number(process.env.MAILING_THROTTLE_MS) || 250;

export async function sendMailingBatch(
  customerIds: number[],
  content: MailingContent,
  ctaUrl: string
): Promise<MailingSendResult[]> {
  const recipients = await db.listCustomersByIds(customerIds);
  const results: MailingSendResult[] = [];

  for (const customer of recipients) {
    const html = buildMailingBlastEmail({
      buyerName: customer.fullName ?? "",
      preheader: content.preheader,
      headline: content.headline,
      paragraphs: content.paragraphs,
      ctaText: content.ctaText,
      ctaUrl,
      highlightLabel: content.highlightLabel,
      highlightValue: content.highlightValue,
    });
    const sent = await sendEmail({ to: customer.email, subject: content.subject, html });
    results.push({ customerId: customer.id, email: customer.email, success: sent.success, reason: sent.reason });
    await sleep(THROTTLE_MS);
  }

  return results;
}
