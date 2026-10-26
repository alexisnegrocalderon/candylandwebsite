import { trpc } from '@/lib/trpc';
import { useMemo } from 'react';
import { DESCUADRE_PCT, MOVIMIENTO_LABEL, formatCantidad, mermaDeConteos, type MovimientoKind } from '@shared/insumos';
import { formatChileDateTime } from '@shared/chileDate';
import type { BarraData } from './types';

/** Conteos de la barra con sus descuadres, y el libro de movimientos. */
export function HistorialTab({ eventId, data }: { eventId: number; data: BarraData }) {
  const conteos = trpc.insumos.conteos.useQuery({ eventId });
  const movimientos = trpc.insumos.movimientos.useQuery({ eventId, limit: 300 });
  const byId = new Map(data.insumos.map((i) => [i.id, i]));
  const merma = useMemo(() => mermaDeConteos(conteos.data ?? [], data.insumos), [conteos.data, data.insumos]);
  const money = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

  return (
    <div className="space-y-6">
      {merma.porConteo.some((c) => c.faltantes.length > 0) && (
        <section className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h3 className="flex-1 font-semibold">Merma por turno y por persona</h3>
            {merma.costoTotal > 0 && <span className="text-sm text-red-500 tabular-nums">{money(merma.costoTotal)} en faltantes</span>}
          </div>
          <p className="text-xs text-muted-foreground">Lo que faltó en cada conteo frente a lo que las ventas decían que debía quedar. El costo sale del precio de compra de cada insumo (si lo cargaste).</p>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card/60">
            {merma.porPersona.map((p) => (
              <li key={p.operatorName} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{p.operatorName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{p.conteos} {p.conteos === 1 ? 'conteo' : 'conteos'} · {p.faltantes} {p.faltantes === 1 ? 'faltante' : 'faltantes'}</span>
                <span className="w-24 shrink-0 text-right tabular-nums text-red-500">{p.costo > 0 ? money(p.costo) : '—'}</span>
              </li>
            ))}
          </ul>
          <ul className="space-y-1.5">
            {merma.porConteo.filter((c) => c.faltantes.length > 0).map((c) => (
              <li key={c.id} className="rounded-xl border border-border bg-card/40 px-3 py-2 text-sm">
                <p className="font-medium">
                  {c.kind === 'apertura' ? 'Apertura' : 'Cierre'} · {c.operatorName} <span className="font-normal text-muted-foreground">· {formatChileDateTime(c.createdAt)}</span>
                  {c.costo > 0 && <span className="float-right tabular-nums text-red-500">{money(c.costo)}</span>}
                </p>
                <p className="text-xs text-muted-foreground">{c.faltantes.map((f) => `${f.name}: faltan ${f.texto}`).join(' · ')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="font-semibold">Conteos de la barra</h3>
        {conteos.data?.length === 0 && <p className="text-sm text-muted-foreground">Nadie ha contado la barra en este evento todavía.</p>}
        {(conteos.data ?? []).map((c) => {
          const off = c.lines.filter((l) => l.diff !== 0);
          const bad = off.filter((l) => l.diff < 0 && Math.abs(l.pct) > DESCUADRE_PCT);
          return (
            <details key={c.id} className={`rounded-2xl border p-3 ${bad.length ? 'border-red-500/40 bg-red-500/5' : 'border-border bg-card/60'}`}>
              <summary className="cursor-pointer">
                <span className="font-semibold">{c.kind === 'apertura' ? 'Apertura' : 'Cierre'}</span>
                <span className="text-sm text-muted-foreground"> · {c.operatorName ?? '—'} · {formatChileDateTime(c.createdAt)}</span>
                <span className="ml-2 text-xs">{bad.length ? `⚠️ ${bad.length} con faltante` : off.length ? `${off.length} con diferencia` : '✓ cuadra'}</span>
              </summary>
              <ul className="mt-2 space-y-1 text-sm">
                {c.lines.map((l) => {
                  const ins = byId.get(l.insumoId);
                  if (!ins) return null;
                  return (
                    <li key={l.insumoId} className="flex justify-between gap-2 tabular-nums">
                      <span className="truncate">{ins.name}</span>
                      <span>
                        {formatCantidad(l.counted, ins)}
                        {l.diff !== 0 && (
                          <span className={l.diff < 0 ? ' text-red-500' : ' text-emerald-500'}>
                            {' '}({l.diff < 0 ? 'faltan' : 'sobran'} {formatCantidad(Math.abs(l.diff), ins)}, {Math.abs(Math.round(l.pct))} %)
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Movimientos de este evento</h3>
        {movimientos.data?.length === 0 && <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>}
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card/60">
          {(movimientos.data ?? []).map((m) => {
            const ins = byId.get(m.insumoId);
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{m.insumoName ?? '¿?'}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {MOVIMIENTO_LABEL[m.kind as MovimientoKind] ?? m.kind} · {formatChileDateTime(m.createdAt)}{m.note ? ` · ${m.note}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 tabular-nums ${m.delta < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {m.delta > 0 ? '+' : '−'}{ins ? formatCantidad(Math.abs(m.delta), ins) : Math.abs(m.delta)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
