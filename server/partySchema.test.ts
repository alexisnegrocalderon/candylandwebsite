import { describe, expect, it } from "vitest";
import { missingPartyIdentitySteps, missingPartySteps, type PartySnapshot } from "./partySchema";

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

describe("missingPartySteps (0137)", () => {
  const profileOld = new Map([["id", "int"], ["gender", "enum('hombre','mujer','pareja','no_binario')"], ["pairType", "enum('mixta','chicas','chicos')"], ["lookingFor", "varchar(128)"], ["orientation", "varchar(16)"], ["relationStyle", "varchar(16)"], ["intents", "varchar(160)"]]);
  const profileNew = new Map([...Array.from(profileOld.entries()), ["superLikeCredits", "int"], ["superLikeBought", "int"], ["superLikeCap", "int"], ["likesUnlocked", "int"], ["affinityAlerts", "int"]]);
  const wallet = (value: boolean) => new Map([["reason", value ? "enum('earn_web','spend_playmatch')" : "enum('earn_web')"]]);
  const prepaid = (value: boolean) => new Map([["reason", value ? "enum('topup_web','spend_playmatch')" : "enum('topup_web')"]]);
  const staff = (value: boolean) => new Map([["cargo", value ? "enum('caja','anfitrion_playmatch','animador')" : "enum('caja')"]]);
  const full = (): PartySnapshot => ({
    columns: new Map([["partyProfiles", profileNew], ["playcoinsLedger", wallet(true)], ["prepaidLedger", prepaid(true)], ["staffMembers", staff(true)], ["partyCharges", new Map([["id", "int"]])], ["partyEventConfig", new Map([["eventId", "int"]])]]),
    tables: new Set(["partyCharges", "partyEventConfig"]),
    indexes: new Set(["partyCharges.party_charges_op_idx", "partyCharges.party_charges_event_idx", "partyCharges.party_charges_profile_idx"]),
  });

  it("con todo aplicado no hace nada", () => {
    expect(missingPartySteps(full())).toEqual([]);
  });

  it("a una base de antes de la 0137 le agrega las columnas, las tablas, los índices y los valores nuevos", () => {
    const s: PartySnapshot = {
      columns: new Map([["partyProfiles", profileOld], ["playcoinsLedger", wallet(false)], ["prepaidLedger", prepaid(false)], ["staffMembers", staff(false)]]),
      tables: new Set(), indexes: new Set(),
    };
    const labels = missingPartySteps(s).map((x) => x.label);
    expect(labels).toEqual(expect.arrayContaining([
      "partyProfiles.superLikeCredits", "partyProfiles.superLikeBought", "partyProfiles.superLikeCap", "partyProfiles.likesUnlocked", "partyProfiles.affinityAlerts",
      "tabla partyCharges", "tabla partyEventConfig", "índice partyCharges.opId",
      "playcoinsLedger spend_playmatch", "prepaidLedger spend_playmatch", "staffMembers.cargo anfitrion_playmatch", "staffMembers.cargo animador",
    ]));
    // El orden importa: la tabla antes que sus índices.
    expect(labels.indexOf("tabla partyCharges")).toBeLessThan(labels.indexOf("índice partyCharges.opId"));
  });

  it("los grupos se piden por separado (la billetera no depende del perfil)", () => {
    const s = full();
    s.columns.set("playcoinsLedger", wallet(false));
    expect(missingPartySteps(s, ["wallet"]).map((x) => x.label)).toEqual(["playcoinsLedger spend_playmatch"]);
    expect(missingPartySteps(s, ["profile", "tables", "staff"])).toEqual([]);
  });

  it("una tabla que no existe (base sin migrar) no recibe ALTER", () => {
    const s: PartySnapshot = { columns: new Map(), tables: new Set(), indexes: new Set() };
    const groups = missingPartySteps(s).map((x) => x.group);
    expect(groups.every((g) => g === "tables")).toBe(true);
  });
});
