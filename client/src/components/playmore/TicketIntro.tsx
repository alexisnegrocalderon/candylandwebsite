import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Volume2, VolumeX } from 'lucide-react';
import {
  TICKET, LOGO_BOX, drawTicketBack, drawTicketBody, drawTicketStub, drawLogoFusion, loadImage, loadTicketFonts,
  type TicketArtData,
} from './ticketArt';
import { playRip } from './playmoreAudio';
import { useCountdown } from './sections';

/* Intro cinematográfico de PLAYMORE: un ticket negro y oro aparece desde la
 * oscuridad aleteando como papel, se acomoda al centro y la persona arranca
 * el talón para entrar. Al arrancarlo, el ticket vuela hacia la cámara con un
 * destello magenta y se abre la landing (`onEnter`).
 *
 * El ticket es siempre horizontal, igual en todas las pantallas. En celular
 * vertical ocupa todo el ancho con una leve inclinación, y arriba y abajo se
 * arma la escena (invitación, cuenta regresiva, pista y botón Entrar).
 *
 * Es 3D real (three.js, cargado solo en esta página). Sin WebGL o con
 * "reducir movimiento" se usa la versión liviana (`FallbackTicket`) con el
 * mismo arte dibujado en canvas 2D. */

interface Props {
  data: TicketArtData;
  countdownIso: string;
  partnerLogoUrl: string;
  soundOn: boolean;
  onToggleSound: () => void;
  /** Talón arrancado: termina el intro (la página sigue con el video puente). */
  onEnter: () => void;
  /** "Saltar intro": directo a la portada. */
  onSkip: () => void;
  /** El ticket llegó a reposo: buen momento para precargar el video. */
  onReady?: () => void;
}

const H_WORLD = 1;
const BODY_W = TICKET.bodyW / TICKET.h;
const STUB_W = TICKET.stubW / TICKET.h;
const TOTAL_W = BODY_W + STUB_W;

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uFlutter;
  uniform float uCurl;
  uniform float uOffsetX;
  uniform float uTotalW;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vUv = uv;
    vec3 p = position;
    float gx = p.x + uOffsetX;
    float nx = gx / uTotalW + 0.5;
    float a1 = gx * 2.2 + uTime * 2.4;
    float a2 = p.y * 3.0 + gx * 1.3 + uTime * 1.7;
    p.z += sin(a1) * uFlutter + sin(a2) * uFlutter * 0.35 + uCurl * nx * nx;
    float dzdx = cos(a1) * 2.2 * uFlutter + cos(a2) * 1.3 * uFlutter * 0.35 + uCurl * 2.0 * nx / uTotalW;
    float dzdy = cos(a2) * 3.0 * uFlutter * 0.35;
    vNormal = normalize(normalMatrix * normalize(vec3(-dzdx, -dzdy, 1.0)));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform sampler2D uBack;
  uniform sampler2D uLogo;
  uniform vec4 uLogoRect;
  uniform float uHasLogo;
  uniform float uSheen;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  void main() {
    vec4 front = texture2D(uMap, vUv);
    if (front.a < 0.5) discard;
    vec3 col;
    if (gl_FrontFacing) {
      col = front.rgb;
      if (uHasLogo > 0.5) {
        vec2 lu = (vUv - uLogoRect.xy) / (uLogoRect.zw - uLogoRect.xy);
        if (lu.x >= 0.0 && lu.x <= 1.0 && lu.y >= 0.0 && lu.y <= 1.0) {
          vec4 l = texture2D(uLogo, lu);
          col += l.rgb * l.a;
        }
      }
    } else {
      col = texture2D(uBack, vec2(1.0 - vUv.x, vUv.y)).rgb;
    }
    vec3 n = normalize(gl_FrontFacing ? vNormal : -vNormal);
    vec3 L = normalize(vec3(-0.4, 0.6, 1.0));
    vec3 V = normalize(vViewPos);
    vec3 H = normalize(L + V);
    float diff = 0.6 + 0.4 * max(dot(n, L), 0.0);
    float spec = pow(max(dot(n, H), 0.0), 48.0);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    float band = exp(-pow((vUv.x + vUv.y * 0.35 - uSheen) * 5.0, 2.0));
    vec3 sheenCol = mix(vec3(1.0, 0.38, 0.78), vec3(0.45, 0.85, 1.0), vUv.y);
    col = col * diff + spec * vec3(1.0, 0.9, 0.7) * (0.12 + lum * 0.8) + band * sheenCol * (0.05 + lum * 0.55);
    gl_FragColor = vec4(col, uOpacity);
  }
