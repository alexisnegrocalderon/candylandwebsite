import { trpc } from '@/lib/trpc';

/** ¿Hay una sesión de «Mi cuenta» en este navegador? (liviano; lo usan el menú, el checkout y los avisos). */
export function useMemberSession() {
  return trpc.member.session.useQuery(undefined, { staleTime: 60_000, retry: false });
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }) : '';

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
