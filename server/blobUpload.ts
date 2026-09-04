import type { Express, Request, Response } from "express";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "./adminRoutes";

/* Subida de flyers/imagen OG a Vercel Blob (pedido explícito del dueño,
 * 02-03/09) -- el navegador sube directo al storage, sin pasar el archivo
 * por esta función serverless. Vercel Hobby tiene un tope de ~4,5MB en el
 * body de una función tradicional (sin importar el express.json({limit})
 * que ya existe en _core/app.ts) -- pasar el archivo A TRAVÉS de esta ruta
 * sería mal camino para fotos de celular, que fácil superan eso.
 *
 * Esta ruta NO es tRPC a propósito: `handleUpload` tiene su propio formato
 * de request/response (protocolo de @vercel/blob/client), no un RPC
 * normal -- mismo criterio que las demás rutas Express crudas de
 * server/adminRoutes.ts (export/import CSV), reusando su mismo
 * `requireAdmin`. */

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Video no tiene UI todavía (fuera de alcance este round -- ver plan),
  // pero se deja permitido para no tener que tocar esta ruta de nuevo
  // cuando se agregue subir el video del Hero.
  "video/mp4",
];

// Generoso para fotos de celular sin editar (a veces 8-10MB), sin invitar
// a subir archivos gigantes -- el body nunca pasa por nuestra función de
// todos modos, así que esto es solo un tope de buen criterio, no una
// limitación técnica de Vercel.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export function registerBlobUploadRoutes(app: Express) {
  app.post("/api/admin/blob/upload", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const jsonResponse = await handleUpload({
        body: req.body as HandleUploadBody,
        request: req,
        onBeforeGenerateToken: async () => {
          // requireAdmin ya corrió arriba -- acá solo se fijan las
          // restricciones del token en sí.
          return {
            allowedContentTypes: ALLOWED_CONTENT_TYPES,
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: true,
          };
        },
        onUploadCompleted: async () => {
          // No hace falta nada acá: el cliente recibe la URL final del
          // upload() y la escribe él mismo en el campo del form (imageUrl/
          // ogImageUrl) -- el "Guardar" de siempre la persiste, igual que
          // hoy con una URL pegada a mano. Este callback solo lo dispara
          // la infraestructura real de Vercel (nunca en localhost), se deja
          // como no-op documentado porque `handleUpload` lo exige.
        },
      });

      res.json(jsonResponse);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "No se pudo autorizar la subida." });
    }
  });
}
