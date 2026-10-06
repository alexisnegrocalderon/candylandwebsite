import { describe, expect, it } from "vitest";
import {
  MAX_TEST_GUESTS, MIN_TEST_GUESTS, PLAYMATCH_TEST_SLUG,
  clampTestGuestCount, isTestTicketCode, testEventWindow, testTicketCode,
} from "../shared/playmatchTest";
import { parseTicketCodeFromQr } from "../shared/qr";
import { isPartyWindowOpen } from "../shared/party";

describe("playmatchTest", () => {
  it("genera códigos que el lector de QR acepta y que no se confunden con entradas reales", () => {
    expect(testTicketCode(1)).toBe("MP-TEST-0001");
    expect(testTicketCode(10)).toBe("MP-TEST-0010");
    expect(parseTicketCodeFromQr(`https://x.cl/verificar/${testTicketCode(3)}`)).toBe("MP-TEST-0003");
  });

  it("solo reconoce como de prueba el formato exacto", () => {
    expect(isTestTicketCode("MP-TEST-0001")).toBe(true);
    expect(isTestTicketCode(" mp-test-0007 ")).toBe(true);
    expect(isTestTicketCode("MP-ABC123456789")).toBe(false);
    expect(isTestTicketCode("MP-TEST-1")).toBe(false);
    expect(isTestTicketCode("MP-TEST-0001; DROP")).toBe(false);
  });

  it("acota la cantidad de invitados", () => {
    expect(clampTestGuestCount(0)).toBe(MIN_TEST_GUESTS);
    expect(clampTestGuestCount(99)).toBe(MAX_TEST_GUESTS);
    expect(clampTestGuestCount(Number.NaN)).toBe(MIN_TEST_GUESTS);
    expect(clampTestGuestCount(4.4)).toBe(4);
  });

  it("la ventana de prueba está abierta ahora y aguanta desfases de zona horaria", () => {
    const now = new Date();
    const w = testEventWindow(now);
    expect(isPartyWindowOpen(w, now)).toBe(true);
    expect(isPartyWindowOpen(w, new Date(now.getTime() + 14 * 3600e3))).toBe(true);
    expect(isPartyWindowOpen(w, new Date(now.getTime() - 14 * 3600e3))).toBe(true);
  });

  it("el slug es fijo", () => {
    expect(PLAYMATCH_TEST_SLUG).toBe("playmatch-test");
  });
});
