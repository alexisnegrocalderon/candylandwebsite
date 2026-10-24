import { afterEach, describe, expect, it, vi } from "vitest";
import { ENV } from "./_core/env";
import { requireCronSecret } from "./cronRoutes";

const res = () => {
  const r: any = { statusCode: 200, body: null };
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  r.json = vi.fn((b: unknown) => { r.body = b; return r; });
  return r;
};
const req = (auth?: string) => ({ headers: auth ? { authorization: auth } : {} }) as any;

describe("autenticación de los crons", () => {
  const original = { ...ENV };
  afterEach(() => { Object.assign(ENV, original); });

  it("sin CRON_SECRET en producción se rechaza", () => {
    Object.assign(ENV, { cronSecret: "", isProduction: true });
    const r = res();
    expect(requireCronSecret(req(), r)).toBe(false);
    expect(r.statusCode).toBe(503);
  });

  it("sin CRON_SECRET en desarrollo se deja pasar", () => {
    Object.assign(ENV, { cronSecret: "", isProduction: false });
    expect(requireCronSecret(req(), res())).toBe(true);
  });

  it("con CRON_SECRET exige el Bearer correcto", () => {
    Object.assign(ENV, { cronSecret: "s3cret", isProduction: true });
    const bad = res();
    expect(requireCronSecret(req("Bearer otro"), bad)).toBe(false);
    expect(bad.statusCode).toBe(401);
    expect(requireCronSecret(req("Bearer s3cret"), res())).toBe(true);
  });
});
