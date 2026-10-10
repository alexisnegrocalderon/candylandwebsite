/**
 * SII (Chile): cálculo puro del F29 del mes, plazos y calendario tributario.
 *
 * Todo acá es una AYUDA para declarar: los valores son sugeridos y conviene
 * compararlos cada mes con la "propuesta de F29" que arma el SII en sii.cl.
 * Los códigos de casilla son los del formulario 29 vigente; si el SII los
 * cambia, se actualizan acá en un solo lugar.
 */
import { ivaFromGross } from './expenses';

export type SiiConfig = {
  /** Día del mes siguiente en que vence el F29 (12; 20 si es facturador electrónico). */
  f29DueDay: number;
  /** Tasa de PPM en % sobre los ingresos netos del mes. null = aún no configurada. */
  ppmRatePercent: number | null;
  /** RUT de la empresa (solo para mostrarlo en la guía). */
  companyRut: string | null;
  /** Régimen, como texto libre ("Pro Pyme General", "no sé"...). */
  regime: string | null;
  /** Si las entradas están exentas de IVA (por defecto NO: afectas). */
  ticketsExempt: boolean;
  /** Incluir las ventas web en el F29 sugerido (regla general: sí). Si se apaga, la
   * herramienta calcula "como declaro hoy" y muestra aparte el IVA web no incluido. */
  webSalesInF29: boolean;
  /** Avisos de vencimientos (push + correo). Prendidos por defecto: evitan multas. */
  remindersEnabled: boolean;
  /** Fechas anuales editables, formato "MM-DD". */
  dj1879Date: string;
  rentaDate: string;
  patenteDates: string[];
};

export const DEFAULT_SII_CONFIG: SiiConfig = {
  f29DueDay: 12,
  ppmRatePercent: null,
  companyRut: null,
  regime: null,
  ticketsExempt: false,
  webSalesInF29: true,
  remindersEnabled: true,
  dj1879Date: '03-31',
  rentaDate: '04-30',
  patenteDates: ['01-31', '07-31'],
};

const MMDD = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function normalizeSiiConfig(raw: unknown): SiiConfig {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<SiiConfig>;
  const day = Number(p.f29DueDay);
  const ppm = p.ppmRatePercent === null || p.ppmRatePercent === undefined ? null : Number(p.ppmRatePercent);
  return {
    f29DueDay: Number.isInteger(day) && day >= 1 && day <= 28 ? day : DEFAULT_SII_CONFIG.f29DueDay,
    ppmRatePercent: ppm !== null && Number.isFinite(ppm) && ppm >= 0 && ppm <= 10 ? ppm : null,
    companyRut: typeof p.companyRut === 'string' && p.companyRut.trim() ? p.companyRut.trim() : null,
    regime: typeof p.regime === 'string' && p.regime.trim() ? p.regime.trim() : null,
    ticketsExempt: p.ticketsExempt === true,
    webSalesInF29: p.webSalesInF29 !== false,
    remindersEnabled: p.remindersEnabled !== false,
    dj1879Date: typeof p.dj1879Date === 'string' && MMDD.test(p.dj1879Date) ? p.dj1879Date : DEFAULT_SII_CONFIG.dj1879Date,
    rentaDate: typeof p.rentaDate === 'string' && MMDD.test(p.rentaDate) ? p.rentaDate : DEFAULT_SII_CONFIG.rentaDate,
    patenteDates: Array.isArray(p.patenteDates) && p.patenteDates.every((d) => typeof d === 'string' && MMDD.test(d))
      ? p.patenteDates.slice(0, 4) : DEFAULT_SII_CONFIG.patenteDates,
  };
}

/** Mes siguiente a "2026-10" → "2026-11". */
export function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Vencimiento del F29 del período `monthKey` (día N del mes siguiente), "YYYY-MM-DD". */
export function f29DueDateFor(monthKey: string, dueDay: number): string {
  return `${nextMonthKey(monthKey)}-${String(dueDay).padStart(2, '0')}`;
}

