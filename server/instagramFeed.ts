/* Datos de la "Ventana a Instagram" de la portada: perfil y últimas
 * publicaciones reales, desde la API de Meta (gratis, sin IA). Se guardan en
 * memoria 1 hora y NO en la base: las URLs de las imágenes de Meta vencen.
 * Si Meta falla se devuelve lo último bueno que había, y si nunca hubo nada,
 * la cabecera con los números guardados del footer (siteSettings). */
import { fetchOwnMedia, fetchOwnProfile } from './instagramSend';
import { getSiteSettings } from './db';
import { normalizeMedia, SHOWCASE_MEDIA_LIMIT, type InstagramShowcase } from '../shared/instagramShowcase';
import { CANDYLAND_INSTAGRAM_HANDLE } from '../shared/instagramShowcaseConfig';

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; data: InstagramShowcase } | null = null;
let inFlight: Promise<InstagramShowcase> | null = null;

async function load(): Promise<InstagramShowcase> {
  const [profile, media] = await Promise.all([
    fetchOwnProfile().catch(() => null),
    fetchOwnMedia(SHOWCASE_MEDIA_LIMIT + 3).catch(() => [] as unknown[]),
  ]);
  const settings = await getSiteSettings().catch(() => null) as { instagramFollowers?: number; instagramPosts?: number } | null;
  return {
    profile: {
      username: profile?.username ?? CANDYLAND_INSTAGRAM_HANDLE,
      name: profile?.name ?? 'Mansion Playroom',
      bio: profile?.bio ?? '',
      picture: profile?.picture ?? null,
      followers: profile?.followers ?? settings?.instagramFollowers ?? 0,
      posts: profile?.posts ?? settings?.instagramPosts ?? 0,
    },
    media: normalizeMedia(media),
  };
}

export async function getInstagramShowcase(now = Date.now()): Promise<InstagramShowcase> {
  if (cache && now - cache.at < TTL_MS) return cache.data;
  if (!inFlight) {
    inFlight = load()
      .then((data) => {
        // Si esta vez Meta no entregó publicaciones pero antes sí, se mantienen las anteriores.
        const merged = data.media.length === 0 && cache ? { ...data, media: cache.data.media } : data;
        cache = { at: Date.now(), data: merged };
        return merged;
      })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}

/** Solo para tests. */
export function resetInstagramShowcaseCache() {
  cache = null;
  inFlight = null;
}