`;

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

const ease = {
  outCubic: (x: number) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inCubic: (x: number) => x * x * x,
};
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function TicketIntro(props: Props) {
  const [mode] = useState<'webgl' | 'lite'>(() => (supportsWebGL() && !prefersReducedMotion() ? 'webgl' : 'lite'));
  return mode === 'webgl' ? <WebGLTicket {...props} /> : <FallbackTicket {...props} />;
}

/** Pantalla vertical (celular): el ticket va a todo el ancho y la escena se
 * arma arriba y abajo. Pantalla baja (celular acostado): controles compactos. */
const isPortrait = () => typeof window !== 'undefined' && window.innerWidth / window.innerHeight < 0.85;
const isShort = () => typeof window !== 'undefined' && window.innerHeight < 520;
/** Fracción del ancho que ocupa el ticket en vertical (lo usan la escena 3D,
 * la versión liviana y el espacio que deja la escena para el ticket). */
const PORTRAIT_FILL = 0.92;

function useViewport() {
  const [vp, setVp] = useState(() => ({ portrait: isPortrait(), short: isShort() }));
  useEffect(() => {
    const on = () => setVp({ portrait: isPortrait(), short: isShort() });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

function MiniCountdown({ iso }: { iso: string }) {
  const c = useCountdown(iso);
  if (c.over) return null;
  const cells: [number, string][] = [[c.days, 'DÍAS'], [c.hours, 'HRS'], [c.minutes, 'MIN'], [c.seconds, 'SEG']];
  return (
    <div className="flex items-start justify-center gap-3" aria-label="Cuenta regresiva">
      {cells.map(([n, l], i) => (
        <div key={l} className="flex items-start gap-3">
          {i > 0 && <span className="playmore-serif pt-1 text-xl italic text-[#d6b25e]/50">·</span>}
          <div className="flex min-w-[2.6rem] flex-col items-center">
            <span className="playmore-sans playmore-gold text-[1.7rem] font-extrabold leading-none tabular-nums">{String(n).padStart(2, '0')}</span>
            <span className="mt-1.5 text-[9px] font-semibold tracking-[0.3em] text-[#e9d9b0]/60">{l}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Controles comunes (sonido, saltar, entrar, pista) y, en vertical, la escena. */
function IntroChrome({ ready, soundOn, onToggleSound, onEnterClick, onSkip, countdownIso }: {
  ready: boolean; soundOn: boolean; onToggleSound: () => void; onEnterClick: () => void; onSkip: () => void; countdownIso: string;
}) {
  const { portrait, short } = useViewport();
  const enterBtn = (
    <button type="button" onClick={onEnterClick}
      className="pointer-events-auto rounded-full bg-gradient-to-r from-[#7a5a22] via-[#f7e7a8] to-[#9c7630] px-9 py-3.5 text-sm font-bold tracking-[0.3em] text-[#141210] shadow-[0_10px_40px_-10px_rgba(247,231,168,0.6)] transition active:scale-[0.98]">
      ENTRAR
    </button>
  );
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-3 p-4 pt-[max(env(safe-area-inset-top),1rem)] sm:p-6">
        <span className="playmore-sans text-[10px] font-semibold tracking-[0.25em] text-[#e9d9b0]/70 sm:text-[11px] sm:tracking-[0.4em]">PLAYROOM × DALMORE</span>
        <div className="pointer-events-auto flex items-center gap-2">
          <button type="button" onClick={onToggleSound} aria-label={soundOn ? 'Silenciar' : 'Activar sonido'} aria-pressed={soundOn}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d6b25e]/40 text-[#e9d9b0] transition hover:bg-white/5">
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button type="button" onClick={onSkip} className="h-10 rounded-full border border-[#d6b25e]/40 whitespace-nowrap px-4 text-[11px] font-semibold tracking-[0.15em] text-[#e9d9b0] transition hover:bg-white/5 sm:text-xs sm:tracking-[0.2em]">
            SALTAR INTRO
          </button>
        </div>
      </div>

      {portrait ? (
        // Escena vertical: invitación + cuenta regresiva / (ticket) / pista + Entrar.
        <div className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex flex-col items-center gap-5">
            <p className="text-[10px] font-semibold tracking-[0.5em] text-[var(--pm-orchid,#e477ea)]">TU INVITACIÓN</p>
            <p className="playmore-serif -mt-2 text-[1.65rem] italic leading-tight text-[#f4efe6]/90">Una noche. Dos mundos.</p>
            <MiniCountdown iso={countdownIso} />
          </div>
          <div aria-hidden="true" style={{ height: `calc(${PORTRAIT_FILL * 100}vw / 3 + 5.5rem)` }} />
          <div className="flex flex-col items-center gap-5 pb-[env(safe-area-inset-bottom)]">
            <p className="playmore-hint text-xs tracking-[0.3em] text-[#e9d9b0]/80">DESLIZA EL TALÓN <span aria-hidden="true">→</span></p>
            {enterBtn}
          </div>
        </div>
      ) : (
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 p-6 text-center transition-opacity duration-700 ${short ? 'pb-[max(env(safe-area-inset-bottom),0.75rem)]' : 'pb-[max(env(safe-area-inset-bottom),1.5rem)]'} ${ready ? 'opacity-100' : 'opacity-0'}`}>
          {!short && (
            <p className="playmore-hint text-sm tracking-[0.25em] text-[#e9d9b0]/80">ARRASTRA EL TALÓN PARA ENTRAR</p>
          )}
          {enterBtn}
        </div>
      )}
    </>
  );
}

