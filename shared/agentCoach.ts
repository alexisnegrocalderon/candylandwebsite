/** Reporte del coach semanal del agente de IA (server/agentCoach.ts): qué
 * preguntó la gente, dónde se enfrió, y qué agregarle al conocimiento y a la
 * guía de ventas. Se guarda en `siteSettings.agentCoachReport`. */
export interface AgentCoachReport {
  generatedAt: string;
  periodFrom: string;
  periodTo: string;
  stats: {
    conversations: number;
    customerMessages: number;
    handoffs: number;
    agentOrders: number;
    agentRevenue: number;
  };
  summary: string;
  topQuestions: string[];
  dropOffPoints: string[];
  knowledgeSuggestions: string[];
  playbookSuggestions: string[];
  highlights: string[];
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
}

/** `null` si no hay reporte guardado (o está roto). */
export function normalizeAgentCoachReport(raw: unknown): AgentCoachReport | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  if (typeof r.generatedAt !== 'string' || typeof r.summary !== 'string') return null;
  const stats = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    generatedAt: r.generatedAt,
    periodFrom: typeof r.periodFrom === 'string' ? r.periodFrom : r.generatedAt,
    periodTo: typeof r.periodTo === 'string' ? r.periodTo : r.generatedAt,
    stats: {
      conversations: n(stats.conversations),
      customerMessages: n(stats.customerMessages),
      handoffs: n(stats.handoffs),
      agentOrders: n(stats.agentOrders),
      agentRevenue: n(stats.agentRevenue),
    },
    summary: r.summary,
    topQuestions: strings(r.topQuestions),
    dropOffPoints: strings(r.dropOffPoints),
    knowledgeSuggestions: strings(r.knowledgeSuggestions),
    playbookSuggestions: strings(r.playbookSuggestions),
    highlights: strings(r.highlights),
  };
}
