import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CalendarClock, Copy, FileText, Landmark, Loader2, Printer, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useIsDemo } from '@/lib/demoMode';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState } from '@/components/admin/EmptyState';
import { formatChileShortDate } from '@shared/chileDate';
import { monthLabel, previousMonthKey, REG_STATUS_LABEL, type RegStatus } from '@shared/sii';

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`;
const onErr = (e: unknown) => toast.error((e as { message?: string })?.message || 'No se pudo completar la acción');
const pill = 'rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 disabled:opacity-60';
const ddmmyyyy = (d: string) => d.split('-').reverse().join('-');

function chileMonthNow(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
}
function monthOptions(): string[] {
  const out: string[] = [];
  let m = chileMonthNow();
  for (let i = 0; i < 18; i++) { out.push(m); m = previousMonthKey(m); }
  return out;
}

const STATUS: Record<string, { l: string; c: string }> = {
  pendiente: { l: 'Pendiente', c: 'bg-pink-500 text-white' },
  declarado: { l: 'Declarado (falta pagar)', c: 'bg-amber-500 text-white' },
  pagado: { l: '✓ Pagado', c: 'bg-emerald-500 text-white' },
};
const ISSUER: Record<string, string> = { mansion: 'Mansion Playroom', tercero: 'Lo factura otro', exento: 'Exento', por_revisar: 'Por revisar' };
const ALERT_TONE: Record<string, string> = { danger: 'bg-red-500/10 text-red-700', warning: 'bg-amber-500/15 text-amber-800', info: 'bg-sky-500/10 text-sky-800' };

/** Accesos directos al SII y a Tesorería (se abren en pestaña nueva). */
const SII_LINKS = [
  { l: 'Entrar a Mi SII (declarar F29)', href: 'https://misii.sii.cl/', primary: true },
  { l: 'Ir a sii.cl', href: 'https://www.sii.cl/', primary: false },
  { l: 'Pagar en Tesorería', href: 'https://www.tgr.cl/', primary: false },
];

const STEPS = [
  'Revisa las alertas de arriba y corrige lo que falte (facturas sin RUT, eventos sin definir quién factura).',
  'Entra a sii.cl con tu RUT y clave tributaria.',
  'Ve a Servicios online → Impuestos mensuales → Declaración mensual (F29) → Declarar IVA.',
  'Elige el período (mes y año) que estás declarando.',
  'El SII te muestra una propuesta con lo que tiene registrado. Compárala con las casillas de esta pantalla: si algo no calza, revisa antes de enviar.',
  'Completa o corrige las casillas con los valores de abajo (botón copiar en cada una).',
  'Envía la declaración y paga (PEC, tarjeta o transferencia). Si el total es $0, igual se envía.',
  'Copia el folio del certificado y anótalo aquí abajo; marca "Pagado".',
];

function F29Tab({ monthKey }: { monthKey: string }) {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data: m, isLoading, isError, error } = trpc.sii.month.useQuery({ monthKey });
  const [folio, setFolio] = useState('');
  const [paid, setPaid] = useState('');
  const mark = trpc.sii.mark.useMutation({
    onSuccess: () => { utils.sii.month.invalidate(); utils.sii.calendar.invalidate(); toast.success('Guardado'); },
    onError: onErr,
  });
  if (isLoading) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (isError || !m) return <p className="text-sm text-destructive">No se pudo cargar: {error?.message}</p>;
  const st = STATUS[m.period.status] ?? STATUS.pendiente;
  const copy = (v: number) => { navigator.clipboard?.writeText(String(v)); toast.success(`Copiado: ${v}`); };

  const printFolder = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    const rows = (arr: string[][]) => arr.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Carpeta SII ${m.label}</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#222}h1{font-size:20px}h2{font-size:15px;margin-top:22px}table{border-collapse:collapse;width:100%;font-size:12px}td{border-bottom:1px solid #ddd;padding:5px}</style></head><body>
      <h1>Carpeta SII · F29 de ${m.label}</h1><p>Vence: ${ddmmyyyy(m.dueDate)} · Estado: ${st.l}${m.period.folio ? ` · Folio ${m.period.folio}` : ''}</p>
      <h2>Casillas sugeridas</h2><table>${rows(m.f29.lines.map((l) => [l.code, l.label, money(l.value)]))}</table>
      <h2>Ventas por evento</h2><table>${rows(m.salesByEvent.map((e) => [e.title, ISSUER[e.issuer] ?? e.issuer, String(e.orders), money(e.amount)]))}</table>
      <h2>Facturas de compra (crédito fiscal)</h2><table>${rows(m.facturas.map((f) => [formatChileShortDate(f.date as any), f.supplier ?? '', f.supplierRut ?? 'sin RUT', money(f.total), money(f.iva)]))}</table>
      <h2>Boletas de honorarios</h2><table>${rows(m.honorarios.map((h) => [h.name, h.rut ?? 'sin RUT', h.eventTitle, money(h.gross), money(h.retention), money(h.net)]))}</table>
      <p style="margin-top:24px;font-size:11px;color:#666">Valores sugeridos por el sistema. Compáralos con la propuesta del SII antes de declarar.</p>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="space-y-6">
      <Card className="admin-clay border-0">
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-[var(--admin-muted)]">F29 de {m.label} · vence el <strong>{ddmmyyyy(m.dueDate)}</strong></p>
            <p className="font-heading text-4xl tabular-nums">{money(m.f29.total)}</p>
            <p className="text-sm text-[var(--admin-muted)]">{m.f29.sinMovimiento ? 'Mes sin movimiento: igual hay que declararlo.' : 'Total sugerido a pagar (IVA + retención + PPM)'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-4 py-1.5 text-sm font-semibold ${st.c}`}>{st.l}</span>
            {SII_LINKS.slice(0, 1).map((k) => (
              <a key={k.href} href={k.href} target="_blank" rel="noopener noreferrer" className={`${pill} bg-pink-500 text-white`}>{k.l} ↗</a>
            ))}
            <button type="button" onClick={printFolder} className={`${pill} bg-black/5 hover:bg-black/10`}><Printer className="w-4 h-4 inline mr-1" /> Carpeta del mes (PDF)</button>
          </div>
        </CardContent>
      </Card>


      <ProposalCard monthKey={monthKey} m={m} isDemo={isDemo} />

      {m.alerts.length > 0 && (
        <div className="space-y-2">
          {m.alerts.map((a, i) => (
            <div key={i} className={`rounded-xl px-4 py-2.5 text-sm flex items-start gap-2 ${ALERT_TONE[a.level]}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {a.text}
            </div>
          ))}
        </div>
      )}


      {m.webExcluded && m.webExcluded.iva > 0 && (
        <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 text-red-700">
          <strong>Este total NO incluye las ventas web</strong> ({m.webExcluded.orders} venta{m.webExcluded.orders === 1 ? '' : 's'}, {money(m.webExcluded.gross)}). Su IVA, <strong>{money(m.webExcluded.iva)}</strong>, queda fuera y se acumula en <em>Regularizar</em>. Puedes cambiarlo en Ajustes.
        </div>
      )}

      <Card className="admin-clay border-0">
        <CardHeader>
          <CardTitle>Ventas afectas del mes por canal</CardTitle>
          <p className="text-sm text-[var(--admin-muted)]">Según la regla general, las dos llevan IVA (se cobren por la web, por Mercado Pago o en la barra). Puedes elegir qué suma el total en Ajustes.</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {([['Ventas web', m.channels.web], ['Barra y caja (presencial)', m.channels.caja]] as const).map(([label, c]) => (
            <div key={label} className="admin-clay-sm p-3">
              <p className="text-xs text-[var(--admin-muted)]">{label} · {c.orders} venta{c.orders === 1 ? '' : 's'}</p>
              <p className="font-heading text-xl tabular-nums">{money(c.gross)} <span className="text-xs font-normal text-[var(--admin-muted)]">con IVA</span></p>
              <p className="text-xs text-[var(--admin-muted)]">Neto sin IVA <strong>{money(c.gross - c.iva)}</strong> · IVA <strong>{money(c.iva)}</strong></p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Casillas sugeridas del F29</CardTitle><p className="text-sm text-[var(--admin-muted)]">Compáralas con la propuesta del SII. Toca copiar para pegar el número.</p></CardHeader>
        <CardContent className="space-y-2">
          {m.f29.lines.map((l) => (
            <div key={l.code} className={`admin-clay-sm p-3 flex flex-wrap items-center gap-3 ${l.code === '91' ? 'ring-2 ring-pink-400' : ''}`}>
              <span className="rounded-lg bg-black/5 px-2 py-1 text-xs font-mono">{l.code}</span>
              <div className="flex-1 min-w-[12rem]">
                <p className="font-medium text-sm">{l.label}</p>
                <p className="text-xs text-[var(--admin-muted)]">{l.hint}</p>
              </div>
              <strong className="tabular-nums">{money(l.value)}</strong>
              <button type="button" onClick={() => copy(l.value)} className="p-2 rounded-full hover:bg-black/5" aria-label={`Copiar casilla ${l.code}`}><Copy className="w-4 h-4" /></button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Paso a paso en sii.cl</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {SII_LINKS.map((k) => (
              <a key={k.href} href={k.href} target="_blank" rel="noopener noreferrer"
                className={`${pill} ${k.primary ? 'bg-pink-500 text-white' : 'bg-black/5 hover:bg-black/10'}`}>{k.l} ↗</a>
            ))}
          </div>
          <ol className="space-y-2 text-sm list-decimal pl-5">{STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
          <div className="mt-5 pt-4 border-t border-black/5 flex flex-wrap items-end gap-2">
            <div><p className="text-xs text-[var(--admin-muted)] mb-1">Folio</p><Input className="w-40" placeholder={m.period.folio ?? 'N° de folio'} value={folio} onChange={(e) => setFolio(e.target.value)} /></div>
            <div><p className="text-xs text-[var(--admin-muted)] mb-1">Monto pagado</p><Input className="w-36" type="number" inputMode="numeric" placeholder={String(m.period.amountPaid ?? m.f29.total)} value={paid} onChange={(e) => setPaid(e.target.value)} /></div>
            <button type="button" disabled={isDemo || mark.isPending} className={`${pill} bg-amber-500 text-white`}
              onClick={() => mark.mutate({ monthKey, status: 'declarado', folio: folio || m.period.folio || null })}>Declarado</button>
            <button type="button" disabled={isDemo || mark.isPending} className={`${pill} bg-emerald-500 text-white`}
              onClick={() => mark.mutate({ monthKey, status: 'pagado', folio: folio || m.period.folio || null, amountPaid: paid ? Math.round(Number(paid)) : (m.period.amountPaid ?? m.f29.total) })}>Pagado</button>
            {m.period.status !== 'pendiente' && (
              <button type="button" disabled={isDemo || mark.isPending} className={`${pill} bg-black/5`}
                onClick={() => { if (window.confirm('¿Volver este mes a pendiente?')) mark.mutate({ monthKey, status: 'pendiente' }); }}>Volver a pendiente</button>
            )}
          </div>
          <p className="text-xs text-[var(--admin-muted)] mt-2">Al marcarlo se guarda el remanente de crédito (casilla 77) para el mes siguiente.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="admin-clay border-0">
          <CardHeader><CardTitle>Ventas del mes por evento</CardTitle><p className="text-sm text-[var(--admin-muted)]">Por fecha de cada venta (no del evento). Sin lo pagado con saldo PlayCard.</p></CardHeader>
          <CardContent className="space-y-2">
            {m.salesByEvent.length === 0 && <p className="text-sm text-[var(--admin-muted)]">Sin ventas este mes.</p>}
            {m.salesByEvent.map((e) => (
              <div key={e.eventId} className="admin-clay-sm p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div><p className="font-medium">{e.title}</p><p className="text-xs text-[var(--admin-muted)]">{e.orders} ventas{e.note ? ` · ${e.note}` : ''}</p></div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${e.issuer === 'mansion' ? 'bg-emerald-500/15 text-emerald-800' : e.issuer === 'por_revisar' ? 'bg-red-500/15 text-red-700' : 'bg-black/5'}`}>{ISSUER[e.issuer] ?? e.issuer}</span>
                <strong className="tabular-nums">{money(e.amount)}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="admin-clay border-0">
          <CardHeader><CardTitle>Facturas de compra (crédito fiscal)</CardTitle><p className="text-sm text-[var(--admin-muted)]">Se cargan en Gastos y P&amp;L con tipo "Factura".</p></CardHeader>
          <CardContent className="space-y-2">
            {m.facturas.length === 0 && <p className="text-sm text-[var(--admin-muted)]">Sin facturas este mes.</p>}
            {m.facturas.map((f) => (
              <div key={f.id} className="admin-clay-sm p-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div><p className="font-medium">{f.supplier || f.description || 'Factura'}</p><p className="text-xs text-[var(--admin-muted)]">{formatChileShortDate(f.date as any)} · {f.supplierRut ?? 'sin RUT'}{f.hasReceipt ? '' : ' · sin foto'}</p></div>
                <span className="tabular-nums">IVA <strong>{money(f.iva)}</strong></span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Compara nuestro total con el monto que muestra la propuesta del F29 en sii.cl. */
function ProposalCard({ monthKey, m, isDemo }: { monthKey: string; m: any; isDemo: boolean }) {
  const utils = trpc.useUtils();
  const [val, setVal] = useState('');
  const save = trpc.sii.saveProposal.useMutation({
    onSuccess: () => { utils.sii.month.invalidate(); setVal(''); toast.success('Propuesta guardada'); },
    onError: onErr,
  });
  const c = m.comparison;
  const tone = !c ? '' : c.level === 'ok' ? 'bg-emerald-500/10 text-emerald-800' : c.level === 'cerca' ? 'bg-sky-500/10 text-sky-800' : 'bg-red-500/10 text-red-700';
  return (
    <Card className="admin-clay border-0">
      <CardHeader>
        <CardTitle>Compara con la propuesta del SII</CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">Al entrar a Mi SII, el F29 muestra una propuesta con el total a pagar. Anótalo y el sistema te dice si calza con el cálculo de aquí.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <p className="text-xs text-[var(--admin-muted)] mb-1">Total a pagar según el SII</p>
            <Input className="w-44" type="number" inputMode="numeric" placeholder={m.siiProposal != null ? String(m.siiProposal) : 'Ej: 152000'} value={val} onChange={(e) => setVal(e.target.value)} />
          </div>
          <button type="button" disabled={isDemo || save.isPending || val === ''} className={`${pill} bg-pink-500 text-white`}
            onClick={() => save.mutate({ monthKey, amount: Math.max(0, Math.round(Number(val) || 0)) })}>Comparar</button>
          {m.siiProposal != null && (
            <button type="button" disabled={isDemo || save.isPending} className={`${pill} bg-black/5`} onClick={() => save.mutate({ monthKey, amount: null })}>Borrar</button>
          )}
        </div>
        {c && (
          <div className={`rounded-xl px-4 py-3 text-sm ${tone}`}>
            <p className="font-semibold">SII {money(c.proposal)} · nuestro cálculo {money(c.estimate)}{c.diff !== 0 ? ` · diferencia ${money(c.diff)}` : ''}</p>
            <p>{c.message}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Precisión del cálculo frente a lo realmente pagado y sugerencia de PPM. */
function LearningCard() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data } = trpc.sii.learning.useQuery();
  const apply = trpc.sii.saveConfig.useMutation({ onSuccess: () => { utils.sii.invalidate(); toast.success('PPM actualizado'); }, onError: onErr });
  if (!data || data.history.length === 0) {
    return (
      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Precisión del cálculo</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-[var(--admin-muted)]">Cuando marques un mes como <strong>Pagado</strong> con el monto real, aquí verás cuánto nos desviamos y si tu PPM real es distinto al configurado.</p></CardContent>
      </Card>
    );
  }
  return (
    <Card className="admin-clay border-0">
      <CardHeader>
        <CardTitle>Precisión del cálculo</CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">{data.avgAbsErrorPercent !== null ? `Desviación promedio: ${data.avgAbsErrorPercent}% sobre lo realmente pagado.` : ''}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.message && (
          <div className="rounded-xl px-4 py-3 text-sm bg-amber-500/15 text-amber-800 flex flex-wrap items-center justify-between gap-2">
            <span>{data.message}</span>
            {data.suggestedPpmPercent !== null && (
              <button type="button" disabled={isDemo || apply.isPending} className={`${pill} bg-pink-500 text-white`}
                onClick={() => apply.mutate({ ppmRatePercent: data.suggestedPpmPercent })}>Usar {data.suggestedPpmPercent}% como mi PPM</button>
            )}
          </div>
        )}
        {data.history.map((h) => (
          <div key={h.monthKey} className="admin-clay-sm p-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium w-36">{monthLabel(h.monthKey)}</span>
            <span>Calculado <strong>{money(h.estimate)}</strong></span>
            <span>Pagado <strong>{money(h.paid)}</strong></span>
            <span className={h.diff === 0 ? 'text-emerald-700' : 'text-[var(--admin-muted)]'}>{h.diff === 0 ? 'Exacto ✓' : `Diferencia ${money(h.diff)}`}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function HonorariosTab({ monthKey }: { monthKey: string }) {
  const { data: m } = trpc.sii.month.useQuery({ monthKey });
  const [year, setYear] = useState(Number(monthKey.slice(0, 4)));
  const { data: yearRows } = trpc.sii.honorariosYear.useQuery({ year });
  return (
    <div className="space-y-6">
      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Boletas de honorarios de {monthLabel(monthKey)}</CardTitle><p className="text-sm text-[var(--admin-muted)]">Del staff marcado con boleta de honorarios. La retención va en la casilla 151 del F29.</p></CardHeader>
        <CardContent className="space-y-2">
          {(m?.honorarios ?? []).length === 0 && <p className="text-sm text-[var(--admin-muted)]">Sin boletas este mes.</p>}
          {(m?.honorarios ?? []).map((h) => (
            <div key={h.shiftId} className="admin-clay-sm p-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex-1 min-w-[10rem]"><p className="font-medium">{h.name}</p><p className="text-xs text-[var(--admin-muted)]">{h.rut ?? 'sin RUT'} · {h.eventTitle}</p></div>
              <span>Boleta <strong>{money(h.gross)}</strong></span>
              <span>Retención {h.ratePercent}% <strong>{money(h.retention)}</strong></span>
              <span>Recibe <strong>{money(h.net)}</strong></span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="admin-clay border-0">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">Resumen anual para la DJ 1879
            <span className="inline-flex gap-1">
              <button type="button" className={`${pill} bg-black/5`} onClick={() => setYear(year - 1)}>←</button>
              <span className="px-2 py-1.5 text-sm">{year}</span>
              <button type="button" className={`${pill} bg-black/5`} onClick={() => setYear(year + 1)}>→</button>
            </span>
          </CardTitle>
          <p className="text-sm text-[var(--admin-muted)]">Se presenta en marzo del año siguiente con lo retenido a cada persona.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {(yearRows ?? []).length === 0 && <p className="text-sm text-[var(--admin-muted)]">Sin boletas en {year}.</p>}
          {(yearRows ?? []).map((r) => (
            <div key={(r.rut ?? '') + r.name} className="admin-clay-sm p-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="flex-1 min-w-[10rem]"><p className="font-medium">{r.name}</p><p className="text-xs text-[var(--admin-muted)]">{r.rut ?? 'sin RUT (falta para la DJ)'} · {r.boletas} boleta{r.boletas === 1 ? '' : 's'}</p></div>
              <span>Bruto <strong>{money(r.gross)}</strong></span>
              <span>Retenido <strong>{money(r.retention)}</strong></span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

const REG_OPTIONS: RegStatus[] = ['pendiente', 'rectificado', 'en_convenio', 'regularizado'];

/** Meses con ventas web que no se declararon a tiempo: seguimiento hasta dejarlos al día. */
function RegularizeTab() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.sii.regularization.useQuery();
  const save = trpc.sii.saveRegularization.useMutation({ onSuccess: () => { utils.sii.regularization.invalidate(); toast.success('Guardado'); }, onError: onErr });
  const [edit, setEdit] = useState<Record<string, { folio: string; installments: string; note: string }>>({});
  if (isLoading || !data) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  const { backlog, months } = data;
  const form = (m: any) => edit[m.monthKey] ?? { folio: m.folio ?? '', installments: m.installments ? String(m.installments) : '', note: m.note ?? '' };
  const patch = (m: any, p: Partial<{ folio: string; installments: string; note: string }>) => setEdit({ ...edit, [m.monthKey]: { ...form(m), ...p } });
  return (
    <div className="space-y-6">
      <Card className="admin-clay border-0">
        <CardContent className="pt-6 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-red-500/10 p-4"><p className="text-xs text-[var(--admin-muted)]">IVA de ventas web por regularizar</p><p className="font-heading text-3xl tabular-nums text-red-700">{money(backlog.pendingIva)}</p><p className="text-[11px] text-[var(--admin-muted)]">Meses cuyo F29 ya venció y no está regularizado</p></div>
            <div className="rounded-2xl bg-amber-500/15 p-4"><p className="text-xs text-[var(--admin-muted)]">En proceso (rectificado o en convenio)</p><p className="font-heading text-3xl tabular-nums text-amber-800">{money(backlog.inProgressIva)}</p></div>
            <a href="/api/admin/sii/informe-contador.csv" className="rounded-2xl bg-pink-500 text-white p-4 flex flex-col justify-center hover:bg-pink-600 transition">
              <span className="font-semibold">Informe para mi contador (CSV)</span><span className="text-xs opacity-90">Ventas por mes y canal, comisiones de Mercado Pago, facturas de compra</span>
            </a>
          </div>
          <div className="text-sm space-y-1 text-[var(--admin-muted)]">
            <p>Por defecto el F29 sugerido incluye las ventas web de los eventos que factura Mansion Playroom. Si prefieres otro modo, lo cambias en Ajustes: el IVA que quede fuera se sigue mostrando acá.</p>
            <p>Los meses de abajo ya vencieron sin esas ventas. Tu contador puede <strong className="text-foreground">rectificar el F29</strong> de cada uno. Si no alcanzas a pagar de una vez, se puede pedir un <strong className="text-foreground">convenio de pago en cuotas con Tesorería</strong>: es mucho mejor que dejar la deuda sin declarar, porque las multas e intereses crecen cada mes. Confírmalo con tu contador.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="admin-clay border-0">
        <CardHeader><CardTitle>Meses con ventas web</CardTitle><p className="text-sm text-[var(--admin-muted)]">Marca el avance de cada mes. El mes que aún no vence se declara normal, con las ventas web incluidas.</p></CardHeader>
        <CardContent className="space-y-3">
          {months.length === 0 && <p className="text-sm text-[var(--admin-muted)]">Todavía no hay ventas web de eventos que factura Mansion Playroom.</p>}
          {months.map((m: any) => {
            const overdue = m.dueDate < data.today;
            const f = form(m);
            return (
              <div key={m.monthKey} className="admin-clay-sm p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium w-36">{monthLabel(m.monthKey)}</span>
                  <span>Ventas web (con IVA) <strong>{money(m.webGross)}</strong></span>
                  <span>Neto sin IVA <strong>{money(m.webGross - m.webIva)}</strong></span>
                  <span>IVA <strong>{money(m.webIva)}</strong></span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${overdue ? 'bg-red-500/15 text-red-700' : 'bg-sky-500/15 text-sky-800'}`}>{overdue ? `F29 venció el ${ddmmyyyy(m.dueDate)}` : `F29 vence el ${ddmmyyyy(m.dueDate)}: declarar con las ventas web`}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {REG_OPTIONS.map((st) => (
                    <button key={st} type="button" disabled={isDemo || save.isPending}
                      className={`${pill} text-xs ${m.status === st ? (st === 'regularizado' ? 'bg-emerald-500 text-white' : 'bg-pink-500 text-white') : 'bg-black/5'}`}
                      onClick={() => save.mutate({ monthKey: m.monthKey, status: st, folio: f.folio || null, installments: f.installments ? Number(f.installments) : null, note: f.note || null })}>
                      {REG_STATUS_LABEL[st]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="w-36" placeholder="Folio rectificatoria" value={f.folio} onChange={(e) => patch(m, { folio: e.target.value })} />
                  <Input className="w-28" type="number" inputMode="numeric" placeholder="N° cuotas" value={f.installments} onChange={(e) => patch(m, { installments: e.target.value })} />
                  <Input className="flex-1 min-w-[10rem]" placeholder="Nota (contador, convenio...)" value={f.note} onChange={(e) => patch(m, { note: e.target.value })} />
                  <button type="button" disabled={isDemo || save.isPending} className={`${pill} bg-black/5 text-xs`}
                    onClick={() => save.mutate({ monthKey: m.monthKey, status: m.status, folio: f.folio || null, installments: f.installments ? Number(f.installments) : null, note: f.note || null })}>Guardar datos</button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function CalendarTab() {
  const [year, setYear] = useState(Number(chileMonthNow().slice(0, 4)));
  const { data } = trpc.sii.calendar.useQuery({ year });
  return (
    <Card className="admin-clay border-0">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">Calendario tributario
          <span className="inline-flex gap-1">
            <button type="button" className={`${pill} bg-black/5`} onClick={() => setYear(year - 1)}>←</button>
            <span className="px-2 py-1.5 text-sm">{year}</span>
            <button type="button" className={`${pill} bg-black/5`} onClick={() => setYear(year + 1)}>→</button>
          </span>
        </CardTitle>
        <p className="text-sm text-[var(--admin-muted)]">Las fechas anuales se ajustan en Ajustes. Te avisamos por push y correo antes de cada una.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {(data ?? []).map((o) => {
          const late = o.daysLeft < 0 && o.status !== 'pagado' && o.kind === 'f29';
          return (
            <div key={o.key} className="admin-clay-sm p-3 flex flex-wrap items-center gap-3 text-sm">
              <CalendarClock className="w-4 h-4 text-[var(--admin-muted)]" />
              <div className="flex-1 min-w-[10rem]"><p className="font-medium">{o.title}</p><p className="text-xs text-[var(--admin-muted)]">Vence el {ddmmyyyy(o.dueDate)}{o.daysLeft >= 0 ? ` · en ${o.daysLeft} día${o.daysLeft === 1 ? '' : 's'}` : ''}</p></div>
              {o.status ? (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${late ? 'bg-red-500 text-white' : (STATUS[o.status] ?? STATUS.pendiente).c}`}>{late ? 'Vencido' : (STATUS[o.status] ?? STATUS.pendiente).l}</span>
              ) : <span className="rounded-full px-3 py-1 text-xs bg-black/5">Anual</span>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function SettingsTab() {
  const isDemo = useIsDemo();
  const utils = trpc.useUtils();
  const { data: cfg } = trpc.sii.config.useQuery();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = trpc.sii.saveConfig.useMutation({ onSuccess: () => { utils.sii.invalidate(); setDraft({}); toast.success('Ajustes guardados'); }, onError: onErr });
  const run = trpc.sii.runRemindersNow.useMutation({ onSuccess: (r: any) => toast.success(r.sent?.length ? `Avisos enviados: ${r.sent.length}` : (r.reason ?? 'Hoy no corresponde ningún aviso')), onError: onErr });
  if (!cfg) return <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  const v = (k: string, d: unknown) => draft[k] ?? (d === null || d === undefined ? '' : String(d));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [k]: e.target.value });
  const submit = () => save.mutate({
    f29DueDay: Number(v('f29DueDay', cfg.f29DueDay)) || 12,
    ppmRatePercent: v('ppmRatePercent', cfg.ppmRatePercent) === '' ? null : Number(String(v('ppmRatePercent', cfg.ppmRatePercent)).replace(',', '.')),
    companyRut: v('companyRut', cfg.companyRut) || null,
    regime: v('regime', cfg.regime) || null,
    dj1879Date: v('dj1879Date', cfg.dj1879Date), rentaDate: v('rentaDate', cfg.rentaDate),
    patenteDates: v('patenteDates', cfg.patenteDates.join(', ')).split(',').map((x) => x.trim()).filter(Boolean),
  });
  const field = (k: string, label: string, hint: string, d: unknown, ph = '') => (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <Input value={v(k, d)} onChange={set(k)} placeholder={ph} disabled={isDemo} />
      <span className="text-xs text-[var(--admin-muted)]">{hint}</span>
    </label>
  );
  return (
    <Card className="admin-clay border-0">
      <CardHeader><CardTitle>Ajustes SII</CardTitle><p className="text-sm text-[var(--admin-muted)]">Confírmalos una vez con un contador o mirando tu último F29.</p></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {field('f29DueDay', 'Día de vencimiento del F29', '12 por defecto; 20 si eres facturador electrónico y declaras por internet.', cfg.f29DueDay)}
          {field('ppmRatePercent', 'Tasa de PPM (%)', 'Depende de tu régimen (aparece en tu F29 anterior, casilla 115). Vacío = no se calcula.', cfg.ppmRatePercent, 'ej: 0,25')}
          {field('regime', 'Régimen tributario', 'Ej: Pro Pyme General (14 D N°3).', cfg.regime, 'No sé')}
          {field('companyRut', 'RUT de la empresa', 'Para la carpeta del mes.', cfg.companyRut, '76.xxx.xxx-x')}
          {field('dj1879Date', 'DJ 1879 (MM-DD)', 'Declaración de honorarios retenidos (marzo).', cfg.dj1879Date)}
          {field('rentaDate', 'Renta F22 (MM-DD)', 'Declaración anual de renta (abril).', cfg.rentaDate)}
          {field('patenteDates', 'Patente municipal (MM-DD, separadas por coma)', 'Cuotas de la patente de tu municipalidad.', cfg.patenteDates.join(', '))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Entradas:</span>
          {[{ v: false, l: 'Afectas a IVA' }, { v: true, l: 'Exentas (confirmado por contador)' }].map((o) => (
            <button key={String(o.v)} type="button" disabled={isDemo} onClick={() => save.mutate({ ticketsExempt: o.v })}
              className={`${pill} ${cfg.ticketsExempt === o.v ? 'bg-pink-500 text-white' : 'bg-black/5'}`}>{o.l}</button>
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-border/60 p-3">
          <p className="text-sm font-medium">Ventas web en el F29 sugerido</p>
          <div className="flex flex-wrap gap-2">
            {[{ v: true, l: 'Incluirlas (regla general)' }, { v: false, l: 'No incluirlas (como declaro hoy)' }].map((o) => (
              <button key={String(o.v)} type="button" disabled={isDemo || save.isPending}
                onClick={() => { if (o.v || window.confirm('Con esta opción el F29 sugerido deja fuera las ventas web. El IVA de esas ventas igual existe: quedará marcado en rojo como no incluido y suma a lo por regularizar. ¿Continuar?')) save.mutate({ webSalesInF29: o.v }); }}
                className={`${pill} ${cfg.webSalesInF29 === o.v ? 'bg-pink-500 text-white' : 'bg-black/5'}`}>{o.l}</button>
            ))}
          </div>
          <p className="text-xs text-[var(--admin-muted)]">Este sistema es tu contabilidad personal: no declara nada en el SII. Esta opción solo cambia qué ventas suma el total sugerido. El IVA de las ventas web que quede fuera siempre se muestra aparte, para que lo regularices con tu contador.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Avisos de vencimiento (push + correo):</span>
          <button type="button" disabled={isDemo} onClick={() => save.mutate({ remindersEnabled: !cfg.remindersEnabled })}
            className={`${pill} ${cfg.remindersEnabled ? 'bg-emerald-500 text-white' : 'bg-black/5'}`}>{cfg.remindersEnabled ? 'Prendidos ✓' : 'Apagados'}</button>
          <button type="button" disabled={isDemo || run.isPending} onClick={() => run.mutate()} className={`${pill} bg-black/5`}>Revisar avisos ahora</button>
        </div>
        <button type="button" disabled={isDemo || save.isPending || Object.keys(draft).length === 0} onClick={submit} className={`${pill} bg-pink-500 text-white px-6 py-2`}>Guardar ajustes</button>
      </CardContent>
    </Card>
  );
}

function AskSii({ monthKey }: { monthKey: string }) {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const ask = trpc.sii.ask.useMutation({ onSuccess: (r, v) => setAnswer({ q: v.question, a: r.answer }), onError: onErr });
  const go = (t: string) => { if (t.trim().length >= 3) ask.mutate({ question: t.trim(), monthKey }); };
  const sugg = ['¿Cuánto tengo que pagar este mes y por qué?', '¿Qué pongo en cada casilla?', '¿Cómo lo declaro paso a paso en sii.cl?', '¿Qué me falta revisar antes de declarar?'];
  return (
    <Card className="admin-clay border-0">
      <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5" /> Asistente SII</CardTitle><p className="text-sm text-[var(--admin-muted)]">Responde con los números del mes elegido. Para temas legales o de régimen, confírmalo con un contador.</p></CardHeader>
      <CardContent className="space-y-3">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); go(q); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ej: ¿por qué subió el IVA este mes?" maxLength={500} />
          <button type="submit" disabled={ask.isPending || q.trim().length < 3} className={`${pill} bg-pink-500 text-white`}>{ask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Preguntar'}</button>
        </form>
        <div className="flex flex-wrap gap-2">{sugg.map((s) => <button key={s} type="button" disabled={ask.isPending} onClick={() => { setQ(s); go(s); }} className={`${pill} bg-black/5 text-xs`}>{s}</button>)}</div>
        {answer && <div className="admin-clay-sm p-4 space-y-1"><p className="text-xs text-[var(--admin-muted)]">{answer.q}</p><p className="text-sm whitespace-pre-wrap">{answer.a}</p></div>}
      </CardContent>
    </Card>
  );
}

const TABS = [['f29', 'F29 del mes'], ['regularizar', 'Regularizar'], ['honorarios', 'Honorarios'], ['calendario', 'Calendario'], ['ajustes', 'Ajustes']] as const;

export default function SiiView() {
  const isDemo = useIsDemo();
  const months = useMemo(monthOptions, []);
  // Por defecto el mes que toca declarar: el anterior.
  const [monthKey, setMonthKey] = useState(months[1]);
  const [tab, setTab] = useState<typeof TABS[number][0]>('f29');
  const { data: toReview } = trpc.sii.eventsToReview.useQuery(undefined, { enabled: !isDemo });
  if (isDemo) return <EmptyState icon={Landmark} title="SII es solo para el administrador" />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl flex items-center gap-2"><Landmark className="w-6 h-6" /> SII</h2>
          <p className="text-sm text-[var(--admin-muted)]">IVA mensual (F29), honorarios y vencimientos, con avisos para que no se pase ninguna fecha.</p>
        </div>
        {(tab === 'f29' || tab === 'honorarios') && (
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      {(toReview ?? []).length > 0 && (
        <div className="rounded-xl px-4 py-3 text-sm bg-red-500/10 text-red-700 flex items-start gap-2">
          <FileText className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{toReview!.length} evento(s) sin definir quién los factura: {toReview!.map((e) => e.title).join(', ')}. Edítalos en Eventos → "¿Quién factura este evento?".</span>
        </div>
      )}

      <AskSii monthKey={monthKey} />

      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)}
            className={`${pill} ${tab === k ? 'bg-pink-500 text-white' : 'bg-black/5'}`}>{l}</button>
        ))}
      </div>

      {tab === 'f29' && <F29Tab monthKey={monthKey} />}
      {tab === 'f29' && <LearningCard />}
      {tab === 'regularizar' && <RegularizeTab />}
      {tab === 'honorarios' && <HonorariosTab monthKey={monthKey} />}
      {tab === 'calendario' && <CalendarTab />}
      {tab === 'ajustes' && <SettingsTab />}
    </div>
  );
}
