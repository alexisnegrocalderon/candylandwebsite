import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARTY_DURATION_MS,
  MAX_ALIAS_LENGTH,
  MAX_TOUCHES_PER_EVENT,
  canEnterParty,
  hasTouchesLeft,
  isOnline,
  isPartyWindowOpen,
  orderedPair,
  partyEntryDenial,
  placeInZone,
  sanitizeAlias,
  sanitizeMessage,
} from "../shared/party";

const eventDate = new Date("2026-08-01T23:00:00Z");
const doorsOpen = new Date("2026-08-01T22:00:00Z");
const eventEnd = new Date("2026-08-02T06:00:00Z");
const fullEvent = { eventDate, doorsOpen, eventEnd };

describe("isPartyWindowOpen", () => {
  it("está cerrada antes de que abran las puertas", () => {
    expect(isPartyWindowOpen(fullEvent, new Date("2026-08-01T21:59:00Z"))).toBe(false);
  });

  it("abre justo en doorsOpen", () => {
    expect(isPartyWindowOpen(fullEvent, doorsOpen)).toBe(true);
  });

  it("está abierta durante la fiesta", () => {
    expect(isPartyWindowOpen(fullEvent, new Date("2026-08-02T02:00:00Z"))).toBe(true);
  });

  it("cierra exactamente en eventEnd, no un minuto después", () => {
    expect(isPartyWindowOpen(fullEvent, new Date("2026-08-02T05:59:00Z"))).toBe(true);
    expect(isPartyWindowOpen(fullEvent, eventEnd)).toBe(false);
  });

  it("sin doorsOpen, abre en eventDate", () => {
    const ev = { eventDate, doorsOpen: null, eventEnd };
    expect(isPartyWindowOpen(ev, new Date("2026-08-01T22:30:00Z"))).toBe(false);
    expect(isPartyWindowOpen(ev, eventDate)).toBe(true);
  });

  it("sin eventEnd, cierra a las 12 horas y no queda abierta para siempre", () => {
    const ev = { eventDate, doorsOpen, eventEnd: null };
    const justBefore = new Date(eventDate.getTime() + DEFAULT_PARTY_DURATION_MS - 1000);
    const justAfter = new Date(eventDate.getTime() + DEFAULT_PARTY_DURATION_MS + 1000);
    expect(isPartyWindowOpen(ev, justBefore)).toBe(true);
    expect(isPartyWindowOpen(ev, justAfter)).toBe(false);
  });

  it("un evento sin fecha válida nunca abre", () => {
    expect(isPartyWindowOpen({ eventDate: "no-es-fecha" }, eventDate)).toBe(false);
  });
});

describe("canEnterParty / partyEntryDenial", () => {
  const during = new Date("2026-08-02T02:00:00Z");
  const usedTicket = { status: "used", eventId: 1 };

  it("deja entrar a quien hizo check-in, durante la fiesta", () => {
    expect(canEnterParty(usedTicket, fullEvent, during)).toBe(true);
    expect(partyEntryDenial(usedTicket, fullEvent, during)).toBeNull();
  });

  it("NO deja entrar con la entrada comprada pero sin pasar por la puerta", () => {
    expect(canEnterParty({ status: "valid", eventId: 1 }, fullEvent, during)).toBe(false);
    expect(partyEntryDenial({ status: "valid", eventId: 1 }, fullEvent, during)).toBe("no_ingreso");
  });

  it("no deja entrar con la entrada anulada", () => {
    expect(partyEntryDenial({ status: "cancelled", eventId: 1 }, fullEvent, during)).toBe("no_ingreso");
  });

  it("no deja entrar fuera del horario aunque haya hecho check-in", () => {
    expect(partyEntryDenial(usedTicket, fullEvent, new Date("2026-08-02T09:00:00Z"))).toBe("fuera_de_horario");
  });

  it("sin ticket o sin evento, no entra", () => {
    expect(partyEntryDenial(null, fullEvent, during)).toBe("sin_ticket");
    expect(partyEntryDenial(usedTicket, null, during)).toBe("sin_ticket");
  });
});

