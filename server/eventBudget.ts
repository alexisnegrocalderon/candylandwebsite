import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { budgetSimulations } from '../drizzle/schema';
import type { RevenueTier, BudgetExpenseLine } from '../shared/eventBudget';

/* CRUD de las simulaciones de presupuesto pre-evento -- la matemática vive
 * en shared/eventBudget.ts (computeBudgetResult), acá solo se guarda y lee
 * lo que el admin cargó. Mismo split que server/birthdayApplications.ts. */

export type SimulationInput = {
  name: string;
  eventId?: number | null;
  ivaApplies: boolean;
  marginTargetPercent: number;
  cardFeePercent: number;
  commissionPercent: number;
  variableCostPerPerson: number;
  otherRevenuePerPerson: number;
  revenueTiers: RevenueTier[];
  expenseLines: BudgetExpenseLine[];
  notes?: string | null;
};

export async function listSimulations(eventId?: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(budgetSimulations)
    .where(eventId ? eq(budgetSimulations.eventId, eventId) : undefined)
    .orderBy(desc(budgetSimulations.updatedAt));
}

export async function getSimulation(id: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(budgetSimulations).where(eq(budgetSimulations.id, id)).limit(1);
  return row ?? null;
}

export async function createSimulation(data: SimulationInput, createdByUserId?: number | null) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const inserted = await db.insert(budgetSimulations).values({
    name: data.name,
    eventId: data.eventId ?? null,
    ivaApplies: data.ivaApplies ? 1 : 0,
    marginTargetPercent: String(data.marginTargetPercent),
    cardFeePercent: String(data.cardFeePercent),
    commissionPercent: String(data.commissionPercent),
    variableCostPerPerson: String(data.variableCostPerPerson),
    otherRevenuePerPerson: String(data.otherRevenuePerPerson),
    revenueTiers: data.revenueTiers,
    expenseLines: data.expenseLines,
    notes: data.notes || null,
    createdByUserId: createdByUserId ?? null,
  });
  const id = (inserted as unknown as { insertId: number }).insertId;
  return { success: true, id };
}

export async function updateSimulation(id: number, data: SimulationInput) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(budgetSimulations).set({
    name: data.name,
    ivaApplies: data.ivaApplies ? 1 : 0,
    marginTargetPercent: String(data.marginTargetPercent),
    cardFeePercent: String(data.cardFeePercent),
    commissionPercent: String(data.commissionPercent),
    variableCostPerPerson: String(data.variableCostPerPerson),
    otherRevenuePerPerson: String(data.otherRevenuePerPerson),
    revenueTiers: data.revenueTiers,
    expenseLines: data.expenseLines,
    notes: data.notes || null,
  }).where(eq(budgetSimulations.id, id));
  return { success: true };
}

export async function deleteSimulation(id: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.delete(budgetSimulations).where(eq(budgetSimulations.id, id));
  return { success: true };
}

/** "Vincular a este evento": una vez que la fiesta hipotética se crea de
 * verdad, esto es lo que le permite a Gastos y P&L mostrar presupuestado
 * vs. real para ese evento (ver EventPnlReport en el admin). */
export async function linkSimulationToEvent(id: number, eventId: number | null) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db.update(budgetSimulations).set({ eventId }).where(eq(budgetSimulations.id, id));
  return { success: true };
}
