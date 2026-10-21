import { useState } from 'react';
import { Loader2, MailX, CheckCircle2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';

/* Baja de correos de promociones: el link del pie de cada correo de marketing
 * llega acá con el correo y su firma (server/unsubscribe.ts). Se confirma con un
 * botón (así un escáner de links del correo no da de baja a nadie solo). */
export default function Baja() {
  useSeo({ title: 'Darme de baja — Mansion Playroom', description: 'Deja de recibir correos de promociones.', path: '/baja', noindex: true });
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const e = params.get('e') ?? '';
  const t = params.get('t') ?? '';
  const [done, setDone] = useState<string | null>(null);
  const confirm = trpc.unsubscribe.confirm.useMutation({ onSuccess: (r) => setDone(r.email) });

  return (
    <div className="min-h-dvh pt-24 pb-16">
      <div className="container max-w-md text-center space-y-5">
        {done ? (
          <>
            <CheckCircle2 className="w-12 h-12 mx-auto text-primary" />
            <h1 className="font-heading font-extrabold text-2xl">Listo, ya no te escribiremos</h1>
            <p className="text-sm text-muted-foreground">
              Dimos de baja <b className="text-foreground">{done}</b> de los correos de promociones. Si compras una entrada, igual te llegará la confirmación con tu QR, porque es parte de tu compra.
            </p>
          </>
        ) : (
          <>
            <MailX className="w-12 h-12 mx-auto text-primary" />
            <h1 className="font-heading font-extrabold text-2xl">¿Quieres dejar de recibir correos?</h1>
            <p className="text-sm text-muted-foreground">
              Te damos de baja de los correos de promociones, avisos y concursos de Mansion Playroom. Seguirás recibiendo la confirmación y el QR de tus compras.
            </p>
            {!e || !t ? (
              <p className="text-sm text-destructive">Este link está incompleto. Abre el botón de baja que viene al final de tu correo.</p>
            ) : (
              <button
                type="button"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate({ e, t })}
                className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-primary text-primary-foreground font-bold text-sm uppercase tracking-wide interactive disabled:opacity-60"
              >
                {confirm.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Darme de baja
              </button>
            )}
            {confirm.error && <p className="text-sm text-destructive">{confirm.error.message}</p>}
          </>
        )}
      </div>
    </div>
  );
}
