/** Enmascarado de datos personales para el acceso de demostración
 * (`role: 'viewer'`, ver server/_core/sdk.ts).
 *
 * El invitado puede recorrer el panel entero -- ingresos, márgenes, gastos,
 * gráficos: eso es justamente lo que se le quiere mostrar -- pero no tiene
 * por qué ver el email, el teléfono ni el RUT de clientes reales. Se aplica
 * como una transformación sobre la respuesta de cada query en vez de
 * modificar las ~46 consultas una por una: un solo lugar que auditar, y
 * cualquier endpoint nuevo queda cubierto automáticamente. */

const EMAIL_KEY = /(^|[a-z])email$/i;
const PHONE_KEY = /(^|[a-z])phone$/i;
const RUT_KEY = /(^|[a-z])rut$/i;

/** Campos que son SIEMPRE el nombre de una persona, sin importar la tabla. */
const PERSON_NAME_KEYS = new Set([
  "fullname",
  "buyername",
  "customername",
  "holdername",
]);

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "***";
  return `${value[0]}***${value.slice(at)}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `+56 9 ****${digits.slice(-4)}` : "****";
}

function maskName(value: string): string {
  // Deja la inicial de cada palabra para que las listas sigan pareciendo
  // listas de gente real (y se note el volumen) sin identificar a nadie.
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}.`)
    .join(" ") || "***";
}

/** ¿Este objeto es la ficha de una persona? Si trae un email o un teléfono,
 * sí -- y entonces su `name` también es un dato personal. Los productos,
 * eventos y tipos de entrada no tienen esas columnas, así que sus nombres
 * (que son justamente lo que hay que mostrar en la demo) quedan intactos. */
function looksLikePersonRecord(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some((k) => EMAIL_KEY.test(k) || PHONE_KEY.test(k));
}

export function maskPii<T>(value: T): T {
  if (value == null) return value;

  if (Array.isArray(value)) {
    return value.map((item) => maskPii(item)) as unknown as T;
  }

  // Date, Buffer y demás objetos no-planos se devuelven tal cual: recorrerlos
  // los destruiría (superjson serializa las fechas del admin).
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Object.getPrototypeOf(obj) !== Object.prototype && Object.getPrototypeOf(obj) !== null) {
      return value;
    }

    const isPerson = looksLikePersonRecord(obj);
    const out: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(obj)) {
      const lower = key.toLowerCase();

      if (typeof val === "string" && val.length > 0) {
        if (EMAIL_KEY.test(key)) { out[key] = maskEmail(val); continue; }
        if (PHONE_KEY.test(key)) { out[key] = maskPhone(val); continue; }
        if (RUT_KEY.test(key)) { out[key] = "**.***.***-*"; continue; }
        if (lower === "instagram") { out[key] = "@***"; continue; }
        if (PERSON_NAME_KEYS.has(lower)) { out[key] = maskName(val); continue; }
        if (lower === "name" && isPerson) { out[key] = maskName(val); continue; }
      }

      out[key] = maskPii(val);
    }

    return out as T;
  }

  return value;
}
