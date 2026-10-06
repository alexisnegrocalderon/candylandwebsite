/* Motor de sonido (Web Audio, sin archivos): sintetiza el ambiente y los loops
 * de Pista Tech y Pista Perreo en el navegador.
 *
 * ⚠️ Se importa SIEMPRE de forma dinámica (ver SoundContext.tsx): quien nunca
 * enciende el sonido no descarga ni un byte de este archivo.
 *
 * Diseño:
 *  - Un solo AudioContext (lo crea SoundContext dentro del gesto del usuario,
 *    por la política de autoplay de Safari/Chrome, y se lo entrega a `init`).
 *  - El sitio está en silencio: solo suena una pista (tech o perreo) cuando
 *    alguien la toca. Un filtro pasa-bajos maestro arranca "tras la puerta" y
 *    se abre en medio segundo al empezar desde el silencio.
 *  - Cada pista tiene su bus de volumen y su propio reloj. El reloj usa el patrón estándar de planificación con anticipación
 *    (un setInterval corto agenda lo que viene en los próximos ~120 ms sobre
 *    el reloj del audio), así el ritmo no se descuadra aunque la pestaña vaya
 *    justa de CPU, y no hace nada ligado al scroll.
 *  - Las voces son nodos efímeros que se liberan solos al terminar. */
import {
  CROSSFADE_S, CUTOFF_DOOR_HZ, CUTOFF_OPEN_HZ, EQ_BARS, MASTER_FADE_IN_S, MASTER_FADE_OUT_S, MASTER_LEVEL,
  SCENES, stepSeconds, stepsFor,
  type PistaId, type StepHit,
} from './config';

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;
/** Si el reloj quedó muy atrás (pestaña dormida), se reinicia en vez de
 * disparar todo lo atrasado de golpe. */
const MAX_LAG_S = 0.5;

interface Clock {
  next: number;
  step: number;
  /** Instante (reloj del audio) en que la escena ya terminó de apagarse. */
  stopAt: number | null;
}

export class SoundEngine {
  private ctx!: AudioContext;
  private master!: GainNode;
  private filter!: BiquadFilterNode;
  private analyser!: AnalyserNode;
  private noise!: AudioBuffer;
  private buses = {} as Record<PistaId, GainNode>;
  private cueBus!: GainNode;
  private clocks: Partial<Record<PistaId, Clock>> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private pista: PistaId | null = null;
  private freqData = new Uint8Array(0);
  private ready = false;
  /** Hasta que se llama a `start()` el motor está en pausa. */
  private paused = true;
  private stopTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Arma el grafo de audio sobre un AudioContext ya creado (y destrabado) por
   * quien llama, dentro del gesto del usuario. */
  init(ctx: AudioContext) {
    if (this.ready) return;
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 0.7;
    this.filter.frequency.value = CUTOFF_OPEN_HZ;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.78;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);

    // bus de cada pista → filtro → master → compresor → (analizador + salida)
    (Object.keys(SCENES) as PistaId[]).forEach((id) => {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      bus.connect(this.filter);
      this.buses[id] = bus;
    });
    this.cueBus = ctx.createGain();
    this.cueBus.gain.value = 1;
    this.cueBus.connect(this.filter);

    this.filter.connect(this.master);
    this.master.connect(compressor);
    compressor.connect(this.analyser);
    compressor.connect(ctx.destination);

