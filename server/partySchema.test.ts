import { describe, expect, it } from "vitest";
import { missingPartyIdentitySteps } from "./partySchema";

const OLD = [
  { name: "id", type: "int" },
  { name: "gender", type: "enum('hombre','mujer','pareja')" },
  { name: "lookingFor", type: "varchar(32)" },
];
const NEW = [
  { name: "id", type: "int" },
  { name: "gender", type: "enum('hombre','mujer','pareja','no_binario')" },
  { name: "pairType", type: "enum('mixta','chicas','chicos')" },
  { name: "lookingFor", type: "varchar(128)" },
  { name: "orientation", type: "varchar(16)" },
  { name: "relationStyle", type: "varchar(16)" },
  { name: "intents", type: "varchar(160)" },
];

describe("missingPartyIdentitySteps", () => {
  it("a una tabla de antes le aplica toda la 0136, en orden", () => {
    expect(missingPartyIdentitySteps(OLD).map((s) => s.label)).toEqual([
      "partyProfiles.gender no_binario", "partyProfiles.pairType", "partyProfiles.lookingFor 128",
      "partyProfiles.orientation", "partyProfiles.relationStyle", "partyProfiles.intents",
    ]);
  });

  it("con la migración ya corrida no hace nada", () => {
    expect(missingPartyIdentitySteps(NEW)).toEqual([]);
  });

  it("si quedó a medias, solo completa lo que falta", () => {
    const half = NEW.filter((c) => c.name !== "intents" && c.name !== "relationStyle");
    expect(missingPartyIdentitySteps(half).map((s) => s.statement)).toEqual([
      "ALTER TABLE `partyProfiles` ADD `relationStyle` varchar(16)",
      "ALTER TABLE `partyProfiles` ADD `intents` varchar(160)",
    ]);
  });

  it("sin la tabla (base nueva) no toca nada", () => {
    expect(missingPartyIdentitySteps([])).toEqual([]);
  });
});
