// Sintetiza la música y los efectos de sonido del Estudio Motion como WAV de
// 16 bits mono, sin descargar nada y siempre igual (ruido con semilla fija).
// Basado en examples/scripts de la skill remotion-motion-graphics (MIT).
//
//   node scripts/motion/gen-audio.mjs
//
// Escribe client/public/motion/audio/{pulse,drive,dream}.wav (pistas de 32 s
// que se repiten sin salto) y client/public/motion/sfx/*.wav. Los pulsos por
// minuto tienen que calzar con MOTION_MUSIC_BPM (shared/motionSpec.ts).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'public', 'motion');
const AUDIO = join(ROOT, 'audio');
const SFX = join(ROOT, 'sfx');
mkdirSync(AUDIO, { recursive: true });
mkdirSync(SFX, { recursive: true });

function wav(samples, peakTarget = 0.9) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? peakTarget / peak : 1;
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * g)) * 32767), 44 + i * 2);
  return buf;
}

let seed = 7;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647 - 0.5;
};

function track(durSecs) {
  const N = Math.round(durSecs * SR);
  const out = new Float32Array(N);
  // Lo que se pasa del final vuelve al principio: la pista se repite sin salto.
  const add = (start, dur, fn) => {
    const s0 = Math.floor(start * SR);
    const n = Math.floor(dur * SR);
    for (let i = 0; i < n; i++) out[(s0 + i) % N] += fn(i / SR, i / n);
  };
  return { out, add, N };
}

const kick = (add, t, gain = 0.85) => add(t, 0.3, (ts, p) => Math.sin(2 * Math.PI * (140 - 95 * Math.min(1, ts * 9)) * ts) * Math.exp(-p * 7) * gain);
const hat = (add, t, gain = 0.1) => add(t, 0.045, (_, p) => rnd() * 2 * Math.exp(-p * 10) * gain);
const clap = (add, t) => add(t, 0.18, (_, p) => rnd() * 2 * Math.exp(-p * 9) * 0.28);
const bass = (add, t, f, dur, gain = 0.3) =>
  add(t, dur, (ts, p) => (Math.sin(2 * Math.PI * f * ts) + Math.sin(2 * Math.PI * f * 3 * ts) / 3.5) * Math.min(1, ts * 90) * Math.exp(-p * 4) * gain);
const pad = (add, t, dur, freqs, gain) =>
  add(t, dur, (ts) => {
    const env = Math.min(1, ts / 0.6) * Math.min(1, (dur - ts) / 0.6);
    let s = 0;
    for (const f of freqs) s += Math.sin(2 * Math.PI * f * 0.9985 * ts) + Math.sin(2 * Math.PI * f * 1.0015 * ts);
    return (s / (freqs.length * 2)) * env * gain;
  });

// Pulse: electrónica, 120 BPM, La menor (16 compases = 32 s).
{
  const BPM = 120, B = 60 / BPM, BARS = 16;
  const { out, add } = track(BARS * 4 * B);
  const chords = [[110, 130.81, 164.81], [87.31, 130.81, 174.61], [98, 146.83, 196], [82.41, 123.47, 164.81]];
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * 4 * B;
    pad(add, t0, 4 * B, chords[bar % 4], 0.12);
    for (let b = 0; b < 4; b++) {
      kick(add, t0 + b * B);
      hat(add, t0 + b * B + B / 2);
    }
    const root = chords[bar % 4][0] / 2;
    for (let e = 0; e < 8; e++) if (e % 2 === 1 || e === 6) bass(add, t0 + e * (B / 2), root, B / 2.2);
  }
  writeFileSync(join(AUDIO, 'pulse.wav'), wav(out));
}

