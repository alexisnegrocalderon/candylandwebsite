import { useEffect, useRef, useState } from 'react';
import { BellRing, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { useDarkGlassDocument } from '@/components/admin/shell/AdminShell';
import { OPERATOR_ROLE_LABELS, STAFF_SYSTEMS, canEnterArea, ownArea, type StaffSystemKey } from '@shared/cajaRoles';
import { trpc } from '@/lib/trpc';
import { STAFF_CALL_NOTE_MAX, STAFF_CALL_REASONS, areaLabel, type StaffCallReason } from '@shared/staffCall';
import { openedFromApp, preselectedOperatorId } from '@/lib/staffLink';
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
  // Desde la sección «Staff» de la App: el nombre ya viene elegido (igual se pide el PIN).
  const preselect = useRef(preselectedOperatorId());
  useEffect(() => {
    const id = preselect.current;
    const op = id ? operators?.find((o) => o.id === id) : undefined;
    if (op) { preselect.current = null; setSelected({ id: op.id, name: op.name }); }
  }, [operators]);

  if (!selected) {
    return (
      <div className="fixed inset-0 overflow-y-auto overscroll-none text-white flex flex-col items-center justify-center gap-8 p-6">
        {openedFromApp() && <a href="/cuenta?tab=perfil" className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white/80">← Volver a mi cuenta</a>}
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
      {openedFromApp() && <a href="/cuenta?tab=perfil" className="absolute left-4 top-[max(16px,env(safe-area-inset-top))] inline-flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-white/80">← Volver a mi cuenta</a>}
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

/** Cada persona solo entra a SU pantalla. Todas las pantallas de trabajo comparten la misma sesión, así que si alguien abre
 * otra (un enlace guardado, un cambio de URL), en vez de mostrarle una pantalla que no es suya —con errores por todos lados—
 * se le dice cuál es la suya y se le lleva directo. Supervisor y Admin entran a todas. */
export function AreaGuard({ area, role, children }: { area: StaffSystemKey; role: string; children: React.ReactNode }) {
  const logout = trpc.puerta.logout.useMutation({ onSettled: () => window.location.reload() });
  if (canEnterArea(role, area)) return <>{children}</>;
  const mine = ownArea(role);
  const here = STAFF_SYSTEMS.find((s) => s.key === area)?.label ?? 'esta pantalla';
  return (
    <div role="alert" className="fixed inset-0 flex flex-col items-center justify-center gap-6 overflow-y-auto p-6 text-center text-white">
      <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-14 w-14 object-contain" />
      <div className="max-w-sm space-y-2">
        <h1 className="font-heading text-2xl font-extrabold">Esta pantalla no es la tuya</h1>
        <p className="text-white/70">{here} es de otra área. {mine ? `Tu pantalla es ${mine.label}.` : 'No tienes una pantalla de trabajo asignada.'}</p>
      </div>
      <div className="w-full max-w-sm space-y-2">
        {mine && <a href={mine.path} className="flex h-16 w-full items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground active:scale-[0.99]">Ir a {mine.label}</a>}
        <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending} className="h-14 w-full rounded-full bg-white/10 font-semibold active:scale-[0.99] disabled:opacity-50">Cerrar sesión</button>
      </div>
    </div>
  );
}

/** El botón de arriba de todas las pantallas: «Llamar a los organizadores». Un toque, un motivo y les llega una notificación al
 * celular al administrador y a los supervisores. Necesita señal (sin ella lo dice y pide llamar por teléfono). */
export function CallOrganizersButton({ area }: { area: StaffSystemKey }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-red-500/20 text-red-300 active:bg-red-500/35" aria-label="Llamar a los organizadores" title="Llamar a los organizadores">
        <BellRing className="h-5 w-5" />
      </button>
      {open && <CallSheet area={area} onClose={() => setOpen(false)} />}
    </>
  );
}

function CallSheet({ area, onClose }: { area: StaffSystemKey; onClose: () => void }) {
  const [reason, setReason] = useState<StaffCallReason | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const call = trpc.terminal.call.useMutation({
    onSuccess: () => { setSent(true); vibrateAlert(60); },
    onError: (e) => toast.error(e.message || 'No se pudo avisar. Llámalos por teléfono.', { duration: 8000 }),
  });
  return (
    <div role="dialog" aria-label="Llamar a los organizadores" className="fixed inset-0 z-[70] flex flex-col bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mt-auto max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-[#140c1f] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-white/50">Llamar a los organizadores</p>
              <p className="text-sm text-white/70">Desde {areaLabel(area)}</p>
            </div>
            <button onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/70 active:bg-white/10" aria-label="Cerrar"><X className="h-6 w-6" /></button>
          </div>
          {sent ? (
            <div className="py-6 text-center">
              <span className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-emerald-400 text-black"><Check className="h-12 w-12" /></span>
              <p className="font-heading text-2xl font-extrabold">Aviso enviado</p>
              <p className="mt-2 text-white/70">Ya les llegó la notificación. Si es urgente, llámalos igual.</p>
              <button onClick={onClose} className="mt-6 h-14 w-full rounded-full bg-emerald-500 text-lg font-bold text-black active:scale-[0.99]">Listo</button>
            </div>
          ) : (
            <>
              {!online && <p className="mb-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">Sin señal: el aviso no puede salir. Llama por teléfono a los organizadores.</p>}
              <p className="mb-2 text-xs uppercase tracking-widest text-white/50">¿Qué pasa?</p>
              <div className="mb-4 grid gap-2">
                {STAFF_CALL_REASONS.map((r) => (
                  <button key={r.key} onClick={() => setReason(r.key)} aria-pressed={reason === r.key}
                    className={`flex h-14 items-center gap-3 rounded-2xl border px-4 text-left text-lg font-bold active:scale-[0.99] ${reason === r.key ? 'border-red-400/70 bg-red-500/20' : 'border-white/10 bg-white/5'}`}>
                    <span className="text-2xl" aria-hidden>{r.emoji}</span>{r.label}
                  </button>
                ))}
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value.slice(0, STAFF_CALL_NOTE_MAX))} placeholder="Detalle (opcional)" maxLength={STAFF_CALL_NOTE_MAX} aria-label="Detalle del aviso"
                className="mb-4 h-12 w-full rounded-2xl bg-white/10 px-4 text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/60" />
              <button onClick={() => reason && call.mutate({ area, reason, note: note.trim() || null })} disabled={!reason || !online || call.isPending}
                className="h-16 w-full rounded-full bg-red-500 text-lg font-bold text-white shadow-[0_0_24px_-6px_rgba(239,68,68,0.9)] active:scale-[0.99] disabled:opacity-35 disabled:shadow-none">
                {call.isPending ? 'Avisando…' : !reason ? 'Elige qué pasa' : 'Avisar ahora'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
