import { useEffect, useState } from 'react';

/** Tamaño de letra del panel de administración. Se escala todo junto (letras, botones y espacios) cambiando el
 * tamaño base de la página, que es de donde salen todas las medidas en rem. Se recuerda en este dispositivo. */
export type AdminTextSize = 'normal' | 'grande' | 'muy-grande';

export const ADMIN_TEXT_SIZES: { id: AdminTextSize; label: string; sample: string }[] = [
  { id: 'normal', label: 'Normal', sample: 'A' },
  { id: 'grande', label: 'Grande', sample: 'A+' },
  { id: 'muy-grande', label: 'Muy grande', sample: 'A++' },
];

const KEY = 'admin-text-size';
const EVENT = 'admin:text-size';
/** Por defecto «grande»: el panel se usa a menudo sin lentes. */
const DEFAULT: AdminTextSize = 'grande';

export function readAdminTextSize(): AdminTextSize {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'normal' || v === 'grande' || v === 'muy-grande' ? v : DEFAULT;
  } catch { return DEFAULT; }
}

export function setAdminTextSize(size: AdminTextSize) {
  try { localStorage.setItem(KEY, size); } catch { /* sin storage: solo dura la sesión */ }
  try { window.dispatchEvent(new CustomEvent<AdminTextSize>(EVENT, { detail: size })); } catch { /* sin window */ }
}

/** Lee y aplica el tamaño en <html data-admin-text>; se quita al salir del panel. Solo lo usa el shell del panel
 * (no la caja ni la terminal de gastos, que tienen su propia distribución). */
export function useAdminTextSize(): [AdminTextSize, (size: AdminTextSize) => void] {
  const [size, setSize] = useState<AdminTextSize>(readAdminTextSize);
  useEffect(() => {
    const onChange = (e: Event) => setSize((e as CustomEvent<AdminTextSize>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.adminText = size;
    return () => { delete root.dataset.adminText; };
  }, [size]);
  return [size, setAdminTextSize];
}
