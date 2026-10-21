/* Importar a la lista de bloqueados una planilla (CSV) con datos parciales:
 * detecta qué es cada columna, clasifica cada celda por su contenido y arma un
 * plan con filas nuevas, fusiones con bloqueados que ya existen y celdas
 * dudosas (ej. un local como "Sinners" en la columna de contacto). Puro: no
 * toca nada; la vista previa del admin lo muestra y el servidor aplica lo que
 * el dueño confirma. */
import { parseDelimited } from './cash';
import { blockedKeysFor, emailKey, hasHardKey, igKey, phoneKey, rutKey, type BlockedRow } from './blockedMatch';

export type FieldKey = 'fullName' | 'rut' | 'email' | 'phone' | 'instagram' | 'sourceVenue' | 'sourceProducer' | 'blockedOn' | 'reason' | 'notes' | 'contact' | 'ignore';

export const FIELD_LABEL: Record<FieldKey, string> = {
  fullName: 'Nombre', rut: 'RUT', email: 'Correo', phone: 'Teléfono', instagram: 'Instagram', sourceVenue: 'Local donde lo bloquearon',
  sourceProducer: 'Productora', blockedOn: 'Fecha del bloqueo', reason: 'Motivo', notes: 'Notas', contact: 'Contacto (mezcla de datos)', ignore: 'Ignorar',
};