export type F29Input = {
  /** Ventas afectas del mes, IVA incluido (lo cobrado). */
  salesTaxableGross: number;
  /** Ventas exentas del mes. */
  salesExempt: number;
  /** IVA de las facturas de compra del mes (crédito fiscal). */
  creditoFacturas: number;
  /** Remanente de crédito fiscal del mes anterior (casilla 77 de ese mes). */
  remanenteAnterior: number;
  /** Retención de boletas de honorarios del mes. */
  retencionHonorarios: number;
  /** Tasa de PPM; null = no configurada (no se calcula). */
  ppmRatePercent: number | null;
};

export type F29Line = { code: string; label: string; value: number; hint: string };

export type F29Result = {
  debito: number;
  creditoTotal: number;
  ivaDeterminado: number;
  remanenteSiguiente: number;
  ppmBase: number;
  ppm: number | null;
  retencion: number;
  total: number;
  sinMovimiento: boolean;
  lines: F29Line[];
};

export function computeF29(i: F29Input): F29Result {
  const gross = Math.max(0, Math.round(i.salesTaxableGross));
  const debito = ivaFromGross(gross);
  const netTaxable = gross - debito;
  const exempt = Math.max(0, Math.round(i.salesExempt));
  const creditoFacturas = Math.max(0, Math.round(i.creditoFacturas));
  const remanenteAnterior = Math.max(0, Math.round(i.remanenteAnterior));
  const creditoTotal = creditoFacturas + remanenteAnterior;
  const ivaDeterminado = Math.max(0, debito - creditoTotal);
  const remanenteSiguiente = Math.max(0, creditoTotal - debito);
  const ppmBase = netTaxable + exempt;
  const ppm = i.ppmRatePercent === null ? null : Math.round((ppmBase * i.ppmRatePercent) / 100);
  const retencion = Math.max(0, Math.round(i.retencionHonorarios));
  const total = ivaDeterminado + retencion + (ppm ?? 0);
  const sinMovimiento = gross === 0 && exempt === 0 && creditoFacturas === 0 && retencion === 0;

  const lines: F29Line[] = [
    { code: '538', label: 'Total débitos (IVA de tus ventas)', value: debito, hint: `19/119 de ${gross.toLocaleString('es-CL')} vendidos con IVA` },
    { code: '504', label: 'Remanente de crédito del mes anterior', value: remanenteAnterior, hint: 'Lo que quedó a favor el mes pasado (su casilla 77)' },
    { code: '537', label: 'Total créditos (IVA de tus facturas + remanente)', value: creditoTotal, hint: 'Solo facturas de compra registradas en el SII' },
    { code: '89', label: 'IVA determinado a pagar', value: ivaDeterminado, hint: 'Débitos menos créditos, si es positivo' },
    { code: '77', label: 'Remanente para el mes siguiente', value: remanenteSiguiente, hint: 'Si los créditos superan a los débitos' },
    { code: '151', label: 'Retención de honorarios', value: retencion, hint: 'Lo retenido en las boletas de honorarios del mes' },
    { code: '563', label: 'Base del PPM (ingresos netos del mes)', value: ppmBase, hint: 'Ventas sin IVA + ventas exentas' },
  ];
  if (ppm !== null) lines.push({ code: '062', label: `PPM (${i.ppmRatePercent}%)`, value: ppm, hint: 'Pago provisional mensual a cuenta del impuesto a la renta' });
  lines.push({ code: '91', label: 'Total a pagar dentro del plazo', value: total, hint: 'IVA determinado + retención + PPM' });
  return { debito, creditoTotal, ivaDeterminado, remanenteSiguiente, ppmBase, ppm, retencion, total, sinMovimiento, lines };
}

/* ─── Calendario y avisos ─────────────────────────────────────── */

export type Obligation = {
  key: string;
  kind: 'f29' | 'dj1879' | 'renta' | 'patente';
  title: string;
  dueDate: string; // YYYY-MM-DD
  /** Para el F29: el mes que se declara. */
  period?: string;
};

