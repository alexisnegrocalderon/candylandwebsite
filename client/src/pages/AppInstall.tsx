import { useEffect, useState } from 'react';
import { BellRing, Share, SquarePlus, Ticket, Zap } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';
import { PushPrompt } from '@/components/site/PushPrompt';
import { isIos, isStandalone, pushPlatform } from '@/lib/customerPush';

/* /app: a donde lleva el QR de la puerta y el botón "Instalar la app" del
 * correo. Enseña a agregar Playroom a inicio (en iPhone es obligatorio para
 * recibir avisos) y, ya instalada, invita a activar los avisos. */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const BENEFITS = [
  { icon: Ticket, text: 'Tu entrada y tu QR a un toque, sin buscar el correo.' },
  { icon: Zap, text: 'Abre al tiro, a pantalla completa, como cualquier app.' },
  { icon: BellRing, text: 'Preventas, concursos y el recordatorio del día de tu evento.' },
];

export default function AppInstall() {
  useSeo({ title: 'Instala la app — Mansion Playroom', description: 'Agrega Mansion Playroom a tu inicio: tu entrada, preventas y concursos a un toque.', path: '/app', noindex: true });
  const [installed] = useState(() => isStandalone());
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const platform = pushPlatform();

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const step = (n: number, body: React.ReactNode) => (
    <li className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">{n}</span>
      <span className="pt-0.5 text-sm text-muted-foreground">{body}</span>
    </li>
  );

  return (
    <div className="min-h-dvh pt-24 pb-16">
      <div className="container max-w-md space-y-6">
        <div className="text-center">
          <img src="/candyland/favicon-192.png" alt="" className="mx-auto mb-4 h-20 w-20 rounded-[22px] shadow-lg" />
          <h1 className="font-heading text-3xl font-extrabold">{installed ? 'Ya tienes la app 🎉' : 'Lleva Playroom en tu teléfono'}</h1>
        </div>

        {!installed && (
          <ul className="space-y-3">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        )}

        {!installed && (
          <div className="rounded-2xl border border-border bg-card p-5">
            {isIos() ? (
              <>
                <p className="mb-3 font-heading font-bold">Agrégala en 3 pasos</p>
                <ol className="space-y-3">
                  {step(1, <>Abre esta página en <b className="text-foreground">Safari</b> y toca <Share className="mx-0.5 inline h-4 w-4 text-sky-500" /> <b className="text-foreground">Compartir</b>.</>)}
                  {step(2, <>Elige <SquarePlus className="mx-0.5 inline h-4 w-4" /> <b className="text-foreground">Agregar a inicio</b>.</>)}
                  {step(3, <>Abre <b className="text-foreground">Playroom</b> desde el ícono nuevo y activa los avisos.</>)}
                </ol>
              </>
            ) : platform === 'android' || deferred ? (
              <>
                <p className="mb-3 font-heading font-bold">Instálala en un toque</p>
                {deferred ? (
                  <button type="button" onClick={() => deferred.prompt()} className="h-12 w-full rounded-full bg-primary font-bold text-primary-foreground interactive">Instalar la app</button>
                ) : (
                  <ol className="space-y-3">
                    {step(1, <>Toca el menú <b className="text-foreground">⋮</b> del navegador.</>)}
                    {step(2, <>Elige <b className="text-foreground">Instalar app</b> o <b className="text-foreground">Agregar a la pantalla de inicio</b>.</>)}
                  </ol>
                )}
              </>
            ) : (
              <>
                <p className="mb-2 font-heading font-bold">Mejor desde tu teléfono</p>
                <p className="mb-3 text-sm text-muted-foreground">Escanea este código con la cámara de tu celular para instalarla.</p>
                <img src="/api/app-qr.png?src=web" alt="QR para instalar la app" className="mx-auto h-44 w-44 rounded-xl border border-border" />
              </>
            )}
          </div>
        )}

        {/* En iPhone sin instalar, los pasos de arriba ya enseñan lo mismo. */}
        {(installed || !isIos()) && <PushPrompt source="app" />}
      </div>
    </div>
  );
}
