// Sintetiza la música y los efectos de sonido del Estudio Motion como WAV de
// 16 bits mono, sin descargar nada y siempre igual (ruido con semilla fija).
// Basado en examples/scripts de la skill remotion-motion-graphics (MIT).
//
//   node scripts/motion/gen-audio.mjs
//
// Escribe client/public/motion/audio/{pulse,drive,dream,neon,latino,hype}.wav (pistas de 32 s
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

/* --- Pistas y efectos nuevos ----------------------------------------------------
 * Van al final y con su propia semilla: así los WAV de arriba salen idénticos a como estaban. */
seed = 99;
const saw = (f, ts) => 2 * ((f * ts) % 1) - 1;

// Neon: synthwave, 110 BPM, Mi menor (12 compases ≈ 26 s). Para el estilo arcade y lo nocturno.
{
  const BPM = 110, B = 60 / BPM, BARS = 12;
  const { out, add } = track(BARS * 4 * B);
  const roots = [82.41, 65.41, 73.42, 61.74];
  const arps = [[329.63, 392, 493.88, 659.25], [261.63, 329.63, 392, 523.25], [293.66, 369.99, 440, 587.33], [246.94, 311.13, 369.99, 493.88]];
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * 4 * B;
    const k = bar % 4;
    pad(add, t0, 4 * B, arps[k].slice(0, 3).map((f) => f / 2), 0.1);
    for (let b = 0; b < 4; b++) {
      kick(add, t0 + b * B, 0.8);
      hat(add, t0 + b * B + B / 2, 0.09);
      if (b === 1 || b === 3) clap(add, t0 + b * B);
    }
    for (let e = 0; e < 8; e++) bass(add, t0 + e * (B / 2), roots[k], B / 2.1, 0.26);
    // Arpegio de dientes de sierra, a semicorcheas; en la segunda mitad sube una octava.
    for (let st = 0; st < 16; st++) {
      const f = arps[k][st % 4] * (st >= 8 ? 2 : 1);
      add(t0 + st * (B / 4), (B / 4) * 1.7, (ts, p) => saw(f, ts) * Math.exp(-p * 3.2) * Math.min(1, ts * 400) * 0.06);
    }
  }
  writeFileSync(join(AUDIO, 'neon.wav'), wav(out));
}

// Latino: dembow, 98 BPM, La menor (12 compases ≈ 29 s). Para fiestas y el tono cálido de la marca.
{
  const BPM = 98, B = 60 / BPM, BARS = 12, S = B / 4;
  const { out, add } = track(BARS * 4 * B);
  const roots = [55, 43.65, 49, 41.2];
  const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66], [164.81, 196, 246.94]];
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * 4 * B;
    const k = bar % 4;
    for (let b = 0; b < 4; b++) kick(add, t0 + b * B, 0.9);
    // El dembow: «boom-ch-boom-chick».
    for (const st of [3, 6, 11, 14]) clap(add, t0 + st * S);
    for (let e = 0; e < 8; e++) hat(add, t0 + e * (B / 2), 0.07);
    // Bajo en tresillo y acordes cortitos.
    for (const st of [0, 3, 6, 10, 12]) bass(add, t0 + st * S, roots[k], B / 3, 0.34);
    for (const st of [0, 6, 10]) pad(add, t0 + st * S, 0.3, chords[k], 0.15);
  }
  writeFileSync(join(AUDIO, 'latino.wav'), wav(out));
}

