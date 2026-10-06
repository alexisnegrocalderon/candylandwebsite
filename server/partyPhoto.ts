import type { Express, Request, Response } from "express";
import * as db from "./db";
import { partyEntryDenial } from "../shared/party";

/* Sirve la foto de swipe de Playmatch. Es una ruta Express cruda (no tRPC)
 * porque responde bytes de imagen, y NO una URL pública de Vercel Blob a
 * propósito: cada pedido revalida que quien mira siga adentro de la fiesta
 * (entrada escaneada + ventana abierta), que no esté expulsado y que cumpla
 * las reglas de `getPartyPhotoForViewer`.
 *
 * El ticketCode viaja en el header `x-ticket-code`, no en la URL, para que no
 * quede en logs ni en el historial. Todo rechazo es un 404 igual: no se
 * distingue "no existe" de "no puedes verla". */
export function registerPartyPhotoRoutes(app: Express) {
  app.get("/api/party/photo/:profileId", async (req: Request, res: Response) => {
    const notFound = () => res.status(404).set("Cache-Control", "no-store").end();

    const ticketCode = String(req.header("x-ticket-code") ?? "").trim();
    const targetId = Number(req.params.profileId);
    if (!ticketCode || !Number.isInteger(targetId) || targetId <= 0) return notFound();

    try {
      const actor = await db.getPartyActor(ticketCode);
      if (!actor?.profile || actor.profile.banned) return notFound();
      if (partyEntryDenial(actor.ticket, actor.event, new Date())) return notFound();

      const photo = await db.getPartyPhotoForViewer(actor.profile, targetId);
      if (!photo) return notFound();

      res.status(200)
        .set({
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-store, private",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline",
        })
        .end(photo);
    } catch (err) {
      console.error("[PartyPhoto] Error sirviendo foto:", err);
      notFound();
    }
  });
}
