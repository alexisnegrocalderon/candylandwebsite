import { useState } from 'react';
import { motion } from 'framer-motion';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useSeo } from '@/hooks/useSeo';
import { parseTicketCodeFromQr } from '@shared/qr';

/* Punto de entrada público a Playmatch (la capa social de la fiesta): antes
 * la única forma de llegar a `/fiesta/:ticketCode` era el botón condicional
 * de `/verificar/:ticketCode`, que solo aparece una vez hecho el check-in en
 * la puerta -- no había ningún link fijo en el sitio. Como cada perfil está
 * atado a un ticketCode, esta página no valida nada: solo redirige a
 * `/fiesta/<código>`, que ya sabe explicar por qué no puedes entrar todavía
 * (ver ClosedDoor en Party.tsx). */
export default function Playmatch() {
  useSeo({
    title: 'Playmatch — Mansion Playroom',
    description: 'Conecta con la gente que está en la fiesta contigo. Solo para quienes ya entraron al evento.',
    path: '/playmatch',
  });

  const [, setLocation] = useLocation();
  const [code, setCode] = useState('');

  const entrar = () => {
    const parsed = parseTicketCodeFromQr(code) ?? code.trim().toUpperCase();
    if (!parsed) { toast.error('Escribe el código de tu entrada.'); return; }
    setLocation(`/fiesta/${parsed}`);
  };

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-2xl mx-auto text-center"
        >
          <p className="text-sm uppercase tracking-[0.3em] text-primary mb-4">Playmatch 🍬</p>
          <h1 className="font-heading text-5xl md:text-6xl tracking-tight mb-6">
            La fiesta también vive en tu <span className="text-gradient">celular</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed mb-10">
            Conecta con quien está en la fiesta contigo, ahora mismo. Toca a alguien y, si acepta, se abre el chat —
            y hasta puedes invitarle un trago que retira en la barra. Solo funciona para quienes ya entraron al
            evento, y solo mientras dura la fiesta.
          </p>

          <div className="bg-card border border-border/50 rounded-2xl p-6 md:p-8 text-left">
            <label className="text-sm font-semibold mb-2 block">Código de tu entrada</label>
            <p className="text-muted-foreground text-sm mb-4">
              Es el mismo código que te llegó por email (formato MP-XXXX...), o el QR de tu ticket.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && entrar()}
                placeholder="MP-XXXXXXXXXXXX"
                className="flex-1 h-14 px-5 rounded-full bg-background border border-border/60 text-base font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
              <button
                onClick={entrar}
                className="btn-jelly h-14 px-8 rounded-full bg-primary text-white font-bold interactive shrink-0"
              >
                Entrar
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-6">
            ¿Ya tienes tu ticket a mano? Entra directo desde el botón "Entrar a Playmatch" en la página de tu entrada.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
