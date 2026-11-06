import { Toaster as Sonner, toast, type ToasterProps } from "sonner";
import { friendlyMessage } from "@/lib/friendlyError";

/* Avisos (toasts) legibles en toda la app: fondo SÓLIDO de color según el tipo (antes eran translúcidos y, cuando caían
 * sobre el encabezado, el texto se mezclaba con lo de atrás y no se podía leer), más anchos, con el texto completo
 * (varias líneas), botón para cerrar y más tiempo en pantalla. Se ubican bajo la barra de estado del celular. */

// Una sola vez: todos los toast.error del sitio pasan por la limpieza (no hay que tocar cada llamada).
let patched = false;
function patchToastErrors() {
  if (patched) return;
  patched = true;
  const original = toast.error.bind(toast);
  (toast as any).error = (message: unknown, data?: unknown) => original(typeof message === "string" ? friendlyMessage(message) : (message as any), data as any);
}
patchToastErrors();

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      richColors
      closeButton
      expand
      visibleToasts={4}
      duration={7000}
      offset={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)", left: 12, right: 12 }}
      className="toaster group"
      toastOptions={{ classNames: { toast: "app-toast" } }}
      style={
        {
          "--width": "min(560px, calc(100vw - 24px))",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
