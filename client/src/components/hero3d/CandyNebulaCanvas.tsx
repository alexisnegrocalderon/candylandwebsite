import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import type { MotionValue } from 'framer-motion';
import CandyNebula from './CandyNebula';

/** Chequea si el navegador puede realmente crear un contexto WebGL antes de
 * montar el <Canvas> -- más confiable que esperar a que r3f tire un error de
 * render, que no siempre queda atrapable por un ErrorBoundary de React (la
 * creación del contexto pasa en un efecto, no en el render). */
function canRenderWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Error boundary local y silenciosa -- a diferencia de la ErrorBoundary
 * global de la app (pantalla completa "ocurrió un error"), acá un fallo del
 * Candy Nebula nunca debe verse: el hero de video ya está pintado detrás,
 * así que el peor caso posible es simplemente "no hay capa 3D". */
class SilentCanvasBoundary extends Component<{ children: ReactNode; onError: () => void }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    console.warn('[CandyNebula] desactivado por error de render:', error);
    this.props.onError();
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Observa pérdida del contexto WebGL (drivers viejos, GPU throttling, tab
 * en background largo rato) y avisa para desmontar el canvas en vez de
 * quedar con un frame congelado o roto. */
function ContextLossWatcher({ onLost }: { onLost: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const handleLost = (e: Event) => {
      e.preventDefault();
      onLost();
    };
    el.addEventListener('webglcontextlost', handleLost);
    return () => el.removeEventListener('webglcontextlost', handleLost);
  }, [gl, onLost]);
  return null;
}

interface CandyNebulaCanvasProps {
  scrollYProgress: MotionValue<number>;
}

export default function CandyNebulaCanvas({ scrollYProgress }: CandyNebulaCanvasProps) {
  const [disabled, setDisabled] = useState(false);
  const supportsWebGL = useRef(canRenderWebGL());

  if (disabled || !supportsWebGL.current) return null;

  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none">
      <SilentCanvasBoundary onError={() => setDisabled(true)}>
        <Suspense fallback={null}>
          <Canvas
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
            camera={{ position: [0, 0, 5], fov: 50 }}
            frameloop="always"
          >
            <ContextLossWatcher onLost={() => setDisabled(true)} />
            <CandyNebula scrollYProgress={scrollYProgress} />
          </Canvas>
        </Suspense>
      </SilentCanvasBoundary>
    </div>
  );
}
