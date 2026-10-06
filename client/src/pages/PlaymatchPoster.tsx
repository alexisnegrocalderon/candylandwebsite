import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useSeo } from '@/hooks/useSeo';

/* Afiche imprimible para pegar dentro del local (barra, baños, pista): un QR
 * grande a /playmatch. Quien ya entró lo escanea y, si su celular ya recuerda
 * la entrada, cae directo en Playmatch. Se abre en /playmatch/afiche y se
 * imprime desde el navegador (Ctrl/Cmd+P). No tiene datos de nadie. */
export default function PlaymatchPoster() {
  useSeo({ title: 'Afiche Playmatch — Mansion Playroom', description: 'Afiche imprimible con el QR de Playmatch.', path: '/playmatch/afiche', noindex: true });
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/playmatch`, { width: 900, margin: 1, errorCorrectionLevel: 'H' })
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  return (
    <div className="min-h-dvh bg-[#120a11] text-white grid place-items-center px-6 py-10 print:bg-[#120a11]" style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}>
      <div className="text-center max-w-md">
        <p className="text-6xl mb-4" aria-hidden>🍬</p>
        <h1 className="font-heading font-extrabold text-5xl tracking-tight mb-3">Playmatch</h1>
        <p className="text-xl text-white/80 mb-8">Conoce gente en la fiesta, ahora mismo</p>

        <div className="bg-white p-4 rounded-3xl inline-block mb-8">
          {qr ? <img src={qr} alt="QR para entrar a Playmatch" className="w-72 h-72 sm:w-80 sm:h-80" /> : <div className="w-72 h-72" />}
        </div>

        <ol className="text-left text-white/80 space-y-2 text-lg mb-8 inline-block">
          <li>1. Escanea el QR con tu cámara</li>
          <li>2. Crea tu alias (sin datos personales)</li>
          <li>3. Toca, conversa o haz swipe 💘</li>
        </ol>

        <p className="text-sm text-white/45">
          Solo para quienes ya entraron · Sin capturas · Lo que pasa en Playmatch se queda en la fiesta
        </p>

        <button
          onClick={() => window.print()}
          className="mt-8 h-12 px-8 rounded-full bg-primary font-bold print:hidden"
        >
          Imprimir
        </button>
      </div>
    </div>
  );
}
