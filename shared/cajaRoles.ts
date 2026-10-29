/** Todos los roles de operador (la columna `operators.role`). */
export const OPERATOR_ROLES = ['admin', 'supervisor', 'caja', 'barra', 'acceso', 'cocina', 'guardarropia'] as const;
export type OperatorRole = (typeof OPERATOR_ROLES)[number];

/** Roles de operador que pueden usar la caja (/caja): vender, canjear,
 * marcar entradas y abrir/cerrar turno. Cada área tiene su propia pantalla y todas comparten la misma cookie de
 * sesión, así que el servidor le cierra la caja explícitamente a Puerta, Cocina, Guardarropía y Barra: la caja vende
 * (solo Caja); Barra prepara y solo cuenta el inventario (/barra) y ve el dosier. Supervisor y Admin entran a todo. */
export const CAJA_ROLES = ['caja', 'supervisor', 'admin'] as const;

export function canUseCaja(role: string | null | undefined): boolean {
  return !!role && (CAJA_ROLES as readonly string[]).includes(role);
}

/** Nombre legible del rol para mostrarle a la persona (no el valor crudo). */
export const OPERATOR_ROLE_LABELS: Record<OperatorRole, string> & Record<string, string> = {
  admin: 'Admin',
  supervisor: 'Supervisor',
  caja: 'Caja',
  barra: 'Barra',
  acceso: 'Puerta',
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
  { key: 'barra', label: 'Conteo de barra', path: '/barra', roles: ['barra', 'supervisor', 'admin'] },
] as const;

export type StaffSystemKey = (typeof STAFF_SYSTEMS)[number]['key'];

/** Roles con acceso a todas las pantallas (para mirar y supervisar). */
export const ALL_AREAS_ROLES = ['supervisor', 'admin'] as const;

/** A qué sistemas entra cada operador de una persona, con el operador con que entra a cada uno (el primero que sirve).
 * Con `ownRole` (el rol de su cargo), una persona ve SOLO su área aunque tenga operadores de otras: ningún área se mezcla;
 * solo Supervisor y Admin ven todas. */
export function staffSystemsFor(operators: { id: number; role: string }[], ownRole?: string | null): { key: StaffSystemKey; label: string; path: string; operatorId: number }[] {
  const out: { key: StaffSystemKey; label: string; path: string; operatorId: number }[] = [];
  const seesAll = !ownRole || (ALL_AREAS_ROLES as readonly string[]).includes(ownRole);
  const mine = seesAll ? operators : operators.filter((o) => o.role === ownRole);
  for (const sys of STAFF_SYSTEMS) {
    const op = mine.find((o) => (sys.roles as readonly string[]).includes(o.role));
    if (op) out.push({ key: sys.key, label: sys.label, path: sys.path, operatorId: op.id });
  }
  return out;
}
