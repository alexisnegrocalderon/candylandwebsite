import type { Express, Request, Response } from "express";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireAdmin } from "./adminRoutes";
import { sdk } from "./_core/sdk";

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
  // Fondos de escena en los videos del Estudio (y el video del Hero).
  "video/mp4",
  "video/webm",
  // Videos del iPhone (.mov) para el contenido de los embajadores.
  "video/quicktime",
  // Música de los videos del Estudio.
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
];

// Generoso para fotos de celular sin editar (a veces 8-10MB) y clips cortos
// de video para el Estudio, sin invitar a subir archivos gigantes -- el body
// nunca pasa por nuestra función de todos modos, así que esto es solo un
// tope de buen criterio, no una limitación técnica de Vercel.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** El SDK solo lee BLOB_READ_WRITE_TOKEN. Al reconectar el store en Vercel, el token quedó
 * con otro nombre (NEW_BLOB_READ_WRITE_TOKEN), así que se acepta cualquiera de los dos. */
const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN || process.env.NEW_BLOB_READ_WRITE_TOKEN;

export function registerBlobUploadRoutes(app: Express) {
  app.post("/api/admin/blob/upload", async (req: Request, res: Response) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const jsonResponse = await handleUpload({
        body: req.body as HandleUploadBody,
        request: req,
        token: blobToken(),
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

  // Boletas de gastos de una co-producción: la puede usar el socio (rol
  // `partner`) además del dueño. Solo imágenes y solo bajo `coproduction/`,
  // así el socio no puede pisar ni subir nada fuera de su carpeta.
  app.post("/api/partner/blob/upload", async (req: Request, res: Response) => {
    let role: string | null = null;
    try { role = (await sdk.authenticateRequest(req)).role; } catch { /* sin sesión */ }
    if (role !== "admin" && role !== "partner") {
      res.status(403).json({ error: "Acceso no permitido" });
      return;
    }
    try {
      const jsonResponse = await handleUpload({
        body: req.body as HandleUploadBody,
        request: req,
        token: blobToken(),
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith("coproduction/")) throw new Error("Ruta de subida no permitida.");
          return {
            allowedContentTypes: ALLOWED_CONTENT_TYPES.filter((t) => t.startsWith("image/")),
            maximumSizeInBytes: MAX_UPLOAD_BYTES,
            addRandomSuffix: true,
          };
        },
        onUploadCompleted: async () => { /* ver arriba: el cliente guarda la URL */ },
      });
      res.json(jsonResponse);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "No se pudo autorizar la subida." });
    }
  });
}
