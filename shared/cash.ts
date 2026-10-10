/**
 * Caja: lectura de cartolas del banco / reportes de Mercado Pago y sugerencias
 * de clasificación. Todo puro (sin base) para poder probarlo y usarlo también
 * en la vista previa del cliente.
 */

export type MovementClass = 'venta' | 'comision' | 'gasto_evento' | 'gasto_empresa' | 'retiro_dueno' | 'traspaso' | 'otro' | 'por_clasificar';

export const MOVEMENT_CLASS_LABEL: Record<MovementClass, string> = {
  venta: 'Venta', comision: 'Comisión', gasto_evento: 'Gasto de un evento', gasto_empresa: 'Gasto de la empresa',
  retiro_dueno: 'Retiro del dueño', traspaso: 'Traspaso entre mis cuentas', otro: 'Otro', por_clasificar: 'Por clasificar',
};

/** Divide un CSV detectando el separador (; , o tab) y respetando comillas. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts = { ';': (firstLine.match(/;/g) ?? []).length, ',': (firstLine.match(/,/g) ?? []).length, '\t': (firstLine.match(/\t/g) ?? []).length };
  const sep = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',') as string;
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (q) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

/** "$1.234.567", "-1.234", "1234,5", "(5.000)" → número en pesos (redondeado). */
export function parseClp(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$\s]|CLP/gi, '');
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(neg ? -n : n);
}

/** dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd (con o sin hora) → "YYYY-MM-DD". */
export function parseDateCl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

/** Hash corto y estable (FNV-1a) para el id externo de una fila de cartola. */
export function stableHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

export type ParsedMovement = { externalId: string; date: string; description: string; amount: number; balance: number | null; suggested: MovementClass };

/** Sugerencia de clasificación por la glosa (el dueño siempre confirma). */
export function suggestClass(description: string, amount: number, source: 'banco' | 'mercadopago'): MovementClass {
  const d = description.toLowerCase();
  if (/comisi[oó]n|cargo por servicio|mantenci[oó]n/.test(d)) return 'comision';
  if (source === 'banco' && /mercado ?pago/.test(d) && amount > 0) return 'traspaso';
  if (source === 'mercadopago' && /retiro|transferencia a (tu|su) cuenta|payout|withdraw/.test(d)) return 'traspaso';
  if (/cajero|giro|atm/.test(d) && amount < 0) return 'retiro_dueno';
  return 'por_clasificar';
}

const COL = {
  date: /fecha|date/i,
  desc: /descrip|detalle|glosa|concepto|movimiento|description/i,
  cargo: /cargo|d[eé]bito|egreso|giro|debit/i,
  abono: /abono|cr[eé]dito|ingreso|dep[oó]sito|credit/i,
  monto: /monto|importe|amount/i,
  saldo: /saldo|balance/i,
};

/** Lee una cartola (CSV exportado del banco). Busca la fila de encabezados en
 * las primeras 20 líneas y detecta las columnas por su nombre. */
export function parseBankStatement(text: string): { movements: ParsedMovement[]; columns: Record<string, string | null>; skipped: number; error: string | null } {
  const rows = parseDelimited(text);
  const headerIdx = rows.slice(0, 20).findIndex((r) => r.some((c) => COL.date.test(c)) && r.some((c) => COL.desc.test(c) || COL.monto.test(c) || COL.cargo.test(c)));
  if (headerIdx < 0) return { movements: [], columns: {}, skipped: 0, error: 'No encontré la fila de encabezados (necesito al menos "Fecha" y "Descripción" o "Monto"). Exporta la cartola como CSV o Excel guardado como CSV.' };
  const header = rows[headerIdx];
  const find = (re: RegExp, exclude?: RegExp) => header.findIndex((c) => re.test(c) && !(exclude && exclude.test(c)));
  const idx = {
    date: find(COL.date), desc: find(COL.desc), cargo: find(COL.cargo, COL.saldo), abono: find(COL.abono, COL.saldo),
    monto: find(COL.monto, COL.saldo), saldo: find(COL.saldo),
  };
  const columns = Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, i >= 0 ? header[i] : null]));
  const seen = new Map<string, number>();
  const movements: ParsedMovement[] = [];
  let skipped = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const date = parseDateCl(r[idx.date]);
    let amount: number | null = null;
    if (idx.cargo >= 0 || idx.abono >= 0) {
      const cargo = idx.cargo >= 0 ? parseClp(r[idx.cargo]) : null;
      const abono = idx.abono >= 0 ? parseClp(r[idx.abono]) : null;
      if (abono) amount = Math.abs(abono);
      else if (cargo) amount = -Math.abs(cargo);
    }
    if (amount === null && idx.monto >= 0) amount = parseClp(r[idx.monto]);
    if (!date || amount === null || amount === 0) { skipped++; continue; }
    const description = (idx.desc >= 0 ? r[idx.desc] : '') || 'Movimiento';
    const balance = idx.saldo >= 0 ? parseClp(r[idx.saldo]) : null;
    const key = `${date}|${amount}|${description}|${balance ?? ''}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    movements.push({ externalId: `bank:${stableHash(`${key}|${n}`)}`, date, description: description.slice(0, 255), amount, balance, suggested: suggestClass(description, amount, 'banco') });
  }
  return { movements, columns, skipped, error: movements.length ? null : 'No encontré movimientos con fecha y monto.' };
}

/** Caja del mes: lo que se ganó, lo que se retiró y lo que debería quedar. */
export function cashPosition(p: { balances: { source: string; balance: number }[]; monthProfit: number; monthWithdrawals: number }) {
  const total = p.balances.reduce((s, b) => s + b.balance, 0);
  return {
    totalBalance: total,
    monthProfit: p.monthProfit,
    monthWithdrawals: p.monthWithdrawals,
    leftInCompany: p.monthProfit - p.monthWithdrawals,
    withdrawalsOverProfit: p.monthWithdrawals > p.monthProfit && p.monthProfit >= 0,
  };
}
