import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn(), extractContent: vi.fn() }));
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, getDb: vi.fn(), getFeaturedEvent: vi.fn().mockResolvedValue({ title: "2º Aniversario", eventDate: new Date(Date.now() + 10 * 86_400_000), shortDescription: "Disfraz obligatorio" }) };
});

import { invokeLLM } from "./_core/llm";
import { generateWeeklyMaterial } from "./ambassadorProgram";
import { buildAmbassadorWeeklyEmail } from "./email";

const llm = vi.mocked(invokeLLM);
const respuesta = (obj: unknown) => llm.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(obj) } }] } as any);

const base = {
  title: "Semana 1 — ya viene",
  storiesText: "Sube la foto de la decoración y pon el sticker de cuenta regresiva.",
  reelText: "Sube el video de la pista con la frase: ya falta poco.",
  postText: "2 años de la Mansión 🔥 Yo ya voy, entra con mi código.",
  countdownText: "Faltan 10 días",
};

describe("generateWeeklyMaterial", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pasa los archivos del Drive a la IA y conserva solo ids que existen", async () => {
    respuesta({ ...base, imageIds: ["a1", "inventado", "b2"] });
    const out = await generateWeeklyMaterial("megaevento", [
      { id: "a1", name: "decoracion.jpg" }, { id: "b2", name: "pista.mp4" },
    ]);
    expect(out.imageIds).toEqual(["a1", "b2"]);
    const userMsg = llm.mock.calls[0][0].messages[1].content as string;
    expect(userMsg).toContain("a1 | decoracion.jpg");
    expect(userMsg).toContain("b2 | pista.mp4");
  });

  it("sin Drive no manda lista de archivos y devuelve imageIds vacío", async () => {
    respuesta({ ...base, imageIds: [] });
    const out = await generateWeeklyMaterial("megaevento");
    expect(out.imageIds).toEqual([]);
    expect(llm.mock.calls[0][0].messages[1].content as string).not.toContain("Archivos disponibles");
  });

  it("el prompt pide pasos simples y prohíbe la jerga", async () => {
    respuesta({ ...base, imageIds: [] });
    await generateWeeklyMaterial("x idea");
    const system = llm.mock.calls[0][0].messages[0].content as string;
    expect(system).toContain("NO creadores de contenido");
    expect(system).toContain("PROHIBIDO");
  });

  it("rechaza un material que se pasa del largo corto", async () => {
    respuesta({ ...base, storiesText: "x".repeat(200), imageIds: [] });
    await expect(generateWeeklyMaterial("idea larga")).rejects.toThrow("formato esperado");
  });
});

describe("buildAmbassadorWeeklyEmail — material para compartir", () => {
  const data = {
    name: "Camila", code: "CAMI", eventTitle: "2do Aniversario", eventSales: 1, eventExistingSales: 0, eventCommission: 1000,
    totalCommission: 5000, currentPercent: 30, nextTarget: null, benefitItems: [], benefitBonusClp: 0,
    exclusiveClientsCount: 1, panelUrl: "https://x.cl/embajador/CAMI",
  };

  it("muestra los pasos numerados y una galería descargable con el link a la carpeta", () => {
    const html = buildAmbassadorWeeklyEmail({
      ...data,
      material: {
        ...base,
        driveFolderUrl: "https://drive.google.com/drive/folders/FOLDER",
        images: [{ id: "a1", name: "decoracion.jpg", mimeType: "image/jpeg" }, { id: "b2", name: "pista.mp4", mimeType: "video/mp4" }],
      },
    });
    expect(html).toContain("1 · Historia");
    expect(html).toContain("2 · Reel o foto");
    expect(html).toContain("3 · Publicación");
    expect(html).toContain("https://drive.google.com/thumbnail?id=a1");
    expect(html).toContain("https://drive.google.com/uc?export=download&id=b2");
    expect(html).toContain("Descargar foto");
    expect(html).toContain("Descargar video");
    expect(html).toContain("https://drive.google.com/drive/folders/FOLDER");
  });

  it("sin imágenes el correo queda sin galería", () => {
    const html = buildAmbassadorWeeklyEmail({ ...data, material: { ...base, images: [] } });
    expect(html).not.toContain("Material para compartir");
  });
});