/** Obligaciones de un año calendario (F29 de cada mes que VENCE en ese año + anuales). */
export function obligationsForYear(year: number, cfg: SiiConfig): Obligation[] {
  const out: Obligation[] = [];
  for (let m = 1; m <= 12; m++) {
    const due = `${year}-${String(m).padStart(2, '0')}`;
    const period = previousMonthKey(due);
    out.push({ key: `f29:${period}`, kind: 'f29', title: `F29 de ${monthLabel(period)}`, dueDate: `${due}-${String(cfg.f29DueDay).padStart(2, '0')}`, period });
  }
  out.push({ key: `dj1879:${year}`, kind: 'dj1879', title: `DJ 1879 (honorarios ${year - 1})`, dueDate: `${year}-${cfg.dj1879Date}` });
  out.push({ key: `renta:${year}`, kind: 'renta', title: `Renta F22 (año ${year - 1})`, dueDate: `${year}-${cfg.rentaDate}` });
  cfg.patenteDates.forEach((d, i) => out.push({ key: `patente:${year}:${i}`, kind: 'patente', title: 'Patente municipal (cuota)', dueDate: `${year}-${d}` }));
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[m - 1] ?? '?'} ${y}`;
}

/** Días calendario entre dos fechas "YYYY-MM-DD" (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export type ReminderKind = 'inicio' | '5dias' | '1dia' | 'hoy' | 'vencido';

/** Qué aviso corresponde HOY para una obligación no cumplida (o null). Para el
 * F29 también avisa el día 1 del mes de vencimiento ("ya puedes prepararlo"). */
export function reminderFor(today: string, o: Obligation, done: boolean): ReminderKind | null {
  if (done) return null;
  const d = daysBetween(today, o.dueDate);
  if (d === 5) return '5dias';
  if (d === 1) return '1dia';
  if (d === 0) return 'hoy';
  if (d < 0 && d >= -10) return 'vencido';
  if (o.kind === 'f29' && today.endsWith('-01') && today.slice(0, 7) === o.dueDate.slice(0, 7)) return 'inicio';
  return null;
}

/* ─── Qué ventas del mes entran al F29 ───────────────────────── */

export type SaleForF29 = { orderId: number; eventId: number; amount: number; accesoAmount?: number; channel?: string };
export type EventTaxInfo = { title: string; taxIssuer: string; taxNote?: string | null };

/** Reparte las ventas del mes (ya filtradas por fecha de venta y sin lo pagado
 * con saldo PlayCard) entre afectas, exentas y fuera del F29, según quién
 * factura cada evento. 'tercero' y 'por_revisar' no entran (los segundos se
 * alertan para que se decidan antes de declarar). */
export function aggregateMonthSales(sales: SaleForF29[], eventsById: Map<number, EventTaxInfo>, ticketsExempt: boolean, includeWeb = true) {
  let taxableGross = 0, exempt = 0;
  // Ventas web que quedaron fuera del cálculo por el modo elegido (siguen siendo IVA).
  const webExcluded = { gross: 0, iva: 0, orders: 0 };
  // Ventas afectas por canal (web vs. caja/barra), para ver cuánto IVA es de cada una.
  const channels = { web: { gross: 0, iva: 0, orders: 0 }, caja: { gross: 0, iva: 0, orders: 0 } };
  const byEvent = new Map<number, { eventId: number; title: string; issuer: string; note: string | null; amount: number; orders: number }>();
  for (const s of sales) {
    const ev = eventsById.get(s.eventId);
    const issuer = ev?.taxIssuer ?? 'por_revisar';
    const g = byEvent.get(s.eventId) ?? { eventId: s.eventId, title: ev?.title ?? `Evento #${s.eventId}`, issuer, note: ev?.taxNote ?? null, amount: 0, orders: 0 };
    g.amount += s.amount; g.orders += 1; byEvent.set(s.eventId, g);
    if (issuer === 'mansion') {
      const ex = ticketsExempt ? Math.min(s.amount, s.accesoAmount ?? 0) : 0;
      exempt += ex;
      taxableGross += s.amount - ex;
      const ch = s.channel === 'web' ? channels.web : channels.caja;
      ch.gross += s.amount - ex; ch.orders += 1; ch.iva += ivaFromGross(s.amount - ex);
      if (s.channel === 'web' && !includeWeb) {
        exempt -= ex; taxableGross -= s.amount - ex;
        webExcluded.gross += s.amount - ex; webExcluded.orders += 1; webExcluded.iva += ivaFromGross(s.amount - ex);
      }
    } else if (issuer === 'exento') {
      exempt += s.amount;
    }
  }
  return { taxableGross, exempt, channels, webExcluded, byEvent: Array.from(byEvent.values()).sort((a, b) => b.amount - a.amount) };
}

