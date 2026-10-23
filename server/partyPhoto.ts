import type { Express, Request, Response } from "express";
import * as db from "./db";
import { MAX_PARTY_PHOTOS, canPreRegister, partyEntryDenial } from "../shared/party";

/* Sirve las fotos de Playmatch (hasta 3 por perfil: `/api/party/photo/:profileId/:position`, sin
 * posición = la principal). Es una ruta Express cruda (no tRPC) porque responde bytes de imagen, y
 * NO una URL pública de Vercel Blob a propósito: cada pedido revalida que quien mira siga adentro
 * de la fiesta (entrada escaneada + ventana abierta), que no esté expulsado y que cumpla las
 * reglas de `getPartyPhotoForViewer`. Única excepción: cada uno ve SUS fotos desde la inscripción
 * anticipada (para armar su perfil antes de llegar); las de otros, nunca antes de entrar.
 *
 * El ticketCode viaja en el header `x-ticket-code`, no en la URL, para que no
 * quede en logs ni en el historial. Todo rechazo es un 404 igual: no se
 * distingue "no existe" de "no puedes verla". */
export function registerPartyPhotoRoutes(app: Express) {
  const handler = async (req: Request, res: Response) => {
    const notFound = () => res.status(404).set("Cache-Control", "no-store").end();

    const ticketCode = String(req.header("x-ticket-code") ?? "").trim();
    const targetId = Number(req.params.profileId);
    const position = req.params.position === undefined ? 0 : Number(req.params.position);
    if (!ticketCode || !Number.isInteger(targetId) || targetId <= 0) return notFound();
    if (!Number.isInteger(position) || position < 0 || position >= MAX_PARTY_PHOTOS) return notFound();

    try {
      const actor = await db.getPartyActor(ticketCode);
      if (!actor?.profile || actor.profile.banned) return notFound();
      const now = new Date();
      const inside = !partyEntryDenial(actor.ticket, actor.event, now);
      const ownBeforeParty = actor.profile.id === targetId && canPreRegister(actor.ticket, actor.event, now);
      if (!inside && !ownBeforeParty) return notFound();

      const photo = await db.getPartyPhotoForViewer(actor.profile, targetId, position);
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
  };
  app.get("/api/party/photo/:profileId", handler);
  app.get("/api/party/photo/:profileId/:position", handler);
}
