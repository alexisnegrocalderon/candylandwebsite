/* Paquete de contenido de un evento (Estudio → «Paquete de un evento», o el
 * botón «Contenido» de cada evento en el admin): con un clic salen, con los
 * datos reales del evento, las imágenes en feed 3:4 e historia 9:16, la imagen
 * para compartir el link (1200×630) y los videos del anuncio. Con el código de
 * un embajador, todo sale personalizado para él. Sin IA: no gasta créditos. */

import { formatChileDate, formatChileTime } from './chileDate';
import { cleanAmbassadorCode, eventVideo, playcardVideo, type StudioVideo, type VideoEvent } from './studioVideo';
import { eventPhotoBrief, photoVariants, type EventForBrief, type StudioVariant } from './studioVariants';

/** El tamaño de la imagen que sale al pegar un link en WhatsApp, Facebook, etc. */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 } as const;

export type PackEvent = EventForBrief & VideoEvent;

/** Las cuatro imágenes del paquete: feed 3:4 e historia 9:16, a sangre y con marco, en Bubble. */
export function packImages(event: PackEvent, code?: string): StudioVariant[] {
  return photoVariants(eventPhotoBrief(event, { code }), { themes: ['bubble'], formats: ['post', 'historia'], styles: ['sangre', 'marco'] });
}

export interface PackVideo {
  key: string;
  label: string;
  video: StudioVideo;
}

/** Los videos del paquete: el anuncio en reel 9:16 y en feed 3:4, y la PlayCard. */
export function packVideos(event: PackEvent, code?: string): PackVideo[] {
  return [
    { key: 'anuncio-reel', label: 'Anuncio · Reel 9:16', video: eventVideo(event, { code, format: 'reel' }) },
    { key: 'anuncio-feed', label: 'Anuncio · Feed 3:4', video: eventVideo(event, { code, format: 'feed' }) },
    { key: 'playcard', label: 'PlayCard animada · Reel 9:16', video: playcardVideo() },
  ];
}

/** Los textos de la imagen para compartir el link. */
export function shareCardText(event: PackEvent, code?: string): { title: string; when: string; footer: string; imageUrl: string } {
  const clean = cleanAmbassadorCode(code);
  const day = formatChileDate(event.eventDate);
  return {
    title: event.title,
    when: `${day[0].toUpperCase()}${day.slice(1)} · ${formatChileTime(event.doorsOpen ?? event.eventDate)} hrs`,
    footer: clean ? `Mi código: ${clean} · mansionplayroom.cl` : 'mansionplayroom.cl · Evento +18',
    imageUrl: event.imageUrl?.trim() ?? '',
  };
}
