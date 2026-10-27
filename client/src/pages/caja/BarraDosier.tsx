import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import type { DosierFichas } from '@shared/dosierFicha';
import { DosierVista } from '@/components/dosier/DosierVista';
import { getLocalDosier } from './db';

/** El dosier de barra dentro de la app: las fichas de preparación se guardan en la tablet con el catálogo, así que
 * se abren aunque se caiga el WiFi. El PDF queda para imprimir o mandar. */
export function BarraDosier({ version, eventId, isOnline }: { version: number; eventId: number; isOnline: boolean }) {
  const [data, setData] = useState<DosierFichas | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    getLocalDosier().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [version]);

  const pdf = trpc.caja.dosierLink.useMutation();
  // La pestaña se abre antes de pedir el link: iOS bloquea las ventanas que se abren después de esperar la red.
  const verPdf = async () => {
    const w = window.open('about:blank', '_blank');
    try {
      const r = await pdf.mutateAsync({ eventId });
      const url = `${window.location.origin}${r.path}`;
      if (w) w.location.href = url; else window.location.href = url;
    } catch (e: any) {
      w?.close();
      toast.error(e?.message ?? 'No se pudo abrir el PDF');
    }
  };

  if (data === undefined) return <p className="text-sm text-white/50">Cargando dosier…</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">📘 Dosier de barra</h1>
          <p className="text-sm text-white/60">Toca un trago para ver su vaso, medidas y preparación. Funciona sin señal.</p>
        </div>
        <button type="button" onClick={verPdf} disabled={!isOnline || pdf.isPending} className="shrink-0 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold disabled:opacity-40">
          {pdf.isPending ? 'Abriendo…' : 'PDF'}
        </button>
      </div>
      {!data || data.fichas.length === 0
        ? <p className="text-sm text-white/60">Todavía no hay recetas cargadas para este evento. El admin las arma en Eventos → Stock de Barra.</p>
        : <DosierVista data={data} seenScope={`caja-${eventId}`} />}
    </div>
  );
}
