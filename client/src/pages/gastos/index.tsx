import '@/admin.css';
import { useState } from 'react';
import { ListChecks, Plus } from 'lucide-react';
import { canOpenAdmin } from '@/lib/demoMode';
import { trpc } from '@/lib/trpc';
import { useSeo } from '@/hooks/useSeo';
import { useInstallableApp } from '@/hooks/useInstallableApp';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { useDarkGlassDocument } from '@/components/admin/shell/AdminShell';
import { ExpenseTerminal } from '@/components/admin/expenses/ExpenseTerminal';
import { ExpensesToday } from '@/components/admin/expenses/ExpensesToday';

/* Carga rápida de gastos desde el celular, como app instalable. Es la misma
 * sesión de admin que /admin (misma cookie, mismo TOTP una sola vez) y el
 * mismo terminal que el hub "Gastos" del panel (ExpenseTerminal), con el
 * vidrio oscuro del panel pero sin su barra de navegación.
 *
 * Instalable en la pantalla de inicio (ver useInstallableApp). Va
 * online-only a propósito: no lleva la cola offline de /caja porque los
 * gastos se cargan con señal, no a oscuras en la pista. */

export default function GastosApp() {
  useSeo({ title: 'Gastos — Mansion Playroom', description: '', path: '/gastos', noindex: true });
  // El SW es network-only (no cachea nada): existe únicamente porque Chrome
  // no ofrece "instalar" sin uno. iOS instala solo con el manifest.
  useInstallableApp('/gastos/sw.js', '/gastos/');
  // Fondo del documento y barra de estado oscuros, igual que el panel.
  useDarkGlassDocument();

  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <Frame>
        <div className="flex min-h-[60dvh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </Frame>
    );
  }
  if (!user) return <AdminLoginForm />;
  if (!canOpenAdmin(user.role)) {
    return (
      <Frame>
        <div className="admin-clay mx-auto mt-10 max-w-sm p-6 text-center">
          <p className="text-muted-foreground">Esta pantalla es solo para el administrador.</p>
        </div>
      </Frame>
    );
  }
  return <GastosScreens />;
}

function GastosScreens() {
  const [tab, setTab] = useState<'cargar' | 'hoy'>('cargar');
  return (
    <Frame tabs={
      <div className="mt-2 flex gap-1.5" role="tablist" aria-label="Gastos">
        <TabChip active={tab === 'cargar'} onClick={() => setTab('cargar')} icon={<Plus className="h-4 w-4" />}>Cargar gasto</TabChip>
        <TabChip active={tab === 'hoy'} onClick={() => setTab('hoy')} icon={<ListChecks className="h-4 w-4" />}>Hoy</TabChip>
      </div>
    }>
      {tab === 'cargar' ? <ExpenseTerminal /> : <ExpensesToday onAdd={() => setTab('cargar')} />}
    </Frame>
  );
}

/** Mismo chrome que el encabezado del panel (AdminShell): vidrio oscuro,
 * logo, título y pestañas, respetando la muesca del iPhone. */
function Frame({ tabs, children }: { tabs?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div data-admin-theme="dark-glass" className="admin-shell dark relative min-h-dvh">
      <div className="admin-backdrop" aria-hidden="true" />
      <div className="relative z-10">
        <header className="sticky top-0 z-30 px-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <div className="admin-glass-panel admin-glass-panel-sm mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-7 w-7 shrink-0 object-contain" />
            <h1 className="min-w-0 flex-1 truncate font-heading text-xl">Gastos</h1>
            <a href="/admin" className="admin-search-btn flex h-9 shrink-0 items-center rounded-xl px-3 text-xs text-muted-foreground">Panel</a>
          </div>
          {tabs && <div className="mx-auto max-w-lg">{tabs}</div>}
        </header>
        <main className="px-3 pb-6 pt-4">{children}</main>
      </div>
    </div>
  );
}

function TabChip({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={active} onClick={onClick}
      className={`admin-tab flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium ${active ? 'admin-tab-active' : ''}`}>
      {icon}
      {children}
    </button>
  );
}
