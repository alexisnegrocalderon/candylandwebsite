/* Compra de insumos desde la foto de una boleta o factura: lógica pura (sin IA, sin base de datos) para que cada
 * cuenta sea comprobable. La IA solo LEE el papel (texto, cantidad, precio, tamaño); emparejar con los insumos y
 * calcular cuánto stock se suma lo hace este archivo, y la persona confirma cada fila antes de cargar nada. */
import { normalizeName, type InsumoUnit } from './insumos';

/** Una línea tal como la leyó la IA de la boleta. */
export interface BoletaLinea {
  /** Texto de la boleta, sin cambiarlo («RON BACARDI BCO 750CC»). */
  descripcion: string;
  /** Cuántas unidades de la línea se compraron (6 en «6 × Coca-Cola 1,5 L»). */
  cantidad: number;
  /** Precio de una unidad de la línea (CLP). */
  precioUnitario: number;
  /** Total de la línea (CLP); negativo si es un descuento. */
  totalLinea: number;
  /** Tamaño de cada envase según el texto (ml o g); 0 si no se ve. */
  tamano: number;
  /** Envases dentro de cada unidad de la línea (pack de 6 → 6); 1 si no es pack. */
  packUnidades: number;
}

const PALABRAS_VACIAS = new Set([
  'botella', 'bot', 'botellin', 'lata', 'latas', 'pack', 'caja', 'cja', 'unidad', 'unidades', 'und', 'un', 'uni', 'de', 'del', 'la', 'el', 'los', 'las',
  'x', 'cc', 'ml', 'lt', 'lts', 'l', 'litro', 'litros', 'kg', 'gr', 'g', 'bco', 'nro', 'desechable', 'retornable', 'ret', 'nr',
]);
const ABREVIATURAS: Record<string, string> = { bco: 'blanco', neg: 'negro', cl: 'cola', gas: 'gas', cerv: 'cerveza', ginger: 'ginger' };

const ES_TAMANO = /^\d+(?:[.,]\d+)?(?:cc|ml|lts?|l|litros?|kg|gr?|oz|º|°|%)$/;
const ES_PACK = /^(?:x\d{1,3}|\d{1,3}x\d{0,3}|\d{1,3}pk|pk\d{1,3})$/;

/** Quita de una línea de boleta lo que no es el nombre: «COD: 12345», «SKU AB-123», códigos de barras (5 o más
 * dígitos), códigos con letras y números mezclados («A1234B») y el número de ítem del principio. Conserva tamaños
 * («750cc», «1,5 L», «35°») y packs («x6»). */
