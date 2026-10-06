import { describe, expect, it } from "vitest";
import {
  computeCustomerLevel, recencyTone, normalizeInstagram, normalizePhone, whatsappUrl, parseBirthDateInput, formatBirthDate,
  daysUntilBirthday, hasBirthdayInMonth, ageFromBirthDate, parseLockedFields, mergeFromOrder, suggestNextAction,
  VIP_SPENT_THRESHOLD_CLP, customerDeleteBlocker, type NextActionInput,
} from "./customerInsights";

const now = new Date("2026-10-06T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("computeCustomerLevel", () => {
  const base = { totalOrders: 1, totalSpent: 30000, lastActivityAt: daysAgo(10), now };
  it("clasifica por compras", () => {
    expect(computeCustomerLevel({ ...base, totalOrders: 0 })).toBe("sin_compras");
    expect(computeCustomerLevel(base)).toBe("nuevo");
    expect(computeCustomerLevel({ ...base, totalOrders: 3 })).toBe("recurrente");
  });
  it("es VIP por gasto o por forzado, y el forzado manda", () => {
    expect(computeCustomerLevel({ ...base, totalSpent: VIP_SPENT_THRESHOLD_CLP })).toBe("vip");
    expect(computeCustomerLevel({ ...base, levelOverride: "vip", totalOrders: 0 })).toBe("vip");
    expect(computeCustomerLevel({ ...base, levelOverride: "inactivo", totalSpent: 999999 })).toBe("inactivo");
  });
  it("pasa a inactivo después de 90 días sin actividad, pero un VIP sigue siendo VIP", () => {
    expect(computeCustomerLevel({ ...base, totalOrders: 2, lastActivityAt: daysAgo(91) })).toBe("inactivo");
    expect(computeCustomerLevel({ ...base, totalOrders: 2, lastActivityAt: daysAgo(90) })).toBe("recurrente");
    expect(computeCustomerLevel({ ...base, totalSpent: 200000, lastActivityAt: daysAgo(200) })).toBe("vip");
  });
  it("un valor raro en levelOverride se ignora", () => {
    expect(computeCustomerLevel({ ...base, levelOverride: "cualquiera" })).toBe("nuevo");
  });
});

describe("recencyTone", () => {
  it("semáforo de recencia", () => {
    expect(recencyTone(null)).toBeNull();
    expect(recencyTone(10)).toBe("reciente");
    expect(recencyTone(60)).toBe("tibio");
    expect(recencyTone(120)).toBe("frio");
  });
});

describe("validación de datos", () => {
  it("normaliza Instagram desde @, texto o URL", () => {
    expect(normalizeInstagram("@camila.ok").value).toBe("camila.ok");
    expect(normalizeInstagram("https://www.instagram.com/camila.ok/").value).toBe("camila.ok");
    expect(normalizeInstagram("").value).toBeNull();
    expect(normalizeInstagram("mala persona!").error).toBeTruthy();
  });
  it("normaliza y valida teléfono", () => {
    expect(normalizePhone("+56 9 1234 5678").value).toBe("+56912345678");
    expect(normalizePhone("9 1234 5678").value).toBe("912345678");
    expect(normalizePhone("123").error).toBeTruthy();
    expect(normalizePhone(null).value).toBeNull();
  });
  it("arma el link de WhatsApp para celulares chilenos", () => {
    expect(whatsappUrl("912345678")).toBe("https://wa.me/56912345678");
    expect(whatsappUrl("+56912345678")).toBe("https://wa.me/56912345678");
    expect(whatsappUrl("")).toBeNull();
  });
});

describe("fecha de nacimiento", () => {
  it("parsea con y sin año", () => {
    expect(parseBirthDateInput("15/03/1995", now).value).toBe("1995-03-15");
    expect(parseBirthDateInput("5-3-1995", now).value).toBe("1995-03-05");
    expect(parseBirthDateInput("15/03", now).value).toBe("03-15");
    expect(parseBirthDateInput("", now).value).toBeNull();
  });
  it("rechaza fechas imposibles", () => {
    expect(parseBirthDateInput("31/02/1990", now).error).toBeTruthy();
    expect(parseBirthDateInput("15/13/1990", now).error).toBeTruthy();
    expect(parseBirthDateInput("15/03/1850", now).error).toBeTruthy();
    expect(parseBirthDateInput("15/03/2999", now).error).toBeTruthy();
    expect(parseBirthDateInput("hola", now).error).toBeTruthy();
  });
  it("acepta el 29 de febrero sin año", () => {
    expect(parseBirthDateInput("29/02", now).value).toBe("02-29");
    expect(parseBirthDateInput("29/02/2001", now).error).toBeTruthy();
  });
  it("formatea de vuelta", () => {
    expect(formatBirthDate("1995-03-15")).toBe("15/03/1995");
    expect(formatBirthDate("03-15")).toBe("15/03");
    expect(formatBirthDate(null)).toBe("");
  });
  it("cuenta los días al próximo cumpleaños", () => {
    expect(daysUntilBirthday("10-06", now)).toBe(0);
    expect(daysUntilBirthday("1990-10-15", now)).toBe(9);
    expect(daysUntilBirthday("10-05", now)).toBe(364);
    expect(daysUntilBirthday(null, now)).toBeNull();
    expect(daysUntilBirthday("02-29", new Date("2027-02-27T12:00:00Z"))).toBe(1);
  });
  it("detecta cumpleaños del mes y la edad", () => {
    expect(hasBirthdayInMonth("1990-10-15", 10)).toBe(true);
    expect(hasBirthdayInMonth("11-01", 10)).toBe(false);
    expect(ageFromBirthDate("1990-10-15", now)).toBe(35);
    expect(ageFromBirthDate("1990-10-01", now)).toBe(36);
    expect(ageFromBirthDate("10-15", now)).toBeNull();
  });
});

