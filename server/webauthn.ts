import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

/* Passkeys (Face ID / Touch ID / Windows Hello) para /admin -- ADEMÁS del
 * login con contraseña + TOTP que ya existe (server/adminSecurity.ts), no en
 * su reemplazo. Un dueño, varios dispositivos posibles: cada uno registra su
 * propia credencial (ver drizzle/schema.ts, adminWebauthnCredentials).
 *
 * Se usan "discoverable credentials" (passkeys de verdad, no solo WebAuthn a
 * secas): el login no necesita listar credenciales de antemano, el propio
 * sistema operativo le muestra al dueño cuál usar. */

export const WEBAUTHN_RP_NAME = 'Mansion Playroom Admin';

/** Dominio de producción: el rpID de las passkeys es SIEMPRE este, aunque el
 * panel se abra desde www (que redirige igual al apex). Un rpID distinto
 * dejaría las llaves registradas inutilizables. */
export const PRODUCTION_RP_ID = 'mansionplayroom.cl';

/** Identidad fija del dueño en el llavero. Sin esto, la librería inventa un
 * userID aleatorio en CADA registro, y iCloud guarda una llave nueva por cada
 * vez en vez de reemplazar la anterior -- de ahí la lista de varias "admin".
 * Con un userID constante, volver a registrar el mismo dispositivo reemplaza
 * la llave vieja. */
export const ADMIN_WEBAUTHN_USER_ID = new TextEncoder().encode('mansionplayroom-admin-owner');
export const ADMIN_WEBAUTHN_USER_ID_B64URL = Buffer.from(ADMIN_WEBAUTHN_USER_ID).toString('base64url');
export const ADMIN_WEBAUTHN_USER_NAME = 'Mansion Playroom';
export const ADMIN_WEBAUTHN_USER_DISPLAY_NAME = 'Admin Mansion Playroom';

/** rpID/origin se derivan del request real: así funciona igual en producción,
 * en cualquier preview de Vercel y en localhost, sin env vars nuevas. WebAuthn
 * exige que coincidan exacto con el origen real del navegador. Excepción: en
 * producción (apex o www) el rpID se fija a PRODUCTION_RP_ID. */
export function getRpIdAndOrigin(req: any): { rpID: string; origin: string } {
  const origin: string = req.headers.origin || `https://${req.headers.host}`;
  let rpID: string;
  try {
    rpID = new URL(origin).hostname;
  } catch {
    rpID = PRODUCTION_RP_ID;
  }
  if (rpID === PRODUCTION_RP_ID || rpID.endsWith(`.${PRODUCTION_RP_ID}`)) rpID = PRODUCTION_RP_ID;
  return { rpID, origin };
}

export async function buildRegistrationOptions(params: { rpID: string; existingCredentialIds: string[] }) {
  return generateRegistrationOptions({
    rpName: WEBAUTHN_RP_NAME,
    rpID: params.rpID,
    userID: ADMIN_WEBAUTHN_USER_ID,
    userName: ADMIN_WEBAUTHN_USER_NAME,
    userDisplayName: ADMIN_WEBAUTHN_USER_DISPLAY_NAME,
    attestationType: 'none',
    // Evita que el mismo dispositivo quede registrado dos veces.
    excludeCredentials: params.existingCredentialIds.map((id) => ({ id })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'required',
      authenticatorAttachment: 'platform',
    },
  });
}

export async function verifyRegistration(params: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
}) {
  return verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.expectedRPID,
  });
}

export async function buildAuthenticationOptions(params: { rpID: string }) {
  return generateAuthenticationOptions({
    rpID: params.rpID,
    userVerification: 'required',
  });
}

export async function verifyAuthentication(params: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  expectedOrigin: string;
  expectedRPID: string;
  credential: { id: string; publicKey: Uint8Array; counter: number; transports?: any };
}) {
  return verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: params.expectedChallenge,
    expectedOrigin: params.expectedOrigin,
    expectedRPID: params.expectedRPID,
    // El tipo exacto de buffer (ArrayBuffer vs ArrayBufferLike) no coincide
    // entre lib.dom y Node de punta, pero en runtime siempre es un
    // Uint8Array real -- la librería no distingue el subtipo del buffer.
    credential: params.credential as Parameters<typeof verifyAuthenticationResponse>[0]['credential'],
  });
}
