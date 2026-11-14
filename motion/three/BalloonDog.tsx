import { useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { BRAND } from '../../shared/motionSpec';

/* El perrito de globos de modelar, en 3D y hecho a mano (sin modelos externos). No es un palo de cápsulas: es un globo
 * largo torcido en burbujas, como los de verdad:
 *   - cada burbuja es un óvalo; entre una y otra queda la torcedura (un pellizco);
 *   - las patas, las orejas y la cola salen en PARES de burbujas pegadas, porque el globo se dobla en dos;
 *   - el hocico y la cola terminan en la puntita anudada del globo.
 * Material de globo: satinado con un reflejo largo y suave (y espejo si es oro o plata). El reflejo sale de un entorno
 * dibujado con los colores de la marca, sin cargar ninguna imagen.
 *
 * Mira hacia +X, con las patas en y = 0. Quien lo usa decide cuánto se infla, cuánto se aplasta con el pulso y cuánto
 * gira (motion/mascot.tsx). */

type V3 = [number, number, number];

/** Una burbuja: centro, radios (x, y, z) y cuánto se inclina (rotación en z). `tone` = qué color toca en el modo multicolor. */
interface Bubble { c: V3; r: V3; tilt?: number; tone: number }

const BUBBLES: Bubble[] = [
  { c: [0.0, 1.4, 0], r: [1.02, 0.44, 0.44], tone: 0 }, // cuerpo
  { c: [0.78, 0.6, 0.25], r: [0.27, 0.62, 0.27], tilt: -0.05, tone: 1 }, // patas de adelante (el par)
  { c: [0.78, 0.6, -0.25], r: [0.27, 0.62, 0.27], tilt: -0.05, tone: 1 },
  { c: [-0.78, 0.6, 0.25], r: [0.27, 0.62, 0.27], tilt: 0.05, tone: 2 }, // patas de atrás
  { c: [-0.78, 0.6, -0.25], r: [0.27, 0.62, 0.27], tilt: 0.05, tone: 2 },
  { c: [1.08, 2.15, 0], r: [0.32, 0.6, 0.32], tilt: -0.4, tone: 3 }, // cuello
  { c: [1.72, 2.68, 0], r: [0.72, 0.35, 0.35], tilt: -0.08, tone: 4 }, // hocico
  { c: [1.12, 3.14, 0.27], r: [0.25, 0.52, 0.25], tilt: 0.5, tone: 5 }, // orejas (el par)
  { c: [1.12, 3.14, -0.27], r: [0.25, 0.52, 0.25], tilt: 0.5, tone: 5 },
  { c: [-1.5, 1.9, 0], r: [0.22, 0.5, 0.24], tilt: 0.5, tone: 3 }, // cola
];
/** Las torceduras: donde se pellizca el globo entre una burbuja y otra. */
const TWISTS: V3[] = [[0.98, 1.72, 0], [-1.05, 1.5, 0], [1.3, 2.55, 0], [1.14, 2.78, 0], [0.74, 1.05, 0]];
/** Las puntitas anudadas (donde se infló el globo): hocico y cola. */
const NOZZLES: Array<{ at: V3; dir: V3 }> = [
  { at: [2.44, 2.66, 0], dir: [1, 0.1, 0] },
  { at: [-1.78, 2.34, 0], dir: [-0.5, 0.86, 0] },
];

const MULTI = ['#FF1E9A', '#2BB5FF', '#F49BFF', '#FFD23F', '#FF8A2B', '#3DDC84'];

/** Entorno de estudio con los colores de la marca: lo que el globo refleja. */
function studioTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.3, BRAND.pink);
  sky.addColorStop(0.55, BRAND.blue);
  sky.addColorStop(0.8, '#8a4db0');
  sky.addColorStop(1, '#d9a7ee');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 512);
  [[120, BRAND.magenta], [430, BRAND.blue], [700, BRAND.pink], [900, BRAND.magenta]].forEach(([x, color]) => {
    const g = ctx.createLinearGradient((x as number) - 50, 0, (x as number) + 50, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, color as string);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect((x as number) - 50, 60, 100, 300);
  });
  // Luces de estudio (cajas de luz): dan el reflejo largo de los globos.
  ctx.fillStyle = '#ffffff';
  [[260, 60, 190, 70], [560, 36, 130, 50], [820, 84, 140, 44], [40, 110, 80, 32]].forEach(([x, y, w, h]) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

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

function makeMaterial(color: string, metal: boolean) {
  return new THREE.MeshPhysicalMaterial({
    color,
    // Globo de modelar: satinado y suave. Oro y plata: espejo.
    // Oro y plata: nacarado (un espejo puro refleja las franjas de color del entorno y sale rayado).
    metalness: metal ? 0.38 : 0.08,
    roughness: metal ? 0.2 : 0.2,
    clearcoat: metal ? 1 : 0.85,
    clearcoatRoughness: metal ? 0.05 : 0.12,
    sheen: metal ? 0 : 0.6,
    sheenColor: new THREE.Color('#ffffff'),
    sheenRoughness: 0.45,
    envMapIntensity: metal ? 0.9 : 1.35,
  });
}

interface DogProps {
  color: string;
  multi: boolean;
  metal: boolean;
  inflate: number;
  squash: number;
}

/** Un perrito entero (sin posicionar). */
const Dog: React.FC<DogProps> = ({ color, multi, metal, inflate, squash }) => {
  const mats = useMemo(() => (multi ? MULTI.map((c) => makeMaterial(c, false)) : [makeMaterial(color, metal)]), [color, multi, metal]);
  const mat = (tone: number) => mats[tone % mats.length];
  // Inflarse: se estira un poco antes de engordar (los globos se alargan al inflarlos).
  const sx = inflate * (1 + 0.06 * Math.max(0, 1 - inflate));
  const sy = inflate * (1 + 0.12 * Math.max(0, 1 - inflate));
  // Aplastarse con el pulso: baja y se ensancha, con las patas en el suelo.
  return (
    <group scale={[sx * (1 + 0.05 * squash), sy * (1 - 0.08 * squash), sx * (1 + 0.05 * squash)]}>
      {/* Centrado en x: el perro va de -1.7 a 2.4. */}
      <group position={[-0.35, 0, 0]}>
        {BUBBLES.map((b, i) => (
          <mesh key={i} position={b.c} rotation={[0, 0, b.tilt ?? 0]} scale={b.r} material={mat(b.tone)}>
            <sphereGeometry args={[1, 40, 28]} />
          </mesh>
        ))}
        {TWISTS.map((p, i) => (
          <mesh key={`t${i}`} position={p} material={mat(i)} scale={[0.1, 0.1, 0.1]}>
            <sphereGeometry args={[1, 16, 14]} />
          </mesh>
        ))}
        {NOZZLES.map((n, i) => {
          const dir = new THREE.Vector3(...n.dir).normalize();
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
          return (
            <group key={`n${i}`} position={n.at} quaternion={q}>
              {/* El cuello anudado y la puntita (como el pico de un globo cerrado con un nudo). */}
              <mesh material={mat(i + 4)} position={[0, 0.02, 0]}>
                <capsuleGeometry args={[0.075, 0.1, 8, 14]} />
              </mesh>
              <mesh material={mat(i + 4)} position={[0, 0.16, 0]} scale={[1.5, 0.8, 1.5]}>
                <sphereGeometry args={[0.06, 14, 12]} />
              </mesh>
            </group>
          );
        })}
      </group>
    </group>
  );
};

export interface BalloonDogProps {
  size: number;
  /** 'uno' = un perrito; 'pareja' = dos de frente (rosa y celeste), que se aplastan por turnos. */
  variant: 'uno' | 'pareja';
  color: string;
  multi?: boolean;
  metal: boolean;
  inflate: number;
  /** 0–1: cuánto se aplasta (con el pulso). En la pareja, el segundo perrito se aplasta con `squash2`. */
  squash: number;
  squash2?: number;
  rotY: number;
  tilt?: number;
}

/** El perrito (o la pareja) en su propio lienzo transparente (se ubica como cualquier div). */
export const BalloonDog: React.FC<BalloonDogProps> = ({ size, variant, color, multi = false, metal, inflate, squash, squash2 = 0, rotY, tilt = 0.12 }) => (
  <ThreeCanvas width={size} height={size} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ position: [0, 0.2, 9], fov: 40 }} style={{ background: 'transparent' }}>
    <Studio />
    <ambientLight intensity={0.4} />
    <directionalLight position={[5, 8, 7]} intensity={1.5} />
    <directionalLight position={[-6, 2, -4]} intensity={0.9} color={BRAND.pink} />
    {inflate > 0.001 && (
      <group position={[0, -1.9, 0]} rotation={[tilt, rotY, 0]}>
        {variant === 'pareja' ? (
          <>
            {/* Frente a frente: la rosa mira a la derecha y la celeste (espejada) a la izquierda. */}
            <group position={[-1.2, 0, 0.12]} scale={0.8}><Dog color="#FF7BC5" multi={false} metal={false} inflate={inflate} squash={squash} /></group>
            <group position={[1.2, 0, -0.12]} rotation={[0, Math.PI, 0]} scale={0.8}><Dog color="#3DB8FF" multi={false} metal={false} inflate={inflate} squash={squash2} /></group>
          </>
        ) : (
          <group scale={1}><Dog color={color} multi={multi} metal={metal} inflate={inflate} squash={squash} /></group>
        )}
      </group>
    )}
  </ThreeCanvas>
);
