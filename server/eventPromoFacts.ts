/* Datos del evento para los correos de promoción (tandas, cupos): salen del evento y no de la fiesta anterior escrita en
 * EVENT_BRAND. En una colaboración (PLAYMORE) el código de vestimenta es el de su landing. */
import { getEventColabBrand } from './coproduction';
import { formatChileDate } from '../shared/chileDate';
import { EVENT_BRAND } from '../shared/eventBrand';

export type EventPromoFacts = { fechaTexto: string; dressCode: string; colab: boolean };

export async function getEventPromoFacts(event: { id: number; eventDate?: Date | string | null }): Promise<EventPromoFacts> {
  const brand = await getEventColabBrand(event.id).catch(() => null);
  const fecha = event.eventDate ? formatChileDate(new Date(event.eventDate)) : EVENT_BRAND.fechaTexto;
  return { fechaTexto: fecha, dressCode: brand?.dressCode || EVENT_BRAND.dressCode, colab: !!brand };
}
