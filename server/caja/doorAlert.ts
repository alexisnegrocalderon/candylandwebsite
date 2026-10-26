import { applyOp } from "./ops";
import { buildDoorAlertPush, cleanAlertNote, type DoorAlertReason } from "../../shared/doorAlert";

/** Deja constancia en el ledger de un aviso urgente de la puerta (como `note`, igual que el deshacer: sin migración) y arma
 * la notificación. Reenviar el mismo opId no duplica el registro; el envío del push lo decide quien llama. */
export async function recordDoorAlert(
  db: any,
  params: { opId: string; eventId: number; operatorId: number; operatorName: string; reason: DoorAlertReason; note?: string | null; ticketCode?: string | null; buyerName?: string | null; clientAt: Date }
) {
  const note = cleanAlertNote(params.note);
  const code = params.ticketCode?.trim().toUpperCase() || null;
  await applyOp(
    db,
    {
      id: params.opId, type: "note", eventId: params.eventId, operatorId: params.operatorId,
      targetType: "ticket", targetId: code ?? "puerta",
      payload: { kind: "door_alert", reason: params.reason, note: note || null, ticketCode: code, buyerName: params.buyerName ?? null },
      clientAt: params.clientAt,
    },
    async () => ({ result: "applied" as const })
  );
  return buildDoorAlertPush({ reason: params.reason, note, operatorName: params.operatorName, ticketCode: code, buyerName: params.buyerName });
}
