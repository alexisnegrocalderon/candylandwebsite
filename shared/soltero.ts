/* Quién puede comprar qué (lo puro; server/solteros.ts guarda y decide):
 * - Los accesos de hombres solos («Soltero» y «Dúo» de dos hombres) piden un
 *   código de comunidad o que la persona esté aprobada en su cuenta.
 * - Quien compra por primera vez deja RUT (o pasaporte), Instagram y teléfono,
 *   que se cruzan con la lista de bloqueados antes de pagar. */
import { isValidRut } from './rut';
import { normalizeIgHandle } from './igCustomerLink';

export const SOLTERO_STATUSES = ['pendiente', 'aprobado', 'rechazado', 'revocado'] as const;
export type SolteroStatus = (typeof SOLTERO_STATUSES)[number];

export const SOLTERO_STATUS_LABEL: Record<SolteroStatus, string> = {
  pendiente: 'En revisión',
  aprobado: 'Aprobado',
  rechazado: 'No aprobado',
  revocado: 'Revocado',
};

type Line = { accesoSlug?: string | null; category?: string | null };

/** ¿Esta compra lleva un acceso de hombres solos? (Soltero, o Dúo de dos hombres). */
export function needsSolteroApproval(lines: Line[], duoComposicion?: string | null): boolean {
  return lines.some((l) => (l.category === 'acceso' || !l.category)
    && (l.accesoSlug === 'soltero' || (l.accesoSlug === 'duo' && duoComposicion === 'dos_hombres')));
}

/** La composición del Dúo que eligió quien compra (el checkout la manda en attendeeData). */
export function parseDuoComposicion(attendeeDataJson: string | null | undefined): string | null {
  if (!attendeeDataJson) return null;
  try {
    const v = JSON.parse(attendeeDataJson)?.duoComposicion;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** Un documento que sirve: RUT chileno válido, o pasaporte (extranjeros) de al menos 5 caracteres. */
export function documentProblem(doc: string | null | undefined, docTipo?: string | null): string | null {
  const v = (doc ?? '').trim();
  if (docTipo === 'passport') return /^[A-Za-z0-9-]{5,20}$/.test(v) ? null : 'Escribe tu número de pasaporte.';
  return isValidRut(v) ? null : 'Ese RUT no es válido. Revísalo (con guion y dígito verificador).';
}

export function instagramProblem(ig: string | null | undefined): string | null {
  return normalizeIgHandle(ig) ? null : 'Escribe tu usuario de Instagram (por ejemplo @tuusuario).';
}

export function phoneProblem(phone: string | null | undefined): string | null {
  return digits(phone).length >= 8 ? null : 'Escribe tu WhatsApp con código de país (+56 9…).';
}

/** Lo que tiene que dejar quien compra por primera vez. null = está todo. */
export function firstPurchaseProblem(d: { doc?: string | null; docTipo?: string | null; instagram?: string | null; phone?: string | null }): string | null {
  return documentProblem(d.doc, d.docTipo) ?? instagramProblem(d.instagram) ?? phoneProblem(d.phone);
}

/** La solicitud de aprobación de soltero desde la app. null = está todo. */
export function solteroRequestProblem(d: { fullName?: string | null; rut?: string | null; instagram?: string | null; phone?: string | null }): string | null {
  if ((d.fullName ?? '').trim().split(/\s+/).filter(Boolean).length < 2) return 'Escribe tu nombre y apellido.';
  return documentProblem(d.rut, 'rut') ?? instagramProblem(d.instagram) ?? phoneProblem(d.phone);
}

/** La regla de los accesos de hombres solos, igual para la pantalla y el servidor: hace falta un código de
 * comunidad, o que quien compra esté aprobado en su cuenta con el MISMO correo de la compra. La campaña
 * aliada tiene sus propias reglas. null = puede comprar. */
export function solteroGateProblem(d: {
  lines: Line[];
  duoComposicion?: string | null;
  communityCode?: string | null;
  buyerEmail: string;
  /** Correo de «Mi cuenta» de quien compra, si está aprobado (lo pone el servidor con la sesión). */
  approvedEmail?: string | null;
  partner?: boolean;
}): string | null {
  if (d.partner || !needsSolteroApproval(d.lines, d.duoComposicion)) return null;
  if (d.communityCode?.trim()) return null;
  if (d.approvedEmail && d.approvedEmail.trim().toLowerCase() === d.buyerEmail.trim().toLowerCase()) return null;
  return 'Este acceso necesita tu código de comunidad o estar aprobado. Pide tu aprobación desde tu app, en «Mi cuenta».';
}
