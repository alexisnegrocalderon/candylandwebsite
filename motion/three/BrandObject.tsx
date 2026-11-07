import { useEffect, useMemo, useState } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import * as THREE from 'three';
import { BRAND } from '../../shared/motionSpec';
import { ease, springs } from '../theme';

/* Objetos 3D de marca (referencia C del dueño: el cubo que gira entre las
 * palabras). Procedurales, sin modelos externos: un cubo tipo «rubik» con las
 * caras de la marca (isotipo, corazón, color) que gira y tuerce una capa por
 * pulso, y un corazón extruido. Las texturas se dibujan en un canvas 2D. */

export type BrandObjectKind = 'cubo' | 'corazon';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

function heartPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.35);
  ctx.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.45, cy - s * 0.95, cx, cy - s * 0.45);
  ctx.bezierCurveTo(cx + s * 0.45, cy - s * 0.95, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35);
  ctx.closePath();
}

/** Textura de una cara: fondo, y encima corazón, isotipo o nada. */
function faceTexture(bg: string, mark: 'corazon' | 'logo' | 'liso', fg: string, logo: HTMLImageElement | null): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 256);
  // Borde interior suave (como las piezas de un cubo de verdad).
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, 250, 250);
  if (mark === 'corazon') {
    ctx.fillStyle = fg;
    heartPath(ctx, 128, 150, 120);
    ctx.fill();
  } else if (mark === 'logo' && logo) {
    const h = 200, w = (logo.width / logo.height) * h;
    ctx.drawImage(logo, 128 - w / 2, 128 - h / 2, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function useLogo(): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [handle] = useState(() => delayRender('Isotipo para el 3D'));
  useEffect(() => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => { setImg(i); continueRender(handle); };
    i.onerror = () => continueRender(handle);
    i.src = staticFile('candyland/logo-isotipo-transparent.png');
  }, [handle]);
  return img;
}

/** Cubo 3×3×3: las piezas giran juntas, y cada `beat` cuadros una capa da una vuelta. */
const Cube: React.FC<{ hero: string; beat: number }> = ({ hero, beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = useLogo();
  const mats = useMemo(() => {
    const white = BRAND.white;
    const kinds: Array<[string, 'corazon' | 'logo' | 'liso', string]> = [
      [white, 'logo', hero], [hero, 'liso', white], [white, 'corazon', hero],
      [hero, 'corazon', white], [white, 'liso', hero], [hero, 'logo', white],
    ];
    return kinds.map(([bg, mark, fg]) => new THREE.MeshStandardMaterial({ map: faceTexture(bg, mark, fg, logo), roughness: 0.32, metalness: 0.02 }));
  }, [hero, logo]);
  const enter = spring({ frame, fps, config: springs.bouncy });
  const turns = Math.floor(frame / beat);
  const local = (frame % beat) / beat;
  // Una vuelta completa de la capa: termina igual que empezó, así nunca salta.
  const twist = interpolate(local, [0.45, 0.95], [0, Math.PI * 2], { easing: ease.inOut, ...clamp });
  const axis = turns % 3;
  const layer = (turns % 2 === 0 ? 1 : -1);
  const size = 0.98;
  const pieces: React.ReactNode[] = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    const inLayer = [x, y, z][axis] === layer;
    const rot: [number, number, number] = [0, 0, 0];
    if (inLayer) rot[axis] = twist;
    pieces.push(
      <group key={`${x}${y}${z}`} rotation={rot}>
        <mesh position={[x, y, z]} material={mats}>
          <boxGeometry args={[size, size, size]} />
        </mesh>
      </group>,
    );
  }
  return (
    <group scale={enter * 0.95} rotation={[0.55 + Math.sin(frame / 50) * 0.15, frame * 0.018 + (1 - enter) * 2, 0.15]}>
      {pieces}
    </group>
  );
};

const Heart: React.FC<{ hero: string }> = ({ hero }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const geo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -1.1);
    s.bezierCurveTo(-2.4, 0.4, -1.2, 2.4, 0, 1.05);
    s.bezierCurveTo(1.2, 2.4, 2.4, 0.4, 0, -1.1);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.7, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.3, bevelSegments: 10, curveSegments: 32 });
    g.center();
    return g;
  }, []);
  const enter = spring({ frame, fps, config: springs.bouncy });
  return (
    // Se balancea de frente (girar entero lo deja de canto y parece una píldora).
    <mesh geometry={geo} scale={enter * 1.35} rotation={[0.15 + Math.sin(frame / 40) * 0.12, Math.sin(frame / 28) * 0.55 + (1 - enter) * 3, Math.sin(frame / 30) * 0.08]}>
      <meshPhysicalMaterial color={hero} roughness={0.18} metalness={0.05} clearcoat={1} clearcoatRoughness={0.12} />
    </mesh>
  );
};

/** El objeto 3D en su propio lienzo transparente (se ubica como cualquier div). */
export const BrandObject: React.FC<{ kind: BrandObjectKind; size: number; hero: string; beat: number }> = ({ kind, size, hero, beat }) => (
  <ThreeCanvas width={size} height={size} gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ position: [0, 0, 9], fov: 40 }} style={{ background: 'transparent' }}>
    <ambientLight intensity={0.9} />
    <directionalLight position={[4, 6, 8]} intensity={2.2} />
    <directionalLight position={[-6, -2, 4]} intensity={0.6} />
    {kind === 'cubo' ? <Cube hero={hero} beat={beat} /> : <Heart hero={hero} />}
  </ThreeCanvas>
);
