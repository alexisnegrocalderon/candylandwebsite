import { useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BRAND } from '../../shared/motionSpec';

/* El perrito globo de Playroom en 3D, hecho a mano (sin modelos externos): cada parte es un globo alargado (una
 * cápsula) y entre parte y parte va el «nudo» donde el globo se tuerce. Brillo de globo metálico: el reflejo sale de un
 * entorno dibujado con los colores de la marca (rosa, celeste, magenta y luces blancas de estudio), así se ve de
 * revista sin cargar ninguna imagen.
 *
 * Mira hacia +X, con las patas en y = 0. Quien lo usa decide cuánto se infla, cuánto se aplasta con el pulso y cuánto
 * gira (motion/mascot.tsx). */

type V3 = [number, number, number];

const R = 0.32;
// Puntos clave (nudos) del perro, de pie y mirando a +X.
const FRONT: V3 = [0.85, 1.55, 0];
const BACK: V3 = [-0.95, 1.6, 0];
const HEAD: V3 = [1.25, 2.6, 0];
/** Cada globo: de dónde a dónde, y su grosor. */
const SEGMENTS: Array<{ a: V3; b: V3; r: number }> = [
  { a: FRONT, b: BACK, r: R * 1.06 }, // lomo
  { a: FRONT, b: [1.05, 0.05, 0.38], r: R }, // pata delantera
  { a: FRONT, b: [1.05, 0.05, -0.38], r: R },
  { a: BACK, b: [-1.1, 0.05, 0.4], r: R }, // pata trasera
  { a: BACK, b: [-1.1, 0.05, -0.4], r: R },
  { a: FRONT, b: HEAD, r: R }, // cuello
  { a: HEAD, b: [0.7, 3.45, 0.46], r: R * 0.92 }, // orejas: hacia atrás y abiertas
  { a: HEAD, b: [0.7, 3.45, -0.46], r: R * 0.92 },
  { a: HEAD, b: [2.2, 2.62, 0], r: R * 1.08 }, // hocico
  { a: BACK, b: [-1.4, 2.4, 0], r: R * 0.82 }, // cola
];
const KNOTS: V3[] = [FRONT, BACK, HEAD];

const UP = new THREE.Vector3(0, 1, 0);

/** Posición, giro y largo de una cápsula que va de `a` a `b` (algo más corta: así se ve el «pellizco» en cada nudo). */
function place(a: V3, b: V3, r: number) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  return {
    position: va.clone().add(vb).multiplyScalar(0.5),
    quaternion: new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
    length: Math.max(0.05, len - r * 1.15),
  };
}

/** Entorno de estudio con los colores de la marca: lo que el globo refleja. */
function studioTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.28, BRAND.pink);
  sky.addColorStop(0.55, BRAND.blue);
  sky.addColorStop(0.78, '#2a1036');
  sky.addColorStop(1, '#0c0810');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);
  // Franjas de color (se ven como reflejos largos sobre el globo).
  [[120, BRAND.magenta], [430, BRAND.blue], [700, BRAND.pink], [900, BRAND.magenta]].forEach(([x, color]) => {
    const g = ctx.createLinearGradient((x as number) - 50, 0, (x as number) + 50, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, color as string);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect((x as number) - 50, 60, 100, 300);
  });
  // Luces de estudio: rectángulos blancos que dan el brillo de globo.
  ctx.fillStyle = '#ffffff';
  [[260, 70, 150, 60], [560, 40, 110, 46], [820, 90, 120, 40], [40, 110, 70, 30]].forEach(([x, y, w, h]) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 18);
    ctx.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pone el entorno de estudio en la escena (una vez por lienzo). */
const Studio: React.FC = () => {
  const { gl, scene } = useThree();
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const tex = studioTexture();
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    tex.dispose();
    pmrem.dispose();
  }, [gl, scene]);
  return null;
};

const Dog: React.FC<{ color: string; metal: boolean; inflate: number; squash: number; rotY: number; tilt: number }> = ({ color, metal, inflate, squash, rotY, tilt }) => {
  const material = useMemo(
    () => new THREE.MeshPhysicalMaterial({
      color,
      metalness: metal ? 1 : 0.55,
      roughness: metal ? 0.06 : 0.14,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: metal ? 1.25 : 1.5,
    }),
    [color, metal],
  );
  const parts = useMemo(() => SEGMENTS.map((s) => ({ ...place(s.a, s.b, s.r), r: s.r })), []);
  // Inflarse: crece con un poco de estiramiento (los globos se alargan antes de engordar).
  const sx = inflate * (1 + 0.06 * Math.max(0, 1 - inflate));
  const sy = inflate * (1 + 0.12 * Math.max(0, 1 - inflate));
  // Aplastarse con el pulso: baja y se ensancha, con las patas en el suelo.
  return (
    <group position={[0, -1.85, 0]} rotation={[tilt, rotY, 0]}>
      <group scale={[sx * (1 + 0.05 * squash), sy * (1 - 0.08 * squash), sx * (1 + 0.05 * squash)]}>
        {/* Centrado en x: el cuerpo va de -1.4 a 2.2. */}
        <group position={[-0.4, 0, 0]}>
          {parts.map((p, i) => (
            <mesh key={i} position={p.position} quaternion={p.quaternion} material={material}>
              <capsuleGeometry args={[p.r, p.length, 14, 28]} />
            </mesh>
          ))}
          {KNOTS.map((k, i) => (
            <mesh key={`k${i}`} position={k} material={material}>
              <sphereGeometry args={[R * 0.55, 20, 20]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
};

/** El perrito en su propio lienzo transparente (se ubica como cualquier div). */
export const BalloonDog: React.FC<{ size: number; color: string; metal: boolean; inflate: number; squash: number; rotY: number; tilt?: number }> = ({ size, color, metal, inflate, squash, rotY, tilt = 0.12 }) => (
  <ThreeCanvas width={size} height={size} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ position: [0, 0.2, 9], fov: 40 }} style={{ background: 'transparent' }}>
    <Studio />
    <ambientLight intensity={0.35} />
    <directionalLight position={[5, 8, 7]} intensity={1.6} />
    <directionalLight position={[-6, 2, -4]} intensity={0.9} color={BRAND.pink} />
    {inflate > 0.001 && <Dog color={color} metal={metal} inflate={inflate} squash={squash} rotY={rotY} tilt={tilt} />}
  </ThreeCanvas>
);
