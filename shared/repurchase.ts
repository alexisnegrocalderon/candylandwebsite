/* «Tu entrada de siempre»: lo que la app necesita para recomprar en un toque.
 * Sale del `attendeeData` de las compras web anteriores (lo que guardó el
 * checkout): el acceso, la cantidad y los acompañantes. Puro, para probarlo
 * sin base de datos. */

/** Un acompañante tal como lo pidió el checkout: `nombre`, `rut` y `docTipo`. */
export type Companion = { nombre: string; rut: string; docTipo?: 'rut' | 'passport' };

export type LastPurchase = {
  accesoSlug: string;
  accesoName: string | null;
  qty: number;
  /** La opción de «¿Cómo vienes?» (pareja, dos-mujeres…), para no volver a preguntarla. */
  option: string | null;
  companions: Companion[];
};

/** Las opciones que se pueden recomprar directo: las que piden código de comunidad, no. */
const OPTION_BY_SLUG: Record<string, string> = { soltera: 'soltera', duo: 'pareja', duo_mujeres: 'dos-mujeres', trio: 'trio', grupo: 'grupo' };

function str(v: unknown): string { return typeof v === 'string' ? v.trim() : ''; }

/** Los acompañantes de una compra (`acceso__acomp1_nombre`, `acceso__acomp1_rut`…), en orden. */
export function companionsFromCampos(campos: Record<string, unknown> | null | undefined): Companion[] {
  if (!campos) return [];
  const byN = new Map<number, Partial<Companion>>();
  for (const [key, value] of Object.entries(campos)) {
    const m = key.match(/^acceso__acomp(\d+)_(nombre|rut|docTipo)$/);
    if (!m) continue;
    const n = Number(m[1]);
    const c = byN.get(n) ?? {};
    if (m[2] === 'docTipo') c.docTipo = value === 'passport' ? 'passport' : 'rut';
    else c[m[2] as 'nombre' | 'rut'] = str(value);
    byN.set(n, c);
  }
  return Array.from(byN.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c)
    .filter((c): c is Companion => !!c.nombre && !!c.rut);
}

/** La última compra recomprable, de la más nueva a la más vieja (`attendeeData` crudo de cada orden). */
export function lastPurchaseFrom(attendeeDataList: (string | null | undefined)[]): LastPurchase | null {
  for (const raw of attendeeDataList) {
    if (!raw) continue;
    let data: any;
    try { data = JSON.parse(raw); } catch { continue; }
    const slug = str(data?.grupoTipo);
    const campos = data?.campos && typeof data.campos === 'object' ? data.campos : null;
    if (!slug || !campos) continue;
    // Con código de comunidad (Soltero, Dúo dos hombres) se valida cada vez: esa no se recompra directo.
    if (str(campos['acceso__codigo_acceso'])) continue;
    const option = OPTION_BY_SLUG[slug] ?? null;
    if (!option) continue;
    return { accesoSlug: slug, accesoName: str(data.acceso) || null, qty: Math.max(1, Number(data.cantidad) || 1), option, companions: companionsFromCampos(campos) };
  }
  return null;
}

/** Todas las personas con las que ha venido (sin repetir, por documento), para elegirlas con un toque. */
export function knownCompanions(attendeeDataList: (string | null | undefined)[], max = 8): Companion[] {
  const seen = new Set<string>();
  const out: Companion[] = [];
  for (const raw of attendeeDataList) {
    if (!raw) continue;
    let data: any;
    try { data = JSON.parse(raw); } catch { continue; }
    for (const c of companionsFromCampos(data?.campos)) {
      const key = c.rut.replace(/[.\-\s]/g, '').toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= max) return out;
    }
  }
  return out;
}
