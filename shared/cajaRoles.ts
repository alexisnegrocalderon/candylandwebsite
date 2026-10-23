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

/** Los sistemas del staff y qué roles entran a cada uno (lo mismo que exige el servidor: caja =
 * CAJA_ROLES, puerta = doorProcedure, cocina = kitchenProcedure, guardarropía = guardarropiaProcedure).
 * La App los usa para la sección «Staff» de Perfil. */
export const STAFF_SYSTEMS = [
  { key: 'caja', label: 'Caja', path: '/caja', roles: [...CAJA_ROLES] as string[] },
  { key: 'puerta', label: 'Puerta', path: '/puerta', roles: ['acceso', 'supervisor', 'admin'] },
  { key: 'cocina', label: 'Cocina', path: '/cocina', roles: ['cocina', 'supervisor', 'admin'] },
  { key: 'guardarropia', label: 'Guardarropía', path: '/guardarropia', roles: ['guardarropia', 'supervisor', 'admin'] },
] as const;

export type StaffSystemKey = (typeof STAFF_SYSTEMS)[number]['key'];

/** A qué sistemas entra cada operador de una persona, con el operador con que entra a cada uno (el
 * primero que sirve). Una persona puede tener más de un operador en el mismo evento. */
export function staffSystemsFor(operators: { id: number; role: string }[]): { key: StaffSystemKey; label: string; path: string; operatorId: number }[] {
  const out: { key: StaffSystemKey; label: string; path: string; operatorId: number }[] = [];
  for (const sys of STAFF_SYSTEMS) {
    const op = operators.find((o) => (sys.roles as readonly string[]).includes(o.role));
    if (op) out.push({ key: sys.key, label: sys.label, path: sys.path, operatorId: op.id });
  }
  return out;
}
