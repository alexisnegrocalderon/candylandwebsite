import { toast } from 'sonner';
import { NOT_ADMIN_ERR_MSG } from '@shared/const';

/** Mismo aviso de error que usa el resto del panel (el invitado de demo no
 * puede escribir; sin base de datos se explica en criollo). */
export const onCartaError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'No se pudo guardar. Intenta de nuevo.';
  if (message === NOT_ADMIN_ERR_MSG || message === 'Admin access required') {
    toast.error('Modo demo — solo lectura. Esta acción está deshabilitada.');
    return;
  }
  toast.error(message === 'Database not available' ? 'Base de datos no configurada — nada se guardó. Revisa DATABASE_URL en Vercel.' : message);
};
