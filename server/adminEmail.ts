/* Correos del administrador. Sirven como PRIMERA llave para entrar al panel (un código al correo, o la
 * sesión de «Mi cuenta» de la app); el segundo factor (app autenticadora) sigue siendo obligatorio, así que
 * conocer el correo no da acceso. Por defecto es el correo del negocio (el mismo de los avisos); la
 * variable `ADMIN_EMAILS` en Vercel (separados por coma) lo reemplaza. Correos personales solo en la
 * variable: este repositorio es público. */
import { normalizeMemberEmail } from './memberAuth';

export function parseAdminEmails(raw: string | undefined): string[] {
  return Array.from(new Set((raw ?? '').split(/[,;\s]+/).map(normalizeMemberEmail).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
}

/** El correo del negocio: admin aunque no esté la variable (pedido del dueño). */
export const DEFAULT_ADMIN_EMAILS = ['contacto@mansionplayroom.cl'];

export const adminEmails = (): string[] => {
  const fromEnv = parseAdminEmails(process.env.ADMIN_EMAILS);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_ADMIN_EMAILS;
};

export function isAdminEmail(email: string | null | undefined): boolean {
  const key = normalizeMemberEmail(email ?? '');
  return !!key && adminEmails().includes(key);
}

/** «Dominio» del código de ingreso al panel: aparte del de «Mi cuenta», así un código de uno nunca abre el otro. */
export const adminLoginCodeKey = (email: string): string => `admin-login:${normalizeMemberEmail(email)}`;
