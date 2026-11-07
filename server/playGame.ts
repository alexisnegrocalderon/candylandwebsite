/* PLAYMORE · Player 1 vs Player 2: estaciones de juego y marcador en vivo.
 *
 * Las tablas se crean solas la primera vez (CREATE TABLE IF NOT EXISTS, igual que drizzle/0151_play_game.sql): no hace falta
 * migrar a mano. Y si no se pueden crear, nada se rompe: el marcador queda en 0 y las estaciones vacías (nunca toca el
 * ingreso ni las entradas).
 *
 * Un punto es una fila de `playScores` (equipo, puntos, de dónde vino). El marcador es la suma por equipo. Una estación es un
 * QR en la mesa de un juego: quien lo escanea con su celular marca su pulsera y le suma los puntos de la estación a su equipo,
 * una vez por celular (`deviceKey`). Es un juego de pulseras, a la palabra: pocas ganas de hacer trampa y poco que ganar. */
import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { cleanPoints, cleanStationCode, isPlayTeam, type PlayGameKind, type PlayTeam, PLAY_GAME_KINDS, type TeamScore } from '../shared/playTeams';

let tablesOk = false;
async function ensureTables(): Promise<boolean> {
  if (tablesOk) return true;
  try {
    const db = await getDb();
    if (!db) return false;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`playStations\` (\`id\` int AUTO_INCREMENT NOT NULL, \`eventId\` int NOT NULL, \`code\` varchar(24) NOT NULL, \`name\` varchar(80) NOT NULL, \`kind\` varchar(12) NOT NULL DEFAULT 'cruzado', \`points\` int NOT NULL DEFAULT 10, \`active\` int NOT NULL DEFAULT 1, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`playStations_id\` PRIMARY KEY(\`id\`), UNIQUE KEY \`play_stations_code_idx\` (\`code\`), KEY \`play_stations_event_idx\` (\`eventId\`))`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`playScores\` (\`id\` int AUTO_INCREMENT NOT NULL, \`eventId\` int NOT NULL, \`team\` varchar(10) NOT NULL, \`points\` int NOT NULL, \`label\` varchar(120) NOT NULL DEFAULT '', \`source\` varchar(10) NOT NULL DEFAULT 'manual', \`stationId\` int NULL, \`deviceKey\` varchar(64) NULL, \`createdAt\` timestamp NOT NULL DEFAULT (now()), CONSTRAINT \`playScores_id\` PRIMARY KEY(\`id\`), KEY \`play_scores_event_idx\` (\`eventId\`), UNIQUE KEY \`play_scores_device_idx\` (\`stationId\`, \`deviceKey\`))`);
    tablesOk = true;
    return true;
  } catch (err) {
    console.error('[playGame] tablas:', err);
    return false;
  }
}

/** Las filas de un SELECT hecho con db.execute (mysql2 devuelve [filas, columnas]). */
function rowsOf(result: unknown): any[] {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
}

export interface PlayStation { id: number; eventId: number; code: string; name: string; kind: PlayGameKind; points: number; active: boolean }

const rowToStation = (r: any): PlayStation => ({
  id: Number(r.id), eventId: Number(r.eventId), code: String(r.code), name: String(r.name),
  kind: (PLAY_GAME_KINDS as readonly string[]).includes(r.kind) ? (r.kind as PlayGameKind) : 'cruzado',
  points: Number(r.points), active: Number(r.active) === 1,
});

/** El marcador de un evento: puntos de cada equipo. Nunca lanza. */
export async function getScore(eventId: number): Promise<TeamScore> {
  const out: TeamScore = { magenta: 0, azul: 0 };
  if (!(await ensureTables())) return out;
  try {
    const db = await getDb();
    const list = rowsOf(await db!.execute(sql`SELECT \`team\`, SUM(\`points\`) AS total FROM \`playScores\` WHERE \`eventId\` = ${eventId} GROUP BY \`team\``));
    for (const r of list) if (isPlayTeam(r.team)) out[r.team as PlayTeam] = Number(r.total ?? 0);
  } catch (err) {
    console.error('[playGame] marcador:', err);
  }
  return out;
}

/** Los últimos puntos, para la tira «acaba de pasar» del marcador. */
export async function recentScores(eventId: number, limit = 8): Promise<{ team: PlayTeam; points: number; label: string; at: string }[]> {
  if (!(await ensureTables())) return [];
  try {
    const db = await getDb();
    const list = rowsOf(await db!.execute(sql`SELECT \`team\`, \`points\`, \`label\`, \`createdAt\` FROM \`playScores\` WHERE \`eventId\` = ${eventId} ORDER BY \`id\` DESC LIMIT ${limit}`));
    return list.filter((r) => isPlayTeam(r.team)).map((r) => ({ team: r.team as PlayTeam, points: Number(r.points), label: String(r.label ?? ''), at: new Date(r.createdAt).toISOString() }));
  } catch (err) {
    console.error('[playGame] recientes:', err);
    return [];
  }
}

