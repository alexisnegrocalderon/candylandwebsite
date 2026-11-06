import { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';
import { FONT_FILES } from './theme';

/* Carga las fuentes de marca una sola vez (vista previa y grabación). Mientras
 * cargan, Remotion espera (delayRender): nunca se graba un cuadro con la
 * letra del sistema. */

let loading: Promise<void> | null = null;

function loadAll(): Promise<void> {
  if (loading) return loading;
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve();
  loading = Promise.all(
    FONT_FILES.map(async ({ family, file, weight }) => {
      const face = new FontFace(family, `url(${staticFile(file)})`, { weight: weight ?? 'normal', display: 'block' });
      try {
        document.fonts.add(await face.load());
      } catch (err) {
        console.warn(`[motion] No cargó la fuente ${family}:`, err);
      }
    }),
  ).then(() => undefined);
  return loading;
}

export function useBrandFonts(): void {
  const [handle] = useState(() => delayRender('Fuentes de marca', { timeoutInMilliseconds: 20000 }));
  useEffect(() => {
    let alive = true;
    loadAll().finally(() => {
      if (alive) continueRender(handle);
    });
    return () => {
      alive = false;
    };
  }, [handle]);
}
