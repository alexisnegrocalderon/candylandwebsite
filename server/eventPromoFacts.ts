/* Datos del evento para los correos de promoción (tandas, cupos): salen del evento y no de la fiesta anterior escrita en
 * EVENT_BRAND. En una colaboración (PLAYMORE) el código de vestimenta es el de su landing. */
import { getEventColabBrand } from './coproduction';
import { formatChileDate } from '../shared/chileDate';

/** `dressCode` vacío = el evento no tiene uno propio y el correo no inventa ninguno. `theme`: el look del correo
 * (la colaboración usa el de PLAYMORE; el resto, el de siempre). */
export type EventPromoFacts = { fechaTexto: string; dressCode: string; colab: boolean; theme?: 'playmore' };

export async function getEventPromoFacts(event: { id: number; eventDate?: Date | string | null }): Promise<EventPromoFacts> {
  const brand = await getEventColabBrand(event.id).catch(() => null);
  const fecha = event.eventDate ? formatChileDate(new Date(event.eventDate)) : 'próximamente';
  return { fechaTexto: fecha, dressCode: brand?.dressCode || '', colab: !!brand, theme: brand ? 'playmore' : undefined };
}
