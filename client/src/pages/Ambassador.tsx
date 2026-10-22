import { useState } from 'react';
import { motion } from 'framer-motion';
import { useRoute, useLocation, Link } from 'wouter';
import { Check, Copy, KeyRound, Crown } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AmbassadorContent } from '@/components/site/AmbassadorContent';
import { AmbassadorDetails } from '@/components/site/AmbassadorDetails';

/* Panel del embajador VIP: /embajador/<CODIGO>.
 *
 * Sin login, igual que /mis-referidos y /mis-puntos: el código hace de llave.
 * Es el mismo criterio ya usado en el sitio -- los embajadores no tienen
 * cuenta y agregarles una sería más friction que seguridad. El servidor
 * enmascara los correos de los clientes justamente porque esta vista es
 * alcanzable con solo el código.
 *
 * `noindex`: muestra plata, no puede quedar en Google. */
export default function Ambassador() {
  const [, params] = useRoute('/embajador/:code');
  const [, setLocation] = useLocation();
  const codeFromUrl = (params?.code ?? '').toUpperCase();

  useSeo({
    title: 'Panel de Embajador — Mansion Playroom',
    description: 'Tus ventas, tu comisión y tus beneficios como embajador.',
    path: codeFromUrl ? `/embajador/${codeFromUrl}` : '/embajador',
    noindex: true,
  });

  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const { data, isLoading, isFetched } = trpc.ambassadors.getPanelByCode.useQuery(
    { code: codeFromUrl },
    { enabled: !!codeFromUrl, retry: false },
  );

  // Sin código en la URL: formulario para entrar.
  if (!codeFromUrl) {
    return (
      <div className="min-h-screen pt-28 pb-16">
        <div className="container max-w-lg text-center">
          <div className="w-16 h-16 mx-auto mb-5 border border-primary/30 rounded-2xl flex items-center justify-center bg-primary/5">
            <Crown className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-heading text-3xl mb-3">Panel de Embajador</h1>
          <p className="text-muted-foreground mb-6">
            Escribe tu código de embajador para ver tus ventas, tu comisión y tus beneficios.
          </p>
          <p className="text-sm text-muted-foreground mb-6 -mt-3">
            O entra a <Link href="/cuenta" className="text-primary underline">Mi cuenta</Link> con tu correo de embajador: ahí tienes todo a mano.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); if (codeInput.trim()) setLocation(`/embajador/${codeInput.trim().toUpperCase()}`); }}
            className="flex gap-2 max-w-sm mx-auto"
          >
            <Input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder="TU-CODIGO"
              className="h-12 text-center font-mono uppercase"
            />
            <Button type="submit" size="lg" className="interactive glow-pink shrink-0" disabled={!codeInput.trim()}>
              <KeyRound className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isFetched && !data) {
    return (
      <div className="min-h-screen pt-28 pb-16">
        <div className="container max-w-lg text-center">
          <p className="text-5xl mb-4" aria-hidden>🔍</p>
          <h1 className="font-heading text-2xl mb-3">No encontramos ese código</h1>
          <p className="text-muted-foreground mb-6">
            Revisa que esté bien escrito. Si crees que es un error, escríbenos por Instagram.
          </p>
          <Link href="/embajador" className="inline-flex h-12 items-center px-8 rounded-full border border-border text-sm font-semibold">
            Probar otro código
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(data.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    if (!data.referralUrl) return;
    navigator.clipboard.writeText(data.referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="min-h-screen pt-28 pb-16">
      <div className="container max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>

          {/* Identidad + código */}
          <div className="text-center mb-8">
            <p className="text-sm uppercase tracking-[0.3em] text-primary mb-2">Panel de Embajador</p>
            <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-1">{data.name}</h1>
            {!data.active && (
              <p className="text-sm text-amber-400 mt-2">Tu código está desactivado ahora mismo. Escríbenos para reactivarlo.</p>
            )}
            <button
              onClick={handleCopy}
              className="mt-5 inline-flex items-center gap-2 px-5 h-12 rounded-full bg-primary/10 border border-primary/30 font-mono font-bold text-primary text-lg interactive"
            >
              {data.code}
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
            <p className="text-xs text-muted-foreground mt-2">
              {copied ? '¡Copiado!' : 'Toca para copiar y compartir tu código'}
            </p>

            {/* Link personal (ver client/src/lib/ambassadorRef.ts): a
                diferencia del código, esto atribuye la venta solo con abrir
                el link -- mejor para el swipe-up de una historia, donde
                nadie transcribe un código a mano. Solo aparece si hay un
                evento destacado al que apuntar. */}
            {data.referralUrl && (
              <div className="mt-4 max-w-md mx-auto">
                <button
                  onClick={handleCopyLink}
                  className="w-full inline-flex items-center justify-between gap-2 px-4 h-11 rounded-full bg-secondary/10 border border-secondary/30 font-mono text-xs text-foreground interactive"
                >
                  <span className="truncate">{data.referralUrl}</span>
                  {copiedLink ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  {copiedLink ? '¡Copiado!' : 'Tu link para el sticker «Enlace» de tus historias: las ventas quedan atribuidas solas'}
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center -mt-4 mb-6">
            Tip: entra a <Link href="/cuenta" className="text-primary underline">Mi cuenta</Link> con tu correo de embajador y tendrás todo esto a mano, sin escribir tu código.
          </p>

          <AmbassadorContent code={data.code} events={data.contentEvents ?? []} items={data.contentItems ?? []} material={data.weeklyMaterial ?? null} />

          <AmbassadorDetails data={data} />
        </motion.div>
      </div>
    </div>
  );
}
