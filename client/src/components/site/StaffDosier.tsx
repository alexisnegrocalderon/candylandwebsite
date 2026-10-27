import { trpc } from '@/lib/trpc';
import { DosierVista } from '@/components/dosier/DosierVista';

/** El dosier de barra para la app del staff: el query solo trae algo si la persona trabaja en barra o coordina. */
export function useStaffDosier() {
  const { data } = trpc.member.staffDosier.useQuery(undefined, { retry: false, staleTime: 5 * 60_000 });
  return data ?? null;
}

/** Fichas de preparación del evento, pensadas para el celular: buscador, secciones y cada trago con su vaso, medidas
 * y pasos. Si cambian una receta, la ficha sale marcada «Actualizado» hasta que se abre. */
export function StaffDosier({ dosier }: { dosier: NonNullable<ReturnType<typeof useStaffDosier>> }) {
  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-title3 font-bold leading-tight">📘 Dosier de barra</p>
          <p className="text-footnote text-white/60">{dosier.data.eventTitle} · toca un trago para ver su preparación.</p>
        </div>
        <a href={dosier.pdfPath} target="_blank" rel="noreferrer" className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-subhead font-semibold">PDF</a>
      </div>
      {dosier.data.fichas.length === 0
        ? <p className="rounded-2xl bg-white/5 p-4 text-subhead text-white/65">Todavía no hay recetas cargadas para esta fiesta. Cuando el administrador las arme, aparecen acá.</p>
        : <DosierVista data={dosier.data} seenScope={`app-${dosier.eventId}`} />}
    </div>
  );
}
