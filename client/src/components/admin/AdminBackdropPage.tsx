import type { ReactNode } from 'react';

/** Pantalla completa del panel con el fondo de luces (login, «sin permisos»…). El fondo es un hermano
 * decorativo: `.admin-backdrop` es `position: fixed` con `pointer-events: none`, y si se usa como
 * contenedor esa propiedad se hereda y nada de lo de adentro recibe toques (la pantalla de ingreso
 * quedaba muerta). Acá el contenido va aparte, por encima, y la página puede hacer scroll. */
export function AdminBackdropPage({ children }: { children: ReactNode }) {
  return (
    <div data-admin-theme="dark-glass" className="relative min-h-screen">
      <div className="admin-backdrop" aria-hidden="true" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">{children}</div>
    </div>
  );
}
