import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mic } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { bytesToBase64, PcmRecorder } from '@/lib/pcmRecorder';
import { VOICE_NOTE_MAX_SECS, VOICE_NOTE_MIN_SECS } from '@shared/voiceNote';

/** Cuánto hay que deslizar el dedo a la izquierda para cancelar (como en WhatsApp). */
const CANCEL_PX = 90;
/** Si la transcripción tarda más que esto, se avisa en vez de quedarse esperando. */
const TRANSCRIBE_TIMEOUT_MS = 30_000;

type Phase = 'idle' | 'recording' | 'processing';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(message)), ms);
    p.then((v) => { window.clearTimeout(t); resolve(v); }, (e) => { window.clearTimeout(t); reject(e); });
  });
}

/** Nota de voz como en WhatsApp: mantén apretado para grabar, suelta para enviar, desliza a la izquierda para cancelar.
 * Lo que se dijo vuelve como texto y se manda al asistente con `onText`. Cada paso tiene su tiempo límite: si algo se
 * traba, se avisa qué pasó en vez de quedarse en «Escuchando…». */
export function VoiceNoteButton({ disabled, onText }: { disabled?: boolean; onText: (text: string) => void }) {
  const [phase, setPhaseState] = useState<Phase>('idle');
  const [secs, setSecs] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  // El estado también va en refs: los manejadores del dedo no pueden quedarse con un valor viejo.
  const phaseRef = useRef<Phase>('idle');
  const recorder = useRef<PcmRecorder | null>(null);
  const startX = useRef(0);
  const released = useRef(false);
  const cancelRef = useRef(false);
  const timer = useRef<number | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const transcribe = trpc.assistant.transcribe.useMutation();

  const setPhase = (p: Phase) => { phaseRef.current = p; setPhaseState(p); };
  const clearTimer = () => { if (timer.current != null) window.clearInterval(timer.current); timer.current = null; };
  useEffect(() => () => { clearTimer(); recorder.current?.cancel(); recorder.current = null; }, []);

  /** Corta la grabación y, si `send`, la manda a transcribir. */
  const finish = async (send: boolean) => {
    if (phaseRef.current !== 'recording') return;
    clearTimer();
    const rec = recorder.current;
    recorder.current = null;
    if (!rec) { setPhase('idle'); return; }
    if (!send) { rec.cancel(); setPhase('idle'); return; }
    const elapsed = rec.seconds;
    if (elapsed < VOICE_NOTE_MIN_SECS) {
      rec.cancel();
      setPhase('idle');
      toast('Mantén apretado el micrófono mientras hablas.');
      return;
    }
    setPhase('processing');
    try {
      const wav = rec.finish();
      if (!wav) throw new Error('No entró sonido del micrófono. Revisa el permiso y vuelve a intentarlo.');
      const { text } = await withTimeout(
        transcribe.mutateAsync({ audio: bytesToBase64(wav) }), TRANSCRIBE_TIMEOUT_MS,
        'La transcripción tardó demasiado. Revisa tu conexión y vuelve a intentarlo.',
      );
      onTextRef.current(text);
    } catch (err) {
      console.error('[NotaDeVoz]', err);
      toast.error(err instanceof Error ? err.message : 'No se pudo transcribir la nota.');
    } finally {
      setPhase('idle');
    }
  };

  const start = async (x: number) => {
    released.current = false;
    cancelRef.current = false;
    setCancelling(false);
    startX.current = x;
    setPhase('recording'); // se ve el contador de inmediato; si no hay permiso vuelve a reposo con un aviso
    setSecs(0);
    const started = await PcmRecorder.start();
    if ('error' in started) {
      setPhase('idle');
      toast.error(started.error === 'unsupported'
        ? 'Este navegador no permite grabar audio. Usa el micrófono del teclado.'
        : 'No hay permiso para el micrófono. Actívalo en Ajustes del teléfono para esta app.');
      return;
    }
    // Soltó mientras se pedía el permiso (la primera vez): no se graba nada.
    if (released.current) {
      started.recorder.cancel();
      setPhase('idle');
      toast('Ahora sí: mantén apretado el micrófono mientras hablas.');
      return;
    }
    recorder.current = started.recorder;
    navigator.vibrate?.(15);
    timer.current = window.setInterval(() => {
      const t = recorder.current?.seconds ?? 0;
      setSecs(t);
      if (t >= VOICE_NOTE_MAX_SECS) void finish(!cancelRef.current); // tope: se manda lo grabado
    }, 200);
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
          if (disabled || busy || phaseRef.current !== 'idle') return;
          e.preventDefault();
          try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura: igual funciona */ }
          void start(e.clientX);
        }}
        onPointerMove={(e) => {
          if (phaseRef.current !== 'recording') return;
          const c = startX.current - e.clientX > CANCEL_PX;
          if (c !== cancelRef.current) { cancelRef.current = c; setCancelling(c); }
        }}
        onPointerUp={() => { released.current = true; void finish(!cancelRef.current); }}
        onPointerCancel={() => { released.current = true; void finish(false); }}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        className={`relative z-20 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition-transform duration-150 disabled:opacity-60 ${
          phase === 'recording' ? (cancelling ? 'scale-125 bg-zinc-600' : 'scale-125 bg-red-500 shadow-lg shadow-red-500/40') : 'bg-primary'}`}
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
      </button>
    </>
  );
}
