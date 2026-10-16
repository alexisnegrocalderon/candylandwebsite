/* Textos de las notificaciones push del admin. iOS muestra el título en UNA
 * línea (lo que no cabe se corta) y el cuerpo en unas 4: por eso el título va
 * corto y con lo importante primero, y nada se corta a mitad de palabra. */

export const PUSH_TITLE_MAX = 40;
export const PUSH_BODY_MAX = 180;

/** Corta en una palabra completa y agrega «…» si sobró texto. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,.;:—-]+$/, '')}…`;
}

/** Título de una línea: «emoji Tipo · detalle». */
export function pushTitle(emoji: string, kind: string, detail?: string | null): string {
  const base = `${emoji} ${kind}`;
  return clip(detail ? `${base} · ${detail}` : base, PUSH_TITLE_MAX);
}

export function clp(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}
