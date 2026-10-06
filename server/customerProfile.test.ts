import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
const { validateCustomerEdit, fieldsToLock } = await import("./customerProfile");

const now = new Date("2026-10-06T12:00:00Z");

describe("validateCustomerEdit", () => {
  it("normaliza lo que escribe el dueño", () => {
    const { patch, errors } = validateCustomerEdit({
      fullName: "  Camila Rojas ", phone: "+56 9 1234 5678", instagram: "@camila.ok", birthDate: "15/03/1995",
      gender: "mujer", city: " Viña del Mar ", source: "instagram", ambassadorCode: "sofia", rut: "12.345.678-5", levelOverride: "vip",
    }, now);
    expect(errors).toEqual({});
    expect(patch).toMatchObject({
      fullName: "Camila Rojas", phone: "+56912345678", instagram: "camila.ok", birthDate: "1995-03-15", gender: "mujer",
      city: "Viña del Mar", source: "instagram", ambassadorCode: "SOFIA", levelOverride: "vip",
    });
  });

  it("los campos ausentes no se tocan y los vacíos se borran", () => {
    const { patch } = validateCustomerEdit({ city: "", notes: "  " }, now);
    expect(patch).toEqual({ city: null, notes: null });
    expect("phone" in patch).toBe(false);
  });

  it("junta todos los errores en vez de fallar en el primero", () => {
    const { errors } = validateCustomerEdit({ phone: "123", birthDate: "31/02/1990", gender: "x", source: "marte", levelOverride: "dios", ambassadorCode: "no valido!", rut: "1-2" }, now);
    expect(Object.keys(errors).sort()).toEqual(["ambassadorCode", "birthDate", "gender", "levelOverride", "phone", "rut", "source"]);
  });

  it("los permisos de contacto viajan como 0/1", () => {
    expect(validateCustomerEdit({ emailOptOut: true, whatsappOptOut: false }, now).patch).toEqual({ emailOptOut: 1, whatsappOptOut: 0 });
  });
});

describe("fieldsToLock", () => {
  it("solo protege los datos que las compras suelen pisar, y solo los tocados", () => {
    expect(fieldsToLock({ fullName: "A", city: "B", emailOptOut: 1 })).toEqual(["fullName"]);
    expect(fieldsToLock({ phone: null, instagram: "x" })).toEqual(["phone", "instagram"]);
    expect(fieldsToLock({ notes: "n", birthDate: "03-15" })).toEqual([]);
  });
});
