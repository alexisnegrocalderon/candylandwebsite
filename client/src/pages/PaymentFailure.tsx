import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { XCircle } from 'lucide-react';
import { useSeo } from '@/hooks/useSeo';

export default function PaymentFailure() {
  useSeo({
    title: 'Pago no procesado — Mansion Playroom',
    description: 'Resultado de un intento de pago de entradas para eventos de Mansion Playroom.',
    path: '/pago/error',
    noindex: true,
  });

  return (
    <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-lg mx-auto px-4"
      >
        <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-destructive" />
        </div>
        <h1 className="font-heading text-4xl md:text-5xl mb-4">Pago no procesado</h1>
        <p className="text-muted-foreground text-lg mb-8">
          Hubo un problema con tu pago. No se realizó ningún cargo. Puedes intentar nuevamente.
        </p>
        <Link
          href="/eventos"
          className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full font-semibold transition-all hover:scale-105 active:scale-95 interactive"
        >
          Volver a eventos
        </Link>
      </motion.div>
    </div>
  );
}
