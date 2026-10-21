/* Concurso de fotos / disfraz: reglas puras. Lo que toca la base, Meta y el
 * almacenamiento vive en server/contestPhoto.ts. */

export interface PhotoAttachment {
  kind: 'story' | 'dm';
  url: string;
}

/** Fotos de un mensaje de Instagram: mención en historia (`story_mention`) o
 * imagen enviada por DM (`image`). Ignora lo demás (links, audio, video…). */
export function extractPhotos(attachments: unknown): PhotoAttachment[] {
  if (!Array.isArray(attachments)) return [];
  const out: PhotoAttachment[] = [];
  for (const raw of attachments) {
    const a = raw as { type?: string; payload?: { url?: string } } | null;
    const url = a?.payload?.url;
    if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) continue;
    if (a?.type === 'story_mention') out.push({ kind: 'story', url });
    else if (a?.type === 'image') out.push({ kind: 'dm', url });
  }
  return out;
}

/** ¿Cuántas fotos más puede subir? */
export const photosLeft = (max: number, used: number) => Math.max(0, max - used);

/** Ganadores y suplentes según el orden en que el jurado las eligió: los
 * primeros `winners` ganan y el resto son suplentes (sin pasarse de `alternates`). */
export function splitJuryPicks<T>(picked: T[], winners: number, alternates: number): { winners: T[]; alternates: T[] } {
  return { winners: picked.slice(0, winners), alternates: picked.slice(winners, winners + alternates) };
}