describe("isOnline", () => {
  const now = new Date("2026-08-02T02:00:00Z");

  it("está en línea si dio señales hace un minuto", () => {
    expect(isOnline(new Date(now.getTime() - 60_000), now)).toBe(true);
  });

  it("no está en línea si desapareció hace cinco minutos", () => {
    expect(isOnline(new Date(now.getTime() - 5 * 60_000), now)).toBe(false);
  });

  it("sin lastSeenAt no está en línea", () => {
    expect(isOnline(null, now)).toBe(false);
  });
});

describe("orderedPair", () => {
  it("normaliza el par en los dos sentidos al mismo resultado", () => {
    expect(orderedPair(7, 3)).toEqual({ low: 3, high: 7 });
    expect(orderedPair(3, 7)).toEqual(orderedPair(7, 3));
  });
});

describe("hasTouchesLeft", () => {
  it("permite tocar mientras no se llegue al tope", () => {
    expect(hasTouchesLeft(0)).toBe(true);
    expect(hasTouchesLeft(MAX_TOUCHES_PER_EVENT - 1)).toBe(true);
  });

  it("corta al llegar al tope", () => {
    expect(hasTouchesLeft(MAX_TOUCHES_PER_EVENT)).toBe(false);
    expect(hasTouchesLeft(MAX_TOUCHES_PER_EVENT + 5)).toBe(false);
  });
});

describe("placeInZone", () => {
  it("devuelve siempre la misma posición para el mismo perfil", () => {
    expect(placeInZone(42)).toEqual(placeInZone(42));
  });

  it("reparte perfiles distintos en posiciones distintas", () => {
    const posiciones = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((id) => JSON.stringify(placeInZone(id))));
    expect(posiciones.size).toBeGreaterThan(6);
  });

  it("mantiene los avatares dentro de la zona, sin pegarse a los bordes", () => {
    for (let id = 1; id <= 200; id++) {
      const { xPct, yPct } = placeInZone(id);
      expect(xPct).toBeGreaterThanOrEqual(12);
      expect(xPct).toBeLessThanOrEqual(88);
      expect(yPct).toBeGreaterThanOrEqual(18);
      expect(yPct).toBeLessThanOrEqual(82);
    }
  });
});

describe("sanitizeAlias", () => {
  it("acepta un alias normal y le normaliza los espacios", () => {
    expect(sanitizeAlias("  La  Reina ")).toEqual({ ok: true, alias: "La Reina" });
  });

  it("rechaza alias muy corto o muy largo", () => {
    expect(sanitizeAlias("a").ok).toBe(false);
    expect(sanitizeAlias("x".repeat(MAX_ALIAS_LENGTH + 1)).ok).toBe(false);
  });

  it("rechaza arrobas: el alias no es para pasar el Instagram", () => {
    const res = sanitizeAlias("@juanita");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.reason).toContain("arrobas");
  });

  it("rechaza links", () => {
    expect(sanitizeAlias("mifoto.com").ok).toBe(false);
    expect(sanitizeAlias("http://x.cl").ok).toBe(false);
  });

  it("rechaza números de teléfono, aunque vengan separados", () => {
    expect(sanitizeAlias("9 8765 4321").ok).toBe(false);
    expect(sanitizeAlias("987654321").ok).toBe(false);
  });

  it("no confunde un alias con un número corto adentro", () => {
    expect(sanitizeAlias("Rosa77").ok).toBe(true);
  });
});

describe("sanitizeMessage", () => {
  it("acepta un mensaje normal", () => {
    expect(sanitizeMessage("  hola   qué tal ")).toEqual({ ok: true, body: "hola qué tal" });
  });

  it("rechaza vacío y demasiado largo", () => {
    expect(sanitizeMessage("   ").ok).toBe(false);
    expect(sanitizeMessage("x".repeat(501)).ok).toBe(false);
  });
});