// Drive: house, 124 BPM, Re menor (16 compases ≈ 31 s).
{
  const BPM = 124, B = 60 / BPM, BARS = 16;
  const { out, add } = track(BARS * 4 * B);
  const roots = [73.42, 73.42, 58.27, 65.41];
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * 4 * B;
    for (let b = 0; b < 4; b++) {
      kick(add, t0 + b * B, 0.9);
      hat(add, t0 + b * B + B / 2, 0.14);
      hat(add, t0 + b * B + B / 4, 0.05);
      if (b === 1 || b === 3) clap(add, t0 + b * B);
      bass(add, t0 + b * B + B / 2, roots[bar % 4], B / 2.4, 0.34);
    }
    const r = roots[bar % 4] * 4;
    // Stab de acorde en el contratiempo.
    for (const off of [0.5, 2.5]) pad(add, t0 + off * B, 0.22, [r, r * 1.2, r * 1.5], 0.16);
  }
  writeFileSync(join(AUDIO, 'drive.wav'), wav(out));
}

// Dream: suave, 96 BPM, Fa mayor (12 compases = 30 s).
{
  const BPM = 96, B = 60 / BPM, BARS = 12;
  const { out, add } = track(BARS * 4 * B);
  const chords = [[174.61, 220, 261.63], [146.83, 174.61, 220], [116.54, 146.83, 174.61], [130.81, 164.81, 196]];
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * 4 * B;
    pad(add, t0, 4 * B, chords[bar % 4], 0.2);
    kick(add, t0, 0.55);
    kick(add, t0 + 2.5 * B, 0.4);
    for (let b = 0; b < 8; b++) hat(add, t0 + b * (B / 2), 0.035);
    // Brillo: arpegio de campanita.
    chords[bar % 4].forEach((f, k) => add(t0 + (k + 1) * B * 0.75, 0.6, (ts, p) => Math.sin(2 * Math.PI * f * 4 * ts) * Math.exp(-p * 6) * 0.05));
  }
  writeFileSync(join(AUDIO, 'dream.wav'), wav(out));
}

/* --- Efectos ------------------------------------------------------------- */
const fx = (secs, fn) => {
  const N = Math.round(secs * SR);
  const out = new Float32Array(N);
  fn(out, N);
  return out;
};

writeFileSync(join(SFX, 'whoosh.wav'), wav(fx(0.4, (out, N) => {
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    lp += (0.05 + 0.3 * Math.sin(Math.PI * t)) * (rnd() * 2 - lp);
    out[i] = lp * Math.sin(Math.PI * Math.pow(t, 0.7)) ** 2;
  }
}), 0.8));

writeFileSync(join(SFX, 'pop.wav'), wav(fx(0.14, (out, N) => {
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    ph += (2 * Math.PI * (700 - 380 * t)) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 9);
  }
}), 0.7));

writeFileSync(join(SFX, 'tick.wav'), wav(fx(0.05, (out, N) => {
  for (let i = 0; i < N; i++) out[i] = Math.sin((2 * Math.PI * 1900 * i) / SR) * Math.exp(-(i / N) * 14);
}), 0.5));

writeFileSync(join(SFX, 'bass.wav'), wav(fx(0.5, (out, N) => {
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    ph += (2 * Math.PI * (70 - 25 * t)) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 5) + (i < SR * 0.02 ? rnd() * 0.6 : 0);
  }
}), 0.95));

writeFileSync(join(SFX, 'riser.wav'), wav(fx(0.9, (out, N) => {
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    lp += (0.02 + 0.5 * t * t) * (rnd() * 2 - lp);
    out[i] = lp * t * t + Math.sin((2 * Math.PI * (200 + 900 * t * t) * i) / SR) * t * 0.15;
  }
}), 0.6));

writeFileSync(join(SFX, 'glitch.wav'), wav(fx(0.22, (out, N) => {
  for (let i = 0; i < N; i++) {
    const step = Math.floor((i / N) * 9);
    const crush = Math.round(rnd() * 4) / 4;
    out[i] = (step % 2 ? crush : Math.sign(Math.sin((2 * Math.PI * (300 + step * 180) * i) / SR)) * 0.5) * (1 - i / N);
  }
}), 0.5));

console.log('Audio escrito en', ROOT);
