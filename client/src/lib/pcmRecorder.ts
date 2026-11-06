import { concatChunks, downsampleTo16k, encodeWavPcm16 } from '@shared/voiceNote';

/** Graba el micrófono como sonido «crudo» (PCM), sin pasar por MediaRecorder: en iPhone MediaRecorder entrega mp4 que
 * después hay que decodificar, y ahí es donde se quedaba colgado sin avisar. Acá lo que sale del micrófono se junta tal
 * cual y se baja a 16 kHz en el propio teléfono. */
export class PcmRecorder {
  private chunks: Float32Array[] = [];
  private stopped = false;

  private constructor(
    private ctx: AudioContext,
    private stream: MediaStream,
    private source: MediaStreamAudioSourceNode,
    private node: ScriptProcessorNode,
    private mute: GainNode,
  ) {
    node.onaudioprocess = (e) => {
      if (this.stopped) return;
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
  }

  /** Crea el contexto de audio AHORA (iOS solo lo deja arrancar dentro del toque del dedo) y pide el micrófono. */
  static async start(): Promise<{ recorder: PcmRecorder } | { error: 'unsupported' | 'denied' }> {
    const Ctx: typeof AudioContext | undefined = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx || !navigator.mediaDevices?.getUserMedia) return { error: 'unsupported' };
    const ctx = new Ctx();
    void ctx.resume().catch(() => {});
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      void ctx.close().catch(() => {});
      return { error: 'denied' };
    }
    try { await ctx.resume(); } catch { /* si no arranca, no entrega muestras: se avisa al cortar */ }
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    // El procesador solo trabaja si llega a la salida; con volumen 0 no se escucha a sí mismo.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    return { recorder: new PcmRecorder(ctx, stream, source, node, mute) };
  }

  /** Cuánto se lleva grabado, en segundos. */
  get seconds(): number {
    return this.chunks.reduce((n, c) => n + c.length, 0) / this.ctx.sampleRate;
  }

  private release() {
    this.stopped = true;
    try { this.node.disconnect(); this.source.disconnect(); this.mute.disconnect(); } catch { /* ya desconectado */ }
    this.stream.getTracks().forEach((t) => t.stop());
    void this.ctx.close().catch(() => {});
  }

  /** Descarta lo grabado. */
  cancel() { this.release(); }

  /** Corta y devuelve un WAV 16 kHz mono (lo que transcribe el servidor), o null si no entró sonido. */
  finish(): Uint8Array | null {
    const rate = this.ctx.sampleRate;
    const samples = concatChunks(this.chunks);
    this.release();
    if (samples.length < rate * 0.2) return null;
    return encodeWavPcm16(downsampleTo16k(samples, rate));
  }
}

/** base64 de unos bytes, por partes para no pasarse del tope de argumentos. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}