/* ─── Comparar con la propuesta del SII y aprender de cada mes ──── */

export type ProposalComparison = {
  proposal: number;
  estimate: number;
  diff: number; // propuesta del SII − nuestro cálculo
  level: 'ok' | 'cerca' | 'distinto';
  message: string;
};

/** Compara nuestro total con el que muestra la propuesta del SII. Una
 * diferencia pequeña (hasta 2 % o $1.000) se considera "cerca". */
export function compareWithProposal(estimate: number, proposal: number): ProposalComparison {
  const diff = Math.round(proposal) - Math.round(estimate);
  const tolerance = Math.max(1000, Math.abs(proposal) * 0.02);
  const level = diff === 0 ? 'ok' : Math.abs(diff) <= tolerance ? 'cerca' : 'distinto';
  const fmt = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
  const message = level === 'ok'
    ? 'Calza exacto con la propuesta del SII.'
    : diff > 0
      ? `El SII propone ${fmt(diff)} MÁS que nuestro cálculo. Suele ser por ventas o boletas que el SII ya tiene registradas y aquí no, o por facturas de compra que no están en el Registro de Compras.`
      : `El SII propone ${fmt(diff)} MENOS que nuestro cálculo. Suele ser por créditos (facturas de compra) que el SII ya tiene y aquí no cargaste, o ventas de eventos que factura otro.`;
  return { proposal: Math.round(proposal), estimate: Math.round(estimate), diff, level, message };
}

export type PeriodRecord = {
  monthKey: string;
  /** Nuestro total sugerido al declarar. */
  estimate: number | null;
  /** Lo que de verdad se pagó. */
  paid: number | null;
  /** Casillas guardadas al declarar (para deducir el PPM real). */
  lines: { code: string; value: number }[] | null;
};

export type SiiLearning = {
  history: { monthKey: string; estimate: number; paid: number; diff: number; diffPercent: number | null }[];
  avgAbsErrorPercent: number | null;
  impliedPpmPercent: number | null;
  suggestedPpmPercent: number | null;
  message: string | null;
};

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Aprende de los meses ya pagados: cuánto nos desviamos del monto real y qué
 * tasa de PPM implica lo que se pagó (total − IVA − retención ÷ base). */
export function learnFromPeriods(periods: PeriodRecord[], currentPpm: number | null): SiiLearning {
  const done = periods.filter((p) => p.estimate !== null && p.paid !== null).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const history = done.map((p) => {
    const diff = (p.paid as number) - (p.estimate as number);
    return { monthKey: p.monthKey, estimate: p.estimate as number, paid: p.paid as number, diff, diffPercent: (p.paid as number) > 0 ? Math.round((diff / (p.paid as number)) * 1000) / 10 : null };
  });
  const pcts = history.map((h) => h.diffPercent).filter((x): x is number => x !== null).map(Math.abs);
  const avgAbsErrorPercent = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null;

  const implied: number[] = [];
  for (const p of done) {
    const code = (c: string) => p.lines?.find((l) => l.code === c)?.value ?? null;
    const base = code('563'), iva = code('89'), ret = code('151');
    if (base && base > 0 && iva !== null && ret !== null) {
      const ppmReal = (p.paid as number) - iva - ret;
      if (ppmReal >= 0) implied.push((ppmReal / base) * 100);
    }
  }
  const last = implied.slice(-3);
  const impliedPpmPercent = last.length ? Math.round(median(last) * 100) / 100 : null;
  const suggestedPpmPercent = impliedPpmPercent !== null && impliedPpmPercent <= 10 && (currentPpm === null || Math.abs(currentPpm - impliedPpmPercent) > 0.05) ? impliedPpmPercent : null;

  let message: string | null = null;
  if (suggestedPpmPercent !== null) message = currentPpm === null
    ? `Con lo que pagaste, tu PPM parece ser ${suggestedPpmPercent}%. Puedes usarlo para que el total sugerido sea más exacto.`
    : `Con lo que pagaste, tu PPM real parece ser ${suggestedPpmPercent}% (tienes configurado ${currentPpm}%).`;
  else if (avgAbsErrorPercent !== null && avgAbsErrorPercent > 5) message = `En promedio nos desviamos ${avgAbsErrorPercent}% del monto real: revisa facturas o eventos sin definir antes de declarar.`;
  return { history, avgAbsErrorPercent, impliedPpmPercent, suggestedPpmPercent, message };
}

