/* PLAYMORE · Player 1 vs Player 2: el equipo (pulsera magenta o azul) de cada persona.
 *
 * Reglas del dueño:
 *  - Nadie elige su equipo: sale al azar y se revela en la puerta, al escanear el QR.
 *  - Cada PERSONA tiene su color. Un Dúo, Pareja o Dos mujeres es UN QR para dos personas: salen un magenta y un azul
 *    (por defecto en equipos distintos: más interacción). Un trío: dos de un color y uno del otro.
 *  - Todo es opcional: quien no quiere jugar no usa la pulsera.
 *
 * El color sale de un hash del código del ticket con una clave secreta del servidor (server/playTeams.ts), así que (a) es el
 * mismo en la puerta, en la app y en cualquier dispositivo sin guardar nada en la base, y (b) nadie puede calcularlo antes de
 * llegar. Con cientos de entradas el reparto queda parejo (el azar de una moneda: ±3 a 4 % en 800 personas). Acá vive solo lo
 * que no necesita la clave, para poder usarlo también en el navegador. */

export const PLAY_TEAMS = ['magenta', 'azul'] as const;
export type PlayTeam = (typeof PLAY_TEAMS)[number];

export interface PlayTeamMeta {
  key: PlayTeam;
  /** Nombre del jugador del concepto arcade. */
  player: string;
  /** Nombre del color, para el staff y para la gente. */
  label: string;
  /** Mundo de origen (la fusión Playroom × Dalmore). */
  world: string;
  /** Color neón (hex) para pantallas. */
  hex: string;
  emoji: string;
}

export const PLAY_TEAM_META: Record<PlayTeam, PlayTeamMeta> = {
  magenta: { key: 'magenta', player: 'Player 1', label: 'Magenta', world: 'Playroom', hex: '#FF2BD6', emoji: '🟣' },
  azul: { key: 'azul', player: 'Player 2', label: 'Azul', world: 'Dalmore', hex: '#29B6FF', emoji: '🔵' },
};

export const otherTeam = (team: PlayTeam): PlayTeam => (team === 'magenta' ? 'azul' : 'magenta');

export const isPlayTeam = (value: unknown): value is PlayTeam => value === 'magenta' || value === 'azul';

/** Cuántas personas cubre un acceso (un QR). Dúo, Pareja y Dos mujeres: 2. Trío: 3. El resto: 1. */
export function peopleForAcceso(accesoSlug: string | null | undefined, groupSize?: number | null): number {
  if (groupSize && groupSize > 0) return Math.min(groupSize, 6);
  if (accesoSlug === 'duo' || accesoSlug === 'duo_mujeres') return 2;
  if (accesoSlug === 'trio') return 3;
  return 1;
}

/** «Magenta» o «Magenta + Azul»: lo que se le dice al staff y a la persona. */
export function describeTeams(teams: readonly PlayTeam[]): string {
  const count = new Map<PlayTeam, number>();
  for (const t of teams) count.set(t, (count.get(t) ?? 0) + 1);
  return PLAY_TEAMS.filter((t) => count.has(t))
    .map((t) => `${count.get(t)! > 1 ? `${count.get(t)} ` : ''}${PLAY_TEAM_META[t].label}`)
    .join(' + ');
}

/* --- Marcador -------------------------------------------------------------- */

export interface TeamScore { magenta: number; azul: number }

/** Quién va ganando, con un empate explícito. */
export function leader(score: TeamScore): PlayTeam | 'empate' {
  if (score.magenta === score.azul) return 'empate';
  return score.magenta > score.azul ? 'magenta' : 'azul';
}

/** % del total de cada equipo (para la barra del marcador). 50/50 si todavía no hay puntos. */
export function scoreShare(score: TeamScore): { magenta: number; azul: number } {
  const total = score.magenta + score.azul;
  if (total <= 0) return { magenta: 50, azul: 50 };
  const magenta = Math.round((score.magenta / total) * 100);
  return { magenta, azul: 100 - magenta };
}

/* --- Estaciones de juego ---------------------------------------------------- */

/** Tipos de juego de la noche (quién juega). */
export const PLAY_GAME_KINDS = ['magenta', 'azul', 'cruzado', 'mezclado'] as const;
export type PlayGameKind = (typeof PLAY_GAME_KINDS)[number];
export const PLAY_GAME_KIND_LABEL: Record<PlayGameKind, string> = {
  magenta: 'Solo magenta',
  azul: 'Solo azul',
  cruzado: 'Cruzado (magenta con azul)',
  mezclado: 'Mezclado (equipos de 4 al azar)',
};

/** Código de una estación: letras y números, 4 a 24, en mayúsculas. */
export function cleanStationCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  return code.length >= 4 && code.length <= 24 ? code : '';
}

export const PLAY_POINTS = { min: 1, max: 100 } as const;
export const cleanPoints = (value: unknown, fallback = 10): number => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(PLAY_POINTS.max, Math.max(PLAY_POINTS.min, n)) : fallback;
};
