import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere } from '@react-three/drei';
import * as THREE from 'three';
import type { MotionValue } from 'framer-motion';
import { prefersReducedMotion } from '@/lib/smoothScroll';

// Paleta de marca ("Playroom Pastel", ver client/src/theme.css) convertida de
// OKLCH a sRGB hex -- three.js no entiende oklch(), así que esto se calculó
// una sola vez con la conversión de referencia (Björn Ottosson) y queda
// hardcodeado acá. Si la paleta de theme.css cambia, hay que regenerar estos
// hex a mano (no hay build step que los sincronice).
const PALETTE = [
  '#e867c3', // --color-primary (fucsia pastel)
  '#1ebde3', // --color-secondary (celeste pastel)
  '#f45fb0', // --color-cherry
  '#8e93f3', // --color-violet-electric
  '#30c2d8', // --color-candy-blue
] as const;

const PARTICLE_COUNT = 1000;

/** Nube de puntos con forma de anillo/toro irregular -- posiciones, colores
 * (mezcla de la paleta de marca) y semillas de fase, generado una sola vez. */
function useNebulaGeometry() {
  return useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    const palette = PALETTE.map((hex) => new THREE.Color(hex));

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      // Distribución tipo toro achatado (anillo de "polvo de caramelo"):
      // u = ángulo grande alrededor del centro, v = ángulo chico del tubo.
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI * 2;
      const R = 1.9; // radio grande del anillo
      const r = 0.5 + Math.random() * 0.85; // grosor del tubo, con jitter

      const x = (R + r * Math.cos(v)) * Math.cos(u);
      const y = (R + r * Math.cos(v)) * Math.sin(u) * 0.35; // achatado en Y
      const z = r * Math.sin(v);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const color = palette[i % palette.length];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      seeds[i] = Math.random();
    }

    return { positions, colors, seeds };
  }, []);
}

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uTime;
  uniform float uScroll;
  varying vec3 vColor;

  void main() {
    vColor = aColor;

    // Drift suave por punto -- todo resuelto acá (vertex shader), no hay
    // trabajo por-partícula en JS por frame, así que el costo no escala con
    // PARTICLE_COUNT del lado de la CPU.
    float t = uTime * 0.15 + aSeed * 6.2831;
    vec3 pos = position;
    pos.x += sin(t) * 0.14;
    pos.y += cos(t * 1.3) * 0.10;
    pos.z += sin(t * 0.7 + aSeed * 3.0) * 0.14;

    // Rotación lenta y continua alrededor de Y, más el avance de scroll
    // (uScroll 0..1 mapeado a una vuelta parcial) -- así el "anillo" gira
    // solo con el tiempo y además responde al scroll del hero.
    float angle = uTime * 0.045 + uScroll * 1.1;
    float ca = cos(angle);
    float sa = sin(angle);
    vec3 rotated = vec3(pos.x * ca - pos.z * sa, pos.y, pos.x * sa + pos.z * ca);

    vec4 mvPosition = modelViewMatrix * vec4(rotated, 1.0);
    gl_PointSize = (260.0 / -mvPosition.z) * (0.55 + 0.55 * fract(aSeed * 7.0));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;

  void main() {
    // Sprite circular procedural -- sin textura: descarta todo lo que quede
    // fuera de un círculo suave centrado en el punto.
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    float alpha = smoothstep(0.5, 0.15, d);
    gl_FragColor = vec4(vColor, alpha * 0.85);
  }
`;

interface CandyNebulaProps {
  /** Progreso de scroll del hero (0..1), ya calculado en Hero() -- se lee
   * con .get() dentro del loop de r3f en vez de suscribirse, para no mezclar
   * el sistema de render de framer-motion con el de three.js. */
  scrollYProgress: MotionValue<number>;
}

export default function CandyNebula({ scrollYProgress }: CandyNebulaProps) {
  const { positions, colors, seeds } = useNebulaGeometry();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const groupRef = useRef<THREE.Group>(null);
  const orb1Ref = useRef<THREE.Mesh>(null);
  const orb2Ref = useRef<THREE.Mesh>(null);

  // Defensa en profundidad: MotionConfig/isFinePointer ya evitan que este
  // componente llegue a montarse con reduced-motion activado, pero si algún
  // día ese gate se rompe en un refactor, esto congela la animación en vez
  // de seguir corriendo un loop WebGL invisible para el usuario que lo pidió.
  const reducedMotion = useRef(prefersReducedMotion());
  useEffect(() => {
    reducedMotion.current = prefersReducedMotion();
  }, []);

  // Parallax por puntero -- se escucha en window (no en el canvas) porque el
  // canvas tiene pointer-events: none (ver CandyNebulaCanvas), para no robarle
  // el drag de los caramelos ni los clicks del hero.
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', handleMove);
    return () => window.removeEventListener('pointermove', handleMove);
  }, []);

  useFrame((state, delta) => {
    if (reducedMotion.current) return;

    const t = state.clock.elapsedTime;
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = t;
      materialRef.current.uniforms.uScroll.value = scrollYProgress.get();
    }

    // El grupo entero se inclina levemente hacia el puntero -- lerp suave
    // para que no se sienta nervioso.
    if (groupRef.current) {
      const targetRotX = pointer.current.y * 0.15;
      const targetRotY = pointer.current.x * 0.2;
      groupRef.current.rotation.x += (targetRotX - groupRef.current.rotation.x) * Math.min(delta * 3, 1);
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * Math.min(delta * 3, 1);
    }

    // Dos "candy orbs" orbitando a velocidades/radios distintos.
    if (orb1Ref.current) {
      const a = t * 0.18;
      orb1Ref.current.position.set(Math.cos(a) * 2.3, Math.sin(a * 1.4) * 0.5, Math.sin(a) * 2.3);
    }
    if (orb2Ref.current) {
      const a = t * -0.24 + Math.PI;
      orb2Ref.current.position.set(Math.cos(a) * 1.7, Math.sin(a * 1.1) * 0.4, Math.sin(a) * 1.7);
    }
  });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScroll: { value: 0 },
    }),
    []
  );

  return (
    <group ref={groupRef}>
      {/* Sin Environment/HDRI (evita pedir texturas externas) -- se ilumina
       * con un par de luces de color de marca en vez de un mapa de entorno. */}
      <ambientLight intensity={0.5} />
      <pointLight color={PALETTE[0]} position={[3, 2, 3]} intensity={12} />
      <pointLight color={PALETTE[1]} position={[-3, -1, 2]} intensity={10} />

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
          <bufferAttribute attach="attributes-aColor" args={[colors, 3]} />
          <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      <Sphere ref={orb1Ref} args={[0.16, 24, 24]}>
        <meshStandardMaterial color={PALETTE[0]} roughness={0.25} metalness={0.55} />
      </Sphere>
      <Sphere ref={orb2Ref} args={[0.11, 24, 24]}>
        <meshStandardMaterial color={PALETTE[2]} roughness={0.25} metalness={0.55} />
      </Sphere>
    </group>
  );
}
