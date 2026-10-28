/* Quién puede regalar. Los regalos (entradas, estacionamiento, tragos de cortesía) son plata que no se cobra:
 * solo el administrador dueño puede darlos; el acceso de solo lectura, los socios y el staff no. La sesión del panel
 * (contraseña o correo + app autenticadora) NO trae correo, así que ahí vale el rol `admin`; si la sesión sí trae
 * correo, tiene que ser el del dueño. */
export const GIFT_ADMIN_EMAILS = ['contacto@mansionplayroom.cl'] as const;

export function canGift(user: { role?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user || user.role !== 'admin') return false;
  const email = (user.email ?? '').trim().toLowerCase();
  return !email || (GIFT_ADMIN_EMAILS as readonly string[]).includes(email);
}

export const GIFT_DENIED_MESSAGE = `Solo ${GIFT_ADMIN_EMAILS[0]} puede dar regalos.`;