const HEADER_RULES: [RegExp, FieldKey][] = [
  [/^(nombre|name|persona|cliente|apellido|nombre completo|full ?name)/, 'fullName'],
  [/\b(rut|run|dni|documento|pasaporte|c[eé]dula|identificaci)/, 'rut'],
  [/\b(mail|correo|e-?mail)/, 'email'],
  [/\b(instagram|insta|ig|redes?)\b/, 'instagram'],
  [/\b(tel[eé]fono|telefono|celular|fono|whats|wsp|m[oó]vil|numero|n[uú]mero)/, 'phone'],
  [/\b(contacto|datos?)\b/, 'contact'],
  [/\b(local|lugar|club|bar|discoteca|recinto|donde|d[oó]nde|venue)/, 'sourceVenue'],
  [/\b(productora|organiza|evento|fiesta|party)/, 'sourceProducer'],
  [/\b(fecha|date|cuando|cu[aá]ndo)/, 'blockedOn'],
  [/\b(motivo|raz[oó]n|causa|por ?qu[eé]|reason)/, 'reason'],
  [/\b(nota|observ|comentario|detalle|obs)/, 'notes'],
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Qué es cada columna según su encabezado (`ignore` si no se reconoce). */
export function detectMapping(headers: string[]): FieldKey[] {
  const used = new Set<FieldKey>();
  return headers.map((h) => {
    const t = fold(h);
    for (const [re, key] of HEADER_RULES) {
      if (re.test(t) && (key === 'contact' || key === 'notes' || !used.has(key))) { used.add(key); return key; }
    }
    return 'ignore';
  });
}

export type CellKind = 'empty' | 'email' | 'instagram' | 'phone' | 'rut' | 'date' | 'text';

/** Qué parece ser el contenido de una celda. */
export function classifyCell(raw: string | null | undefined): CellKind {
  const v = (raw ?? '').trim();
  if (!v || /^[-–—.\s]+$/.test(v) || /^(n\/?a|s\/?d|sin dato|no tiene|ninguno)$/i.test(v)) return 'empty';
  if (emailKey(v)) return 'email';
  if (/^@/.test(v) || /instagram\.com\//i.test(v)) return igKey(v) ? 'instagram' : 'text';
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v) || /^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date';
  const compact = v.replace(/[\s.()-]/g, '');
  if (/^(\+?56)?9\d{8}$/.test(compact) || /^\+\d{9,14}$/.test(compact)) return 'phone';
  if (/^\d{1,2}(\.?\d{3}){2}-?[0-9kK]$/.test(v) || /^\d{7,8}-?[0-9kK]$/.test(compact)) return 'rut';
  if (/^\d{8}$/.test(compact)) return 'phone';
  return 'text';
}

/** "05/09/2026", "5-9-26" o "2026-09-05" → "2026-09-05"; null si no se entiende. */
export function parseSheetDate(raw: string): string | null {
  const v = raw.trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return v;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[2]); const d = Number(m[1]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type TextPlacement = 'venue' | 'note' | 'name' | 'ignore';

export interface ImportFields {
  fullName: string | null; rut: string | null; email: string | null; phone: string | null; instagram: string | null;
  sourceVenue: string | null; sourceProducer: string | null; blockedOn: string | null; reason: string | null; notes: string | null;
}

export interface CellWarning {
  line: number;
  column: number;
  value: string;
  /** Qué se esperaba en esa columna. */
  expected: FieldKey;
  found: CellKind;
}

export interface PlannedRow {
  line: number;
  fields: ImportFields;
  /** 'create' = ficha nueva; 'merge' = se completa una existente o una fila anterior del archivo; 'skip' = sin ningún dato. */
  action: 'create' | 'merge' | 'skip';
  mergeWithId: number | null;
  mergeWithLine: number | null;
  /** Solo hay nombre: se carga igual, pero solo avisará (no bloquea). */
  onlyName: boolean;
}

export interface MisplacedValue {
  value: string;
  count: number;
  column: number;
  /** Dónde se pondría por defecto. */
  placement: TextPlacement;
}

export interface BlockedImportPlan {
  rows: PlannedRow[];
  misplaced: MisplacedValue[];
  counts: { create: number; merge: number; skip: number; onlyName: number };
}

const emptyFields = (): ImportFields => ({ fullName: null, rut: null, email: null, phone: null, instagram: null, sourceVenue: null, sourceProducer: null, blockedOn: null, reason: null, notes: null });

export interface ImportOptions {
  mapping: FieldKey[];
  /** Qué hacer con cada texto que cayó en una columna que no es de texto (clave = el texto). */
  placements?: Record<string, TextPlacement>;
  defaultVenue?: string | null;
  defaultProducer?: string | null;
  defaultSourceBy?: string | null;
}

/** Texto corto que cayó en una columna de contacto: lo más probable es el local. */
export const defaultPlacement = (value: string): TextPlacement => (value.trim().split(/\s+/).length <= 3 ? 'venue' : 'note');

const TEXT_FIELDS: FieldKey[] = ['fullName', 'sourceVenue', 'sourceProducer', 'reason', 'notes', 'ignore'];

function put(f: ImportFields, key: keyof ImportFields, value: string) {
  const v = value.trim();
  if (!v) return;
  if (key === 'notes' || key === 'reason') f[key] = f[key] ? `${f[key]} · ${v}` : v;
  else if (!f[key]) f[key] = v;
}

/** La ficha existente que es la misma persona: coincide algún dato duro; con solo nombre, solo si el nombre completo es idéntico y la otra ficha tampoco tiene dato duro. */
export function findExistingMatch(keys: ReturnType<typeof blockedKeysFor>, existing: BlockedRow[]): BlockedRow | null {
  for (const row of existing) {
    if ((keys.rutNorm && row.rutNorm === keys.rutNorm) || (keys.emailNorm && row.emailNorm === keys.emailNorm) || (keys.phoneNorm && row.phoneNorm === keys.phoneNorm) || (keys.igNorm && row.igNorm === keys.igNorm)) return row;
  }
  if (!hasHardKey(keys) && keys.nameFold) return existing.find((r) => r.nameFold === keys.nameFold && !hasHardKey(r)) ?? null;
  return null;
}

export function parseSheet(text: string): { headers: string[]; rows: string[][] } {
  const all = parseDelimited(text);
  return { headers: all[0] ?? [], rows: all.slice(1) };
}

/** Arma el plan de importación. `existing` = fichas ya cargadas (para fusionar, no duplicar). */
export function planBlockedImport(rows: string[][], opts: ImportOptions, existing: BlockedRow[]): BlockedImportPlan {
  const planned: PlannedRow[] = [];
  const misplacedMap = new Map<string, MisplacedValue>();
  const seen = new Map<string, number>(); // clave dura/nombre -> índice en `planned`

  rows.forEach((cells, idx) => {
    const line = idx + 2;
    const f = emptyFields();
    cells.forEach((raw, col) => {
      const v = (raw ?? '').trim();
      const field = opts.mapping[col] ?? 'ignore';
      if (!v || field === 'ignore') return;
      const kind = classifyCell(v);
      if (kind === 'empty') return;

      const route = (target: FieldKey) => {
        if (target === 'rut' || target === 'email' || target === 'phone' || target === 'instagram') put(f, target, v);
        else if (target === 'blockedOn') { const d = parseSheetDate(v); if (d) f.blockedOn = f.blockedOn ?? d; else put(f, 'notes', v); }
        else if (target === 'fullName' || target === 'sourceVenue' || target === 'sourceProducer' || target === 'reason' || target === 'notes') put(f, target, v);
      };
      const placeText = () => {
        const placement = opts.placements?.[v] ?? defaultPlacement(v);
        const key = `${col}\u0000${v}`;
        const m = misplacedMap.get(key) ?? { value: v, count: 0, column: col, placement };
        m.count++;
        misplacedMap.set(key, m);
        if (placement === 'venue') put(f, 'sourceVenue', v);
        else if (placement === 'note') put(f, 'notes', v);
        else if (placement === 'name') put(f, 'fullName', v);
      };

      if (field === 'contact') {
        // Columna mezclada: cada celda va a donde dice su contenido.
        if (kind === 'text') placeText(); else if (kind === 'date') route('blockedOn'); else route(kind);
        return;
      }
      if (TEXT_FIELDS.includes(field)) { route(field); return; }
      if (field === 'blockedOn') { route('blockedOn'); return; }
      // Una columna de RUT/documento acepta cualquier documento (RUT sin dígito
      // verificador, cédula o pasaporte extranjero): lo dudoso se revisa en la ficha.
      if (field === 'rut' && /^[A-Za-z0-9.\- ]{5,20}$/.test(v) && /\d{5}/.test(v.replace(/[.\- ]/g, ''))) { route('rut'); return; }
      // Columna de dato duro (RUT, teléfono, correo, Instagram): si el contenido no es de ese tipo, se ve qué es.
      if (kind === field) { route(field); return; }
      if (kind === 'text') { placeText(); return; }
      if (kind === 'date') { route('blockedOn'); return; }
      route(kind); // otro dato duro en la columna equivocada (ej. un correo en "teléfono"): igual se guarda donde corresponde
    });

    if (!f.sourceVenue && opts.defaultVenue) f.sourceVenue = opts.defaultVenue;
    if (!f.sourceProducer && opts.defaultProducer) f.sourceProducer = opts.defaultProducer;

    const keys = blockedKeysFor(f);
    const hasData = hasHardKey(keys) || !!keys.nameFold || !!f.fullName;
    if (!hasData) { planned.push({ line, fields: f, action: 'skip', mergeWithId: null, mergeWithLine: null, onlyName: false }); return; }

    // ¿Es alguien que ya está en la lista (o una fila anterior del archivo)?
    let mergeWithId: number | null = findExistingMatch(keys, existing)?.id ?? null;
    let mergeWithLine: number | null = null;
    const ids = [keys.rutNorm && `r:${keys.rutNorm}`, keys.emailNorm && `e:${keys.emailNorm}`, keys.phoneNorm && `p:${keys.phoneNorm}`, keys.igNorm && `i:${keys.igNorm}`].filter(Boolean) as string[];
    if (mergeWithId == null) {
      for (const k of ids) if (seen.has(k)) { mergeWithLine = planned[seen.get(k)!].line; break; }
      if (mergeWithLine == null && !ids.length && keys.nameFold && seen.has(`n:${keys.nameFold}`)) mergeWithLine = planned[seen.get(`n:${keys.nameFold}`)!].line;
    }
    const at = planned.length;
    for (const k of ids) if (!seen.has(k)) seen.set(k, at);
    if (!ids.length && keys.nameFold && !seen.has(`n:${keys.nameFold}`)) seen.set(`n:${keys.nameFold}`, at);

    planned.push({
      line, fields: f, action: mergeWithId != null || mergeWithLine != null ? 'merge' : 'create',
      mergeWithId, mergeWithLine, onlyName: !hasHardKey(keys),
    });
  });

  const counts = { create: 0, merge: 0, skip: 0, onlyName: 0 };
  for (const r of planned) { counts[r.action]++; if (r.action !== 'skip' && r.onlyName) counts.onlyName++; }
  const misplaced = Array.from(misplacedMap.values()).sort((a, b) => b.count - a.count);
  return { rows: planned, misplaced, counts };
}

/** Fusión: completa lo que falta; nunca pisa un dato que ya estaba. Las notas se suman. */
export function mergeFields(current: Partial<ImportFields>, incoming: ImportFields): Partial<ImportFields> {
  const out: Partial<ImportFields> = {};
  (Object.keys(incoming) as (keyof ImportFields)[]).forEach((k) => {
    const inc = incoming[k];
    if (!inc) return;
    const cur = current[k];
    if (k === 'notes' || k === 'reason') {
      if (!cur) out[k] = inc;
      else if (!cur.includes(inc)) out[k] = `${cur} · ${inc}`;
    } else if (!cur) out[k] = inc;
  });
  return out;
}

// Reexporta para quien arma la vista previa.
export { rutKey, phoneKey };
