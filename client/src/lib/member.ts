import { trpc } from '@/lib/trpc';

/** ¿Hay una sesión de «Mi cuenta» en este navegador? (liviano; lo usan el menú, el checkout y los avisos). */
export function useMemberSession() {
  return trpc.member.session.useQuery(undefined, { staleTime: 60_000, retry: false });
}

export const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }) : '';

export const fmtDateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('es-CL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';

/** ¿El sitio debe invitar a «Mi cuenta»? Solo si el dueño prendió algún beneficio (cupones); si no, se queda oculto (la página igual funciona). */
export function useMemberInvite(): boolean {
  // Al generar las páginas estáticas (build) no hay cliente tRPC: ahí no se invita. El valor es constante por entorno, así que el orden de hooks no cambia.
  if (typeof window === 'undefined') return false;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { data } = trpc.member.perks.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  return !!data?.invite;
}
