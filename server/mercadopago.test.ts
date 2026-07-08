import { describe, expect, it } from "vitest";

describe("Mercado Pago Integration", () => {
  it("should have MERCADOPAGO_ACCESS_TOKEN configured", () => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    expect(token).toBeDefined();
    expect(token).not.toBe("");
    expect(token!.length).toBeGreaterThan(10);
  });

  it("should be able to reach Mercado Pago API", async () => {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token || token === "test_placeholder") {
      // Skip if no real token
      return;
    }
    
    const response = await fetch("https://api.mercadopago.com/v1/payment_methods", {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Even with invalid token, we should get a response (401 or 200)
    expect([200, 401, 403]).toContain(response.status);
  });
});
