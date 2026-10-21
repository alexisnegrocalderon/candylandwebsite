import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useDarkGlassDocument } from '@/components/admin/shell/AdminShell';
import { OPERATOR_ROLE_LABELS } from '@shared/cajaRoles';
import { useHideSplashWhenSettled } from '@/lib/splash';

/* Piezas comunes de los terminales de operación que se usan desde el
 * celular (/cocina, /guardarropia): marco de vidrio oscuro como /caja y el
 * panel admin, login con tarjetas + teclado numérico, pitido y pantalla
 * siempre encendida. */

/** Marco con el mismo vidrio oscuro de /caja: tema en <html> (toasts y
 * portales también), fondo de planetas. Cada pantalla de adentro es `fixed
 * inset-0` y transparente para que se vea este fondo. */
export function TerminalFrame({ children }: { children: React.ReactNode }) {
  useDarkGlassDocument();
  // El splash de apertura se va cuando ya no queda nada "cargando" adentro.
  const contentRef = useRef<HTMLDivElement>(null);
  useHideSplashWhenSettled(contentRef);
  return (
    <div data-admin-theme="dark-glass" className="admin-shell caja-shell dark">
      <div className="admin-backdrop" aria-hidden="true" />
      <div ref={contentRef} className="contents">{children}</div>
    </div>
  );
}

export function TerminalSpinner() {
  return <div data-splash-wait className="fixed inset-0 grid place-items-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
}

/** Pitido corto con Web Audio API -- sin archivo de sonido que cargar. */
export function beep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Sin Web Audio (raro) -- silencioso, no rompe nada.
  }
}

/** Sonido de resultado: `ok` (dos notas que suben), `warn` (dos pitidos
 * graves) y `error` (zumbido largo) -- para reaccionar sin mirar la
 * pantalla. */
export function playTone(kind: 'ok' | 'warn' | 'error') {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const notes: { freq: number; at: number; len: number; type: OscillatorType }[] =
      kind === 'ok' ? [{ freq: 660, at: 0, len: 0.12, type: 'sine' }, { freq: 990, at: 0.12, len: 0.2, type: 'sine' }]
      : kind === 'warn' ? [{ freq: 420, at: 0, len: 0.16, type: 'triangle' }, { freq: 420, at: 0.24, len: 0.16, type: 'triangle' }]
      : [{ freq: 180, at: 0, len: 0.55, type: 'sawtooth' }];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.type;
      osc.frequency.value = n.freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t0 = ctx.currentTime + n.at;
      gain.gain.setValueAtTime(0.22, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + n.len);
      osc.start(t0);
      osc.stop(t0 + n.len);
    }
  } catch {
    // Sin Web Audio -- silencioso, no rompe nada.
  }
}

/** Vibración corta donde el navegador la deja (iOS no vibra desde la web). */
export function vibrateAlert(pattern: number | number[] = [200, 80, 200]) {
  try { navigator.vibrate?.(pattern); } catch { /* sin API */ }
}

/** Pantalla siempre encendida mientras el terminal está abierto. Si el
 * navegador no tiene Wake Lock (o el sistema lo suelta al cambiar de app) se
 * ignora / se vuelve a pedir al volver a la pestaña. */
export function useWakeLock() {
  useEffect(() => {
    let lock: any = null;
    const request = async () => {
      try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* sin permiso o sin API */ }
    };
    request();
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      try { lock?.release?.(); } catch { /* ya liberado */ }
    };
  }, []);
}

/** Login de operador: tarjetas con los nombres y teclado numérico para el
 * PIN. Hasta 8 dígitos (lo que acepta el servidor); no entra solo: con PIN de
 * 4 a 8 dígitos no hay forma de saber cuándo terminó, y probar a ciegas
 * gastaría intentos del bloqueo por PIN -- se entra con el botón.
 * `onSubmit` recibe un tercer argumento para llamar si el login falla (borra
 * el PIN tecleado). */
export function TerminalLogin({ title, operators, emptyText, pending, onSubmit }: {
  title: string;
  operators: { id: number; name: string; role: string }[] | undefined;
  emptyText: string;
  pending: boolean;
  onSubmit: (operatorId: number, pin: string, onError: () => void) => void;
}) {
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);
  const [pin, setPin] = useState('');

  if (!selected) {
    return (
      <div className="fixed inset-0 overflow-y-auto overscroll-none text-white flex flex-col items-center justify-center gap-8 p-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-14 w-14 object-contain" />
          <h1 className="font-heading text-2xl tracking-tight"><span className="admin-brand-text block">MANSION PLAYROOM</span>{title}</h1>
          <p className="text-white/70 text-sm">Toca tu nombre</p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          {(operators ?? []).map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected({ id: o.id, name: o.name })}
              className="admin-tile flex h-20 flex-col items-center justify-center rounded-3xl text-lg font-semibold active:scale-95 transition-transform"
            >
              {o.name}
              <span className="text-xs font-normal text-white/60">{OPERATOR_ROLE_LABELS[o.role] ?? o.role}</span>
            </button>
          ))}
          {operators && operators.length === 0 && <p className="col-span-2 text-center text-white/50 text-sm">{emptyText}</p>}
        </div>
      </div>
    );
  }

  const dots = Math.max(6, pin.length);
  return (
    <div className="fixed inset-0 overflow-y-auto overscroll-none text-white flex flex-col items-center justify-center gap-6 p-6">
      <button onClick={() => { setSelected(null); setPin(''); }} className="text-white/60 text-sm h-11 px-3">← Cambiar de persona</button>
      <h1 className="text-xl font-bold">{selected.name}</h1>
      <div className="flex gap-3" role="status" aria-label={`${pin.length} dígitos ingresados`}>
        {Array.from({ length: dots }, (_, i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pin.length ? 'bg-primary border-primary shadow-[0_0_10px_-2px_var(--color-primary)]' : 'border-white/15'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
          <button
            key={i}
            disabled={!k || pending}
            onClick={() => {
              if (k === '⌫') { setPin((p) => p.slice(0, -1)); return; }
              if (!k) return;
              setPin((p) => (p + k).slice(0, 8));
            }}
            aria-label={k === '⌫' ? 'Borrar último dígito' : k || undefined}
            className={`h-16 rounded-full text-xl font-semibold active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-primary ${k ? 'admin-tile' : 'invisible'}`}
          >
            {k}
          </button>
        ))}
      </div>
      <button
        disabled={pin.length < 4 || pending}
        onClick={() => onSubmit(selected.id, pin, () => setPin(''))}
        className="w-full max-w-xs h-14 rounded-full bg-primary text-base font-bold text-primary-foreground disabled:opacity-35"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </div>
  );
}

/** Aviso de error de login común a los terminales. */
export function loginErrorToast(e: { message: string }) {
  toast.error(e.message);
}
