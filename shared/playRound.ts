/* PLAYMORE · juegos en vivo (el anfitrión llama jugadores por color y decide el ganador en el momento).
 * Todo simple y sin puntos en el celular: se abre una ronda («necesito 2 azules y 2 magenta»), la gente de esas pulseras va
 * llegando, cuando están todos se juega, y el equipo que gana se lleva un copete. Siempre opcional y con consentimiento.
 * Acá vive lo puro (el catálogo de juegos y la cuenta de quién falta) para poder probarlo sin pantalla. */

import type { PlayTeam } from './playTeams';

export type Need = Record<PlayTeam, number>;

export interface LiveGame {
  key: string;
  name: string;
  emoji: string;
  /** Cuántas personas de cada color se piden por defecto. */
  need: Need;
  /** Cómo se decide el ganador, en una frase. */
  rule: string;
}

export const LIVE_GAMES: LiveGame[] = [
  { key: 'ppt', name: 'Piedra, papel o tijera', emoji: '✊', need: { magenta: 1, azul: 1 }, rule: 'Mejor de 3. Gana quien lleve 2.' },
  { key: 'dados', name: 'Dados', emoji: '🎲', need: { magenta: 2, azul: 2 }, rule: 'Cada jugador tira un dado. Gana el equipo con la suma más alta.' },
  { key: 'equilibrio', name: 'Un pie', emoji: '🦩', need: { magenta: 2, azul: 2 }, rule: 'Todos en un pie con los brazos abiertos. Gana el equipo cuyo último jugador aguante más.' },
  { key: 'baile', name: 'Baile de 10 segundos', emoji: '💃', need: { magenta: 1, azul: 1 }, rule: 'Cada uno baila 10 segundos. Gana quien reciba más aplausos.' },
  { key: 'cancion', name: 'Adivina la canción', emoji: '🎧', need: { magenta: 2, azul: 2 }, rule: 'Suena una canción: gana el equipo que grite primero su nombre.' },
  { key: 'trivia', name: 'Trivia relámpago', emoji: '⚡', need: { magenta: 2, azul: 2 }, rule: '3 preguntas rápidas. Gana el equipo que responda más.' },
  { key: 'mimica', name: 'Mímica', emoji: '🎭', need: { magenta: 2, azul: 2 }, rule: 'Uno actúa una palabra y su equipo la adivina en 30 segundos. Gana el que más aciertos junte.' },
  { key: 'mirada', name: 'Mirada sin reír', emoji: '👀', need: { magenta: 1, azul: 1 }, rule: 'Se miran a los ojos sin reír. El primero que se ríe pierde.' },
  { key: 'ruleta', name: 'Ruleta de la suerte', emoji: '🎡', need: { magenta: 1, azul: 1 }, rule: 'Gira la ruleta: el color que sale gana.' },
];

export const MAX_PER_TEAM = 6;

export const cleanCount = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_PER_TEAM, Math.max(0, v)) : 0;
};

export const gameByKey = (key: string | null | undefined): LiveGame | null => LIVE_GAMES.find((g) => g.key === key) ?? null;

/** Cuántos de cada color faltan para completar la ronda. */
export function missing(need: Need, here: Need): Need {
  return { magenta: Math.max(0, need.magenta - here.magenta), azul: Math.max(0, need.azul - here.azul) };
}

/** ¿Están todos? Una ronda sin nadie pedido nunca queda «completa». */
export function isComplete(need: Need, here: Need): boolean {
  const m = missing(need, here);
  return need.magenta + need.azul > 0 && m.magenta === 0 && m.azul === 0;
}

const word = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** «Faltan 1 azul y 2 magenta» / «Falta 1 azul» / «¡Completo!». */
export function missingText(need: Need, here: Need): string {
  const m = missing(need, here);
  const parts: string[] = [];
  if (m.azul > 0) parts.push(word(m.azul, 'azul', 'azules'));
  if (m.magenta > 0) parts.push(word(m.magenta, 'magenta', 'magenta'));
  if (!parts.length) return '¡Completo!';
  return `${m.azul + m.magenta === 1 ? 'Falta' : 'Faltan'} ${parts.join(' y ')}`;
}

/** El llamado para la pantalla: «Necesitamos 2 azules y 2 magenta». */
export function callText(need: Need): string {
  const parts: string[] = [];
  if (need.azul > 0) parts.push(word(need.azul, 'azul', 'azules'));
  if (need.magenta > 0) parts.push(word(need.magenta, 'magenta', 'magenta'));
  return parts.length ? `Necesitamos ${parts.join(' y ')}` : 'Elige cuántos jugadores';
}

/** Un juego al azar distinto del anterior (para la ruleta). `rand` va de 0 a 1 (se inyecta para poder probarlo). */
export function pickGame(rand: () => number, exceptKey?: string | null): LiveGame {
  const pool = LIVE_GAMES.filter((g) => g.key !== exceptKey);
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}