function WebGLTicket({ data, countdownIso, partnerLogoUrl, soundOn, onToggleSound, onEnter, onSkip, onReady }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const tearRef = useRef<(() => void) | null>(null);
  const soundRef = useRef(soundOn);
  const onEnterRef = useRef(onEnter);
  const onReadyRef = useRef(onReady);
  const [ready, setReady] = useState(false);
  soundRef.current = soundOn;
  onEnterRef.current = onEnter;
  onReadyRef.current = onReady;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let raf = 0;
    const cleanup: (() => void)[] = [];

    (async () => {
      await loadTicketFonts();
      const [playroomLogo, partnerLogo] = await Promise.all([
        loadImage('/candyland/logo-isotipo-transparent.png'),
        loadImage(partnerLogoUrl),
      ]);
      if (disposed) return;
      const art = data;

      // ── Texturas ──────────────────────────────────────────────────────
      const bodyCanvas = document.createElement('canvas');
      const stubCanvas = document.createElement('canvas');
      const backBody = document.createElement('canvas');
      const backStub = document.createElement('canvas');
      const logoCanvas = document.createElement('canvas');
      logoCanvas.width = logoCanvas.height = 512;
      drawTicketBody(bodyCanvas, art);
      drawTicketStub(stubCanvas, art);
      drawTicketBack(backBody, TICKET.bodyW);
      drawTicketBack(backStub, TICKET.stubW);
      drawLogoFusion(logoCanvas, 0, playroomLogo, partnerLogo, art.partnerName);

      const tex = (c: HTMLCanvasElement) => {
        const t = new THREE.CanvasTexture(c);
        t.anisotropy = 4;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        return t;
      };
      const tBody = tex(bodyCanvas), tStub = tex(stubCanvas), tBackBody = tex(backBody), tBackStub = tex(backStub);
      const tLogo = new THREE.CanvasTexture(logoCanvas);

      // ── Escena ────────────────────────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      // En celular 1.75x ya se ve nítido y cuida la batería y la fluidez.
      const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.touchAction = 'none';
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

      const u = LOGO_BOX;
      const logoRect = new THREE.Vector4(
        u.x / TICKET.bodyW, 1 - (u.y + u.size) / TICKET.h,
        (u.x + u.size) / TICKET.bodyW, 1 - u.y / TICKET.h,
      );
      const shared = {
        uTime: { value: 0 }, uFlutter: { value: 0.3 }, uCurl: { value: 0.9 }, uTotalW: { value: TOTAL_W },
        uSheen: { value: -0.5 }, uOpacity: { value: 1 },
      };
      const bodyMat = new THREE.ShaderMaterial({
        vertexShader, fragmentShader, side: THREE.DoubleSide, transparent: true,
        uniforms: { ...shared, uMap: { value: tBody }, uBack: { value: tBackBody }, uLogo: { value: tLogo }, uLogoRect: { value: logoRect }, uHasLogo: { value: 1 }, uOffsetX: { value: -TOTAL_W / 2 + BODY_W / 2 } },
      });
      const stubMat = new THREE.ShaderMaterial({
        vertexShader, fragmentShader, side: THREE.DoubleSide, transparent: true,
        uniforms: { ...shared, uMap: { value: tStub }, uBack: { value: tBackStub }, uLogo: { value: tLogo }, uLogoRect: { value: logoRect }, uHasLogo: { value: 0 }, uOffsetX: { value: -TOTAL_W / 2 + BODY_W + STUB_W / 2 } },
      });
      const bodyGeo = new THREE.PlaneGeometry(BODY_W, H_WORLD, 80, 10);
      const stubGeo = new THREE.PlaneGeometry(STUB_W, H_WORLD, 24, 10);
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.x = -TOTAL_W / 2 + BODY_W / 2;
      const stubPivot = new THREE.Group();
      stubPivot.position.set(-TOTAL_W / 2 + BODY_W, H_WORLD / 2, 0);
      const stub = new THREE.Mesh(stubGeo, stubMat);
      stub.position.set(STUB_W / 2, -H_WORLD / 2, 0);
      stubPivot.add(stub);

      const ticket = new THREE.Group();
      ticket.add(body, stubPivot);
      scene.add(ticket);

      // ── Tamaño / orientación ──────────────────────────────────────────
      // Siempre horizontal. La cámara se aleja lo justo para que el ticket
      // ocupe ~92% del ancho en vertical y deje aire para los controles en
      // pantallas anchas o bajas.
      let portrait = false;
      const resize = () => {
        const w = mount.clientWidth, h = mount.clientHeight;
        renderer.setSize(w, h, false);
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        const aspect = w / h;
        camera.aspect = aspect;
        portrait = aspect < 0.85;
        const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const fillW = portrait ? PORTRAIT_FILL : 0.8;
        const fillH = h < 520 ? 0.42 : 0.5;
        camera.position.z = Math.max(H_WORLD / fillH / (2 * tanH), TOTAL_W / fillW / (2 * tanH * aspect));
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener('resize', resize);
      cleanup.push(() => window.removeEventListener('resize', resize));

      // ── Interacción: arrancar el talón ────────────────────────────────
      type Phase = 'enter' | 'idle' | 'torn' | 'fly' | 'done';
      let phase: Phase = 'enter';
      let phaseStart = performance.now();
      let tearAmount = 0;
      let dragging = false;
      let dragStart: { x: number; y: number } | null = null;
      const pointer = new THREE.Vector2(0, 0);
      const ray = new THREE.Raycaster();
      const stubVel = new THREE.Vector3();
      let stubSpin = 0;

      const ndc = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      };
      // En pantallas táctiles el talón es chico: también vale tomar el
      // ticket desde su último tercio, junto a la perforación.
      const hitsStub = (e: PointerEvent) => {
        ray.setFromCamera(ndc(e), camera);
        if (ray.intersectObject(stub).length > 0) return true;
        if (e.pointerType !== 'touch') return false;
        const hit = ray.intersectObject(body)[0];
        return !!hit?.uv && hit.uv.x > 0.66;
      };
      const tear = () => {
        if (phase !== 'idle' && phase !== 'enter') return;
        phase = 'torn';
        phaseStart = performance.now();
        // El talón sale hacia afuera y cae girando.
        stubVel.set(portrait ? 0.7 : 1.1, portrait ? 0.3 : 0.5, 0.6);
        stubSpin = (Math.random() > 0.5 ? 1 : -1) * 2.4;
        if (soundRef.current) playRip();
        setReady(false);
      };
      tearRef.current = tear;

      const onDown = (e: PointerEvent) => {
        if (phase !== 'idle') return;
        if (hitsStub(e)) {
          dragging = true;
          dragStart = { x: e.clientX, y: e.clientY };
          renderer.domElement.setPointerCapture(e.pointerId);
        }
      };
      let lastMouse = 0;
      const onMove = (e: PointerEvent) => {
        const p = ndc(e);
        if (e.pointerType === 'mouse') { pointer.copy(p); lastMouse = performance.now(); }
        if (dragging && dragStart) {
          const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
          // En celular el gesto es más corto (pantalla más chica).
          tearAmount = clamp01(dist / (e.pointerType === 'touch' ? 110 : 160));
          if (tearAmount >= 1) { dragging = false; tear(); }
        } else if (phase === 'idle') {
          renderer.domElement.style.cursor = hitsStub(e) ? 'grab' : 'default';
        }
      };
      const onUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        const moved = dragStart ? Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) : 0;
        // Un toque (sin arrastrar) también arranca: en celular es lo natural.
        if (tearAmount > 0.45 || moved < 6) tear();
      };
      const el = renderer.domElement;
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      cleanup.push(() => {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
      });

      // ── Bucle ─────────────────────────────────────────────────────────
      const t0 = performance.now();
      let last = t0;
      let lastLogo = 0;
      const ENTER_MS = 2600;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const time = (now - t0) / 1000;
        shared.uTime.value = time;
        const since = now - phaseStart;

        // Logos que se funden: ~25 cuadros por segundo alcanzan.
        if (now - lastLogo > 40) {
          drawLogoFusion(logoCanvas, (time % 4.6) / 4.6, playroomLogo, partnerLogo, art.partnerName);
          tLogo.needsUpdate = true;
          lastLogo = now;
        }

        // Brillo que recorre el oro cada ~4 s.
        shared.uSheen.value = ((time % 4.2) / 4.2) * 2.4 - 0.6;

        if (phase === 'enter') {
          const k = ease.outCubic(clamp01(since / ENTER_MS));
          ticket.position.set(lerp(-0.6, 0, k), lerp(1.3, 0, k), lerp(-10, 0, k));
          ticket.rotation.set(lerp(1.15, 0.06, k), lerp(-1.5, -0.1, k), lerp(0.9, 0.02, k));
          shared.uFlutter.value = lerp(0.3, 0.03, k);
          shared.uCurl.value = lerp(0.95, 0, k);
          if (since >= ENTER_MS) { phase = 'idle'; phaseStart = now; setReady(true); onReadyRef.current?.(); }
        } else if (phase === 'idle') {
          ticket.position.y = Math.sin(time * 1.1) * 0.035;
          ticket.position.x = 0;
          ticket.position.z = 0;
          // Sin mouse (celular) el ticket se mece solo, suave, para que el
          // brillo y la inclinación sigan vivos.
          if (now - lastMouse > 2500) pointer.set(Math.sin(time * 0.55) * 0.55, Math.cos(time * 0.43) * 0.4);
          // En vertical va un poco más inclinado: se ve más grande y en 3D.
          const tilt = portrait ? 1.6 : 1;
          ticket.rotation.x = lerp(ticket.rotation.x, (0.06 - pointer.y * 0.12) * tilt, 0.05);
          ticket.rotation.y = lerp(ticket.rotation.y, (-0.1 + pointer.x * 0.2) * tilt, 0.05);
          ticket.rotation.z = lerp(ticket.rotation.z, portrait ? 0.035 : 0.02, 0.05);
          shared.uFlutter.value = 0.025;
          if (!dragging) tearAmount = lerp(tearAmount, 0, 0.15);
          // El talón cede al arrastrarlo (se despega desde la perforación).
          stubPivot.rotation.z = -tearAmount * 0.32;
          stubPivot.position.y = H_WORLD / 2 - tearAmount * 0.05;
        } else if (phase === 'torn') {
          stubVel.y -= 3.2 * dt;
          stubPivot.position.addScaledVector(stubVel, dt);
          stubPivot.rotation.z += stubSpin * dt;
          stubPivot.rotation.x += 1.3 * dt;
          if (since > 520) { phase = 'fly'; phaseStart = now; }
        } else if (phase === 'fly') {
          stubVel.y -= 3.2 * dt;
          stubPivot.position.addScaledVector(stubVel, dt);
          stubPivot.rotation.z += stubSpin * dt;
          const k = ease.inCubic(clamp01(since / 1000));
          ticket.position.z = lerp(0, camera.position.z - 0.25, k);
          ticket.rotation.x = lerp(ticket.rotation.x, 0, 0.12);
          ticket.rotation.y = lerp(ticket.rotation.y, 0, 0.12);
          shared.uFlutter.value = lerp(0.025, 0.12, k);
          if (flashRef.current) flashRef.current.style.opacity = String(clamp01((k - 0.45) / 0.45));
          if (since >= 1000) {
            phase = 'done';
            onEnterRef.current();
          }
        }

        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);

      cleanup.push(() => {
        cancelAnimationFrame(raf);
        [bodyGeo, stubGeo, bodyMat, stubMat, tBody, tStub, tBackBody, tBackStub, tLogo].forEach((x) => x.dispose());
        renderer.dispose();
        renderer.domElement.remove();
      });
    })();

    return () => {
      disposed = true;
      tearRef.current = null;
      cleanup.forEach((f) => f());
    };
    // El intro se arma una sola vez: los datos no cambian mientras se ve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="playmore-intro fixed inset-0 z-[60] overflow-hidden bg-[#0c0908]" role="dialog" aria-label="Intro: tu ticket para PLAYMORE">
      <div className="playmore-grain pointer-events-none absolute inset-0" aria-hidden="true" />
      <div ref={mountRef} className="absolute inset-0" />
      <div ref={flashRef} className="pointer-events-none absolute inset-0 opacity-0" aria-hidden="true"
        style={{ background: 'radial-gradient(circle at 50% 50%, #fff6e0 0%, #E477EA 30%, #96159D 60%, #0c0908 100%)' }} />
      <IntroChrome
        ready={ready}
        soundOn={soundOn}
        onToggleSound={onToggleSound}
        onEnterClick={() => tearRef.current?.()}
        onSkip={onSkip}
        countdownIso={countdownIso}
      />
    </div>
  );
}