    // Ruido blanco de 1 s, compartido por hi-hats, claps y barridos.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ready = true;
  }

  get running(): boolean {
    return this.ready && !this.paused && this.ctx.state === 'running';
  }

  /** Enciende el sonido: sube el volumen general. Si ya hay una pista elegida
   * la arranca (con el efecto de apertura salvo al volver de una pausa). */
  async start(withCue = true) {
    if (!this.ready) return;
    this.cancelPendingStop();
    this.paused = false;
    await this.ctx.resume();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + MASTER_FADE_IN_S);

    const pista = this.pista;
    if (pista && !this.clocks[pista]) {
      this.openDoor(now);
      this.startScene(pista, now + 0.05, MASTER_FADE_IN_S);
      if (withCue) this.cue(pista, now);
    }
  }

  /** Apaga: baja el volumen y suspende el contexto (deja de gastar CPU). */
  stop() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + MASTER_FADE_OUT_S);
    this.cancelPendingStop();
    this.stopTimeout = setTimeout(() => this.suspendNow(), MASTER_FADE_OUT_S * 1000 + 60);
  }

  /** Pausa sin perder la preferencia (pestaña oculta, pantalla interna). */
  pause() {
    this.stop();
  }

  resume() {
    if (!this.ready) return;
    void this.start(false);
  }

  private suspendNow() {
    this.paused = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Las escenas se reinician al volver a empezar: sin esto, el reloj
    // quedaría desfasado respecto del reloj del audio, que estuvo suspendido.
    this.clocks = {};
    (Object.keys(this.buses) as PistaId[]).forEach((id) => {
      this.buses[id].gain.cancelScheduledValues(0);
      this.buses[id].gain.value = 0;
    });
    void this.ctx.suspend();
  }

  private cancelPendingStop() {
    if (this.stopTimeout) {
      clearTimeout(this.stopTimeout);
      this.stopTimeout = null;
    }
  }

  /** Abre una pista (o la suelta con `null`: se apaga con un fundido y el
   * sitio vuelve al silencio). */
  setPista(next: PistaId | null) {
    const prev = this.pista;
    this.pista = next;
    if (!this.ready || this.paused || prev === next) return;
    const now = this.ctx.currentTime;

    if (next) {
      // Desde el silencio la puerta se abre; entre pistas ya está abierta.
      if (!prev) this.openDoor(now);
      this.cue(next, now);
      this.startScene(next, now + 0.05, prev ? CROSSFADE_S : 0.5);
    }
    if (prev) this.endScene(prev, now, CROSSFADE_S);
  }

  /** Barrido de filtro "la puerta se abre": de apagado/lejano a todo abierto. */
  private openDoor(t: number) {
    const f = this.filter.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(CUTOFF_DOOR_HZ, t);
    f.setTargetAtTime(CUTOFF_OPEN_HZ, t + 0.02, 0.2);
  }

  /** Alturas (0-1) para las barras del ecualizador, tomadas del audio real. */
  getBars(n: number = EQ_BARS): number[] {
    const out = new Array<number>(n).fill(0);
    if (!this.ready || this.paused) return out;
    this.analyser.getByteFrequencyData(this.freqData);
    // Espaciado logarítmico entre los bins ~1 y ~90 (≈ 190 Hz a 17 kHz): los
    // graves quedan a la izquierda y no se "comen" todas las barras.
    const lo = 1;
    const hi = Math.min(90, this.freqData.length - 1);
    for (let i = 0; i < n; i++) {
      const a = Math.round(lo * Math.pow(hi / lo, i / n));
      const b = Math.max(a + 1, Math.round(lo * Math.pow(hi / lo, (i + 1) / n)));
      let peak = 0;
      for (let k = a; k < b && k < this.freqData.length; k++) peak = Math.max(peak, this.freqData[k]);
      out[i] = Math.pow(peak / 255, 1.4);
    }
    return out;
  }

  // ── Escenas ──────────────────────────────────────────────────────────

  private startScene(id: PistaId, at: number, fadeS: number) {
    this.clocks[id] = { next: at, step: 0, stopAt: null };
    const gain = this.buses[id].gain;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(0, at);
    gain.linearRampToValueAtTime(SCENES[id].level, at + fadeS);
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private endScene(id: PistaId, at: number, fadeS: number) {
    const clock = this.clocks[id];
    if (!clock) return;
    clock.stopAt = at + fadeS + 0.05;
    const gain = this.buses[id].gain;
    gain.cancelScheduledValues(at);
    gain.setValueAtTime(gain.value, at);
    gain.linearRampToValueAtTime(0, at + fadeS);
  }

  private tick() {
    const now = this.ctx.currentTime;
    const horizon = now + LOOKAHEAD_S;
    (Object.keys(this.clocks) as PistaId[]).forEach((id) => {
      const clock = this.clocks[id];
      if (!clock) return;
      if (clock.stopAt !== null && now >= clock.stopAt) {
        delete this.clocks[id];
        return;
      }
      if (now - clock.next > MAX_LAG_S) clock.next = now + 0.05;
      const dur = stepSeconds(SCENES[id].bpm);
      while (clock.next < horizon) {
        for (const hit of stepsFor(id, clock.step)) this.play(hit, clock.next, this.buses[id]);
        clock.next += dur;
        clock.step++;
      }
    });
    // Sin pistas sonando no hace falta el reloj: cero CPU en silencio.
    if (Object.keys(this.clocks).length === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Voces ────────────────────────────────────────────────────────────

  private play(hit: StepHit, t: number, out: AudioNode) {
    switch (hit.kind) {
      case 'kick': return this.kick(t, out, hit.vel);
      case 'hat': return this.hat(t, out, hit.vel, 0.04);
      case 'openHat': return this.hat(t, out, hit.vel, 0.16);
      case 'clap': return this.clap(t, out, hit.vel);
      case 'snare': return this.snare(t, out, hit.vel);
      case 'bass': return this.bass(t, out, hit.vel, hit.freq ?? 55);
      case 'sub': return this.sub(t, out, hit.vel, hit.freq ?? 55);
      case 'pluck': return this.pluck(t, out, hit.vel, hit.freq ?? 220);
    }
  }

  private env(t: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  private noiseSource(t: number, dur: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true; // los barridos duran más que el buffer de 1 s
    src.start(t, Math.random() * 0.5, dur);
    return src;
  }

  private kick(t: number, out: AudioNode, vel: number) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.env(t, vel, 0.002, 0.38);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.42);
  }

  private hat(t: number, out: AudioNode, vel: number, decay: number) {
    const src = this.noiseSource(t, decay + 0.05);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.env(t, vel * 0.5, 0.001, decay);
    src.connect(hp).connect(g).connect(out);
  }

  private clap(t: number, out: AudioNode, vel: number) {
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // tres golpecitos seguidos = "palmada"
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.011;
      g.gain.linearRampToValueAtTime(vel * 0.7, at + 0.001);
      g.gain.exponentialRampToValueAtTime(0.05, at + 0.01);
    }
    g.gain.linearRampToValueAtTime(vel * 0.7, t + 0.034);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const src = this.noiseSource(t, 0.3);
    src.connect(bp).connect(g).connect(out);
  }

  private snare(t: number, out: AudioNode, vel: number) {
    // cuerpo tonal + chasquido de ruido
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(230, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    const og = this.env(t, vel * 0.45, 0.001, 0.12);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.16);

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const ng = this.env(t, vel * 0.55, 0.001, 0.14);
    this.noiseSource(t, 0.2).connect(hp).connect(ng).connect(out);
  }

  private bass(t: number, out: AudioNode, vel: number, freq: number) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(220, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.2);
    const g = this.env(t, vel * 0.55, 0.004, 0.2);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  private sub(t: number, out: AudioNode, vel: number, freq: number) {
    // 808: seno grave con una caída de tono rápida y cola larga
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.8, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const g = this.env(t, vel * 0.9, 0.004, 0.5);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.56);
  }

  private pluck(t: number, out: AudioNode, vel: number, freq: number) {
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    const g = this.env(t, vel * 0.3, 0.003, 0.28);
    lp.connect(g).connect(out);
    for (const detune of [-7, 7]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 0.34);
    }
  }

  // ── El "momento especial" al tocar una pista ─────────────────────────

  /** Efecto de apertura de puerta, distinto para cada pista. */
  private cue(pista: PistaId, t: number) {
    const out = this.cueBus;
    // golpe grave que "abre" la puerta
    const thud = this.ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(110, t);
    thud.frequency.exponentialRampToValueAtTime(34, t + 0.45);
    const thudGain = this.env(t, 0.9, 0.003, 0.5);
    thud.connect(thudGain).connect(out);
    thud.start(t);
    thud.stop(t + 0.55);

    if (pista === 'TECH') {
      // barrido ascendente de ruido: sube la energía hacia el bombo
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 3;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(7500, t + 0.9);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      this.noiseSource(t, 1.2).connect(bp).connect(g).connect(out);
      return;
    }

    // PERREO: golpe de corneta (dos sierras que caen un poco de tono) + caída
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
    const horn = this.env(t + 0.02, 0.32, 0.01, 0.55);
    lp.connect(horn).connect(out);
    for (const freq of [466.16, 587.33]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * 1.03, t);
      osc.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 0.62);
    }
  }
}
