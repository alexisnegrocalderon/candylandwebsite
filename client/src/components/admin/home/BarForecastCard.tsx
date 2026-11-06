import { ArrowRight, CheckCircle2, Wine } from 'lucide-react';
import { trpc } from '@/lib/trpc';

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** Barra del próximo evento: para la gente con entrada, qué falta comprar (según las fiestas anteriores y el stock). */
export function BarForecastCard({ eventId, onOpen }: { eventId: number; onOpen: (section: string) => void }) {
  const { data, isLoading, isError } = trpc.pilot.bar.useQuery({ eventId }, { staleTime: 5 * 60_000, retry: false });
  if (isError || (!isLoading && !data)) return null;
  return (
    <section aria-label="Barra" className="admin-clay p-4 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-white"><Wine className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-lg leading-tight">{data?.sinStockPlayroom ? 'Compra nueva para la fiesta' : 'Barra para la fiesta'}</h3>
          <p className="text-sm text-muted-foreground">
            {isLoading ? 'Calculando…' : data!.conEntrada ? `${data!.conEntrada} personas con entrada` : `Sin entradas todavía: calculado para ${data!.personas}`}
            {data?.sinStockPlayroom ? ' · sin usar el stock de Playroom' : ''}
          </p>
        </div>
      </div>
      {data && (data.totalFaltan === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-emerald-300" /> Alcanza con lo que hay en stock.</p>
      ) : (
        <>
          <p className="mt-3 text-base">{data.sinStockPlayroom ? 'Hay que comprar' : 'Faltan'} <strong>{data.totalFaltan} insumo{data.totalFaltan === 1 ? '' : 's'}</strong>{data.missingCost > 0 ? ` · ${clp(data.missingCost)}` : ''}</p>
          <ul className="mt-2 space-y-1.5">
            {data.faltan.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">{f.name}</span>
                <span className="shrink-0 font-semibold">comprar {f.comprar}</span>
              </li>
            ))}
          </ul>
        </>
      ))}
      <button type="button" onClick={() => onOpen(data?.sinStockPlayroom ? 'compra-fiesta' : 'insumos')} className="admin-tab mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold">
        {data?.sinStockPlayroom ? 'Ver la lista de compras de la fiesta' : 'Ver la lista de compras completa'} <ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}
