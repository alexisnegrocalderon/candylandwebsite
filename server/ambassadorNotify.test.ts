import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));
vi.mock("./customerPush", () => ({ pushToEmail: vi.fn() }));
vi.mock("./contentStudio", () => ({ getContentDesign: vi.fn(), readVideoRender: vi.fn() }));
import * as db from "./db";
import { pushToEmail } from "./customerPush";
import { notifyAmbassadorsNewContent } from "./ambassadorContent";

function fakeDb(rows: unknown[]) {
  return { select: () => ({ from: () => ({ where: () => Promise.resolve(rows) }) }) };
}

describe("aviso de contenido nuevo a embajadoras", () => {
  beforeEach(() => { vi.mocked(pushToEmail).mockReset(); });

  it("avisa a cada embajadora activa con correo y cuenta los envíos", async () => {
    vi.mocked(db.getDb).mockResolvedValue(fakeDb([{ email: "sofi@x.cl" }, { email: null }, { email: "cami@x.cl" }]) as any);
    vi.mocked(pushToEmail).mockResolvedValue(1);
    const sent = await notifyAmbassadorsNewContent(3);
    expect(sent).toBe(2);
    expect(pushToEmail).toHaveBeenCalledTimes(2);
    const payload = vi.mocked(pushToEmail).mock.calls[0][1];
    expect(payload.title).toContain("contenido nuevo");
    expect(payload.body).toContain("3 piezas nuevas");
    expect(payload.url).toBe("/cuenta?tab=embajador");
  });

  it("con una sola pieza habla en singular y sin piezas no avisa", async () => {
    vi.mocked(db.getDb).mockResolvedValue(fakeDb([{ email: "sofi@x.cl" }]) as any);
    vi.mocked(pushToEmail).mockResolvedValue(1);
    await notifyAmbassadorsNewContent(1);
    expect(vi.mocked(pushToEmail).mock.calls[0][1].body).toContain("una pieza nueva");
    vi.mocked(pushToEmail).mockClear();
    expect(await notifyAmbassadorsNewContent(0)).toBe(0);
    expect(pushToEmail).not.toHaveBeenCalled();
  });

  it("un aviso que falla no frena a las demás", async () => {
    vi.mocked(db.getDb).mockResolvedValue(fakeDb([{ email: "a@x.cl" }, { email: "b@x.cl" }]) as any);
    vi.mocked(pushToEmail).mockRejectedValueOnce(new Error("push caído")).mockResolvedValueOnce(1);
    expect(await notifyAmbassadorsNewContent(2)).toBe(1);
  });
});
