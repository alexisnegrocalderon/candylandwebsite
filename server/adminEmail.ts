/* Correos que el dueño autoriza como admin (variable `ADMIN_EMAILS` en Vercel, separados por coma).
 * Sirven como PRIMERA llave para entrar al panel (un código al correo, o la sesión de «Mi cuenta» de la
 * app); el segundo factor (app autenticadora) sigue siendo obligatorio. Sin la variable, esto queda apagado.
 * El correo vive solo en la variable de entorno: este repositorio es público. */
import { normalizeMemberEmail } from './memberAuth';

export function parseAdminEmails(raw: string | undefined): string[] {
  return Array.from(new Set((raw ?? '').split(/[,;\s]+/).map(normalizeMemberEmail).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));
}

export const adminEmails = (): string[] => parseAdminEmails(process.env.ADMIN_EMAILS);

export function isAdminEmail(email: string | null | undefined): boolean {
  const key = normalizeMemberEmail(email ?? '');
  return !!key && adminEmails().includes(key);
}

/** «Dominio» del código de ingreso al panel: aparte del de «Mi cuenta», así un código de uno nunca abre el otro. */
export const adminLoginCodeKey = (email: string): string => `admin-login:${normalizeMemberEmail(email)}`;
