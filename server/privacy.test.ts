import { describe, it, expect } from "vitest";
import { maskPii } from "./privacy";

/* El enmascarado es lo único que separa a un cliente potencial mirando la
 * demo de los datos personales de los clientes reales. Si esto se rompe, se
 * rompe en silencio -- de ahí que se teste el criterio, no solo el formato. */

describe("maskPii", () => {
  it("enmascara email, teléfono y RUT", () => {
    const out = maskPii({ email: "alexis@gmail.com", phone: "+56912345678", rut: "12.345.678-9" });
    expect(out.email).toBe("a***@gmail.com");
    expect(out.email).not.toContain("alexis");
    expect(out.phone).not.toContain("1234");
    expect(out.rut).toBe("**.***.***-*");
  });

  it("cubre las variantes con prefijo del schema (buyerEmail, customerEmail…)", () => {
    const out = maskPii({ buyerEmail: "a@b.cl", customerEmail: "c@d.cl", buyerPhone: "+56999998888" });
    expect(out.buyerEmail).not.toContain("a@b.cl");
    expect(out.customerEmail).not.toContain("c@d.cl");
    expect(out.buyerPhone).not.toContain("9999");
  });

  it("enmascara el nombre cuando la fila ES de una persona", () => {
    const out = maskPii({ name: "Maria Jose Perez", email: "mj@x.cl" });
    expect(out.name).toBe("M. J. P.");
  });

  it("NO toca el nombre de un producto (misma clave `name`, fila sin email)", () => {
    const out = maskPii([{ name: "HandRoll XL", unitsSold: 10, revenue: 80000 }]);
    expect(out[0].name).toBe("HandRoll XL");
    expect(out[0].revenue).toBe(80000);
  });

  it("deja intactas las cifras de plata, que son el punto de la demo", () => {
    const out = maskPii({ buyerEmail: "a@b.cl", totalAmount: 45000, marginPercent: 32 });
    expect(out.totalAmount).toBe(45000);
    expect(out.marginPercent).toBe(32);
  });

  it("no destruye las fechas al recorrer el objeto", () => {
    const d = new Date("2026-01-01T00:00:00Z");
    expect(maskPii({ createdAt: d }).createdAt).toBeInstanceOf(Date);
  });

  it("baja recursivamente por arrays y objetos anidados", () => {
    const out = maskPii({ orders: [{ buyerEmail: "x@y.cl", items: [{ name: "Pizza" }] }] });
    expect(out.orders[0].buyerEmail).not.toContain("x@y.cl");
    expect(out.orders[0].items[0].name).toBe("Pizza");
  });

  it("tolera null, undefined y strings vacíos sin romperse", () => {
    expect(maskPii(null)).toBeNull();
    expect(maskPii({ email: null, phone: "" })).toEqual({ email: null, phone: "" });
  });
});
