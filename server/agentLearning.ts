/** Aprendizaje del agente de IA (Instagram y WhatsApp comparten el cerebro).
 *
 * Dos caminos, los dos hacia `agentKnowledge` (datos sueltos, no mensajes grabados):
 *  1. El dueño le EXPLICA algo en una pregunta que el agente no supo resolver («Enseñarle»):
 *     la IA lo convierte en un dato claro y queda activo (el dueño ya lo aprobó al escribirlo).
 *  2. El agente aprende SOLO de las respuestas a mano del dueño: cuando el dueño contesta una
 *     conversación que el agente derivó, un cron saca el dato reutilizable. Lo de precios y
 *     reglas de ingreso/reembolso queda «por revisar» hasta que el dueño lo apruebe.
 *
 * Lo aprendido se ve en el panel (se puede pausar o borrar) y se le pasa al modelo como
 * contexto (server/instagramAgent.ts); nunca reemplaza las reglas duras del prompt. Los datos de
 * personas (correo, teléfono, RUT, @) no se guardan nunca. */
import { and, asc, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from './db';
import { invokeLLM, extractContent } from './_core/llm';
import { agentHandoffLog, agentKnowledge, igMessages, waMessages, type AgentKnowledgeRow } from '../drizzle/schema';
import {
  classifyHandoffNoise, cleanFactText, hasPersonalData, KNOWLEDGE_PROMPT_MAX_FACTS, statusForNewFact,
  type KnowledgeSource, type KnowledgeStatus, type KnowledgeTopic,
} from '../shared/agentKnowledge';

const SYSTEM_PROMPT = `Mantienes el conocimiento de la IA que contesta los mensajes directos de Mansion Playroom, una productora de fiestas en Viña del Mar y Valparaíso (Chile).
Recibes la pregunta de un cliente y la respuesta o explicación del dueño. Tu trabajo: extraer DATOS reutilizables que la IA pueda usar más adelante para contestar a otras personas.
Reglas:
- Cada dato se escribe solo, en una o dos frases, sobre la productora o sus fiestas (ej. "El estacionamiento cuesta $5.000 y se paga en la puerta"). No uses "yo" ni "te", no escribas saludos ni mensajes listos para mandar: es un dato, no un guion.
- Solo lo que el dueño dijo. No agregues montos, horas ni condiciones que no estén en su respuesta.
- Si la respuesta es solo para el caso de UNA persona (confirmar su compra, devolverle plata, agendarla, "ya te lo envié"), no es reutilizable: marca reusable=false.
- Nunca incluyas nombres de clientes, teléfonos, correos, RUT ni cuentas de Instagram de personas: si el dato depende de eso, marca personalData=true.
- topic: "precios" si habla de montos, descuentos, cupones o formas de pago; "reglas" si habla de reembolsos, devoluciones, edad mínima, ingreso, disfraz, dress code, bloqueos o derecho de admisión; "general" para todo lo demás.
- Si no hay ningún dato reutilizable, devuelve la lista vacía.
Responde ÚNICAMENTE con el JSON pedido.`;

const FACTS_SCHEMA = {
  name: 'agent_facts',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['facts'],
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'topic', 'reusable', 'personalData'],
          properties: {
            text: { type: 'string', description: 'El dato, autocontenido, en una o dos frases.' },
            topic: { type: 'string', enum: ['general', 'precios', 'reglas'] },
            reusable: { type: 'boolean', description: 'false si solo sirve para el caso de una persona.' },
            personalData: { type: 'boolean', description: 'true si el dato incluye o depende de datos de una persona.' },
          },
        },
      },
    },
  },
} as const;

export const FACTS_SCHEMA_FOR_TEST = FACTS_SCHEMA;

const FactsOut = z.object({
  facts: z.array(z.object({ text: z.string(), topic: z.enum(['general', 'precios', 'reglas']), reusable: z.boolean(), personalData: z.boolean() })),
});

export interface DistilledFact { text: string; topic: KnowledgeTopic }

