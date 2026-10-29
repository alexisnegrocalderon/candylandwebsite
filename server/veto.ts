/* Veto en el momento (puerta o panel): se escanea el QR, se elige un motivo y quedan vetados el titular y todos los
 * acompañantes de la compra. Al instante: entran a la lista de bloqueados (puerta y compras), sus entradas válidas se
 * anulan y salen de Playmatch. Si lo pide un guardia, el veto rige igual pero queda «pendiente» hasta que el dueño lo
 * confirma o lo levanta (reglas puras y datos de la nota en shared/veto.ts). */
import { and, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { blockedCustomers, events, orders, partyProfiles, tickets } from '../drizzle/schema';
import { createBlockedCustomer, findBlockedMatch, getDb, invalidateBlockedCache, orderIdentities, recordAdminAudit, setPartyProfileBanned } from './db';
import { sendPushToAdminsAlways } from './push';
import { initialVetoStatus, parseVetoNotes, vetoNotes, vetoPeople, vetoReasonText, VETO_REASONS, type VetoMeta, type VetoReasonKey } from '../shared/veto';

const SOURCE_VENUE = 'Mansión PlayRoom';

export interface VetoResult { people: string[]; ticketsCancelled: number; profilesBanned: number; alreadyBlocked: number; status: VetoMeta['status'] }

/** Vetar desde un código de entrada. `by.kind` 'puerta' deja el veto pendiente de confirmar; 'admin' lo deja confirmado. */
export async function vetoTicket(params: {
  ticketCode: string; reasonKey: VetoReasonKey; note?: string | null;
  by: { kind: 'puerta' | 'admin'; name: string }; ip?: string | null;
}): Promise<VetoResult> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const reason = vetoReasonText(params.reasonKey, params.note);
  if (!reason) throw new Error('Escribe el motivo (mínimo 3 letras).');

  const code = params.ticketCode.trim();
  const [ticket] = await db.select().from(tickets).where(eq(tickets.ticketCode, code)).limit(1);
  if (!ticket) throw new Error('No encontré esa entrada.');
  const [order] = await db.select().from(orders).where(eq(orders.id, ticket.orderId)).limit(1);
  if (!order) throw new Error('No encontré la compra de esa entrada.');

  // Titular y acompañantes (nombre, RUT; el titular además con correo y teléfono).
  const identities = vetoPeople(orderIdentities(order.attendeeData, { name: order.buyerName, email: order.buyerEmail, phone: order.buyerPhone }));
  if (identities.length === 0) throw new Error('Esa compra no tiene datos de personas para vetar.');

  // Entradas y perfiles de Playmatch: las de esta compra y las próximas del mismo correo.
  const now = Date.now();
  const futureOrders = await db.select({ id: orders.id }).from(orders)
    .innerJoin(events, eq(orders.eventId, events.id))
    .where(and(sql`LOWER(${orders.buyerEmail}) = ${String(order.buyerEmail).toLowerCase()}`, eq(orders.paymentStatus, 'approved'), gte(events.eventDate, new Date(now - 12 * 3_600_000))));
  const orderIds = Array.from(new Set([order.id, ...futureOrders.map((o: { id: number }) => o.id)]));
  const allTickets = await db.select({ id: tickets.id, ticketCode: tickets.ticketCode, status: tickets.status }).from(tickets).where(inArray(tickets.orderId, orderIds));
  const toCancel = allTickets.filter((t: { status: string }) => t.status === 'valid');
  if (toCancel.length) await db.update(tickets).set({ status: 'cancelled' }).where(inArray(tickets.id, toCancel.map((t: { id: number }) => t.id)));
  const profiles = allTickets.length
    ? await db.select({ id: partyProfiles.id }).from(partyProfiles).where(inArray(partyProfiles.ticketId, allTickets.map((t: { id: number }) => t.id)))
    : [];
  for (const p of profiles as { id: number }[]) await setPartyProfileBanned(p.id, true);

  const meta: Omit<VetoMeta, 'veto'> = {
    status: initialVetoStatus(params.by.kind), byKind: params.by.kind, by: params.by.name, ticketCode: code, eventId: ticket.eventId,
    at: new Date().toISOString(), reasonKey: params.reasonKey,
    tickets: toCancel.map((t: { ticketCode: string }) => t.ticketCode), profiles: (profiles as { id: number }[]).map((p) => p.id),
  };

  // Una ficha por persona (las que ya estaban bloqueadas no se duplican).
  let alreadyBlocked = 0;
  const names: string[] = [];
  for (const p of identities) {
    names.push((p.name ?? '').trim() || (p.email ?? '') || 'Sin nombre');
    const hit = await findBlockedMatch([{ name: p.name, rut: p.rut, email: p.email, phone: p.phone, instagram: p.instagram }]);
    if (hit.block.length > 0) { alreadyBlocked++; continue; }
    await createBlockedCustomer({
      fullName: p.name ?? null, rut: p.rut ?? null, email: p.email ?? null, phone: p.phone ?? null, instagram: p.instagram ?? null,
      reason, sourceVenue: SOURCE_VENUE, blockedOn: new Date().toISOString().slice(0, 10),
      sourceBy: `${params.by.kind === 'puerta' ? 'Puerta' : 'Panel'}: ${params.by.name}`.slice(0, 120), notes: vetoNotes(meta),
    });
  }

  await recordAdminAudit({
    action: 'veto.create', targetType: 'ticket', targetId: ticket.id, eventId: ticket.eventId, ip: params.ip ?? null,
    payload: { by: params.by, reason, people: names, tickets: meta.tickets, profiles: meta.profiles, status: meta.status },
  });

  // Aviso al celular del dueño (si lo pidió un guardia, con el pedido de confirmar).
  const label = VETO_REASONS.find((r) => r.key === params.reasonKey)?.label ?? 'Veto';
  void sendPushToAdminsAlways({
    title: `🚫 Vetado en la ${params.by.kind === 'puerta' ? 'puerta' : 'fiesta'}: ${names[0]}${names.length > 1 ? ` +${names.length - 1}` : ''}`,
    body: `${label} · lo pidió ${params.by.name}.${meta.status === 'pendiente' ? ' Confírmalo en Bloqueo de clientes.' : ''}`,
    url: '/admin',
  });

  return { people: names, ticketsCancelled: toCancel.length, profilesBanned: profiles.length, alreadyBlocked, status: meta.status };
}