/** Versión liviana: el mismo arte en canvas 2D, con CSS 3D. */
function FallbackTicket({ data, countdownIso, partnerLogoUrl, soundOn, onToggleSound, onEnter, onSkip }: Props) {
  const bodyRef = useRef<HTMLCanvasElement>(null);
  const stubRef = useRef<HTMLCanvasElement>(null);
  const [torn, setTorn] = useState(false);
  const { portrait } = useViewport();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadTicketFonts();
      const [playroomLogo, partnerLogo] = await Promise.all([
        loadImage('/candyland/logo-isotipo-transparent.png'),
        loadImage(partnerLogoUrl),
      ]);
      if (cancelled || !bodyRef.current || !stubRef.current) return;
      drawTicketBody(bodyRef.current, data);
      drawTicketStub(stubRef.current, data);
      const logo = document.createElement('canvas');
      logo.width = logo.height = 512;
      drawLogoFusion(logo, 0.7, playroomLogo, partnerLogo, data.partnerName);
      bodyRef.current.getContext('2d')!.drawImage(logo, LOGO_BOX.x, LOGO_BOX.y, LOGO_BOX.size, LOGO_BOX.size);
    })();
    return () => { cancelled = true; };
  }, [data, partnerLogoUrl]);

  const tear = () => {
    if (torn) return;
    setTorn(true);
    if (soundOn) playRip();
    window.setTimeout(onEnter, 900);
  };

  return (
    <div className="playmore-intro fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-[#0c0908]" role="dialog" aria-label="Intro: tu ticket para PLAYMORE">
      <div className="playmore-grain pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className={`playmore-lite-ticket relative flex transition-all duration-700 ${torn ? 'scale-125 opacity-0' : ''}`}
        style={{ width: portrait ? `${PORTRAIT_FILL * 100}vw` : 'min(80vw, 1100px, 120vh)' }}
      >
        <canvas ref={bodyRef} className="h-auto" style={{ width: `${(TICKET.bodyW / (TICKET.bodyW + TICKET.stubW)) * 100}%` }} />
        <button type="button" onClick={tear} aria-label="Arrancar el talón"
          className={`relative block transition-transform duration-500 ${torn ? 'translate-x-16 translate-y-24 rotate-12 opacity-0' : 'hover:-rotate-2'}`}
          style={{ width: `${(TICKET.stubW / (TICKET.bodyW + TICKET.stubW)) * 100}%`, transformOrigin: 'left top' }}>
          <canvas ref={stubRef} className="h-auto w-full" />
        </button>
      </div>
      <IntroChrome ready={!torn} soundOn={soundOn} onToggleSound={onToggleSound} onEnterClick={tear} onSkip={onSkip} countdownIso={countdownIso} />
    </div>
  );
}
