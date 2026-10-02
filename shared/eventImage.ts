/** Imágenes de eventos servidas desde un almacén de Vercel Blob que quedó
 * bloqueado (responde 403 "Your store is blocked" a todo el mundo, aunque el
 * dueño las siga viendo por caché del navegador).
 *
 * Mientras se resuben los flyers a un almacén nuevo, esta capa evita que una
 * URL muerta llegue a la pantalla o a la vista previa del link:
 *  - si el evento tiene una copia local (`LOCAL_FLYERS`), se usa esa;
 *  - si no, se devuelve null para que cada pantalla muestre su estado de
 *    "sin flyer" de una vez, en vez de pedir una imagen que va a fallar.
 *
 * Solo toca URLs del host bloqueado: un flyer resubido al almacén nuevo tiene
 * otro host y pasa tal cual, sin necesidad de tocar este archivo. */

export const BLOCKED_BLOB_HOST = 'fvrw9lthpgo9eimj.public.blob.vercel-storage.com';

/** slug del evento → flyer guardado dentro del sitio (client/public). */
const LOCAL_FLYERS: Record<string, string> = {
  '2do-aniversario-playroom': '/candyland/flyer-aniversario.jpg',
};

export function isBlockedBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).host === BLOCKED_BLOB_HOST;
  } catch {
    return false;
  }
}

/** Las metaetiquetas de vista previa y el JSON-LD exigen URL absoluta: una
 * copia local ('/candyland/...') se completa con el dominio del sitio. */
export function absoluteImageUrl(url: string | null | undefined, siteUrl = 'https://mansionplayroom.cl'): string | null {
  if (!url) return null;
  return url.startsWith('/') ? `${siteUrl}${url}` : url;
}

/** URL de imagen a mostrar para un evento: la original si funciona, la copia
 * local si la original está en el almacén bloqueado, o null si no hay ninguna. */
export function eventImage(slug: string | null | undefined, url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isBlockedBlobUrl(url)) return url;
  return (slug && LOCAL_FLYERS[slug]) || null;
}