/** La IA convierte pregunta + respuesta en datos reutilizables. Descarta lo no reutilizable y lo que trae datos de personas. */
export async function distillFacts(input: { question: string; answer: string }): Promise<DistilledFact[]> {
  const result = await invokeLLM({
    feature: 'agentLearning',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Pregunta del cliente:\n"""${input.question.slice(0, 1500)}"""\n\nRespuesta / explicación del dueño:\n"""${input.answer.slice(0, 2500)}"""` },
    ],
    responseFormat: { type: 'json_schema', json_schema: FACTS_SCHEMA },
  });
  const raw = extractContent(result.choices[0]?.message ?? { content: '' });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('La IA no devolvió un formato válido'); }
  const out = FactsOut.safeParse(parsed);
  if (!out.success) throw new Error('La IA no devolvió datos válidos');
  return out.data.facts
    .filter((f) => f.reusable && !f.personalData)
    .map((f) => ({ text: cleanFactText(f.text), topic: f.topic as KnowledgeTopic }))
    .filter((f) => f.text.length >= 8 && !hasPersonalData(f.text));
}

/** Guarda datos nuevos (sin repetir uno que ya existe). Devuelve los que quedaron guardados. */
async function saveFacts(facts: DistilledFact[], source: KnowledgeSource, handoffId: number | null): Promise<AgentKnowledgeRow[]> {
  const db = await getDb();
  if (!db || facts.length === 0) return [];
  const existing = new Set((await db.select({ t: agentKnowledge.text }).from(agentKnowledge)).map((r) => r.t.toLowerCase()));
  const saved: AgentKnowledgeRow[] = [];
  for (const f of facts) {
    if (existing.has(f.text.toLowerCase())) continue;
    existing.add(f.text.toLowerCase());
    const status = statusForNewFact(f.topic, source);
    const [res] = await db.insert(agentKnowledge).values({ text: f.text, topic: f.topic, source, status, handoffId }) as any;
    const [row] = await db.select().from(agentKnowledge).where(eq(agentKnowledge.id, Number(res.insertId))).limit(1);
    if (row) saved.push(row);
  }
  return saved;
}

async function resolveHandoff(id: number, outcome: 'ensenado' | 'respondida' | 'descartado'): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(agentHandoffLog).set({ resolvedAt: new Date(), outcome }).where(eq(agentHandoffLog.id, id));
}

/** El dueño le explica algo al agente (desde una pregunta pendiente o suelto). Lo que escribe lo aprueba él: queda activo. */
export async function teachFromOwner(input: { idea: string; handoffId?: number | null }): Promise<{ saved: AgentKnowledgeRow[]; usedAi: boolean }> {
  const idea = input.idea.replace(/\s+/g, ' ').trim();
  if (idea.length < 8) throw new Error('Escribe un poco más: ¿qué debería saber el agente?');
  if (hasPersonalData(idea)) throw new Error('Eso trae datos de una persona (correo, teléfono, RUT o @). Cuéntalo sin datos personales: el agente no los guarda.');
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  let question = '(sin pregunta puntual: el dueño quiere que el agente sepa esto)';
  if (input.handoffId) {
    const [h] = await db.select().from(agentHandoffLog).where(eq(agentHandoffLog.id, input.handoffId)).limit(1);
    if (h?.incomingText) question = h.incomingText;
  }
  let facts: DistilledFact[] = [];
  let usedAi = true;
  try {
    facts = await distillFacts({ question, answer: idea });
  } catch (err) {
    console.error('[AgentLearning] No se pudo destilar; se guarda tal cual lo escribió el dueño:', err);
    usedAi = false;
  }
  // Si la IA no sacó nada (o falló), se guarda lo que escribió el dueño: lo escribió a propósito.
  if (facts.length === 0) facts = [{ text: cleanFactText(idea), topic: 'general' }];
  const saved = await saveFacts(facts, 'dueno', input.handoffId ?? null);
  if (input.handoffId) await resolveHandoff(input.handoffId, 'ensenado');
  return { saved, usedAi };
}

/* ── Lista y edición ─────────────────────────────────────────────────────── */

export async function listKnowledge(): Promise<AgentKnowledgeRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentKnowledge).orderBy(desc(agentKnowledge.updatedAt)).limit(300);
}

export async function setKnowledgeStatus(id: number, status: KnowledgeStatus): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(agentKnowledge).set({ status }).where(eq(agentKnowledge.id, id));
}

export async function updateKnowledgeText(id: number, text: string): Promise<void> {
  const clean = cleanFactText(text);
  if (clean.length < 8) throw new Error('El dato es muy corto.');
  if (hasPersonalData(clean)) throw new Error('Trae datos de una persona (correo, teléfono, RUT o @): el agente no los guarda.');
  const db = await getDb();
  if (!db) return;
  await db.update(agentKnowledge).set({ text: clean }).where(eq(agentKnowledge.id, id));
}

export async function deleteKnowledge(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(agentKnowledge).where(eq(agentKnowledge.id, id));
}

/** Los datos activos que viajan al modelo, de más nuevo a más viejo. Nunca rompe al agente: sin tabla (migración pendiente), lista vacía. */
export async function activeKnowledgeFacts(): Promise<{ text: string }[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db.select({ text: agentKnowledge.text }).from(agentKnowledge).where(eq(agentKnowledge.status, 'activo')).orderBy(desc(agentKnowledge.updatedAt)).limit(KNOWLEDGE_PROMPT_MAX_FACTS);
  } catch {
    return [];
  }
}

/* ── Aprendizaje autónomo (cron) ─────────────────────────────────────────── */

/** Descarta solas las derivaciones que no enseñan nada (adjuntos sin texto, mensajes personales, solo emojis). */
export async function sweepNoise(limit = 200): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const pending = await db.select().from(agentHandoffLog).where(and(isNull(agentHandoffLog.resolvedAt), isNull(agentHandoffLog.outcome))).orderBy(desc(agentHandoffLog.createdAt)).limit(limit);
  const noisy = pending.filter((h) => classifyHandoffNoise({ incomingText: h.incomingText, reason: h.reason }));
  if (noisy.length > 0) {
    await db.update(agentHandoffLog).set({ resolvedAt: new Date(), outcome: 'descartado' }).where(inArray(agentHandoffLog.id, noisy.map((h) => h.id)));
  }
  return noisy.length;
}

/** Las respuestas a mano del dueño en un hilo derivado, después de la derivación (hasta 4 mensajes seguidos). */
async function ownerReplies(h: typeof agentHandoffLog.$inferSelect): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const until = new Date(new Date(h.createdAt).getTime() + 3 * 86_400_000);
  const rows = h.channel === 'instagram'
    ? await db.select({ text: igMessages.text, at: igMessages.createdAt }).from(igMessages)
        .where(and(eq(igMessages.threadId, h.threadId), eq(igMessages.direction, 'out'), eq(igMessages.source, 'admin'), gte(igMessages.createdAt, h.createdAt), lte(igMessages.createdAt, until))).orderBy(asc(igMessages.createdAt)).limit(8)
    : await db.select({ text: waMessages.text, at: waMessages.createdAt }).from(waMessages)
        .where(and(eq(waMessages.threadId, h.threadId), eq(waMessages.direction, 'out'), inArray(waMessages.source, ['admin', 'owner_app']), gte(waMessages.createdAt, h.createdAt), lte(waMessages.createdAt, until))).orderBy(asc(waMessages.createdAt)).limit(8);
  const texts = rows.filter((r) => (r.text ?? '').trim().length > 0);
  if (texts.length === 0) return [];
  const first = new Date(texts[0].at).getTime();
  return texts.filter((r) => new Date(r.at).getTime() - first <= 2 * 3_600_000).slice(0, 4).map((r) => (r.text ?? '').trim());
}

/** Aprende de las respuestas a mano del dueño a conversaciones derivadas. Una IA por derivación (tope por corrida). */
export async function learnFromOwnerReplies(now = new Date(), maxPerRun = 12): Promise<{ learned: number; answered: number; failed: number }> {
  const db = await getDb();
  const out = { learned: 0, answered: 0, failed: 0 };
  if (!db) return out;
  // Deja pasar 10 minutos: el dueño puede estar a mitad de la conversación.
  const pending = await db.select().from(agentHandoffLog)
    .where(and(isNull(agentHandoffLog.resolvedAt), isNull(agentHandoffLog.outcome), lte(agentHandoffLog.createdAt, new Date(now.getTime() - 10 * 60_000)), gte(agentHandoffLog.createdAt, new Date(now.getTime() - 14 * 86_400_000))))
    .orderBy(asc(agentHandoffLog.createdAt)).limit(60);
  let used = 0;
  for (const h of pending) {
    if (used >= maxPerRun) break;
    const replies = await ownerReplies(h);
    if (replies.length === 0) continue;
    used++;
    try {
      const facts = await distillFacts({ question: h.incomingText, answer: replies.join('\n') });
      const saved = await saveFacts(facts, 'respuesta', h.id);
      await resolveHandoff(h.id, saved.length > 0 ? 'ensenado' : 'respondida');
      if (saved.length > 0) out.learned += saved.length; else out.answered++;
    } catch (err) {
      out.failed++;
      console.error('[AgentLearning] No se pudo aprender de una respuesta:', err);
    }
  }
  return out;
}

export async function runAgentLearning(now = new Date()): Promise<{ dismissed: number; learned: number; answered: number; failed: number }> {
  const dismissed = await sweepNoise();
  const r = await learnFromOwnerReplies(now);
  return { dismissed, ...r };
}
