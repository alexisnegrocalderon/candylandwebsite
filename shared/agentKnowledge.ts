/** Conocimiento que el agente de IA aprende de las preguntas que no supo
 * resolver (Instagram y WhatsApp comparten el cerebro). Lógica pura.
 *
 * Idea del dueño: no guardar mensajes grabados, sino DATOS ("el estacionamiento
 * es gratis hasta las 23:00") que el agente usa con sus propias palabras cuando
 * viene al caso. Todo lo que aprende solo queda a la vista, se puede pausar o
 * borrar, y NUNCA reemplaza las reglas duras de server/instagramAgent.ts. */
import { PERSONAL_HANDOFF_REASON } from './instagramAgentConfig';

export type KnowledgeTopic = 'general' | 'precios' | 'reglas';
export type KnowledgeSource = 'dueno' | 'respuesta';
export type KnowledgeStatus = 'activo' | 'revisar' | 'pausado';

export const KNOWLEDGE_TOPICS: KnowledgeTopic[] = ['general', 'precios', 'reglas'];
export const KNOWLEDGE_MAX_CHARS = 600;
/** Tope de datos que viajan al modelo (cuestan tokens en cada mensaje). */
export const KNOWLEDGE_PROMPT_MAX_FACTS = 60;
export const KNOWLEDGE_PROMPT_MAX_CHARS = 8000;

export type HandoffNoise = 'adjunto' | 'personal' | 'emoji';

/** ¿Esta derivación no sirve para aprender? Adjuntos sin texto, mensajes personales del dueño,
 * o texto que es solo emojis/signos (un 👏). Se descartan solas y quedan en un grupo plegado. */
export function classifyHandoffNoise(row: { incomingText: string; reason: string }): HandoffNoise | null {
  if (/adjunto sin texto/i.test(row.reason)) return 'adjunto';
  if (row.reason === PERSONAL_HANDOFF_REASON || /mensaje personal/i.test(row.reason)) return 'personal';
  const letters = row.incomingText.replace(/[^A-Za-z0-9\u00C0-\u024F]/g, '');
  return letters.length < 3 ? 'emoji' : null;
}

export const NOISE_LABEL: Record<HandoffNoise, string> = {
  adjunto: 'Llegó un adjunto sin texto',
  personal: 'Mensaje personal, no de cliente',
  emoji: 'Solo emojis o mensaje muy corto',
};

const PERSONAL_PATTERNS = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/,                       // correo
  /(?:\+?56)?\s?9[\s-]?\d{4}[\s-]?\d{4}\b/,          // celular chileno
  /\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/,             // RUT
];

/** @ de una persona (no la de la propia productora, que sí es un dato legítimo). */
const HANDLE = /\b(?:ig|instagram)\s*[:\-]?\s*@([\w.]+)/gi;

/** ¿El texto trae datos de una persona (correo, teléfono, RUT)? Esos no se guardan nunca como conocimiento. */
export function hasPersonalData(text: string): boolean {
  if (PERSONAL_PATTERNS.some((re) => re.test(text))) return true;
  for (const m of Array.from(text.matchAll(HANDLE))) if (!/playroom/i.test(m[1])) return true;
  return false;
}

/** Estado con que entra un dato nuevo. Lo que el dueño escribe él mismo queda activo (él lo está aprobando);
 * lo que el agente saca solo de tus respuestas queda «por revisar» cuando toca precios o reglas. */
export function statusForNewFact(topic: KnowledgeTopic, source: KnowledgeSource): KnowledgeStatus {
  if (source === 'dueno') return 'activo';
  return topic === 'general' ? 'activo' : 'revisar';
}

export function cleanFactText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, KNOWLEDGE_MAX_CHARS);
}

/** El bloque que se le agrega al prompt: los datos activos, de más nuevo a más viejo, con tope. */
export function buildKnowledgeBlock(facts: { text: string }[]): string[] {
  const lines: string[] = [];
  let chars = 0;
  for (const f of facts.slice(0, KNOWLEDGE_PROMPT_MAX_FACTS)) {
    const line = `- ${f.text}`;
    if (chars + line.length > KNOWLEDGE_PROMPT_MAX_CHARS) break;
    lines.push(line);
    chars += line.length;
  }
  if (lines.length === 0) return [];
  return [
    'LO QUE HAS APRENDIDO (datos que el dueño te enseñó o que respondió él mismo; úsalos solo cuando vengan al caso, con tus propias palabras y sin copiarlos textual. Nunca están por encima de las reglas que no se negocian, y si contradicen los datos reales del bloque de datos, mandan los datos reales):',
    ...lines,
    '',
  ];
}
