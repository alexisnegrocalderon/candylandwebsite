import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "./sqlLike";

describe("escapeLikePattern", () => {
  it("deja intacto el texto normal, con tildes y espacios", () => {
    expect(escapeLikePattern("José Pérez")).toBe("José Pérez");
    expect(escapeLikePattern("")).toBe("");
  });

  it("escapa los comodines de LIKE para que se busquen como texto", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("juan_perez")).toBe("juan\\_perez");
  });

  it("escapa la barra invertida primero, sin duplicar el escape de los demás", () => {
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
    expect(escapeLikePattern("\\%")).toBe("\\\\\\%");
  });
});
