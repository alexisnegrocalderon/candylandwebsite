import { describe, expect, it } from "vitest";
import {
  GIFT_INVITE_TTL_MS,
  MAX_GIFT_MESSAGE_LENGTH,
  canPayGift,
  canRespondToGift,
  giftExpiresAt,
  isGiftClaimable,
  isGiftExpired,
  sanitizeGiftMessage,
  visibleGiftStatus,
  type GiftStatus,
} from "../shared/party";

const NOW = new Date("2026-08-02T02:00:00Z");
const ALIVE = new Date(NOW.getTime() + 5 * 60_000);   // vence en 5 minutos
const DEAD = new Date(NOW.getTime() - 60_000);        // venció hace un minuto

const EL_REY = 1;
const LA_REINA = 2;

function gift(status: GiftStatus, expiresAt: Date | null = ALIVE) {
  return { status, fromProfileId: EL_REY, toProfileId: LA_REINA, expiresAt };
}

describe("giftExpiresAt", () => {
  it("una invitación dura 15 minutos", () => {
    expect(giftExpiresAt(NOW).getTime() - NOW.getTime()).toBe(GIFT_INVITE_TTL_MS);
  });
});

describe("canRespondToGift", () => {
  it("el destinatario puede aceptar o rechazar una invitación viva", () => {
    expect(canRespondToGift(gift("invited"), LA_REINA, NOW)).toBe(true);
  });

  it("el que invitó no puede responderse a sí mismo", () => {
    expect(canRespondToGift(gift("invited"), EL_REY, NOW)).toBe(false);
  });

  it("un tercero no puede responder una invitación ajena", () => {
    expect(canRespondToGift(gift("invited"), 99, NOW)).toBe(false);
  });

  it("no se puede responder dos veces", () => {
    expect(canRespondToGift(gift("accepted"), LA_REINA, NOW)).toBe(false);
    expect(canRespondToGift(gift("declined"), LA_REINA, NOW)).toBe(false);
  });

  it("no se puede responder una invitación vencida", () => {
    expect(canRespondToGift(gift("invited", DEAD), LA_REINA, NOW)).toBe(false);
  });
});

describe("canPayGift", () => {
  it("el que invitó paga recién cuando le dijeron que sí", () => {
    expect(canPayGift(gift("accepted"), EL_REY, NOW)).toBe(true);
  });

  it("NO se puede pagar antes de que la otra persona responda", () => {
    expect(canPayGift(gift("invited"), EL_REY, NOW)).toBe(false);
  });

  it("no se paga un trago que fue rechazado", () => {
    expect(canPayGift(gift("declined"), EL_REY, NOW)).toBe(false);
  });

  it("el destinatario no paga su propio regalo", () => {
    expect(canPayGift(gift("accepted"), LA_REINA, NOW)).toBe(false);
  });

  it("no se puede pagar una invitación vencida", () => {
    expect(canPayGift(gift("accepted", DEAD), EL_REY, NOW)).toBe(false);
  });

  it("no se paga dos veces", () => {
    expect(canPayGift(gift("paid"), EL_REY, NOW)).toBe(false);
    expect(canPayGift(gift("redeemed"), EL_REY, NOW)).toBe(false);
  });
});

describe("isGiftExpired", () => {
  it("un regalo ya pagado NO vence: sigue válido para el próximo evento", () => {
    const muyViejo = new Date(NOW.getTime() - 90 * 24 * 60 * 60_000);
    expect(isGiftExpired({ status: "paid", expiresAt: muyViejo }, NOW)).toBe(false);
    expect(isGiftExpired({ status: "redeemed", expiresAt: muyViejo }, NOW)).toBe(false);
  });

  it("una invitación sin responder sí vence", () => {
    expect(isGiftExpired({ status: "invited", expiresAt: DEAD }, NOW)).toBe(true);
    expect(isGiftExpired({ status: "invited", expiresAt: ALIVE }, NOW)).toBe(false);
  });

  it("una aceptada que nadie pagó también vence", () => {
    expect(isGiftExpired({ status: "accepted", expiresAt: DEAD }, NOW)).toBe(true);
  });
});

describe("isGiftClaimable", () => {
  it("solo se cobra en la barra un regalo pagado", () => {
    expect(isGiftClaimable({ status: "paid" })).toBe(true);
  });

  it("no se cobra dos veces, ni antes de pagarse", () => {
    for (const s of ["invited", "accepted", "declined", "redeemed", "expired"] as GiftStatus[]) {
      expect(isGiftClaimable({ status: s })).toBe(false);
    }
  });
});

describe("visibleGiftStatus", () => {
  it("una invitación vencida se muestra como vencida, no como pendiente", () => {
    expect(visibleGiftStatus({ status: "invited", expiresAt: DEAD }, NOW)).toBe("expired");
  });

  it("un regalo pagado se muestra tal cual por más viejo que sea", () => {
    expect(visibleGiftStatus({ status: "paid", expiresAt: DEAD }, NOW)).toBe("paid");
  });
});

describe("sanitizeGiftMessage", () => {
  it("acepta una nota corta y normaliza espacios", () => {
    expect(sanitizeGiftMessage("  para  ti 🍹 ")).toEqual({ ok: true, body: "para ti 🍹" });
  });

  it("acepta vacío: la nota es opcional", () => {
    expect(sanitizeGiftMessage("   ")).toEqual({ ok: true, body: "" });
  });

  it("rechaza una nota demasiado larga", () => {
    expect(sanitizeGiftMessage("x".repeat(MAX_GIFT_MESSAGE_LENGTH + 1)).ok).toBe(false);
  });
});
