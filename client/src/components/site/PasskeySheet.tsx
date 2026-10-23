import { useEffect } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, ScanFace, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { BottomSheet } from '@/components/site/AccountPayments';
import { biometricName, markPasskeyHere, markPasskeyOfferSeen, passkeyUsedHere, thisDeviceName, usePasskeyRegister } from '@/lib/memberPasskey';
import { signalAcceptedCredentials } from '@/lib/passkeySignals';
import { fmtDate } from '@/lib/member';

/* Perfil → «Entrar con Face ID»: activarlo en este teléfono, ver dónde está activo y quitarlo.
 * `offer`: la misma hoja como invitación, justo después de entrar con el código (una vez). */
export function PasskeySheet({ open, onClose, offer = false }: { open: boolean; onClose: () => void; offer?: boolean }) {
  const name = biometricName();
  const device = thisDeviceName();
  const list = trpc.member.passkeys.useQuery(undefined, { enabled: open, retry: false });
  const del = trpc.member.passkeyDelete.useMutation({ onSuccess: () => list.refetch() });
  const reg = usePasskeyRegister(open);
  const keys = list.data?.list ?? [];
  const activeHere = passkeyUsedHere() && keys.length > 0;

  // El llavero del teléfono se entera de qué llaves siguen valiendo (y borra las que se quitaron acá).
  const data = list.data;
  useEffect(() => {
    if (!data) return;
    void signalAcceptedCredentials({ userId: data.userId, name: data.email, displayName: data.email, credentialIds: data.list.map((k) => k.credentialId) });
    if (data.list.length === 0) markPasskeyHere(false);
  }, [data]);

  const close = () => { if (offer) markPasskeyOfferSeen(); onClose(); };
  const activate = async () => {
    if (await reg.register()) {
      toast.success(`Listo: la próxima vez entras con ${name}.`);
      if (offer) close();
    }
  };

  return (
    <BottomSheet open={open} onClose={close} title={`Entrar con ${name}`}>
      <div className="space-y-4 pb-2">
        <div className="flex flex-col items-center gap-3 pt-1 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-gradient-to-br from-pink-500 to-sky-500 shadow-[0_10px_30px_-8px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.45)]">
            <ScanFace className="h-8 w-8 text-white" strokeWidth={1.8} />
          </span>
          <p className="text-title3 font-bold">{offer ? `¿Entrar con ${name} la próxima vez?` : `Sin esperar el código`}</p>
          <p className="text-subhead text-white/70">
            Te reconoce el teléfono y estás dentro, sin esperar el código al correo. {name === 'Face ID' ? 'Tu cara nunca sale del teléfono' : name === 'Touch ID' || name === 'tu huella' ? 'Tu huella nunca sale del teléfono' : 'Tu huella o tu cara nunca salen del dispositivo'}: nosotros solo guardamos una llave segura.
          </p>
        </div>

        {activeHere ? (
          <p className="flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-400/15 text-subhead font-semibold text-emerald-300"><Check className="h-4 w-4" /> Activado en {device}</p>
        ) : (
          <button type="button" onClick={() => { void activate(); }} disabled={reg.busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-sky-500 text-headline font-bold text-white shadow-[0_10px_28px_-8px_rgba(236,72,153,0.7),inset_0_1px_0_rgba(255,255,255,0.4)] interactive disabled:opacity-60">
            {reg.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanFace className="h-5 w-5" />} Activar en {device}
          </button>
        )}
        {reg.error && <p className="text-center text-footnote text-rose-300" role="alert">{reg.error}</p>}
        {offer && !activeHere && <button type="button" onClick={close} className="block w-full py-1 text-center text-subhead font-semibold text-white/60">Ahora no</button>}

        {keys.length > 0 && (
          <div className="space-y-2">
            <p className="px-1 text-footnote font-semibold uppercase tracking-wide text-white/60">Activo en</p>
            <div className="account-glass divide-y divide-white/10 overflow-hidden rounded-[22px]">
              {keys.map((k) => (
                <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                  <ScanFace className="h-5 w-5 shrink-0 text-pink-300" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold leading-tight">{k.deviceLabel}</span>
                    <span className="block text-footnote text-white/60">{k.lastUsedAt ? `Usado el ${fmtDate(k.lastUsedAt)}` : `Activado el ${fmtDate(k.createdAt)}`}</span>
                  </span>
                  <button type="button" onClick={() => del.mutate({ id: k.id })} disabled={del.isPending} aria-label={`Quitar ${name} de ${k.deviceLabel}`}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-rose-300 interactive disabled:opacity-50">
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                </div>
              ))}
            </div>
            <p className="px-1 text-caption1 text-white/60">Si quitas uno, ese dispositivo vuelve a entrar con el código al correo.</p>
          </div>
        )}
        {list.isError && <p className="text-center text-footnote text-white/60">No pudimos ver dónde está activo. Revisa tu conexión.</p>}
      </div>
    </BottomSheet>
  );
}
