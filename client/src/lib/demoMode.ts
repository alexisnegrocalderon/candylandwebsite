import { trpc } from "@/lib/trpc";

/** Roles que pueden ABRIR el panel de admin. El invitado (`viewer`) entra a
 * mirar: el servidor le bloquea toda escritura y le enmascara los datos
 * personales (server/privacy.ts), así que acá alcanza con dejarlo pasar. */
export function canOpenAdmin(role: string | null | undefined): boolean {
  return role === "admin" || role === "viewer";
}

export const DEMO_TOOLTIP = "Modo demo — solo lectura";

/** ¿La sesión actual es la de demostración? Se usa para deshabilitar los
 * controles de escritura, no para proteger nada: la protección real está en
 * el servidor (`adminProcedure` vs `adminReadProcedure`). */
export function useIsDemo(): boolean {
  const { data: user } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  return user?.role === "viewer";
}

/** Props para pegarle a un botón/control de escritura:
 * `<Button {...useDemoProps()}>`. Deshabilita y explica por qué. */
export function useDemoProps(): { disabled?: true; title?: string } {
  return useIsDemo() ? { disabled: true, title: DEMO_TOOLTIP } : {};
}
