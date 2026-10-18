/* Sonido opcional de la landing PLAYMORE, sintetizado con Web Audio: un beat
 * electrónico suave de fondo y el "riiip" al arrancar el talón. Sin archivos
 * que descargar; si más adelante hay audio real, se reemplaza acá.
 *
 * Arranca apagado: los navegadores solo dejan sonar audio después de un
 * toque, y una landing que suena sola espanta. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let loopTimer: number | null = null;
let nextBeat = 0;
let step = 0;

const BPM = 118;
const STEP = 60 / BPM / 2; // corcheas

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  return ctx;
}

function noiseBuffer(ac: AudioContext, seconds: number) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function kick(ac: AudioContext, at: number) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.frequency.setValueAtTime(140, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.18);
  g.gain.setValueAtTime(0.9, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.32);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + 0.34);
}

function hat(ac: AudioContext, at: number, vol: number) {
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.06);
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 8000;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
  src.connect(hp).connect(g).connect(master!);
  src.start(at);
}

/** Acorde de pad (Am7) que respira cada compás. */
function pad(ac: AudioContext, at: number) {
  for (const f of [220, 261.63, 329.63, 392]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, at);
    lp.frequency.linearRampToValueAtTime(1400, at + STEP * 4);
    lp.frequency.linearRampToValueAtTime(500, at + STEP * 8);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.025, at + STEP * 2);
    g.gain.linearRampToValueAtTime(0, at + STEP * 8);
    o.connect(lp).connect(g).connect(master!);
    o.start(at);
    o.stop(at + STEP * 8 + 0.05);
  }
}

function schedule() {
  const ac = ctx!;
  while (nextBeat < ac.currentTime + 0.25) {
    const s = step % 16;
    if (s % 4 === 0) kick(ac, nextBeat);
    if (s % 2 === 1) hat(ac, nextBeat, s % 4 === 3 ? 0.12 : 0.06);
    if (s === 0) pad(ac, nextBeat);
    nextBeat += STEP;
    step++;
  }
}

export function startMusic() {
  const ac = ensureCtx();
  if (!ac || !master) return;
  void ac.resume();
  master.gain.cancelScheduledValues(ac.currentTime);
  master.gain.setTargetAtTime(0.35, ac.currentTime, 0.4);
  if (loopTimer == null) {
    nextBeat = ac.currentTime + 0.05;
    step = 0;
    loopTimer = window.setInterval(schedule, 80);
  }
}

export function stopMusic() {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
  const ac = ctx;
  window.setTimeout(() => {
    if (loopTimer != null && master && master.gain.value < 0.01) {
      window.clearInterval(loopTimer);
      loopTimer = null;
      void ac.suspend();
    }
  }, 1200);
}

/** El "riiip" del talón: ruido filtrado con barrido, tipo papel rasgado. */
export function playRip() {
  const ac = ensureCtx();
  if (!ac) return;
  void ac.resume();
  const at = ac.currentTime + 0.01;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.45);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(900, at);
  bp.frequency.exponentialRampToValueAtTime(4200, at + 0.35);
  const g = ac.createGain();
  // Rasgado con "dientes": modulación rápida de volumen.
  g.gain.setValueAtTime(0, at);
  for (let i = 0; i < 14; i++) g.gain.setValueAtTime(i % 2 ? 0.15 : 0.55, at + i * 0.025);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.42);
  src.connect(bp).connect(g).connect(ac.destination);
  src.start(at);
}
