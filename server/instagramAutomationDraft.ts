import { z } from "zod";
import { invokeLLM, extractContent } from "./_core/llm";
import { getSiteSettings } from "./db";
import { normalizeInstagramAgentConfig } from "../shared/instagramAgentConfig";
import { EVENT_BRAND } from "../shared/eventBrand";

/* Botón "Rellenar con IA" de la automatización de Instagram por palabra
 * clave (client/src/components/admin/InstagramAutomations.tsx). Mismo
 * molde que server/eventDescriptions.ts (system prompt + json_schema +
 * zod), pero reusando el mismo contexto de marca del agente conversacional
 * de Instagram (brandNotes/styleExamples + EVENT_BRAND.dressCode) en vez de
 * un tono hardcodeado nuevo -- para que el mensaje de la automatización
 * suene coherente con el resto de los DMs automáticos del sitio. */

export const AutomationReplyDraftSchema = z.object({
  replyMessage: z.string().min(1).max(700),
});
export type AutomationReplyDraftResult = z.infer<typeof AutomationReplyDraftSchema>;

const AUTOMATION_REPLY_JSON_SCHEMA = {
  name: "automation_reply_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["replyMessage"],
    properties: {
      replyMessage: {
        type: "string",
        description: "El mensaje que se le manda por DM a la persona que comentó/respondió la palabra clave. Tono cercano, sin markdown. Si tiene más de una parte (saludo/oferta/cierre), separadas por una línea en blanco (\\n\\n) entre cada una, no todo corrido en un solo párrafo.",
      },
    },
  },
} as const;

export type AutomationRewardInput =
  | { kind: "none" }
  | { kind: "discount"; discountType: "percentage" | "fixed"; discountValue: number }
  | { kind: "gift"; productName: string };

const TRIGGER_LABEL: Record<"comment" | "story_reply" | "both", string> = {
  comment: "un comentario en un post/reel",
  story_reply: "una respuesta a una historia",
  both: "un comentario o una respuesta a una historia",
};

function describeReward(reward: AutomationRewardInput): string {
  if (reward.kind === "discount") {
    const valor = reward.discountType === "percentage" ? `${reward.discountValue}% de descuento` : `$${reward.discountValue} CLP de descuento`;
    return `Regala un CÓDIGO DE DESCUENTO (${valor}). En el mensaje, usa el placeholder literal {{codigo}} donde iría el código (NUNCA inventes ni escribas un código real, todavía no existe) y puedes usar {{link}} para el link de compra (ya lleva el código aplicado solo). No escribas el valor del descuento como si fuera el código.`;
  }
  if (reward.kind === "gift") {
    const producto = reward.productName.trim();
    return `Regala un PRODUCTO de la Carta de la Fiesta${producto ? ` (${producto})` : ""}, gratis, para canjear en caja con la entrada. En el mensaje, usa el placeholder literal {{producto}} donde iría el nombre del producto (no lo repitas escrito aparte) y puedes usar {{link}} para el link de compra (ya lleva el código del regalo aplicado solo).`;
  }
  return "No regala ningún código ni producto -- el mensaje es solo información, un link o un texto (puedes usar {{link}} si tiene sentido, pero no hay ninguna obligación de incluir un link).";
}

/** Arma el mensaje de una automatización de Instagram a partir de la
 * palabra clave, dónde aplica, la recompensa ya configurada en el
 * formulario, y una idea libre y opcional que haya escrito el dueño. No se
 * guarda nada -- es un borrador para el campo `replyMessage` del formulario,
 * que el dueño puede editar a mano después. */
export async function generateAutomationReplyDraft(input: {
  keyword: string;
  triggerSource: "comment" | "story_reply" | "both";
  idea?: string;
  reward: AutomationRewardInput;
}): Promise<AutomationReplyDraftResult> {
  const settings = await getSiteSettings();
  const config = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);

  const datos = [
    `Se activa cuando alguien deja ${TRIGGER_LABEL[input.triggerSource]} con la palabra clave "${input.keyword}".`,
    describeReward(input.reward),
    input.idea?.trim() ? `Lo que quiere lograr el dueño con este mensaje: ${input.idea.trim()}` : null,
    `DRESS CODE (por si el mensaje lo menciona): ${EVENT_BRAND.dressCode}`,
  ].filter(Boolean).join("\n");

  const systemPrompt = [
    "Eres quien escribe los mensajes automáticos que le llegan por Instagram a alguien que comentó o respondió una historia con una palabra clave, para Mansion Playroom.",
    "",
    "CONTEXTO DE LA MARCA (lo escribió el dueño, respétalo):",
    config.brandNotes,
    "",
    "Escribe UN mensaje español chileno, cercano y natural -- como si el dueño le estuviera respondiendo el DM en persona, no una campaña. Sin markdown, sin listas, como mucho un emoji.",
    "Si el mensaje tiene más de una parte (ej. saludo + oferta/código + link + cierre), sepáralas con una línea en blanco entre cada una (un salto de línea real, no una sola oración corrida) -- así se lee ordenado en el DM, como un mensaje bien armado, no como un bloque de texto. No metas la idea del saludo, el código y el link todos pegados en la misma oración. Ejemplo de formato esperado (no copies el contenido, es solo la forma):",
    "¡Hola! Gracias por tu onda 💜\n\nTe dejamos este código AUTOXX00 con $5.000 de descuento para tu entrada\n\nO directamente entra acá y ya te queda aplicado: {{link}}\n\nNos vemos en Mansion 🎉",
    "Usa los placeholders {{codigo}}, {{producto}} y {{link}} literalmente tal cual (con las llaves dobles) cuando corresponda según la recompensa -- nunca inventes un código, un nombre de producto que no te dieron, ni una URL.",
    "No prometas nada que no esté en los datos de abajo. Responde ÚNICAMENTE con el JSON pedido.",
    ...(config.styleExamples.trim().length > 0
      ? [
          "",
          "EJEMPLOS DE CÓMO ESCRIBE EL DUEÑO (imita este tono, no copies el contenido literal si no calza):",
          config.styleExamples,
        ]
      : []),
  ].join("\n");

  const result = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: datos },
    ],
    responseFormat: { type: "json_schema", json_schema: AUTOMATION_REPLY_JSON_SCHEMA },
  });

  const raw = extractContent(result.choices[0]?.message ?? { content: "" });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("La IA no devolvió un JSON válido. Intenta de nuevo.");
  }

  const validated = AutomationReplyDraftSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`El mensaje generado no tiene el formato esperado: ${validated.error.issues[0]?.message ?? "error desconocido"}.`);
  }
  return validated.data;
}
