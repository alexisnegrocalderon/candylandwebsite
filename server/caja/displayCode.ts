import { randomInt } from "crypto";

// Alfabeto sin 0/O/1/I/L (docs/ARQUITECTURA-CAJA.md §9) — dictable por
// teléfono sin ambigüedad. 31 caracteres, dos grupos de 4 -> ~9.2e11
// combinaciones por prefijo; colisión resuelta igual por UNIQUE + reintento.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

function randomGroup(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** Prefijo por defecto cuando el producto no tiene `internalCode` configurado. */
export function fallbackInternalCode(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 3) || "EXT").padEnd(3, "X");
}

/** Genera un código legible de canje: `{PREFIJO}-XXXX-XXXX`. */
export function generateDisplayCode(prefix: string): string {
  const cleanPrefix = prefix.trim().toUpperCase().slice(0, 6) || "EXT";
  return `${cleanPrefix}-${randomGroup(4)}-${randomGroup(4)}`;
}