/** Suma puntos a mano (el anfitrión de un juego). */
export async function addManualPoints(input: { eventId: number; team: PlayTeam; points: number; label: string }): Promise<void> {
  if (!(await ensureTables())) throw new Error('No se pudo abrir el marcador. Intenta de nuevo.');
  const db = await getDb();
  const points = Math.max(-100, Math.min(100, Math.round(input.points)));
  if (!points) throw new Error('Los puntos no pueden ser 0.');
  await db!.execute(sql`INSERT INTO \`playScores\` (\`eventId\`, \`team\`, \`points\`, \`label\`, \`source\`) VALUES (${input.eventId}, ${input.team}, ${points}, ${input.label.trim().slice(0, 120)}, 'manual')`);
}

/** Empieza de cero el marcador de un evento (los puntos de prueba antes de la fiesta). */
export async function resetScore(eventId: number): Promise<void> {
  if (!(await ensureTables())) return;
  const db = await getDb();
  await db!.execute(sql`DELETE FROM \`playScores\` WHERE \`eventId\` = ${eventId}`);
}

export async function listStations(eventId: number): Promise<PlayStation[]> {
  if (!(await ensureTables())) return [];
  try {
    const db = await getDb();
    return rowsOf(await db!.execute(sql`SELECT * FROM \`playStations\` WHERE \`eventId\` = ${eventId} ORDER BY \`id\``)).map(rowToStation);
  } catch (err) {
    console.error('[playGame] estaciones:', err);
    return [];
  }
}

export async function getStationByCode(code: string): Promise<PlayStation | null> {
  const clean = cleanStationCode(code);
  if (!clean || !(await ensureTables())) return null;
  try {
    const db = await getDb();
    const list = rowsOf(await db!.execute(sql`SELECT * FROM \`playStations\` WHERE \`code\` = ${clean} LIMIT 1`));
    return list[0] ? rowToStation(list[0]) : null;
  } catch {
    return null;
  }
}

/** Crea una estación con un código corto al azar (el del QR). */
export async function createStation(input: { eventId: number; name: string; kind: PlayGameKind; points: number }): Promise<PlayStation> {
  if (!(await ensureTables())) throw new Error('No se pudo abrir el marcador. Intenta de nuevo.');
  const db = await getDb();
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new Error('Ponle un nombre al juego.');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
    try {
      await db!.execute(sql`INSERT INTO \`playStations\` (\`eventId\`, \`code\`, \`name\`, \`kind\`, \`points\`) VALUES (${input.eventId}, ${code}, ${name}, ${input.kind}, ${cleanPoints(input.points)})`);
      const made = await getStationByCode(code);
      if (made) return made;
    } catch (err: any) {
      if (!/duplicate/i.test(String(err?.message ?? err?.cause?.message ?? ''))) throw err;
    }
  }
  throw new Error('No se pudo crear la estación. Intenta de nuevo.');
}

export async function setStationActive(id: number, active: boolean): Promise<void> {
  if (!(await ensureTables())) return;
  const db = await getDb();
  await db!.execute(sql`UPDATE \`playStations\` SET \`active\` = ${active ? 1 : 0} WHERE \`id\` = ${id}`);
}

export async function deleteStation(id: number): Promise<void> {
  if (!(await ensureTables())) return;
  const db = await getDb();
  await db!.execute(sql`DELETE FROM \`playStations\` WHERE \`id\` = ${id}`);
}

/** Quien escanea el QR de una estación suma sus puntos al equipo que dice llevar, una vez por celular. */
export async function scanStation(input: { code: string; team: PlayTeam; deviceKey: string }): Promise<{ ok: true; station: PlayStation; score: TeamScore } | { ok: false; reason: string }> {
  const station = await getStationByCode(input.code);
  if (!station) return { ok: false, reason: 'Ese juego no existe.' };
  if (!station.active) return { ok: false, reason: 'Ese juego ya cerró.' };
  const device = input.deviceKey.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (device.length < 8) return { ok: false, reason: 'No se pudo reconocer tu celular. Recarga la página.' };
  if (station.kind === 'magenta' && input.team !== 'magenta') return { ok: false, reason: 'Este juego es solo para pulsera magenta.' };
  if (station.kind === 'azul' && input.team !== 'azul') return { ok: false, reason: 'Este juego es solo para pulsera azul.' };
  const db = await getDb();
  try {
    await db!.execute(sql`INSERT INTO \`playScores\` (\`eventId\`, \`team\`, \`points\`, \`label\`, \`source\`, \`stationId\`, \`deviceKey\`) VALUES (${station.eventId}, ${input.team}, ${station.points}, ${station.name}, 'station', ${station.id}, ${device})`);
  } catch (err: any) {
    if (/duplicate/i.test(String(err?.message ?? err?.cause?.message ?? ''))) return { ok: false, reason: 'Ya sumaste los puntos de este juego.' };
    throw err;
  }
  return { ok: true, station, score: await getScore(station.eventId) };
}
