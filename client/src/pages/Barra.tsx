import '@/admin.css';
import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { TerminalFrame, TerminalLogin, TerminalSpinner, loginErrorToast } from '@/components/terminal/TerminalShell';
import { BarraCount } from '@/components/barra/BarraCount';
import { openedFromApp } from '@/lib/staffLink';
import { barraTareaEstado, type BarraConteoKind } from '@shared/barraConteo';
import { formatChileTime } from '@shared/chileDate';

/* Conteo de barra del staff (se usa desde el celular): el inventario inicial (el día del evento, antes de abrir
 * puertas, mientras se arma la barra) y el de cierre (cuando ya terminó la fiesta). /caja solo lleva la plata:
 * el inventario se cuenta acá. Cualquiera de la barra puede hacerlo; el primero que cuenta deja la tarea lista
 * para todos. Necesita señal (el conteo se guarda en el servidor). */

export default function Barra() {
  useSeo({ title: 'Barra — Mansion Playroom', description: 'Conteo de inventario de la barra.', path: '/barra', noindex: true });
  return (
    <TerminalFrame>
      <Gate />
    </TerminalFrame>
  );
}

function Gate() {
  const me = trpc.barra.me.useQuery();
  if (me.isLoading) return <TerminalSpinner />;
  if (!me.data) return <Login onDone={() => me.refetch()} />;
  return <Home operatorName={me.data.name} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const { data: operators } = trpc.barra.listOperators.useQuery();
  const login = trpc.barra.login.useMutation({ onSuccess: onDone, onError: loginErrorToast });
  return (
    <TerminalLogin
      title="Conteo de barra"
      operators={operators as any}
      emptyText='No hay nadie con permiso de barra. Pídele a un admin que te cree un usuario con rol "barra".'
      pending={login.isPending}
      onSubmit={(operatorId, pin, onError) => login.mutate({ operatorId, pin }, { onError })}
    />
  );
}

const ESTADO_TEXT = {
  listo: { badge: 'Listo ✓', tone: 'text-emerald-300' },
  pendiente: { badge: 'Pendiente', tone: 'text-amber-300' },
  aun_no: { badge: 'Todavía no', tone: 'text-white/50' },
  vencida: { badge: 'Ya cerró', tone: 'text-white/50' },
} as const;

const AYUDA: Record<BarraConteoKind, Record<'pendiente' | 'aun_no' | 'vencida' | 'listo', string>> = {
  apertura: {
    pendiente: 'Cuenta lo que hay en la barra y en la bodega antes de abrir puertas.',
    aun_no: 'Se abre el día del evento, mientras se arma la barra.',
    vencida: 'La fiesta ya empezó: avisa a un supervisor si falta.',
    listo: 'Ya quedó contado.',
  },
  cierre: {
    pendiente: 'La fiesta terminó: cuenta lo que quedó en la barra y en la bodega.',
    aun_no: 'Se abre cuando termina la fiesta.',
    vencida: 'Ya pasó el plazo: avisa a un supervisor si falta.',
    listo: 'Ya quedó contado.',
  },
};

function Home({ operatorName }: { operatorName: string }) {
  const utils = trpc.useUtils();
  const [counting, setCounting] = useState<BarraConteoKind | null>(null);
  const { data: event, isLoading: loadingEvent } = trpc.barra.activeEvent.useQuery();
  const tareas = trpc.barra.tareas.useQuery({ eventId: event?.id ?? 0 }, { enabled: !!event, refetchInterval: 60_000 });
  const logout = trpc.barra.logout.useMutation({ onSuccess: () => utils.barra.me.invalidate() });

  if (loadingEvent) return <TerminalSpinner />;

  if (event && counting) {
    return (
      <BarraCount
        eventId={event.id}
        kind={counting}
        onBack={() => setCounting(null)}
        onDone={() => { setCounting(null); void tareas.refetch(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto overscroll-none text-white">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 p-6 pt-[max(24px,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between gap-3">
          {openedFromApp()
            ? <a href="/cuenta?tab=perfil" className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold text-white/80">← Mi cuenta</a>
            : <span />}
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">{operatorName}</span>
            <button onClick={() => logout.mutate()} disabled={logout.isPending} aria-label="Cerrar sesión" className="grid h-11 w-11 place-items-center rounded-full bg-white/10">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">🍸 Barra</p>
          <h1 className="text-2xl font-bold">Conteo de inventario</h1>
          {event && <p className="mt-1 text-sm text-white/60">{event.title}</p>}
        </div>

        {!event && <p className="text-sm text-white/60">No hay un evento activo para contar.</p>}
        {event && tareas.isLoading && <TerminalSpinner />}
        {tareas.isError && <p className="text-sm text-amber-300">Sin conexión: el conteo necesita señal.</p>}

        {(tareas.data ?? []).map((t) => {
          const estado = barraTareaEstado(t);
          const { badge, tone } = ESTADO_TEXT[estado];
          // Un supervisor/admin puede contar fuera de ventana o repetir (el servidor lo permite).
          const canOpen = estado === 'pendiente';
          return (
            <div key={t.kind} className="space-y-3 rounded-3xl p-5 admin-clay admin-clay-sm">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold">{t.label}</h2>
                <span className={`text-sm font-bold ${tone}`}>{badge}</span>
              </div>
              <p className="text-sm text-white/60">
                {t.hecho
                  ? `Lo hizo ${t.hecho.por ?? 'alguien de la barra'} a las ${formatChileTime(t.hecho.a)}.`
                  : AYUDA[t.kind][estado]}
              </p>
              {canOpen && (
                <button onClick={() => setCounting(t.kind)} className="h-14 w-full rounded-full bg-primary text-base font-bold text-primary-foreground active:scale-95">
                  Empezar conteo
                </button>
              )}
              {!canOpen && <SupervisorOverride kind={t.kind} onStart={setCounting} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Supervisor/admin: puede contar fuera de ventana o corregir uno ya hecho. */
function SupervisorOverride({ kind, onStart }: { kind: BarraConteoKind; onStart: (k: BarraConteoKind) => void }) {
  const me = trpc.barra.me.useQuery();
  if (me.data?.role !== 'supervisor' && me.data?.role !== 'admin') return null;
  return (
    <button onClick={() => onStart(kind)} className="w-full py-2 text-center text-sm text-white/60 underline">
      Contar igual (supervisor)
    </button>
  );
}
