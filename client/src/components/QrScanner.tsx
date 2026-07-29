import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CameraOff } from 'lucide-react';

/* Cámara + decodificación de QR, reusada por /puerta y /caja.
 *
 * Un frame del video se copia a un <canvas> oculto y jsQR lee los píxeles
 * -- se usa jsQR porque `BarcodeDetector` no existe en Safari/iOS, y el
 * teléfono que escanea en la puerta o en la caja casi siempre es un
 * iPhone. */

export function QrScanner({
  paused = false,
  onDecode,
  onError,
  className = '',
  children,
}: {
  /** Si es `true`, sigue mostrando cámara pero deja de decodificar
   * (ej. mientras hay una ficha abierta en pantalla). */
  paused?: boolean;
  onDecode: (raw: string) => void;
  onError?: (message: string) => void;
  className?: string;
  /** Overlay encima del video (marco de puntería, texto de ayuda). */
  children?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [camError, setCamError] = useState<string | null>(null);

  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  const onDecodeRef = useRef(onDecode);
  useEffect(() => { onDecodeRef.current = onDecode; }, [onDecode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamError(null);

        const tick = () => {
          rafRef.current = requestAnimationFrame(tick);
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (pausedRef.current || !video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (found?.data) onDecodeRef.current(found.data);
        };
        tick();
      } catch {
        const message = 'No pudimos abrir la cámara. Revisa el permiso en el navegador.';
        setCamError(message);
        onError?.(message);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />

      {camError ? (
        <div className="absolute inset-0 grid place-items-center px-8 text-center">
          <div>
            <CameraOff className="w-10 h-10 mx-auto mb-3 text-white/40" />
            <p className="text-sm text-white/70">{camError}</p>
          </div>
        </div>
      ) : children}
    </div>
  );
}
