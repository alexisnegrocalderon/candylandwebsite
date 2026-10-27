import { describe, expect, it } from "vitest";
import { buildDosierPdf, colorDe } from "./dosierPdf";

describe("dosier PDF", () => {
  it("arma un PDF con portada, guía, fichas y resumen", async () => {
    const pdf = await buildDosierPdf({
      eventTitle: "Fiesta de prueba", emittedAt: new Date("2026-10-30T23:00:00Z"),
      tragos: [
        { name: "Piscolón", section: "Pisco", glass: "vaso", glassLabel: "Vaso", glassMl: 500, lineas: [{ name: "Pisco", unit: "ml", amount: 90, texto: "3 jiggers · 90 ml" }], opciones: [{ label: "Con", choices: ["Coca Cola", "Sprite"], ml: 200 }], extras: ["Hielo en cubos"], pasos: ["Llenar el vaso con hielo."], foto: null },
        { name: "Tropical Gin XL", section: "Gin", glass: "copa_xl", glassLabel: "Copa XL", glassMl: 600, lineas: [{ name: "Gin", unit: "ml", amount: 120, texto: "4 jiggers" }, { name: "Red Bull (lata)", unit: "un", amount: 1, texto: "1 unidad" }], opciones: [], extras: ["Borde de Tajín"], pasos: [], foto: null },
        { name: "Shot", section: "Shots", glass: "shot", glassLabel: "Shot", glassMl: 30, lineas: [{ name: "Tequila", unit: "ml", amount: 30, texto: "1 jigger" }], opciones: [], extras: [], pasos: ["Servir."], foto: null },
      ],
      talCual: [{ name: "Peroni", section: "Cerveza" }],
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // Sin fotos, el PDF queda liviano (bajo el tope de respuesta de Vercel).
    expect(pdf.length).toBeLessThan(1_500_000);
  });
  it("cada ingrediente tiene su color", () => {
    expect(colorDe("Coca Cola")).not.toBe(colorDe("Sprite"));
    expect(colorDe("Aperol")).toBe("#F26A21");
  });
});
