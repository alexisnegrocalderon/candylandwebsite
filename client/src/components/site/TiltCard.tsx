import { useEffect, useRef, type ReactNode } from 'react';

/* La PlayCard con efecto 3D tipo Apple Wallet: se inclina siguiendo el dedo
 * (o el mouse) y, donde el teléfono entrega el giroscopio sin pedir permiso
 * (Android), también con el movimiento del teléfono. Encima va un reflejo
 * holográfico que se mueve con la inclinación (`.lg-sheen` en index.css).
 * En iPhone el giroscopio exige un permiso del sistema; no se pide para no
 * molestar en la puerta, así que ahí el reflejo se mueve solo y la tarjeta
 * se inclina al deslizar el dedo. */

const MAX_DEG = 9;

export function TiltCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const sheen = useRef<HTMLDivElement>(null);
  const still = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  const apply = (x: number, y: number) => {
    // x, y en 0..1 (0.5 = al centro)
    const el = ref.current;
    if (!el) return;
    el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * MAX_DEG * 2}deg) rotateY(${(x - 0.5) * MAX_DEG * 2}deg)`;
    sheen.current?.classList.remove('lg-sheen-idle');
    sheen.current?.style.setProperty('--tx', String(x));
    sheen.current?.style.setProperty('--ty', String(y));
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = '';
    sheen.current?.classList.add('lg-sheen-idle');
  };

  useEffect(() => {
    if (still) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      const x = Math.min(1, Math.max(0, 0.5 + e.gamma / 60));
      const y = Math.min(1, Math.max(0, 0.5 + (e.beta - 45) / 60));
      apply(x, y);
    };
    // Algunos navegadores ni siquiera definen DeviceOrientationEvent: ahí solo se inclina con el dedo.
    if (typeof window.DeviceOrientationEvent === 'undefined') return;
    const needsPermission = typeof (window.DeviceOrientationEvent as any).requestPermission === 'function';
    if (!needsPermission) window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still]);

  const onMove = (e: React.PointerEvent) => {
    if (still) return;
    const r = e.currentTarget.getBoundingClientRect();
    apply((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  };

  return (
    <div onPointerMove={onMove} onPointerLeave={reset} onPointerUp={reset} onPointerCancel={reset} style={{ touchAction: 'pan-y' }}>
      <div ref={ref} className="lg-tilt relative">
        {children}
        <div ref={sheen} aria-hidden="true" className={`lg-sheen ${still ? '' : 'lg-sheen-idle'}`}
          style={{ top: 0, left: '50%', right: 'auto', bottom: 'auto', width: '100%', maxWidth: 440, aspectRatio: '1.586', transform: 'translateX(-50%)' }} />
      </div>
    </div>
  );
}
