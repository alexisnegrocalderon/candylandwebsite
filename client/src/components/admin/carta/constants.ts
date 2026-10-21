import type { CartaProduct } from '@shared/carta';

/* Carta de la fiesta: los tragos, la comida, la guardarropía y el merch son
 * `ticketTypes` con categoría propia (consumo/locker/merch) del evento -- no
 * una tabla nueva (docs/ARQUITECTURA-CAJA.md §12). La ventaja concreta de
 * reusar esa tabla: la venta queda como `orders` con channel='caja', así que
 * el reporte, el CSV y el PDF del admin ya las ven sin tocar nada.
 *
 * Y la ventaja de que sean categorías propias en vez de 'extra': el checkout
 * de la web lista addons filtrando `category === 'extra'`, así que un trago
 * NO aparece en el sitio, no emite ticket y no manda correo. Se vende solo en
 * la barra, que es lo que corresponde. */

export const CARTA_CATEGORIES = [
  { id: 'consumo', label: 'Tragos y comida', emoji: '🍹', color: '#f472b6', help: 'Todo lo que se consume en la fiesta: tragos, cervezas, bebidas, comida.' },
  { id: 'locker', label: 'Guardarropía', emoji: '🧥', color: '#818cf8', help: 'Se cobra igual que un producto; al confirmar, la caja pide el número de la percha.' },
  { id: 'merch', label: 'Merch', emoji: '🎁', color: '#fbbf24', help: 'Poleras, stickers, lo que se venda de recuerdo.' },
  { id: 'extra', label: 'Extras de la web', emoji: '🎫', color: '#34d399', help: 'Estacionamiento, covers y demás addons que TAMBIÉN se ofrecen en el checkout del sitio.' },
] as const;

export type CartaCategory = typeof CARTA_CATEGORIES[number]['id'];

// Emojis sugeridos para no tener que ir a buscarlos a otro lado. El dueño
// eligió emoji + color en vez de fotos: se lee mejor que una miniatura en una
// tablet a oscuras, y no obliga a construir subida de imágenes.
export const EMOJI_SUGGESTIONS: Record<CartaCategory, string[]> = {
  consumo: ['🍹', '🍺', '🍷', '🥃', '🍸', '🥤', '💧', '⚡', '🍔', '🌭', '🍕', '🌮', '🍟', '🍫'],
  locker: ['🧥', '🎒', '👜', '🧣', '☂️'],
  merch: ['👕', '🧢', '🩲', '🏷️', '💿', '✨'],
  extra: ['🅿️', '⭐', '🎫', '🎟️', '🛋️'],
};

export const COLOR_PALETTE = ['#f472b6', '#fb7185', '#f59e0b', '#fbbf24', '#34d399', '#22d3ee', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9'];

export const categoryMeta = (id: string) => CARTA_CATEGORIES.find((c) => c.id === id) ?? CARTA_CATEGORIES[0];

/** Estado del formulario de un producto (nuevo o en edición). */
export interface ProductForm {
  name: string;
  category: CartaCategory;
  groupName: string;
  emoji: string;
  color: string;
  price: number;
  costPrice: number;
  totalStock: number;
  sortOrder: number;
  toKitchen: number;
  /** Ingredientes/sabores especiales: se ve en /caja al mantener presionada la tarjeta. */
  description: string;
  /** Solo en "Extras de la web": acredita saldo prepagado en vez de un derecho canjeable. */
  topupAmount: number;
  /** Opcional: solo cuando otro sistema reconoce el producto por un código fijo (ej. premios de Cumpleañeros). */
  internalCode: string;
}

export function emptyForm(category: CartaCategory, groupName = ''): ProductForm {
  return {
    name: '', category, groupName,
    emoji: EMOJI_SUGGESTIONS[category][0],
    color: categoryMeta(category).color as string,
    price: 0, costPrice: 0, totalStock: 100, sortOrder: 0, toKitchen: 0, description: '', topupAmount: 0, internalCode: '',
  };
}

export function formFromProduct(p: CartaProduct & { topupAmount?: number | string | null }): ProductForm {
  const category = p.category as CartaCategory;
  return {
    name: p.name,
    category,
    groupName: p.groupName ?? '',
    emoji: p.emoji ?? EMOJI_SUGGESTIONS[category]?.[0] ?? '🍹',
    color: p.color ?? (categoryMeta(category).color as string),
    price: Number(p.price),
    costPrice: p.costPrice != null ? Number(p.costPrice) : 0,
    totalStock: Number(p.totalStock),
    sortOrder: Number(p.sortOrder ?? 0),
    toKitchen: Number(p.toKitchen ?? 0),
    description: p.description ?? '',
    topupAmount: p.topupAmount ? Number(p.topupAmount) : 0,
    internalCode: p.internalCode ?? '',
  };
}

/** Lo que se manda al servidor al crear (`isNew`) o editar. Editar manda
 * `topupAmount: null` fuera de "Extras" para limpiarlo. */
export function payloadFromForm(form: ProductForm, isNew: true): ReturnType<typeof buildPayload> & { topupAmount?: number };
export function payloadFromForm(form: ProductForm, isNew: false): ReturnType<typeof buildPayload> & { topupAmount?: number | null };
export function payloadFromForm(form: ProductForm, isNew: boolean) { return buildPayload(form, isNew); }

function buildPayload(form: ProductForm, isNew: boolean) {
  return {
    name: form.name.trim(),
    category: form.category,
    groupName: form.groupName.trim() || undefined,
    emoji: form.emoji || undefined,
    color: form.color,
    price: form.price,
    costPrice: form.costPrice || undefined,
    totalStock: form.totalStock,
    sortOrder: form.sortOrder,
    toKitchen: form.toKitchen,
    description: form.description.trim() || undefined,
    topupAmount: form.category === 'extra' ? (form.topupAmount || (isNew ? undefined : null)) : (isNew ? undefined : null),
    internalCode: form.internalCode.trim() ? form.internalCode.trim().toUpperCase() : undefined,
  };
}

/** Devuelve el mensaje de error de validación del formulario, o `null`. */
export function validateForm(form: ProductForm): string | null {
  if (!form.name.trim()) return 'Ponle un nombre al producto';
  if (!(form.price > 0)) return 'El precio tiene que ser mayor a 0';
  return null;
}
