import crypto from 'crypto';
import { generateSecret, generateSync, verifySync, generateURI } from 'otplib';

/* Segundo factor del panel de administración.
 *
 * Antes de esto, /admin se protegía con una sola contraseña y SIN ningún
 * límite de intentos -- un script podía probar miles por minuto contra el
 * panel que puede borrar compras y exportar la base entera. La caja, en
 * cambio, ya tenía límite por IP, bloqueo por intentos y dispositivo
 * enrolado. Esto empareja la cancha del lado que más lo necesitaba. */

/** Tolerancia de reloj, en segundos. Un teléfono desfasado medio minuto es
 * normal; más que eso ya es una señal de que algo raro pasa. */
export const TOTP_TOLERANCE_SECONDS = 30;

export const BACKUP_CODE_COUNT = 8;

/** Sin I, O, 0 ni 1: estos códigos se anotan a mano en un papel y se
 * tipean bajo presión, cuando el dueño ya perdió el teléfono. */
const BACKUP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// --- Contraseña ---

/** Comparación de tiempo constante. La versión anterior usaba `!==`, que
 * corta apenas encuentra el primer carácter distinto y, en teoría, filtra
 * información por el tiempo que tarda. Se hashea primero para que
 * `timingSafeEqual` reciba siempre el mismo largo (si no, lanza excepción
 * con largos distintos, que a su vez filtraría el largo de la clave). */
export function safeCompare(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a ?? '').digest();
  const hb = crypto.createHash('sha256').update(b ?? '').digest();
  return crypto.timingSafeEqual(ha, hb);
}

// --- TOTP ---

export function createTotpSecret(): string {
  return generateSecret();
}

/** URI `otpauth://` que se convierte en el QR que escanea Google
 * Authenticator. El QR se dibuja con el paquete `qrcode`, que ya es
 * dependencia del proyecto (server/qr.ts). */
export function totpUri(secret: string, label = 'admin'): string {
  return generateURI({ secret, issuer: 'Candyland', label });
}

export type TotpResult = { ok: true; timeStep: number } | { ok: false; reason: 'invalido' | 'reusado' };

/** Valida un código de la app de autenticación.
 *
 * `lastUsedStep` es lo que impide reusar un código: cada código vive 30
 * segundos, así que sin esto alguien que alcance a verlo en pantalla puede
 * volver a usarlo dentro de esa ventana. otplib lo resuelve con
 * `afterTimeStep`, que rechaza cualquier paso menor o igual al último. */
export function verifyTotp(params: {
  secret: string;
  token: string;
  lastUsedStep?: number | null;
  now?: Date;
}): TotpResult {
  const token = (params.token ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return { ok: false, reason: 'invalido' };

  const epoch = Math.floor((params.now?.getTime() ?? Date.now()) / 1000);

  const res = verifySync({
    secret: params.secret,
    token,
    epoch,
    epochTolerance: TOTP_TOLERANCE_SECONDS,
    ...(params.lastUsedStep != null ? { afterTimeStep: params.lastUsedStep } : {}),
  });

  if (!res.valid) {
    // Distinguir "código malo" de "código ya usado" ayuda a explicarle al
    // dueño por qué le rebotó un código que ve correcto en su pantalla.
    if (params.lastUsedStep != null) {
      const sinReplay = verifySync({ secret: params.secret, token, epoch, epochTolerance: TOTP_TOLERANCE_SECONDS });
      if (sinReplay.valid) return { ok: false, reason: 'reusado' };
    }
    return { ok: false, reason: 'invalido' };
  }

  // `verifySync` devuelve un tipo union (TOTP | HOTP) y solo la rama TOTP
  // trae `timeStep`. Acá siempre es TOTP -- es la estrategia por defecto --
  // pero se comprueba en tiempo de ejecución en vez de forzar el tipo: si
  // el `timeStep` no llegara, la protección contra reenvío quedaría muda.
  const timeStep = (res as { timeStep?: number }).timeStep;
  if (typeof timeStep !== 'number') return { ok: false, reason: 'invalido' };

  return { ok: true, timeStep };
}

/** Solo para tests y para la pantalla de configuración: genera el código
 * que la app mostraría en este instante. */
export function currentTotpToken(secret: string, now: Date = new Date()): string {
  return generateSync({ secret, epoch: Math.floor(now.getTime() / 1000) });
}

// --- Códigos de respaldo ---

export function hashBackupCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeBackupCode(code)).digest('hex');
}

/** Tolera minúsculas, espacios y que el guion falte: se tipean a mano. */
export function normalizeBackupCode(code: string): string {
  return (code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Genera los códigos de respaldo. Devuelve los legibles (se muestran UNA
 * sola vez) y los hasheados (lo único que se guarda). */
export function generateBackupCodes(count = BACKUP_CODE_COUNT): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  for (let i = 0; i < count; i++) {
    const chars: string[] = [];
    // 8 caracteres de un alfabeto de 32 = 40 bits de entropía por código.
    const bytes = crypto.randomBytes(8);
    for (let j = 0; j < 8; j++) chars.push(BACKUP_ALPHABET[bytes[j] % BACKUP_ALPHABET.length]);
    plain.push(`${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`);
  }
  return { plain, hashed: plain.map(hashBackupCode) };
}

/** Consume un código de respaldo. Devuelve la lista sin él, para que no
 * pueda usarse dos veces. */
export function consumeBackupCode(hashed: string[], code: string): { ok: boolean; remaining: string[] } {
  const target = hashBackupCode(code);
  const idx = hashed.findIndex((h) => safeCompare(h, target));
  if (idx === -1) return { ok: false, remaining: hashed };
  return { ok: true, remaining: hashed.filter((_, i) => i !== idx) };
}
