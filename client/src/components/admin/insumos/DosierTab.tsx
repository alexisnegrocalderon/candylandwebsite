import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { DosierVista } from '@/components/dosier/DosierVista';
import { DosierPdfDialog } from './DosierPdfDialog';
import { RecetaDialog } from './RecetaDialog';
import type { BarraData } from './types';

/** El dosier tal como lo ve la barra, para revisarlo antes del evento: tocas una ficha, y «Editar receta» abre la
 * receta de ese trago sin salir de aquí. Cada cambio que guardas le llega a la barra como «Actualizado». */
export function DosierTab({ eventId, eventTitle, data, onChanged }: { eventId: number; eventTitle: string; data: BarraData; onChanged: () => void }) {
  const fichas = trpc.insumos.dosierFichas.useQuery({ eventId });
  const [pdfOpen, setPdfOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const producto = data.productos.find((p) => p.id === editing) ?? null;
  const refresh = () => { fichas.refetch(); onChanged(); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">Así lo ve la barra en su app (pestaña Dosier). Se actualiza solo cuando guardas una receta.</p>
        <Button type="button" variant="outline" onClick={() => setPdfOpen(true)}>📘 PDF y WhatsApp</Button>
      </div>
      {fichas.isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
      {fichas.data && fichas.data.fichas.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay tragos con receta. Arma las recetas en la pestaña Recetas y aparecen aquí.</p>}
      {fichas.data && fichas.data.fichas.length > 0 && <DosierVista data={fichas.data} claro onEdit={(f) => setEditing(f.id)} />}
      <DosierPdfDialog eventId={eventId} eventTitle={eventTitle} open={pdfOpen} onClose={() => setPdfOpen(false)} />
      <RecetaDialog producto={producto} data={data} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} onChanged={refresh} />
    </div>
  );
}
