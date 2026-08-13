import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { useDemoProps, useIsDemo, DEMO_TOOLTIP } from '@/lib/demoMode';

type ButtonProps = React.ComponentProps<typeof Button>;

/** Botón que ejecuta una ESCRITURA (crear, editar, borrar, enviar).
 *
 * Idéntico al `Button` normal salvo que se deshabilita solo cuando la sesión
 * es la de demostración de solo lectura. Existe como componente aparte, en
 * vez de un `disabled={isDemo}` repetido en cada llamada, para que agregar
 * un botón de escritura nuevo no requiera acordarse del modo demo: basta con
 * usar este en lugar de `Button`.
 *
 * Ojo: esto es cosmético. Quien realmente bloquea la escritura es el
 * servidor (`adminProcedure` en server/routers.ts). */
export const WriteButton = forwardRef<HTMLButtonElement, ButtonProps>(
  function WriteButton({ disabled, title, ...rest }, ref) {
    const demoProps = useDemoProps();
    return (
      <Button
        ref={ref}
        {...rest}
        disabled={disabled || demoProps.disabled}
        title={demoProps.title ?? title}
      />
    );
  },
);

/** Enlace de descarga servido por una ruta Express con `requireAdmin`
 * (los export CSV). Para el invitado de demostración esas rutas devuelven
 * 403, así que en vez de abrirle una pestaña con el error se muestra el
 * botón deshabilitado. Los reportes imprimibles (/admin/print/...) NO usan
 * esto: son páginas del cliente que se alimentan de queries ya
 * enmascaradas, así que el invitado sí puede verlas. */
export function DownloadLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isDemo = useIsDemo();
  if (isDemo) {
    return <span title={DEMO_TOOLTIP} className="pointer-events-none opacity-50">{children}</span>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
