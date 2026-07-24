import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { CheckCircle, Ticket, Mail, Sparkles } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

/* Bienvenida post-pago: el momento en que la persona queda oficialmente
 * "adentro" de Candyland. La animación del dulce sumándose es deliberadamente
 * simple (emoji + spring) — queda pendiente reemplazarla por una pieza
 * ilustrada de Higgsfield si se quiere algo más elaborado. */
export default function PaymentSuccess() {
  useSeo({
    title: 'Pago exitoso — Mansion Playroom',
    description: 'Confirmación de compra de entradas para eventos de Mansion Playroom.',
    path: '/pago/exito',
    noindex: true,
  });

  return (
    <div className="min-h-screen pt-24 pb-16 flex items-center justify-center overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-lg mx-auto px-4"
      >
        <div className="relative w-24 h-24 mx-auto mb-6">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.15 }}
            className="w-24 h-24 rounded-full glass-candy flex items-center justify-center text-5xl"
          >
            🍭
          </motion.div>
          <motion.span
            initial={{ scale: 0, opacity: 0, y: 4 }}
            animate={{ scale: 1.1, opacity: 1, y: -10 }}
            transition={{ duration: 0.7, delay: 0.5, ease: [0.34, 1.4, 0.64, 1] }}
            className="absolute -top-1 -right-1 text-2xl"
            aria-hidden
          >
            ✨
          </motion.span>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="font-heading text-4xl md:text-5xl mb-3 text-gradient-candy"
        >
          ¡Bienvenidx a Candyland!
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground text-lg mb-2"
        >
          Tu pago fue confirmado y ya sumaste tu dulce a la Misión 300.
        </motion.p>
        <p className="text-muted-foreground text-sm mb-8 inline-flex items-center gap-1.5 justify-center">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> En breve recibirás un email con tu entrada y código QR.
        </p>

        <div className="bg-card border border-border/50 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Mail className="w-5 h-5 text-primary" />
            <span className="text-sm">Revisa tu bandeja de entrada</span>
          </div>
          <div className="flex items-center gap-3">
            <Ticket className="w-5 h-5 text-primary" />
            <span className="text-sm">Tu QR es tu entrada al evento</span>
          </div>
        </div>

        <Link
          href="/eventos"
          className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full font-semibold transition-all hover:scale-105 active:scale-95 interactive"
        >
          Ver más eventos
        </Link>
      </motion.div>
    </div>
  );
}
