/* Lectura de una carpeta pública de Google Drive para el "Material de esta
 * semana" de los embajadores (server/ambassadorProgram.ts). Sin dependencias
 * nuevas: la API de Drive v3 se llama con `fetch` y una API key (variable
 * `GOOGLE_API_KEY`). Solo funciona con carpetas compartidas como "cualquier
 * persona con el enlace" -- la API key no tiene identidad de usuario. */

export type DriveMedia = {
  id: string;
  name: string;
  mimeType: string;
};

export type DriveMediaWithUrls = DriveMedia & { thumbUrl: string; downloadUrl: string };

/** Miniatura pública (la que usa Drive en sus propias vistas previas). */
export const driveThumbUrl = (id: string, width = 600) =>
  `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${width}`;
/** Descarga directa del archivo original. */
export const driveDownloadUrl = (id: string) =>
  `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;

/** Saca el id de la carpeta de los dos formatos de link que existen:
 * `drive.google.com/drive/folders/<id>?...` y `drive.google.com/open?id=<id>`.
 * También acepta el id pelado. `null` si no parece un link de Drive. */
export function parseDriveFolderId(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const folder = text.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  if (folder) return folder[1];
  const param = text.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (param) return param[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(text)) return text;
  return null;
}

export function withUrls(files: DriveMedia[]): DriveMediaWithUrls[] {
  return files.map((f) => ({ ...f, thumbUrl: driveThumbUrl(f.id), downloadUrl: driveDownloadUrl(f.id) }));
}

/** Lista fotos y videos de la carpeta (más nuevos primero). Lanza errores en
 * español pensados para mostrarse tal cual en el admin. */
export async function listDriveMedia(folderUrlOrId: string, apiKey: string | undefined = process.env.GOOGLE_API_KEY): Promise<DriveMediaWithUrls[]> {
  if (!apiKey) {
    throw new Error('Falta configurar GOOGLE_API_KEY en Vercel para leer la carpeta de Drive.');
  }
  const folderId = parseDriveFolderId(folderUrlOrId);
  if (!folderId) throw new Error('El link no parece ser una carpeta de Google Drive.');

  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')`,
    fields: 'files(id,name,mimeType)',
    orderBy: 'createdTime desc',
    pageSize: '50',
    key: apiKey,
  });

  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`);
  } catch {
    throw new Error('No se pudo conectar con Google Drive. Intenta de nuevo en un momento.');
  }
  if (res.status === 403 || res.status === 404) {
    throw new Error('No se puede leer la carpeta. Compártela como "Cualquier persona con el enlace" (Lector) y revisa que la API key tenga habilitada la Google Drive API.');
  }
  if (!res.ok) throw new Error(`Google Drive respondió con un error (${res.status}).`);

  const body = (await res.json()) as { files?: DriveMedia[] };
  const files = (body.files ?? []).filter((f) => f?.id && f?.name);
  if (files.length === 0) throw new Error('La carpeta no tiene fotos ni videos.');
  return withUrls(files);
}
