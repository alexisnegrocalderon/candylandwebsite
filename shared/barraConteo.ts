/* Cuándo le toca al staff de barra contar el inventario (tareas «Conteo inicial» e «Inventario de cierre» de su app).
 *
 * - Conteo inicial: desde el comienzo del día del evento (hora de Chile) hasta que se abren las puertas — la barra
 *   se arma y se cuenta ANTES de vender; contar con la fiesta andando mezclaría lo vendido con lo contado.
 * - Inventario de cierre: desde que termina la fiesta (`eventEnd`; si no está cargado, 5 horas después de la hora del
 *   evento) y por un día y medio más, para el que lo deja para la mañana siguiente.
 * Un supervisor o admin puede contar fuera de ventana (el servidor lo permite): esto solo avisa qué corresponde ahora. */
import { startOfChileDay } from './chileDate';

export type BarraConteoKind = 'apertura' | 'cierre';
export type BarraVentana = 'aun_no' | 'abierta' | 'cerrada';

export const CIERRE_FALLBACK_HORAS = 5;
const CIERRE_VIGENCIA_HORAS = 36;
const HORA_MS = 3_600_000;

type Fecha = Date | string | null | undefined;
const ms = (d: Fecha): number | null => (d ? new Date(d).getTime() : null);

export function barraConteoVentana(
  event: { eventDate: Fecha; doorsOpen?: Fecha; eventEnd?: Fecha },
  now: Date = new Date(),
): Record<BarraConteoKind, BarraVentana> {
  const date = ms(event.eventDate);
  if (date == null) return { apertura: 'cerrada', cierre: 'cerrada' };
  const t = now.getTime();
  const desde = startOfChileDay(new Date(date)).getTime();
  const puertas = ms(event.doorsOpen) ?? date;
  const fin = ms(event.eventEnd) ?? date + CIERRE_FALLBACK_HORAS * HORA_MS;
  const ventana = (inicio: number, hasta: number): BarraVentana => (t < inicio ? 'aun_no' : t < hasta ? 'abierta' : 'cerrada');
  return {
    apertura: ventana(desde, Math.min(puertas, fin)),
    cierre: ventana(fin, fin + CIERRE_VIGENCIA_HORAS * HORA_MS),
  };
}

export interface BarraTarea {
  kind: BarraConteoKind;
  label: string;
  ventana: BarraVentana;
  /** Quién lo hizo y cuándo (el primero que contó deja la tarea lista para todos). */
  hecho: { por: string | null; a: string } | null;
}

export const BARRA_TAREA_LABEL: Record<BarraConteoKind, string> = { apertura: 'Conteo inicial', cierre: 'Inventario de cierre' };

/** Texto corto del estado de una tarea para la app. */
export function barraTareaEstado(t: BarraTarea): 'listo' | 'pendiente' | 'aun_no' | 'vencida' {
  if (t.hecho) return 'listo';
  if (t.ventana === 'abierta') return 'pendiente';
  return t.ventana === 'aun_no' ? 'aun_no' : 'vencida';
}
