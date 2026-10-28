/* Quién puede regalar. Los regalos (entradas, estacionamiento, tragos de cortesía) son plata que no se cobra:
 * solo el administrador dueño puede darlos. Los demás accesos del panel, incluso admin, los ven pero no los hacen. */
export const GIFT_ADMIN_EMAILS = ['contacto@mansionplayroom.cl'] as const;

export function canGift(user: { role?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user || user.role !== 'admin') return false;
  const email = (user.email ?? '').trim().toLowerCase();
  return (GIFT_ADMIN_EMAILS as readonly string[]).includes(email);
}

export const GIFT_DENIED_MESSAGE = `Solo ${GIFT_ADMIN_EMAILS[0]} puede dar regalos.`;
