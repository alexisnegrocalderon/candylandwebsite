import { useEffect, useState } from 'react';
import { Fingerprint, Trash2 } from 'lucide-react';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { trpc } from '@/lib/trpc';
import { signalUnknownCredential } from '@/lib/passkeySignals';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useDemoProps, useIsSupervisor } from '@/lib/demoMode';

/** Botón de borrar reusado en todo el panel admin.
 *
 * Además de confirmar, pide la clave de admin: pedido explícito del dueño,
 * "que no se pueda eliminar nada sin mi clave". La sesión del panel dura 7
 * días, así que sin esto el 2FA protege ENTRAR pero no BORRAR -- con el
 * teléfono desbloqueado, un toque de más borra una compra o un evento sin
 * nada que lo frene. La clave se valida en el servidor en cada llamada
 * (`adminPasswordProcedure`), nunca acá.
 *
 * Alternativa a la clave: Face ID/Touch ID con el mismo passkey del login.
 * El servidor verifica la huella/cara y entrega un permiso de 60 s que viaja
 * en el mismo campo `adminPassword` (ver `signFaceIdDeleteGrant` en
 * server/routers.ts), así que los `onConfirm` de siempre no cambian.
 *
 * `description` debe nombrar qué se está por borrar (el evento, el código)
 * para que el diálogo se entienda solo. */
export function ConfirmDeleteButton({
  description,
  onConfirm,
  disabled,
  className,
  children,
  open: openProp,
  onOpenChange,
}: {
  description: string;
  onConfirm: (adminPassword: string) => void | Promise<unknown>;
  disabled?: boolean;
  /** Reemplaza el look por defecto (botón chico con solo el ícono de
   * tacho) -- usado por `SwipeToDeleteRow` para que el mismo diálogo de
   * siempre se dispare desde el botón rojo "Eliminar" que revela el swipe. */
  className?: string;
  children?: React.ReactNode;
  /** Modo controlado opcional -- `SwipeToDeleteCard` lo usa para abrir el
   * diálogo con un swipe largo, sin que haya que tocar el botón. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const demoProps = useDemoProps();
  // La supervisora nunca borra: el botón ni aparece (el servidor igual lo rechaza).
  const isSupervisor = useIsSupervisor();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => { setInnerOpen(v); onOpenChange?.(v); };
  const [adminPassword, setAdminPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [faceIdSupported, setFaceIdSupported] = useState(false);
  const [faceIdError, setFaceIdError] = useState('');
  const reauthOptions = trpc.auth.webauthnReauthOptions.useMutation();
  const reauthVerify = trpc.auth.webauthnReauthVerify.useMutation();

  useEffect(() => { setFaceIdSupported(browserSupportsWebAuthn()); }, []);

  // La clave no se conserva entre aperturas: si el diálogo se cierra, se
  // vuelve a pedir. Es justo el punto de pedirla cada vez.
  const close = () => { setOpen(false); setAdminPassword(''); setWorking(false); setFaceIdError(''); };

  const run = async (secret = adminPassword) => {
    if (!secret || working) return;
    setWorking(true);
    try {
      await onConfirm(secret);
      close();
    } catch {
      // El error ya se muestra por onMutationError en cada mutation; el
      // diálogo queda abierto para reintentar con la clave correcta.
      setWorking(false);
    }
  };

  const runConFaceId = async () => {
    if (working) return;
    setFaceIdError('');
    setWorking(true);
    let grant: string;
    try {
      const { options, ticket } = await reauthOptions.mutateAsync();
      const response = await startAuthentication({ optionsJSON: options });
      grant = (await reauthVerify.mutateAsync({ ticket, response })).grant;
    } catch (e: any) {
      const message: string = e?.message ?? '';
      if (message.startsWith('UNKNOWN_CREDENTIAL:')) {
        const staleId = message.slice('UNKNOWN_CREDENTIAL:'.length);
        if (staleId) signalUnknownCredential(staleId);
        setFaceIdError('Ese Face ID ya no está registrado en este panel. Usa tu clave, o vuelve a registrar el dispositivo en Ajustes.');
      } else if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') {
        setFaceIdError('Face ID cancelado. Intenta de nuevo o usa tu clave.');
      } else {
        setFaceIdError(message || 'No se pudo verificar con Face ID.');
      }
      setWorking(false);
      return;
    }
    setWorking(false);
    await run(grant);
  };

  if (isSupervisor) return null;

  return (
    <AlertDialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <AlertDialogTrigger asChild>
        {children ? (
          <button type="button" className={className} {...demoProps} disabled={disabled || demoProps.disabled}>
            {children}
          </button>
        ) : (
          <Button variant="outline" size="sm" className={`text-destructive ${className ?? ''}`} {...demoProps} disabled={disabled || demoProps.disabled}>
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar definitivamente?</AlertDialogTitle>
          <AlertDialogDescription>{description} Esta acción no se puede deshacer.</AlertDialogDescription>
        </AlertDialogHeader>
        {faceIdSupported && (
          <div>
            <Button
              type="button"
              variant="destructive"
              onClick={runConFaceId}
              disabled={working}
              className="w-full h-12 gap-2 text-base"
            >
              <Fingerprint className="w-5 h-5" />
              {working ? 'Verificando…' : 'Eliminar con Face ID'}
            </Button>
            {faceIdError && <p className="text-xs text-destructive mt-1.5" role="alert">{faceIdError}</p>}
            <p className="text-xs text-muted-foreground mt-3 text-center">o con tu clave de admin</p>
          </div>
        )}
        <div>
          <Input
            type="password"
            autoFocus={!faceIdSupported}
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } }}
            placeholder="Tu clave de admin"
          />
          <p className="text-xs text-muted-foreground mt-1.5">Se pide en cada borrado, no basta con tener la sesión abierta.</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); run(); }}
            disabled={!adminPassword || working}
            className={buttonVariants({ variant: faceIdSupported ? 'outline' : 'destructive' })}
          >
            {working ? 'Eliminando…' : 'Eliminar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
