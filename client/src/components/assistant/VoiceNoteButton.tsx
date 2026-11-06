import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mic } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { encodeWavPcm16, VOICE_NOTE_MAX_SECS, VOICE_NOTE_MIN_SECS, VOICE_NOTE_RATE } from '@shared/voiceNote';

/** Cuánto hay que deslizar el dedo a la izquierda para cancelar (como en WhatsApp). */
const CANCEL_PX = 90;

type Phase = 'idle' | 'recording' | 'processing';

/** Lo grabado (mp4 en iPhone, webm en Android) → WAV 16 kHz mono en base64, que es lo que el servidor transcribe. */
async function toWavBase64(blob: Blob): Promise<string> {
  const Ctx: typeof AudioContext = (window as any).AudioContext ?? (window as any).webkitAudioContext;
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    const buf = await blob.arrayBuffer();
    decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(buf, resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
    });
  } finally {
    ctx.close?.().catch(() => {});
  }
  const secs = Math.min(decoded.duration, VOICE_NOTE_MAX_SECS);
  const OfflineCtx: typeof OfflineAudioContext = (window as any).OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  const off = new OfflineCtx(1, Math.max(1, Math.ceil(secs * VOICE_NOTE_RATE)), VOICE_NOTE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  const wav = encodeWavPcm16(rendered.getChannelData(0));
  let bin = '';
  for (let i = 0; i < wav.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(wav.subarray(i, i + 0x8000)));
  return btoa(bin);
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Nota de voz como en WhatsApp: mantén apretado para grabar, suelta para enviar, desliza a la izquierda para cancelar.
 * Lo que se dijo vuelve como texto y se manda al asistente con `onText`. */
export function VoiceNoteButton({ disabled, onText }: { disabled?: boolean; onText: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [secs, setSecs] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const startX = useRef(0);
  const released = useRef(false);
  const cancelRef = useRef(false);
  const timer = useRef<number | null>(null);
  const transcribe = trpc.assistant.transcribe.useMutation();

  const stopTracks = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  const clearTimer = () => { if (timer.current != null) window.clearInterval(timer.current); timer.current = null; };
  useEffect(() => () => { clearTimer(); stopTracks(); }, []);

  const finish = (send: boolean) => {
    clearTimer();
    const rec = recorder.current;
    recorder.current = null;
    const elapsed = (Date.now() - startedAt.current) / 1000;
    if (!rec) { stopTracks(); setPhase('idle'); return; }
    if (!send || elapsed < VOICE_NOTE_MIN_SECS) {
      rec.onstop = () => stopTracks();
      try { rec.stop(); } catch { stopTracks(); }
      setPhase('idle');
      if (send) toast('Mantén apretado el micrófono mientras hablas.');
      return;
    }
    setPhase('processing');
    rec.onstop = async () => {
      stopTracks();
      try {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/mp4' });
        const audio = await toWavBase64(blob);
        const { text } = await transcribe.mutateAsync({ audio });
        onText(text);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo transcribir la nota.');
      } finally {
        setPhase('idle');
      }
    };
    try { rec.stop(); } catch { stopTracks(); setPhase('idle'); }
  };

  const start = async (x: number) => {
    released.current = false;
    cancelRef.current = false;
    setCancelling(false);
    startX.current = x;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Este navegador no permite grabar audio. Usa el micrófono del teclado.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Soltó mientras se pedía el permiso (la primera vez): no se graba nada.
      if (released.current) { s.getTracks().forEach((t) => t.stop()); toast('Ahora sí: mantén apretado el micrófono mientras hablas.'); return; }
      stream.current = s;
      const rec = new MediaRecorder(s);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.start();
      recorder.current = rec;
      startedAt.current = Date.now();
      setSecs(0);
      setPhase('recording');
      navigator.vibrate?.(15);
      timer.current = window.setInterval(() => {
        const t = (Date.now() - startedAt.current) / 1000;
        setSecs(t);
        if (t >= VOICE_NOTE_MAX_SECS) finish(true); // tope: se manda lo grabado
      }, 200);
    } catch {
      toast.error('No hay permiso para el micrófono. Actívalo en Ajustes del teléfono para esta app.');
    }
  };

  const busy = phase === 'processing' || transcribe.isPending;

  return (
    <>
      {phase !== 'idle' && (
        <div aria-live="polite" className="pointer-events-none absolute inset-y-0 left-0 right-14 z-10 flex items-center gap-3 rounded-3xl bg-card px-4">
          {phase === 'recording' ? (
            <>
              <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="tabular-nums text-base font-semibold">{clock(secs)}</span>
              <span className={`ml-auto truncate text-sm ${cancelling ? 'font-semibold text-red-300' : 'text-muted-foreground'}`}>
                {cancelling ? 'Suelta para cancelar' : '‹ Desliza para cancelar'}
              </span>
            </>
          ) : (
            <span className="flex items-center gap-2 text-base text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Escuchando la nota…</span>
          )}
        </div>
      )}
      <button
        type="button"
        aria-label="Mantén apretado para grabar una nota de voz"
        disabled={disabled || busy}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (disabled || busy || phase !== 'idle') return;
          e.preventDefault();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura: igual funciona */ }
          void start(e.clientX);
        }}
        onPointerMove={(e) => {
          if (phase !== 'recording') return;
          const c = startX.current - e.clientX > CANCEL_PX;
          if (c !== cancelRef.current) { cancelRef.current = c; setCancelling(c); }
        }}
        onPointerUp={() => { released.current = true; if (phase === 'recording') finish(!cancelRef.current); }}
        onPointerCancel={() => { released.current = true; if (phase === 'recording') finish(false); }}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        className={`relative z-20 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition-transform duration-150 disabled:opacity-60 ${
          phase === 'recording' ? (cancelling ? 'scale-125 bg-zinc-600' : 'scale-125 bg-red-500 shadow-lg shadow-red-500/40') : 'bg-primary'}`}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
      </button>
    </>
  );
}
