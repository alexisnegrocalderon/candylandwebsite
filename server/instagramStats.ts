/* Seguidores y publicaciones del Instagram de Playroom para el footer del
 * sitio. Se leen de la API de Meta (gratis, sin IA) con el mismo token del
 * agente y se guardan en siteSettings: el footer sigue leyendo de ahí, así que
 * si Meta falla se queda el último número bueno en vez de mostrar 0. */
import { fetchOwnProfile } from './instagramSend';
import { updateSiteSettings } from './db';

export async function syncInstagramStats(): Promise<{ followers: number; posts: number }> {
  const profile = await fetchOwnProfile();
  // Meta a veces responde sin el dato: nunca se pisa un número bueno con 0.
  if (!Number.isFinite(profile.followers) || (profile.followers ?? 0) <= 0) {
    throw new Error('Meta no entregó la cantidad de seguidores. Se mantiene el número anterior.');
  }
  const followers = Math.round(profile.followers as number);
  const posts = Number.isFinite(profile.posts) && (profile.posts ?? 0) > 0 ? Math.round(profile.posts as number) : undefined;
  await updateSiteSettings({ instagramFollowers: followers, ...(posts !== undefined ? { instagramPosts: posts } : {}) });
  return { followers, posts: posts ?? 0 };
}
