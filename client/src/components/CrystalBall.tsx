import { motion } from 'framer-motion';

/* Bola de cristal del Oráculo de Disfraces (/disfraces y la portada). */
export default function CrystalBall({ pulsing }: { pulsing?: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="relative mx-auto w-36 h-36 md:w-44 md:h-44"
      animate={pulsing ? { scale: [1, 1.06, 1] } : { y: [0, -8, 0] }}
      transition={{ duration: pulsing ? 1.4 : 4, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#eaffb8_0%,#ba8cff_38%,#4d4d4d_75%,#1a1a1a_100%)] shadow-[0_0_60px_rgba(186,140,255,0.55),0_0_120px_rgba(196,255,77,0.25)]" />
      <motion.div
        className="absolute inset-3 rounded-full bg-[conic-gradient(from_0deg,transparent,rgba(196,255,77,0.35),transparent,rgba(186,140,255,0.4),transparent)] blur-md"
        animate={{ rotate: 360 }}
        transition={{ duration: pulsing ? 2.5 : 10, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute top-5 left-8 w-8 h-5 rounded-full bg-white/40 blur-sm" />
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-24 h-6 rounded-[50%] bg-[#4d4d4d] shadow-[0_6px_20px_rgba(0,0,0,0.6)]" />
    </motion.div>
  );
}
