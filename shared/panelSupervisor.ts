/** Supervisoras con acceso propio al panel de admin (ej. Belén García): una
 * cuenta por persona, con clave y segundo factor suyos. Ven SOLO las
 * secciones de esta lista; el servidor además rechaza todo endpoint que no
 * esté abierto expresamente al rol `supervisor`. */

export function supervisorOpenId(id: number, sessionVersion: number): string {
  return `sup:${id}:${sessionVersion}`;
}

export function parseSupervisorOpenId(openId: string): { id: number; sessionVersion: number } | null {
  const m = /^sup:(\d{1,9}):(\d{1,9})$/.exec(openId);
  return m ? { id: Number(m[1]), sessionVersion: Number(m[2]) } : null;
}

/** Secciones del panel que ve una supervisora (ids de ADMIN_SECTIONS). */
export const SUPERVISOR_SECTION_IDS = [
  'sup-home',
  'playmatch-control', 'denuncias', 'solteros',
  'insumos',
  'manual-access', 'discounts', 'community',
] as const;

export type SupervisorSectionId = typeof SUPERVISOR_SECTION_IDS[number];
