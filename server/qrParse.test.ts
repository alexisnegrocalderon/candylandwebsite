import { describe, expect, it } from "vitest";
import { parseTicketCodeFromQr } from "../shared/qr";

const CODE = "MP-A1B2C3D4E5F6";

describe("parseTicketCodeFromQr", () => {
  it("lee la URL que realmente trae el QR", () => {
    expect(parseTicketCodeFromQr(`https://mansionplayroom.cl/verificar/${CODE}`)).toBe(CODE);
  });

  it("tolera la barra final", () => {
    expect(parseTicketCodeFromQr(`https://mansionplayroom.cl/verificar/${CODE}/`)).toBe(CODE);
  });

  it("funciona con otros dominios: preview de Vercel y desarrollo local", () => {
    expect(parseTicketCodeFromQr(`https://candylandwebsite.vercel.app/verificar/${CODE}`)).toBe(CODE);
    expect(parseTicketCodeFromQr(`http://localhost:5173/verificar/${CODE}`)).toBe(CODE);
  });

  it("ignora parámetros de seguimiento que algún lector pueda agregar", () => {
    expect(parseTicketCodeFromQr(`https://mansionplayroom.cl/verificar/${CODE}?utm_source=qr`)).toBe(CODE);
    expect(parseTicketCodeFromQr(`https://mansionplayroom.cl/verificar/${CODE}#top`)).toBe(CODE);
  });

  it("normaliza a mayúsculas", () => {
    expect(parseTicketCodeFromQr(`https://mansionplayroom.cl/verificar/${CODE.toLowerCase()}`)).toBe(CODE);
  });

  it("acepta el código tecleado a mano, sin URL", () => {
    expect(parseTicketCodeFromQr(CODE)).toBe(CODE);
    expect(parseTicketCodeFromQr(`  ${CODE.toLowerCase()}  `)).toBe(CODE);
  });

  it("rechaza un QR que no es de una entrada", () => {
    expect(parseTicketCodeFromQr("https://www.instagram.com/mansionplayroom")).toBeNull();
    expect(parseTicketCodeFromQr("https://mansionplayroom.cl/eventos/candyland")).toBeNull();
    expect(parseTicketCodeFromQr("WIFI:S:Candyland;T:WPA;P:clave;;")).toBeNull();
  });

  it("rechaza basura y vacío", () => {
    expect(parseTicketCodeFromQr("")).toBeNull();
    expect(parseTicketCodeFromQr("   ")).toBeNull();
    expect(parseTicketCodeFromQr("hola")).toBeNull();
    expect(parseTicketCodeFromQr("ab")).toBeNull();
  });

  it("rechaza una URL de /verificar con el código vacío", () => {
    expect(parseTicketCodeFromQr("https://mansionplayroom.cl/verificar/")).toBeNull();
  });

  it("no se deja engañar por caracteres raros en el código", () => {
    expect(parseTicketCodeFromQr("https://mansionplayroom.cl/verificar/MP-<script>")).toBeNull();
    expect(parseTicketCodeFromQr("https://mansionplayroom.cl/verificar/MP A1B2")).toBeNull();
  });
});
