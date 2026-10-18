/** Roles de operador que pueden usar la caja (/caja): vender, canjear,
 * marcar entradas y abrir/cerrar turno. Acceso, cocina y guardarropía tienen
 * sus propias pantallas y comparten la misma cookie de sesión, así que el
 * servidor tiene que cerrarles la caja explícitamente. */
export const CAJA_ROLES = ['caja', 'barra', 'supervisor', 'admin'] as const;

export function canUseCaja(role: string | null | undefined): boolean {
  return !!role && (CAJA_ROLES as readonly string[]).includes(role);
}

/** Nombre legible del rol para mostrarle a la persona (no el valor crudo). */
export const OPERATOR_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  caja: 'Caja',
  barra: 'Barra',
  acceso: 'Acceso',
  cocina: 'Cocina',
  guardarropia: 'Guardarropía',
};