describe("campos protegidos de las compras", () => {
  it("lo editado a mano no se pisa, lo demás sí", () => {
    expect(mergeFromOrder("phone", ["phone"], "111", "222")).toBe("111");
    expect(mergeFromOrder("phone", [], "111", "222")).toBe("222");
  });
  it("si la compra no trae el dato, se conserva el anterior", () => {
    expect(mergeFromOrder("rut", [], "1-9", null)).toBe("1-9");
    expect(mergeFromOrder("rut", [], null, null)).toBeNull();
  });
  it("ignora valores inválidos en lockedFields", () => {
    expect(parseLockedFields(["phone", "email", 3])).toEqual(["phone"]);
    expect(parseLockedFields(null)).toEqual([]);
  });
});

describe("suggestNextAction", () => {
  const base: NextActionInput = {
    level: "recurrente", totalOrders: 3, daysSinceLastActivity: 10, phone: "912345678", instagram: "x",
    emailOptOut: false, whatsappOptOut: false, prepaidBalance: 0, now,
  };
  it("prioriza el cumpleaños cercano", () => {
    const a = suggestNextAction({ ...base, birthDate: "10-12" });
    expect(a?.kind).toBe("birthday");
    expect(a?.title).toContain("6 días");
  });
  it("sugiere usar el saldo sin usar", () => {
    expect(suggestNextAction({ ...base, prepaidBalance: 12000 })?.kind).toBe("unused_balance");
  });
  it("detecta quien compró y no fue", () => {
    expect(suggestNextAction({ ...base, boughtLastEventButMissed: true })?.kind).toBe("no_show");
  });
  it("sugiere recuperar a un inactivo", () => {
    const a = suggestNextAction({ ...base, level: "inactivo", daysSinceLastActivity: 120 });
    expect(a?.kind).toBe("win_back");
    expect(a?.title).toContain("120 días");
  });
  it("respeta las bajas: sin canal permitido no sugiere escribir", () => {
    const a = suggestNextAction({ ...base, level: "inactivo", daysSinceLastActivity: 120, emailOptOut: true, whatsappOptOut: true });
    expect(a?.kind).toBe("unreachable");
    expect(suggestNextAction({ ...base, birthDate: "10-12", emailOptOut: true, whatsappOptOut: true })?.kind).not.toBe("birthday");
  });
  it("con la baja de correo usa WhatsApp, y al revés", () => {
    expect(suggestNextAction({ ...base, level: "inactivo", daysSinceLastActivity: 120, emailOptOut: true })?.reason).toContain("por WhatsApp");
    expect(suggestNextAction({ ...base, level: "inactivo", daysSinceLastActivity: 120, whatsappOptOut: true })?.reason).toContain("por correo");
  });
  it("pide datos de contacto o el cumpleaños cuando faltan", () => {
    expect(suggestNextAction({ ...base, phone: null, instagram: null })?.kind).toBe("missing_contact");
    expect(suggestNextAction({ ...base, level: "nuevo", totalOrders: 1 })?.kind).toBe("ask_birthday");
  });
  it("no inventa nada cuando todo está bien", () => {
    expect(suggestNextAction({ ...base, birthDate: "1990-03-01" })).toBeNull();
  });
});

describe("customerDeleteBlocker", () => {
  const free = { prepaidBalance: 0, emailOptOut: 0, whatsappOptOut: 0 };
  it("deja borrar a un cliente sin saldo ni bajas", () => {
    expect(customerDeleteBlocker(free)).toBeNull();
  });
  it("no deja borrar con saldo prepagado: es plata del cliente", () => {
    expect(customerDeleteBlocker({ ...free, prepaidBalance: 12500 })).toContain("$12.500");
  });
  it("no deja borrar a quien pidió la baja, para no perderla", () => {
    expect(customerDeleteBlocker({ ...free, emailOptOut: 1 })).toContain("baja");
    expect(customerDeleteBlocker({ ...free, whatsappOptOut: true })).toContain("baja");
  });
});
