/**
 * Reglas de la preventa "Misión 300", compartidas entre cliente y servidor
 * (el servidor las necesita para calcular precios reales al crear la orden
 * y al liquidar la misión; el cliente para mostrar el precio correcto en
 * el checkout antes de pagar).
 */

export const MISSION_300_GOAL = 300;
export const MISSION_300_DEPOSIT_PER_PERSON = 10000;
export const MISSION_300_CUTOFF_DAYS = 3;
/** Tope máximo que paga cualquier acceso comprado por Misión 300, aunque no se cumpla la meta. */
export const MISSION_300_TOPUP_CAP_PCT = 0.6;

/** Personas que suma cada acceso a la meta (y al contador público de la
 * home) — debe coincidir con `personas` en client/src/config/candyland.ts. */
export const ACCESO_PERSONAS: Record<string, number> = {
  duo: 2,
  duo_mujeres: 2,
  soltera: 1,
  soltero: 1,
  trio: 3,
  grupo: 4,
  cumpleaneros: 1,
};

/** Unidades de $10.000 que se cobran de abono durante la Misión 300 --
 * normalmente igual a ACCESO_PERSONAS (1 persona = 1 unidad), pero
 * `duo_mujeres` es la excepción: son 2 personas reales (cuentan doble hacia
 * la meta de 300) que pagan como si fuera 1 sola -- "2x1, mismo valor que
 * Soltera". Sin esta separación, missionDepositPrice() cobraría el doble
 * durante la preventa por usar el mismo número para ambas cosas. */
export const ACCESO_DEPOSIT_UNITS: Record<string, number> = {
  ...ACCESO_PERSONAS,
  duo_mujeres: 1,
};

export function personasForAccesoSlug(accesoSlug: string | null | undefined): number {
  if (!accesoSlug) return 1;
  return ACCESO_PERSONAS[accesoSlug] ?? 1;
}

/** Personas cubiertas por UN ticket. `groupSize` (columna `tickets.groupSize`)
 * gana sobre la tabla fija de slugs cuando está seteado -- lo usa la
 * invitación especial instantánea del admin: un solo ticket que representa a
 * varias personas, en vez de un ticket por persona (server/db.ts
 * createInstantInvite). Sin `groupSize`, es exactamente personasForAccesoSlug. */
export function personasForTicket(groupSize: number | null | undefined, accesoSlug: string | null | undefined): number {
  return groupSize ?? personasForAccesoSlug(accesoSlug);
}

function depositUnitsForAccesoSlug(accesoSlug: string | null | undefined): number {
  if (!accesoSlug) return 1;
  return ACCESO_DEPOSIT_UNITS[accesoSlug] ?? personasForAccesoSlug(accesoSlug);
}

// Mismo criterio de hora fija de Chile (UTC-4, continental sin cambio de
// horario) ya usado en client/src/config/candyland.ts (EVENTO.eventDate) y
// en client/src/pages/admin/Dashboard.tsx (fromChileInputValue/toChileInputValue).
const CHILE_FIXED_OFFSET_MS = 4 * 60 * 60 * 1000;

/** 23:59:59 (hora de Chile) del día que, contando el propio evento, es el
 * día número MISSION_300_CUTOFF_DAYS antes de la fiesta -- así "3 días
 * antes" incluye el día de hoy completo, en vez de restar 72 horas exactas
 * desde la hora en que arranca el evento (lo que cortaba la ventana casi un
 * día antes de lo esperado). */
export function missionCutoff(eventDate: Date): Date {
  const chileWallClock = new Date(eventDate.getTime() - CHILE_FIXED_OFFSET_MS);
  const cutoffDayUTC = Date.UTC(
    chileWallClock.getUTCFullYear(),
    chileWallClock.getUTCMonth(),
    chileWallClock.getUTCDate() - (MISSION_300_CUTOFF_DAYS - 1),
    23, 59, 59, 999,
  );
  return new Date(cutoffDayUTC + CHILE_FIXED_OFFSET_MS);
}

export function isMissionWindowOpen(eventDate: Date, now: Date = new Date()): boolean {
  return now.getTime() < missionCutoff(eventDate).getTime();
}

/** Precio del abono para una entrada de este acceso (por unidad, no por persona). */
export function missionDepositPrice(accesoSlug: string | null | undefined): number {
  return MISSION_300_DEPOSIT_PER_PERSON * depositUnitsForAccesoSlug(accesoSlug);
}

/** Tope máximo (60% del valor general) para una entrada de este acceso. */
export function missionCapPrice(generalPrice: number): number {
  return Math.round(generalPrice * MISSION_300_TOPUP_CAP_PCT);
}
