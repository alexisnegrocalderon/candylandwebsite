import { useEffect } from 'react';
import type { AdminDeepLink } from '@shared/adminDeepLink';

/* Detalle pendiente de un aviso push (pestaña, conversación, comentario).
 * El panel lo deja acá al abrir la sección; la sección lo toma al montarse
 * o, si ya estaba abierta, lo recibe por el evento. */
const DEEP_LINK_EVENT = 'admin:deep-link';
let pending: AdminDeepLink | null = null;

export function deliverAdminDeepLink(link: AdminDeepLink): void {
  pending = link;
  window.dispatchEvent(new CustomEvent(DEEP_LINK_EVENT));
}

function take(section: string): AdminDeepLink | null {
  if (!pending || pending.section !== section) return null;
  const link = pending;
  pending = null;
  return link;
}

/** Llama `onLink` con el destino del aviso cuando corresponde a `section`. */
export function useAdminDeepLink(section: string, onLink: (link: AdminDeepLink) => void): void {
  useEffect(() => {
    const apply = () => {
      const link = take(section);
      if (link) onLink(link);
    };
    apply();
    window.addEventListener(DEEP_LINK_EVENT, apply);
    return () => window.removeEventListener(DEEP_LINK_EVENT, apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
}
