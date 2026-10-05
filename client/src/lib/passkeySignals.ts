/* Signal API de WebAuthn (Safari/iOS 26+, Chrome 132+): le avisa al llavero
 * qué llaves siguen valiendo, para que quite solo las viejas -- sin esto, una
 * llave borrada en Ajustes seguía apareciendo en el llavero del teléfono y
 * hacía fallar el Face ID. Todo es "mejor esfuerzo": si el navegador no tiene
 * la API, o falla, no pasa nada y se ignora. */

const RP_ID = typeof window !== 'undefined' && window.location.hostname.endsWith('mansionplayroom.cl')
  ? 'mansionplayroom.cl'
  : typeof window !== 'undefined' ? window.location.hostname : 'mansionplayroom.cl';

type SignalApi = {
  signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void>;
  signalAllAcceptedCredentials?: (o: { rpId: string; userId: string; allAcceptedCredentialIds: string[] }) => Promise<void>;
  signalCurrentUserDetails?: (o: { rpId: string; userId: string; name: string; displayName: string }) => Promise<void>;
};

function api(): SignalApi | null {
  const pkc = typeof window !== 'undefined' ? (window as any).PublicKeyCredential : undefined;
  return pkc ?? null;
}

/** El servidor no reconoce esta llave: pídele al llavero que la quite. */
export async function signalUnknownCredential(credentialId: string) {
  try { await api()?.signalUnknownCredential?.({ rpId: RP_ID, credentialId }); } catch { /* mejor esfuerzo */ }
}

/** Estas son las únicas llaves vigentes: el llavero oculta/quita el resto. */
export async function signalAcceptedCredentials(params: { userId: string; name: string; displayName: string; credentialIds: string[] }) {
  try {
    await api()?.signalAllAcceptedCredentials?.({ rpId: RP_ID, userId: params.userId, allAcceptedCredentialIds: params.credentialIds });
    await api()?.signalCurrentUserDetails?.({ rpId: RP_ID, userId: params.userId, name: params.name, displayName: params.displayName });
  } catch { /* mejor esfuerzo */ }
}
