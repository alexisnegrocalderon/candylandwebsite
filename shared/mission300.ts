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

function depositUnitsForAccesoSlug(accesoSlug: string | null | undefined): number {
  if (!accesoSlug) return 1;
  return ACCESO_DEPOSIT_UNITS[accesoSlug] ?? personasForAccesoSlug(accesoSlug);
}

/** Fecha límite de la Misión 300 para un evento: 3 días antes de que empiece. */
export function missionCutoff(eventDate: Date): Date {
  return new Date(eventDate.getTime() - MISSION_300_CUTOFF_DAYS * 24 * 60 * 60 * 1000);
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
