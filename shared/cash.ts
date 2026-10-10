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

/* ─── Estado de cuenta de Mercado Pago (CSV que se descarga desde la app/web) ── */

export type StatementMovement = {
  externalId: string;
  occurredAt: string; // ISO con hora de Chile
  description: string;
  amount: number; // con signo; en ventas, el NETO (ya sin comisión)
  kind: string;
  classification: MovementClass;
  /** Sugerencia para el dueño cuando queda por clasificar. */
  suggestion: MovementClass | null;
  gross?: number;
  fee?: number;
};

export type MpStatement = {
  movements: StatementMovement[];
  finalBalance: number | null;
  lastDate: string | null;
  totals: { ventasBrutas: number; comisiones: number; ventasNetas: number; transferenciasEnviadas: number; pagos: number; retiros: number; transferenciasRecibidas: number; rentabilidad: number };
  feePercent: number | null;
};

/** "02-09-2026 20:07:30" → ISO en hora de Chile. */
export function parseDateTimeCl(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mo, y, h = '12', mi = '00', se = '00'] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${h.padStart(2, '0')}:${mi}:${se}-03:00`;
}

const MP_SUGGEST: Record<string, MovementClass> = {
  'retiro de dinero': 'retiro_dueno',
  'pago de suscripción': 'gasto_empresa',
  'pago de servicio': 'gasto_empresa',
};

/** Lee el estado de cuenta de Mercado Pago. Devuelve null si el archivo no es de ese formato. */
export function parseMercadoPagoStatement(text: string): MpStatement | null {
  const rows = parseDelimited(text);
  const hIdx = rows.findIndex((r) => r.some((c) => /^RELEASE_DATE$/i.test(c)) && r.some((c) => /^TRANSACTION_NET_AMOUNT$/i.test(c)));
  if (hIdx < 0) return null;
  const sIdx = rows.findIndex((r) => r.some((c) => /^FINAL_BALANCE$/i.test(c)));
  const finalBalance = sIdx >= 0 && rows[sIdx + 1] ? parseClp(rows[sIdx + 1][rows[sIdx].findIndex((c) => /^FINAL_BALANCE$/i.test(c))]) : null;
  const h = rows[hIdx].map((c) => c.toUpperCase());
  const i = (n: string) => h.indexOf(n);
  const iDate = i('RELEASE_DATE'), iMov = i('MOVEMENT_TYPE'), iType = i('TRANSACTION_TYPE'), iId = i('TRANSACTION_ID'), iAmt = i('TRANSACTION_NET_AMOUNT'), iFee = i('MP_PROCESSING_FEE');
  const totals = { ventasBrutas: 0, comisiones: 0, ventasNetas: 0, transferenciasEnviadas: 0, pagos: 0, retiros: 0, transferenciasRecibidas: 0, rentabilidad: 0 };
  const movements: StatementMovement[] = [];
  let lastDate: string | null = null;
  for (const r of rows.slice(hIdx + 1)) {
    const when = parseDateTimeCl(r[iDate] ?? '');
    const amount = parseClp(r[iAmt]);
    if (!when || amount === null) continue;
    lastDate = when;
    const fee = Math.abs(parseClp(r[iFee]) ?? 0);
    const type = (r[iType] ?? r[iMov] ?? 'Movimiento').trim();
    const t = type.toLowerCase();
    const id = (r[iId] ?? '').trim();
    if (t === 'liberación de dinero' || t === 'liberacion de dinero') {
      totals.ventasBrutas += amount; totals.comisiones += fee; totals.ventasNetas += amount - fee;
      // Mismo id que usa la sincronización por API (`pay:<id>`): no se duplica.
      movements.push({ externalId: `pay:${id}`, occurredAt: when, description: 'Venta liberada', amount: amount - fee, kind: 'venta', classification: 'venta', suggestion: null, gross: amount, fee });
      continue;
    }
    if (t === 'rentabilidad') {
      totals.rentabilidad += amount;
      movements.push({ externalId: `mpst:${id}`, occurredAt: when, description: 'Rentabilidad (intereses de Mercado Pago)', amount, kind: 'rentabilidad', classification: 'otro', suggestion: null });
      continue;
    }
    if (t === 'transferencia enviada') totals.transferenciasEnviadas += amount;
    else if (t === 'transferencia recibida') totals.transferenciasRecibidas += amount;
    else if (t.startsWith('retiro')) totals.retiros += amount;
    else if (t.startsWith('pago')) totals.pagos += amount;
    movements.push({
      externalId: `mpst:${id}`, occurredAt: when, description: type, amount: amount - fee, kind: t.slice(0, 40),
      classification: 'por_clasificar', suggestion: MP_SUGGEST[t] ?? null,
    });
  }
  return {
    movements, finalBalance, lastDate, totals,
    feePercent: totals.ventasBrutas > 0 ? Math.round((totals.comisiones / totals.ventasBrutas) * 1000) / 10 : null,
  };
}

/* ─── Cuadratura: cobros de Mercado Pago vs. ventas del sistema ──── */

export type MpPayment = { key: string; paymentId: string; occurredAt: string; gross: number; description?: string };
export type SystemOrder = { orderId: number; paymentId: string | null; createdAt: string; total: number };

/** Número del cobro de un movimiento: viene en `raw.id` (API) o en el id externo `pay:<n>` (estado de cuenta). */
export function paymentIdOf(m: { externalId: string; raw?: { id?: unknown } | null }): string {
  return String(m.raw?.id ?? m.externalId.replace(/^pay:/, '')).trim();
}

/** Calza cada cobro con una venta: primero por número de cobro y, si no hay,
 * por monto exacto dentro de ±`windowDays` días (una sola venta por cobro).
 * Devuelve lo que quedó sin calzar de cada lado. */
export function matchPaymentsToOrders(payments: MpPayment[], orders: SystemOrder[], windowDays = 5) {
  const usedOrders = new Set<number>();
  const byId = new Map(orders.filter((o) => o.paymentId).map((o) => [String(o.paymentId), o]));
  const matchedById: string[] = [];
  const matchedByAmount: string[] = [];
  const unmatchedPayments: MpPayment[] = [];
  const left: MpPayment[] = [];
  for (const p of payments) {
    const o = byId.get(p.paymentId);
    if (o && !usedOrders.has(o.orderId)) { usedOrders.add(o.orderId); matchedById.push(p.key); } else left.push(p);
  }
  const ms = windowDays * 86_400_000;
  for (const p of left) {
    const t = Date.parse(p.occurredAt);
    const cand = orders
      .filter((o) => !usedOrders.has(o.orderId) && Math.round(o.total) === Math.round(p.gross) && Math.abs(Date.parse(o.createdAt) - t) <= ms)
      .sort((a, b) => Math.abs(Date.parse(a.createdAt) - t) - Math.abs(Date.parse(b.createdAt) - t))[0];
    if (cand) { usedOrders.add(cand.orderId); matchedByAmount.push(p.key); } else unmatchedPayments.push(p);
  }
  const unmatchedOrders = orders.filter((o) => !usedOrders.has(o.orderId));
  return { matchedById, matchedByAmount, unmatchedPayments, unmatchedOrders };
}