export interface PendingVeto { ticketCode: string; status: VetoMeta['status']; by: string; byKind: 'puerta' | 'admin'; at: string; reasonKey: VetoReasonKey; reason: string | null; people: { id: number; name: string | null }[] }

/** Los vetos hechos en el momento, agrupados por entrada (los pendientes primero). */
export async function listVetos(): Promise<PendingVeto[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(blockedCustomers).where(like(blockedCustomers.notes, '{"veto":1%'));
  const byCode = new Map<string, PendingVeto>();
  for (const r of rows as any[]) {
    const meta = parseVetoNotes(r.notes);
    if (!meta) continue;
    const g: PendingVeto = byCode.get(meta.ticketCode) ?? { ticketCode: meta.ticketCode, status: meta.status, by: meta.by, byKind: meta.byKind, at: meta.at, reasonKey: meta.reasonKey, reason: r.reason ?? null, people: [] };
    g.people.push({ id: r.id, name: r.fullName ?? r.email ?? null });
    byCode.set(meta.ticketCode, g);
  }
  return Array.from(byCode.values()).sort((a, b) => Number(b.status === 'pendiente') - Number(a.status === 'pendiente') || b.at.localeCompare(a.at));
}

async function vetoRows(ticketCode: string) {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const rows = await db.select().from(blockedCustomers).where(like(blockedCustomers.notes, '{"veto":1%'));
  return { db, rows: (rows as any[]).filter((r) => parseVetoNotes(r.notes)?.ticketCode === ticketCode) };
}

/** El dueño confirma el veto de un guardia: queda para siempre. */
export async function confirmVeto(ticketCode: string, by: { name: string; ip?: string | null }): Promise<number> {
  const { db, rows } = await vetoRows(ticketCode);
  if (rows.length === 0) throw new Error('No encontré ese veto.');
  for (const r of rows) {
    const meta = parseVetoNotes(r.notes)!;
    await db.update(blockedCustomers).set({ notes: vetoNotes({ ...meta, status: 'confirmado' }) }).where(eq(blockedCustomers.id, r.id));
  }
  await recordAdminAudit({ action: 'veto.confirm', targetType: 'ticket', targetId: ticketCode, ip: by.ip ?? null, payload: { by: by.name, people: rows.length } });
  return rows.length;
}

/** El dueño levanta un veto (se equivocaron): sale de la lista y se devuelven las entradas que se anularon. */
export async function liftVeto(ticketCode: string, by: { name: string; ip?: string | null }): Promise<{ people: number; ticketsRestored: number }> {
  const { db, rows } = await vetoRows(ticketCode);
  if (rows.length === 0) throw new Error('No encontré ese veto.');
  const meta = parseVetoNotes(rows[0].notes)!;
  await db.update(blockedCustomers).set({ isActive: 0 }).where(inArray(blockedCustomers.id, rows.map((r) => r.id)));
  let restored = 0;
  if (meta.tickets.length) {
    const res = await db.update(tickets).set({ status: 'valid' }).where(and(inArray(tickets.ticketCode, meta.tickets), eq(tickets.status, 'cancelled')));
    restored = Number((res as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
  }
  for (const id of meta.profiles) await setPartyProfileBanned(id, false);
  invalidateBlockedCache();
  await recordAdminAudit({ action: 'veto.lift', targetType: 'ticket', targetId: ticketCode, ip: by.ip ?? null, payload: { by: by.name, people: rows.length, ticketsRestored: restored } });
  return { people: rows.length, ticketsRestored: restored };
}
