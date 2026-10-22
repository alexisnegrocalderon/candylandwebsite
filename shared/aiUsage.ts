/* Panel de gasto de IA (admin → Marketing → Estudio): resume las filas de
 * `aiUsage` por función y por día. Lo puro vive acá para probarlo sin base. */

export const AI_FEATURE_LABEL: Record<string, string> = {
  'studio-diseno-libre': 'Estudio: diseño libre',
  'studio-rapido': 'Estudio: modo Rápido',
  'studio-video': 'Estudio: video desde una idea',
  'studio-foto': 'Estudio: textos para una foto',
  agentCoach: 'Coach del agente',
  costumeOracle: 'Oráculo de disfraces',
  salesStrategist: 'Director comercial',
  reelScript: 'Guion de reels',
  instagramAutomationDraft: 'Borrador de automatizaciones',
  eventSurvey: 'Encuesta de evento',
  'caja-alerts': 'Resumen de caja',
  eventDescriptions: 'Descripciones de eventos',
  ambassadorProgram: 'Programa de embajadores',
  mailing: 'Mailing',
  instagramAgent: 'Agente de Instagram/WhatsApp',
  orderReminders: 'Recordatorios de pedidos',
  sii: 'Consulta SII',
  contentPlanner: 'Plan de contenido',
  budgetNarrative: 'Informe de presupuesto',
  financeDirector: 'Director de finanzas',
  instagramComments: 'Respuestas a comentarios',
  adminQa: 'Preguntas al panel',
  profileAudit: 'Auditoría de perfil',
  receiptScan: 'Lectura de boletas',
};

export interface AiUsageEntry {
  feature: string;
  model: string;
  costMicroUsd: number;
  createdAt: Date | string;
}

export interface AiUsageSummary {
  totalUsd: number;
  calls: number;
  byFeature: { feature: string; label: string; usd: number; calls: number }[];
  byDay: { day: string; usd: number }[];
}

/** Día en Chile (YYYY-MM-DD) de una fecha. */
function chileDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(d);
}

export function summarizeAiUsage(rows: AiUsageEntry[]): AiUsageSummary {
  const feature = new Map<string, { usd: number; calls: number }>();
  const day = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    const usd = r.costMicroUsd / 1_000_000;
    total += usd;
    const f = feature.get(r.feature) ?? { usd: 0, calls: 0 };
    f.usd += usd; f.calls += 1;
    feature.set(r.feature, f);
    const key = chileDay(new Date(r.createdAt));
    day.set(key, (day.get(key) ?? 0) + usd);
  }
  return {
    totalUsd: total,
    calls: rows.length,
    byFeature: Array.from(feature, ([key, v]) => ({ feature: key, label: AI_FEATURE_LABEL[key] ?? key, ...v })).sort((a, b) => b.usd - a.usd),
    byDay: Array.from(day, ([d, usd]) => ({ day: d, usd })).sort((a, b) => a.day.localeCompare(b.day)),
  };
}
