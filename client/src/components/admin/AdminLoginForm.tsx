import { useEffect, useState } from 'react';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Fingerprint } from 'lucide-react';

/** Login del panel en dos pasos: contraseña y luego el código de la app de
 * autenticación. La contraseña sola ya no entrega sesión.
 *
 * Además, si el dispositivo tiene un passkey registrado (Face ID/Touch ID,
 * ver Ajustes → Seguridad), se puede entrar directo sin pasar por ninguno de
 * los dos pasos -- es un camino adicional, no reemplaza al de arriba. */
export function AdminLoginForm() {
  const utils = trpc.useUtils();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qrImageUrl: string } | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [webauthnSupported, setWebauthnSupported] = useState(false);
  const [webauthnPending, setWebauthnPending] = useState(false);

  useEffect(() => { setWebauthnSupported(browserSupportsWebAuthn()); }, []);

  const entrar = async () => { setError(''); await utils.auth.me.invalidate(); };

  const webauthnLoginOptions = trpc.auth.webauthnLoginOptions.useMutation();
  const webauthnLoginVerify = trpc.auth.webauthnLoginVerify.useMutation();

  const loginConFaceId = async () => {
    setError('');
    setWebauthnPending(true);
    try {
      const { options, ticket } = await webauthnLoginOptions.mutateAsync();
      const response = await startAuthentication({ optionsJSON: options });
      await webauthnLoginVerify.mutateAsync({ ticket, response });
      await entrar();
    } catch (e: any) {
      // El usuario cancela el prompt (o no tiene ningún passkey guardado
      // todavía) -- no es un error real, no hace falta gritarlo en rojo.
      if (e?.name !== 'NotAllowedError') setError(e?.message || 'No se pudo verificar con Face ID/Touch ID.');
    } finally {
      setWebauthnPending(false);
    }
  };

  const setupTotp = trpc.auth.adminSetupTotp.useMutation({
    onSuccess: (r) => setSetup(r),
    onError: (e) => setError(e.message),
  });

  const login = trpc.auth.adminLogin.useMutation({
    onSuccess: (r) => {
      setError('');
      if (r.skipped2fa) { entrar(); return; }
      setTicket(r.ticket);
      if (r.needsSetup) setupTotp.mutate({ ticket: r.ticket });
    },
    onError: (e) => setError(e.message),
  });

  const confirmTotp = trpc.auth.adminConfirmTotp.useMutation({
    onSuccess: (r) => { setError(''); setBackupCodes(r.backupCodes); },
    onError: (e) => { setError(e.message); setCode(''); },
  });

  const verify = trpc.auth.adminVerifyCode.useMutation({
    onSuccess: (r) => {
      if (r.backupCodeUsed) {
        alert(`Entraste con un código de respaldo. Te quedan ${r.backupCodesLeft}.`);
      }
      entrar();
    },
    onError: (e) => { setError(e.message); setCode(''); },
  });

  // Los códigos de respaldo se muestran UNA sola vez: después solo queda
  // su hash guardado, y ni el sistema puede recuperarlos.
  if (backupCodes) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h2 className="font-heading text-2xl mb-2">Guarda estos códigos</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Son tu única forma de entrar si pierdes el teléfono. Se muestran una sola vez —
            anótalos en un papel o guárdalos en tu gestor de contraseñas. Cada uno sirve una vez.
          </p>
          <div className="grid grid-cols-2 gap-2 mb-6">
            {backupCodes.map((c) => (
              <code key={c} className="p-3 rounded-lg bg-muted font-mono text-sm tracking-wider">{c}</code>
            ))}
          </div>
          <Button onClick={entrar} className="interactive w-full h-12">Ya los guardé, entrar</Button>
        </div>
      </div>
    );
  }

  // Configuración inicial del segundo factor.
  if (setup) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h2 className="font-heading text-2xl mb-2">Configura tu segundo factor</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Escanea este código con Google Authenticator (o la app que uses) y escribe el número que aparece.
          </p>
          <img src={setup.qrImageUrl} alt="Código QR para la app de autenticación" className="w-56 h-56 mx-auto rounded-xl mb-3" />
          <p className="text-xs text-amber-600 mb-4">
            Escribe el código sin recargar la página ni volver atrás. Si algo sale mal,
            vuelve a empezar desde la contraseña: el mismo QR sigue sirviendo.
          </p>
          <details className="mb-5 text-xs text-muted-foreground">
            <summary className="cursor-pointer">¿No puedes escanear?</summary>
            <code className="block mt-2 p-2 rounded bg-muted font-mono break-all">{setup.secret}</code>
          </details>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoFocus
            className="mb-3 h-14 text-center text-2xl tracking-[0.4em] font-mono"
          />
          {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}
          <Button
            onClick={() => ticket && confirmTotp.mutate({ ticket, code })}
            disabled={code.length !== 6 || confirmTotp.isPending}
            className="interactive w-full h-12"
          >
            {confirmTotp.isPending ? 'Verificando…' : 'Confirmar'}
          </Button>
        </div>
      </div>
    );
  }

  // Paso 2: el código.
  if (ticket) {
    return (
      <div className="min-h-screen pt-24 flex items-center justify-center px-4">
        <div className="w-full max-w-xs text-center">
          <h2 className="font-heading text-2xl mb-2">Código de verificación</h2>
          <p className="text-muted-foreground text-sm mb-5">
            Abre tu app de autenticación y escribe el número. También sirve uno de tus códigos de respaldo.
          </p>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 9))}
            placeholder="000000"
            autoFocus
            className="mb-3 h-14 text-center text-2xl tracking-[0.3em] font-mono"
          />
          {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}
          <Button
            onClick={() => verify.mutate({ ticket, code })}
            disabled={code.length < 6 || verify.isPending}
            className="interactive w-full h-12"
          >
            {verify.isPending ? 'Verificando…' : 'Entrar'}
          </Button>
          <button
            onClick={() => { setTicket(null); setCode(''); setPassword(''); setError(''); }}
            className="text-xs text-muted-foreground mt-4 underline"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  // Paso 1: la contraseña.
  return (
    <div className="min-h-screen pt-24 flex items-center justify-center px-4">
      <form
        onSubmit={(e) => { e.preventDefault(); if (password) login.mutate({ password }); }}
        className="text-center w-full max-w-xs"
      >
        <h2 className="font-heading text-3xl mb-4">Acceso Restringido</h2>
        <p className="text-muted-foreground mb-6">Ingresa la contraseña de administrador.</p>
        {webauthnSupported && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={loginConFaceId}
              disabled={webauthnPending}
              className="interactive w-full mb-4 gap-2"
            >
              <Fingerprint className="w-4 h-4" />
              {webauthnPending ? 'Verificando…' : 'Usar Face ID / Touch ID'}
            </Button>
            <div className="flex items-center gap-3 mb-4 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> o <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
          className="mb-3 h-12 text-center"
        />
        {error && <p className="text-sm text-destructive mb-3" role="alert">{error}</p>}
        <Button type="submit" disabled={login.isPending || setupTotp.isPending || !password} className="interactive w-full">
          {login.isPending || setupTotp.isPending ? 'Entrando…' : 'Continuar'}
        </Button>
      </form>
    </div>
  );
}
