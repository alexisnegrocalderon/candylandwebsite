/* Las tareas de barra de una noche (conteo inicial e inventario de cierre): su ventana horaria y quién ya las hizo.
 * Las usan la pantalla /barra y el perfil del staff en la app. */
import { BARRA_TAREA_LABEL, barraConteoVentana, type BarraConteoKind, type BarraTarea } from '../shared/barraConteo';
import { getEventById } from './db';
import * as insumoSvc from './insumos';

const KINDS: BarraConteoKind[] = ['apertura', 'cierre'];

export async function barraTareasDelEvento(eventId: number, now: Date = new Date()): Promise<BarraTarea[]> {
  const event = await getEventById(eventId);
  if (!event) return [];
  const ventana = barraConteoVentana(event, now);
  return Promise.all(KINDS.map(async (kind) => {
    const hecho = await insumoSvc.ultimoConteo(eventId, kind);
    return {
      kind,
      label: BARRA_TAREA_LABEL[kind],
      ventana: ventana[kind],
      hecho: hecho ? { por: hecho.operatorName, a: new Date(hecho.createdAt).toISOString() } : null,
    };
  }));
}
