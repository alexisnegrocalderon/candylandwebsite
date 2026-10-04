import { afterEach, describe, expect, it, vi } from "vitest";
import { listDriveMedia, parseDriveFolderId } from "./googleDrive";

describe("parseDriveFolderId", () => {
  const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  it("lee el id de un link de carpeta", () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${id}?usp=sharing`)).toBe(id);
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${id}`)).toBe(id);
  });
  it("lee el id del formato ?id=", () => {
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${id}`)).toBe(id);
  });
  it("acepta el id pelado y rechaza lo que no es de Drive", () => {
    expect(parseDriveFolderId(id)).toBe(id);
    expect(parseDriveFolderId("https://instagram.com/mansionplayroom")).toBeNull();
    expect(parseDriveFolderId("  ")).toBeNull();
  });
});

describe("listDriveMedia", () => {
  const folder = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  afterEach(() => vi.unstubAllGlobals());

  it("falla con un mensaje claro si falta la API key", async () => {
    await expect(listDriveMedia(folder, "")).rejects.toThrow("GOOGLE_API_KEY");
  });

  it("devuelve archivos con miniatura y link de descarga", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ files: [{ id: "f1", name: "decoracion.jpg", mimeType: "image/jpeg" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const files = await listDriveMedia(folder, "KEY");
    expect(files).toEqual([{
      id: "f1", name: "decoracion.jpg", mimeType: "image/jpeg",
      thumbUrl: "https://drive.google.com/thumbnail?id=f1&sz=w600",
      downloadUrl: "https://drive.google.com/uc?export=download&id=f1",
    }]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("key=KEY");
    expect(decodeURIComponent(url.replace(/\+/g, ' '))).toContain("'1AbCdEfGhIjKlMnOpQrStUvWxYz012345' in parents");
  });

  it("explica cómo compartir la carpeta cuando Drive responde 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
    await expect(listDriveMedia(folder, "KEY")).rejects.toThrow("Cualquier persona con el enlace");
  });

  it("avisa si la carpeta no tiene fotos ni videos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ files: [] }) }));
    await expect(listDriveMedia(folder, "KEY")).rejects.toThrow("no tiene fotos");
  });
});