/* ─── IVA a apartar y plata libre de un evento ──────────────────── */

export type TaxReserve = {
  /** IVA que cobraste en las ventas (19/119 del total cobrado). */
  debito: number;
  /** IVA de tus facturas de compra: lo que recuperas. */
  credito: number;
  /** Lo que debes apartar para el F29 (débito − crédito, si es positivo). */
  ivaNeto: number;
  /** Si el crédito supera al débito, lo que sobra pasa al mes siguiente. */
  remanente: number;
  /** PPM estimado sobre las ventas netas; null si la tasa no está configurada. */
  ppm: number | null;
  /** Retención de las boletas de honorarios del staff. */
  retencion: number;
  /** Total a apartar: IVA neto + PPM + retención. */
  totalApartar: number;
  /** Lo cobrado menos lo que no es tuyo (IVA neto, PPM y retención). */
  platLibre: number;
  /** Qué parte de lo cobrado es IVA (%), para el "por cada $100". */
  ivaPercentOfGross: number;
};

export function taxReserve(p: { grossIncome: number; debito: number; credito: number; ppmRatePercent: number | null; retencion: number }): TaxReserve {
  const gross = Math.max(0, Math.round(p.grossIncome));
  const debito = Math.max(0, Math.round(p.debito));
  const credito = Math.max(0, Math.round(p.credito));
  const ivaNeto = Math.max(0, debito - credito);
  const remanente = Math.max(0, credito - debito);
  const netIncome = Math.max(0, gross - debito);
  const ppm = p.ppmRatePercent === null ? null : Math.round((netIncome * p.ppmRatePercent) / 100);
  const retencion = Math.max(0, Math.round(p.retencion));
  const totalApartar = ivaNeto + (ppm ?? 0) + retencion;
  return {
    debito, credito, ivaNeto, remanente, ppm, retencion, totalApartar,
    platLibre: gross - totalApartar,
    ivaPercentOfGross: gross > 0 ? Math.round((debito / gross) * 1000) / 10 : 0,
  };
}

/* ─── Regularización de meses (ventas web no declaradas antes) ───── */

export type RegStatus = 'pendiente' | 'rectificado' | 'en_convenio' | 'regularizado';
export const REG_STATUS_LABEL: Record<RegStatus, string> = {
  pendiente: 'Por regularizar', rectificado: 'F29 rectificado (falta pagar)', en_convenio: 'En convenio de pago', regularizado: 'Regularizado ✓',
};

export type RegMonth = { monthKey: string; webGross: number; webIva: number; status: RegStatus };

/** Meses cuyo F29 ya venció (o es el del mes en curso: no) y que tienen IVA de
 * ventas web sin regularizar. El mes que todavía está por declarar NO es
 * atraso: se declara normal, con las ventas web incluidas. */
export function regularizationBacklog(months: RegMonth[], today: string, dueDay: number) {
  const due = (m: string) => f29DueDateFor(m, dueDay);
  const overdue = months.filter((m) => m.webIva > 0 && due(m.monthKey) < today && m.status !== 'regularizado');
  return {
    months: overdue,
    pendingIva: overdue.filter((m) => m.status === 'pendiente').reduce((s, m) => s + m.webIva, 0),
    inProgressIva: overdue.filter((m) => m.status === 'rectificado' || m.status === 'en_convenio').reduce((s, m) => s + m.webIva, 0),
  };
}