export function limpiarCodigos(texto: string): string {
  const base = normalizeName(texto)
    .replace(/\b(?:cod(?:igo)?|sku|ean|plu|ref|art(?:iculo)?|item|lote)\b\.?\s*[:#.\-]?\s*[a-z0-9][a-z0-9\-/.]*/g, ' ')
    .replace(/[#*]/g, ' ');
  const tokens = base.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  tokens.forEach((t, i) => {
    if (ES_TAMANO.test(t) || ES_PACK.test(t)) { out.push(t); return; }
    const soloNum = t.replace(/[.\-/]/g, '');
    if (/^\d{5,}$/.test(soloNum)) return; // código de barras o SKU
    if (i === 0 && /^\d{3,}$/.test(soloNum)) return; // número de ítem
    const letras = (t.match(/[a-z]/g) ?? []).length;
    const digitos = (t.match(/\d/g) ?? []).length;
    if (letras > 0 && digitos >= 2 && t.length >= 5 && !/^\d+(?:[.,]\d+)?[a-z]{1,6}$/.test(t)) return; // código mezclado
    out.push(t);
  });
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/** Palabras con peso de un nombre de producto (sin tamaños, sin relleno, sin tildes, sin plurales). */
export function palabrasClave(texto: string): string[] {
  const limpio = limpiarCodigos(texto)
    .replace(/\b\d+[.,]?\d*\s*(cc|ml|lts?|l|litros?|kg|gr?|oz)\b/g, ' ')
    .replace(/\bx\s*\d+\b/g, ' ');
  const out: string[] = [];
  for (const w0 of limpio.split(/[^a-z0-9]+/)) {
    if (!w0) continue;
    const w = ABREVIATURAS[w0] ?? w0;
    if (PALABRAS_VACIAS.has(w)) continue;
    out.push(w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
  }
  return Array.from(new Set(out));
}

/** Tamaño de envase que dice el texto («750cc», «1,5 L», «350 ml») en ml/g, o 0. */
export function tamanoDeTexto(texto: string): number {
  const t = normalizeName(texto);
  const m = /(\d+(?:[.,]\d+)?)\s*(cc|ml|lts?|l|litros?|kg|gr?)\b/.exec(t);
  if (!m) return 0;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  const u = m[2];
  if (u === 'cc' || u === 'ml' || u === 'g' || u === 'gr') return Math.round(n);
  return Math.round(n * 1000);
}

/** Envases por unidad si el texto dice «pack 6», «x6», «6 pack»; 1 si no. */
export function packDeTexto(texto: string): number {
  const t = normalizeName(texto);
  const m = /\b(?:pack|pk|caja|cja)\s*(?:de\s*)?(\d{1,3})\b/.exec(t) ?? /\b(\d{1,3})\s*(?:pack|pk)\b/.exec(t) ?? /\bx\s*(\d{1,3})\b(?!\s*(?:cc|ml|l))/.exec(t);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 100 ? n : 1;
}

export interface InsumoParaEmparejar { id: number; name: string; unit: InsumoUnit; containerSize: number; sizes?: number[] | null; aliases?: string[] }

export type Confianza = 'alta' | 'media' | 'nueva';
export interface Emparejado {
  insumoId: number | null;
  confianza: Confianza;
  /** Hasta 3 candidatos, el mejor primero (para que la persona cambie con un toque). */
  candidatos: { insumoId: number; score: number }[];
}

function puntaje(lineaTexto: string, nombre: string): number {
  if (normalizeName(lineaTexto) === normalizeName(nombre) || limpiarCodigos(lineaTexto) === limpiarCodigos(nombre)) return 1;
  const a = new Set(palabrasClave(lineaTexto));
  const b = palabrasClave(nombre);
  if (a.size === 0 || b.length === 0) return 0;
  const comunes = b.filter((w) => a.has(w)).length;
  const cobertura = comunes / b.length; // cuánto del nombre del insumo aparece en la línea
  const precision = comunes / a.size; // cuánto de la línea es el insumo
  return Math.round((0.7 * cobertura + 0.3 * precision) * 1000) / 1000;
}

/** Busca el insumo de una línea de boleta. «alta» solo si el mejor es claro y deja buen margen sobre el segundo;
 * «media» queda sugerido pero se revisa; «nueva» si nada se parece. Los alias que la persona ya enseñó pesan igual
 * que el nombre. */
export function emparejarInsumo(descripcion: string, insumos: InsumoParaEmparejar[]): Emparejado {
  const ranking = insumos
    .map((i) => {
      // «Pisco Mistral 35 / Nobel»: cada alternativa también cuenta sola, con la primera palabra (pisco) delante.
      const partes = i.name.split('/').map((s) => s.trim()).filter(Boolean);
      const primera = palabrasClave(partes[0] ?? i.name)[0] ?? '';
      const nombres = [i.name, ...partes.slice(1).map((p) => `${primera} ${p}`), ...(i.aliases ?? [])];
      return { insumoId: i.id, score: Math.max(...nombres.map((n) => puntaje(descripcion, n))) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  const candidatos = ranking.slice(0, 3);
  const [mejor, segundo] = candidatos;
  if (!mejor || mejor.score < 0.5) return { insumoId: null, confianza: 'nueva', candidatos };
  const margen = mejor.score - (segundo?.score ?? 0);
  const alta = mejor.score >= 0.85 && margen >= 0.15;
  return { insumoId: mejor.insumoId, confianza: alta ? 'alta' : 'media', candidatos };
}

export interface CargaLinea {
  /** Envases comprados (cantidad × pack). */
  envases: number;
  /** Tamaño de cada envase (ml/g) que se usó para el cálculo; 0 para insumos por unidad. */
  tamano: number;
  /** Cuánto se suma al stock, en la unidad del insumo. */
  agregar: number;
  /** Lo que costó cada envase comprado (CLP). */
  costoEnvase: number;
  /** Costo por envase del tamaño de compra del insumo (para actualizar su costo). */
  costoParaInsumo: number | null;
  avisos: string[];
}

/** Cuánto stock suma una línea y cuánto costó cada envase. Solo aritmética entera/decimales con redondeo
 * explícito; cada aviso es algo que la persona debe mirar antes de confirmar. */
export function cargaDeLinea(
  l: Pick<BoletaLinea, 'cantidad' | 'precioUnitario' | 'totalLinea' | 'tamano' | 'packUnidades'>,
  insumo: Pick<InsumoParaEmparejar, 'unit' | 'containerSize' | 'sizes'>,
): CargaLinea {
  const avisos: string[] = [];
  const cantidad = Math.max(0, l.cantidad);
  const pack = Math.max(1, Math.round(l.packUnidades || 1));
  const envases = Math.round(cantidad * pack * 100) / 100;
  let tamano = 0;
  let agregar: number;
  if (insumo.unit === 'un') {
    // Un insumo contado por unidad (latas, botellines): cada envase es una unidad, salvo que se cuente por cajas.
    agregar = envases * (insumo.containerSize > 1 && pack === 1 ? insumo.containerSize : 1);
  } else {
    tamano = l.tamano > 0 ? l.tamano : insumo.containerSize;
    agregar = Math.round(envases * tamano * 100) / 100;
    const conocidos = new Set<number>([insumo.containerSize, ...(insumo.sizes ?? [])]);
    if (!conocidos.has(tamano)) avisos.push(`El tamaño ${tamano} no está entre los de este insumo (${Array.from(conocidos).sort((a, b) => a - b).join(', ')}).`);
    if (l.tamano <= 0) avisos.push('La boleta no dice el tamaño: se usó el de compra del insumo.');
  }
  const costoEnvase = envases > 0 ? Math.round(l.totalLinea / envases) : 0;
  if (Math.abs(Math.round(cantidad * l.precioUnitario) - l.totalLinea) > Math.max(2, cantidad)) {
    avisos.push('Cantidad × precio no coincide con el total de la línea.');
  }
  const costoParaInsumo = insumo.unit !== 'un' && tamano > 0 && costoEnvase > 0 ? Math.round((costoEnvase * insumo.containerSize) / tamano) : (costoEnvase > 0 ? costoEnvase : null);
  return { envases, tamano, agregar, costoEnvase, costoParaInsumo, avisos };
}

/** ¿Las líneas suman el total de la boleta? Descuentos (negativos) y propina/envases sin insumo explican diferencias. */
export function cuadreBoleta(lineas: { totalLinea: number }[], totalBoleta: number): { suma: number; diferencia: number; cuadra: boolean } {
  const suma = Math.round(lineas.reduce((s, l) => s + l.totalLinea, 0));
  const diferencia = Math.round(totalBoleta) - suma;
  return { suma, diferencia, cuadra: totalBoleta > 0 && Math.abs(diferencia) <= Math.max(5, Math.round(totalBoleta * 0.002)) };
}

/** Nombre de insumo sugerido para un producto nuevo de la boleta: sin tamaños, en mayúscula inicial. */
export function nombreSugerido(descripcion: string): string {
  const limpio = limpiarCodigos(descripcion)
    .replace(/\b\d+[.,]?\d*\s*(cc|ml|lts?|l|litros?|kg|gr?)\b/gi, ' ')
    .replace(/\b(pack|pk)\s*\d*\b|\bx\s*\d+\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const base = limpio || descripcion.trim();
  return base.toLowerCase().split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ').slice(0, 100);
}
