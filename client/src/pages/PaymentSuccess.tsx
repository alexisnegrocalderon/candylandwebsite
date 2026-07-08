import { motion } from 'framer-motion';
import { Link } from 'wouter';
import { CheckCircle, Ticket, Mail } from 'lucide-react';

export default function PaymentSuccess() {
  return (
    <div className="min-h-screen pt-24 pb-16 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-lg mx-auto px-4"
      >
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-400" />
        </div>
        <h1 className="font-heading text-4xl md:text-5xl mb-4">¡Pago Exitoso!</h1>
        <p className="text-muted-foreground text-lg mb-8">
          Tu compra ha sido procesada correctamente. En breve recibirás un email con tu entrada y código QR.
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
