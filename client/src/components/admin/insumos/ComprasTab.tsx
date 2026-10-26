import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Download } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCantidad, listaComprasTexto } from '@shared/insumos';
import { money, type BarraData } from './types';

const DEFAULT_PERSONAS = 300;

/** Lista de compras: consumo de las últimas fiestas escalado a N personas. */
export function ComprasTab({ eventId, data }: { eventId: number; data: BarraData }) {
  const [personas, setPersonas] = useState(DEFAULT_PERSONAS);
  const [factor, setFactor] = useState(1.1);
  const [manualRate, setManualRate] = useState('');
  // Cantidad de tragos fijada a mano por producto (el resto se reparte solo).
  const [manual, setManual] = useState<Record<number, string>>({});
  // Se espera a que la persona termine de teclear antes de recalcular.
  const [query, setQuery] = useState({ personas, factor, rate: manualRate, manual });
  useEffect(() => {
    const id = window.setTimeout(() => setQuery({ personas, factor, rate: manualRate, manual }), 400);
    return () => window.clearTimeout(id);
  }, [personas, factor, manualRate, manual]);

  const overrides = Object.fromEntries(Object.entries(query.manual).filter(([, v]) => v.trim() !== '' && Number(v) >= 0).map(([k, v]) => [k, Number(v)]));
  const proyeccion = trpc.insumos.proyeccion.useQuery({
    eventId, personas: Math.max(1, query.personas || 1), factor: query.factor > 0 ? query.factor : 1,
    tragosPorPersona: query.rate.trim() === '' ? null : Number(query.rate),
    overrides: Object.keys(overrides).length ? overrides : undefined,
  }, { placeholderData: (prev) => prev });
  const p = proyeccion.data;
  const insumoById = new Map(data.insumos.map((i) => [i.id, i]));

  const copyText = async () => {
    if (!p) return;
    try { await navigator.clipboard.writeText(listaComprasTexto(p, data.insumos, personas)); toast.success('Lista copiada: pégala en WhatsApp'); }
    catch { toast.error('No se pudo copiar'); }
  };
  const downloadCsv = () => {
    if (!p) return;
    const rows = [['Insumo', 'Necesario', 'Hay', 'Falta', 'Envases a comprar', 'Costo estimado']];
    for (const r of p.insumos) {
      const ins = insumoById.get(r.insumoId);
      rows.push([r.name, String(r.need), String(r.stock), String(r.missing), `${r.containersToBuy} ${ins?.containerLabel ?? ''}`.trim(), r.cost != null ? String(r.cost) : '']);
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `lista-compras-${personas}-personas.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const toBuy = p?.insumos.filter((i) => i.containersToBuy > 0) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="pr-personas">Personas</Label>
          <Input id="pr-personas" type="number" inputMode="numeric" min={1} value={personas || ''} onChange={(e) => setPersonas(Number(e.target.value))} />
        </div>
        <div>
          <Label htmlFor="pr-factor">Margen extra</Label>
          <div className="relative">
            <Input id="pr-factor" type="number" inputMode="numeric" min={0} max={200} value={Math.round((factor - 1) * 100)} onChange={(e) => setFactor(1 + (Number(e.target.value) || 0) / 100)} className="pr-7" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
        </div>
        <div>
          <Label htmlFor="pr-rate">Tragos/persona</Label>
          <Input id="pr-rate" type="number" inputMode="decimal" min={0} step={0.1} value={manualRate} onChange={(e) => setManualRate(e.target.value)} placeholder={p ? String(p.tragosPorPersona) : 'auto'} />
        </div>
      </div>
      {p && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Con entrada hoy: <strong className="text-foreground">{p.personasConEntrada}</strong> personas</span>
          {p.personasConEntrada > 0 && p.personasConEntrada !== personas && (
            <button type="button" className="underline" onClick={() => setPersonas(p.personasConEntrada)}>usar ese número</button>
          )}
          {personas !== DEFAULT_PERSONAS && <button type="button" className="underline" onClick={() => setPersonas(DEFAULT_PERSONAS)}>volver a {DEFAULT_PERSONAS}</button>}
        </div>
      )}

      {!p && <p className="text-sm text-muted-foreground">Calculando…</p>}
      {p && (
        <>
          <div className="rounded-2xl border border-border bg-card/60 p-3 text-sm">
            <p>
              <strong>{p.totalTragos.toLocaleString('es-CL')} tragos</strong> esperados ({p.tragosPorPersona} por persona{manualRate.trim() === '' ? ', según las últimas fiestas' : ', a mano'}
              {factor !== 1 ? `, +${Math.round((factor - 1) * 100)} % de margen` : ''}).
            </p>
            {p.fuentes.length > 0
              ? <p className="mt-1 text-xs text-muted-foreground">Basado en: {p.fuentes.map((f) => `${f.title} (${f.personas} personas, ${f.tragos} tragos)`).join(' · ')}</p>
              : <p className="mt-1 text-xs text-amber-500">No hay ventas de barra de fiestas anteriores: pon los tragos por persona a mano (el reparto entre tragos queda parejo).</p>}
            {p.sinReceta.length > 0 && <p className="mt-1 text-xs text-amber-500">Sin receta (no entran en la lista): {p.sinReceta.join(', ')}</p>}
          </div>

          <div className="flex items-center gap-2">
            <h3 className="flex-1 font-semibold">Comprar {toBuy.length > 0 ? `(${toBuy.length})` : ''}</h3>
            <Button variant="outline" size="sm" onClick={copyText}><Copy className="mr-1 h-4 w-4" /> WhatsApp</Button>
            <Button variant="outline" size="sm" onClick={downloadCsv}><Download className="mr-1 h-4 w-4" /> CSV</Button>
          </div>

          <ul className="space-y-2">
            {p.insumos.map((r) => {
              const ins = insumoById.get(r.insumoId);
              if (!ins) return null;
              const ok = r.containersToBuy === 0;
              return (
                <li key={r.insumoId} className={`rounded-2xl border p-3 ${ok ? 'border-border bg-card/40' : 'border-amber-500/40 bg-amber-500/5'}`}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{r.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Se necesita {formatCantidad(r.need, ins)} · hay {formatCantidad(r.stock, ins)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {ok
                        ? <span className="text-sm font-semibold text-emerald-500">Alcanza ✓</span>
                        : <span className="block text-lg font-bold tabular-nums">{r.containersToBuy} <span className="text-sm font-normal">{r.containersToBuy === 1 ? ins.containerLabel : `${ins.containerLabel}s`}</span></span>}
                      {!ok && r.cost != null && <span className="block text-xs text-muted-foreground">{money(r.cost)}</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {p.costoTotal > 0 && <p className="text-right text-sm">Costo estimado de la compra: <strong>{money(p.costoTotal)}</strong></p>}

          <section className="rounded-2xl border border-border bg-card/40 p-3">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-sm font-semibold">Tragos esperados por producto</h3>
              {Object.keys(manual).length > 0 && <button type="button" className="text-xs underline" onClick={() => setManual({})}>volver al reparto automático</button>}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Cambia la cantidad de cualquier trago y se recalcula todo (insumos, lo que falta y el costo). Los que no toques se reparten el resto.</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {p.productos.map((x) => (
                <li key={x.id} className="flex items-center gap-2 tabular-nums">
                  <span className="min-w-0 flex-1 truncate">{x.name}{!x.fromHistory && !x.manual && <span className="text-xs text-muted-foreground"> (sin historial)</span>}</span>
                  <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">{Math.round(x.share * 100)} %</span>
                  <Input
                    type="number" inputMode="numeric" min={0} aria-label={`Tragos esperados de ${x.name}`}
                    value={manual[x.id] ?? String(x.quantity)}
                    onChange={(e) => setManual((m) => ({ ...m, [x.id]: e.target.value }))}
                    onBlur={() => setManual((m) => {
                      if ((m[x.id] ?? 'x').trim() !== '') return m;
                      const { [x.id]: _removed, ...rest } = m; // vacío = vuelve al reparto automático
                      return rest;
                    })}
                    className={`h-9 w-24 shrink-0 text-right ${manual[x.id] !== undefined ? 'border-primary' : ''}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
