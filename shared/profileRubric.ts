/* Puntaje del perfil de Instagram de Playroom (server/profileAudit.ts). La IA
 * puntúa cada criterio dentro de su máximo y explica qué falla; el TOTAL lo
 * suma el código, para que no cambie por redondeos de la IA. Idea de la
 * rúbrica de 100 puntos del paquete github.com/Jakeschincariol/instagram-agent-skill
 * (MIT), adaptada a una fiesta y no a un freelancer. */

export interface RubricItem {
  id: string;
  label: string;
  max: number;
  /** Qué mirar, para la IA y para el dueño. */
  look: string;
}

export const PROFILE_RUBRIC: RubricItem[] = [
  { id: 'nombre', label: 'Nombre buscable', max: 8, look: 'El nombre del perfil incluye lo que la gente busca (ej. "Mansion Playroom · Fiesta liberal Viña"), no solo la marca.' },
  { id: 'bio-que-es', label: 'La bio dice qué es, dónde y cuándo', max: 15, look: 'En 3 segundos se entiende: qué es (fiesta liberal), dónde (Viña / Valparaíso) y la próxima fecha.' },
  { id: 'para-quien', label: 'Para quién es y el ambiente', max: 10, look: 'Se entiende el tipo de ambiente (parejas, solteros, +18, respeto) sin ser explícito.' },
  { id: 'reglas', label: 'Reglas y consentimiento visibles', max: 10, look: 'La bio o las destacadas muestran el consentimiento y las reglas: es lo que da confianza a quien llega por primera vez.' },
  { id: 'cta', label: 'Llamada a la acción', max: 8, look: 'Hay una sola invitación clara (ej. "Entradas en el link", "Escríbenos").' },
  { id: 'link', label: 'Link a la próxima fiesta', max: 10, look: 'El link lleva directo a comprar o ver la próxima fiesta (no a la portada genérica ni a un link roto).' },
  { id: 'destacadas', label: 'Historias destacadas clave', max: 12, look: 'Están las que responden las dudas: cómo funciona, accesos y precios, reglas, preguntas frecuentes, fiestas pasadas.' },
  { id: 'foto', label: 'Foto de perfil reconocible', max: 7, look: 'Se reconoce el logo o la marca en miniatura.' },
  { id: 'fijados', label: 'Publicaciones fijadas', max: 8, look: 'Los 3 fijados presentan la fiesta, dan confianza y muestran la próxima fecha.' },
  { id: 'coherencia', label: 'Coherencia con el sitio', max: 5, look: 'Nombre, tono, fechas y precios coinciden con mansionplayroom.cl.' },
  { id: 'prueba-social', label: 'Prueba social', max: 5, look: 'Se ve que hay comunidad: fiestas pasadas, comentarios, menciones (sin exponer a personas).' },
  { id: 'lectura', label: 'Largo y legibilidad', max: 2, look: 'La bio no es un muro de texto: saltos de línea, pocos emojis, 150 caracteres o menos.' },
];

export const PROFILE_RUBRIC_MAX = PROFILE_RUBRIC.reduce((sum, i) => sum + i.max, 0); // 100

export interface AuditItemScore { id: string; label: string; max: number; score: number; note: string }

export type AuditLevel = 'excelente' | 'bueno' | 'a mejorar' | 'urgente';

export function levelFor(total: number): AuditLevel {
  if (total >= 85) return 'excelente';
  if (total >= 65) return 'bueno';
  if (total >= 40) return 'a mejorar';
  return 'urgente';
}

/** Une lo que devolvió la IA con la rúbrica: cada puntaje se fuerza a un
 * entero entre 0 y el máximo del criterio, los que falten quedan en 0 y el
 * total sale de sumar, nunca de lo que diga la IA. */
export function scoreProfile(raw: unknown): { items: AuditItemScore[]; total: number; level: AuditLevel } {
  const byId = new Map<string, { score?: unknown; note?: unknown }>();
  if (Array.isArray(raw)) {
    for (const r of raw) {
      if (r && typeof r === 'object' && typeof (r as any).id === 'string') byId.set((r as any).id, r as any);
    }
  }
  const items = PROFILE_RUBRIC.map((item) => {
    const given = byId.get(item.id);
    const n = Math.round(Number(given?.score));
    const score = Number.isFinite(n) ? Math.min(item.max, Math.max(0, n)) : 0;
    return { id: item.id, label: item.label, max: item.max, score, note: typeof given?.note === 'string' ? given.note.trim().slice(0, 400) : '' };
  });
  const total = items.reduce((sum, i) => sum + i.score, 0);
  return { items, total, level: levelFor(total) };
}