// Hype: 140 BPM, Fa# menor (16 compases ≈ 27 s). Para cuenta regresiva, urgencia y anuncios fuertes.
{
  const BPM = 140, B = 60 / BPM, BARS = 16, S = B / 4;
  const { out, add } = track(BARS * 4 * B);
  const roots = [92.5, 82.41, 73.42, 82.41];
  const chords = [[370, 440, 554.37], [329.63, 392, 493.88], [293.66, 369.99, 440], [329.63, 392, 493.88]];
  for (let bar = 0; bar < BARS; bar++) {
    const t0 = bar * 4 * B;
    const k = bar % 4;
    const fill = bar % 8 === 7;
    for (let b = 0; b < 4; b++) {
      // Cada 8 compases, redoble de bombo en el último tiempo (la «subida» antes del golpe).
      if (fill && b === 3) for (let r = 0; r < 4; r++) kick(add, t0 + b * B + r * S, 0.6 + r * 0.08);
      else kick(add, t0 + b * B, 0.95);
      if (b === 1 || b === 3) clap(add, t0 + b * B);
    }
    for (let st = 0; st < 16; st++) hat(add, t0 + st * S, st % 2 ? 0.09 : 0.05);
    bass(add, t0, roots[k], B * 1.8, 0.42);
    bass(add, t0 + 2.5 * B, roots[k] * 0.75, B * 1.2, 0.36);
    for (let b = 0; b < 4; b++) pad(add, t0 + (b + 0.5) * B, 0.16, chords[k], 0.12);
  }
  writeFileSync(join(AUDIO, 'hype.wav'), wav(out));
}

// Efectos por acción: lo que suena cuando aparece cada adorno del look.
writeFileSync(join(SFX, 'sparkle.wav'), wav(fx(0.5, (out, N) => {
  [[2093, 0], [2637, 0.04], [3136, 0.08], [3951, 0.13]].forEach(([f, at]) => {
    for (let i = Math.floor(at * SR); i < N; i++) {
      const t = (i - at * SR) / SR;
      out[i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 11) * 0.3;
    }
  });
}), 0.6));

writeFileSync(join(SFX, 'coin.wav'), wav(fx(0.3, (out, N) => {
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const f = t < 0.07 ? 988 : 1319;
    out[i] = Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.35 * (t < 0.07 ? 1 : Math.exp(-(t - 0.07) * 14));
  }
}), 0.5));

writeFileSync(join(SFX, 'thud.wav'), wav(fx(0.34, (out, N) => {
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    ph += (2 * Math.PI * (95 - 55 * Math.min(1, t * 4))) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 8) + (i < SR * 0.012 ? rnd() * 1.4 : 0);
  }
}), 0.9));

writeFileSync(join(SFX, 'rip.wav'), wav(fx(0.3, (out, N) => {
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    lp += 0.45 * (rnd() * 2 - lp);
    out[i] = (rnd() * 2 - lp) * (0.4 + 0.6 * Math.abs(Math.sin(t * 55))) * Math.sin(Math.PI * t) ** 0.5;
  }
}), 0.5));

// Gancho de chat: llega un mensaje (ding de dos notas), se envía el tuyo (barrido corto hacia arriba) y vibra el celular.
writeFileSync(join(SFX, 'ding.wav'), wav(fx(0.42, (out, N) => {
  [[1319, 0], [1760, 0.09]].forEach(([f, at]) => {
    for (let i = Math.floor(at * SR); i < N; i++) {
      const t = (i - at * SR) / SR;
      out[i] += (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 2 * t) * 0.18) * Math.exp(-t * 9) * 0.4;
    }
  });
}), 0.6));

writeFileSync(join(SFX, 'send.wav'), wav(fx(0.16, (out, N) => {
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / N;
    ph += (2 * Math.PI * (500 + 700 * t)) / SR;
    out[i] = Math.sin(ph) * Math.sin(Math.PI * t) * 0.6;
  }
}), 0.45));

writeFileSync(join(SFX, 'buzz.wav'), wav(fx(0.32, (out, N) => {
  // Dos zumbidos graves seguidos, como la vibración del celular sobre una mesa.
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const on = (t < 0.1 || (t > 0.16 && t < 0.26)) ? 1 : 0;
    out[i] = (Math.sign(Math.sin(2 * Math.PI * 62 * t)) * 0.5 + Math.sin(2 * Math.PI * 124 * t) * 0.3) * on * Math.min(1, t * 200);
  }
}), 0.55));

console.log('Audio escrito en', ROOT);
