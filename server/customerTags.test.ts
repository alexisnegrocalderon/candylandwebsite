import { describe, expect, it } from "vitest";
import { tallyTags } from "./db";

describe("tallyTags", () => {
  it("cuenta cuántos clientes tiene cada etiqueta", () => {
    const result = tallyTags([
      ["vip", "masivocandyland2"],
      ["masivocandyland2"],
      ["masivocandyland2", "cumpleaños"],
    ]);
    expect(result).toEqual([
      { tag: "masivocandyland2", count: 3 },
      { tag: "cumpleaños", count: 1 },
      { tag: "vip", count: 1 },
    ]);
  });

  it("ordena por cantidad y desempata alfabéticamente", () => {
    const result = tallyTags([["b", "a"], ["b", "a"], ["c"]]);
    expect(result.map((r) => r.tag)).toEqual(["a", "b", "c"]);
  });

  it("no cuenta dos veces al mismo cliente si trae la etiqueta repetida", () => {
    expect(tallyTags([["vip", "vip", "vip"]])).toEqual([{ tag: "vip", count: 1 }]);
  });

  it("ignora filas sin etiquetas, nulls y valores que no son arrays", () => {
    const result = tallyTags([null, undefined, [], "vip", 42, { tag: "vip" }, ["real"]]);
    expect(result).toEqual([{ tag: "real", count: 1 }]);
  });

  it("descarta strings vacíos y recorta espacios", () => {
    const result = tallyTags([["  ", "", "  vip  "], ["vip"]]);
    expect(result).toEqual([{ tag: "vip", count: 2 }]);
  });

  it("devuelve lista vacía cuando no hay clientes", () => {
    expect(tallyTags([])).toEqual([]);
  });
});
