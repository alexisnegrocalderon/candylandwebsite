/* Sonido de la landing PLAYMORE, sintetizado con Web Audio (sin archivos):
 * solo el "riiip" al arrancar el talón de un ticket. Ya no hay música de fondo
 * ni botón de sonido; este efecto suena apenas con el gesto de la persona. */

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

function noiseBuffer(ac: AudioContext, seconds: number) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
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
