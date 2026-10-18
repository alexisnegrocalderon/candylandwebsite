import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, LogOut, MoreHorizontal, Search, Settings as SettingsIcon, Eye } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ADMIN_HUBS, hubBadgeCount, type AdminHub, type AdminHubId, type ShellSection } from './nav';
import { CommandPalette } from './CommandPalette';

const COLLAPSED_KEY = 'admin-sidebar-collapsed';

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

function writeCollapsed(value: boolean) {
  try { localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0'); } catch { /* sin storage: solo dura la sesión */ }
}

const formatBadge = (n: number) => (n > 99 ? '99+' : String(n));

/** El tema va en <html> y no solo en el shell: los diálogos, selects y menús
 * de Radix se montan en un portal directo en <body>, fuera del shell, y sin
 * esto saldrían claros sobre el panel oscuro. Se quita al salir del panel. */
function useDarkGlassDocument() {
  useEffect(() => {
    const root = document.documentElement;
    const prevTheme = root.dataset.adminTheme;
    root.dataset.adminTheme = 'dark-glass';
    root.classList.add('dark');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevColor = meta?.content;
    if (meta) meta.content = '#0b0612';
    return () => {
      if (prevTheme === undefined) delete root.dataset.adminTheme; else root.dataset.adminTheme = prevTheme;
      root.classList.remove('dark');
      if (meta && prevColor !== undefined) meta.content = prevColor;
    };
  }, []);
}

interface AdminShellProps {
  sections: ShellSection[];
  activeSection: string;
  onOpenSection: (id: string) => void;
  badgeCounts: Record<string, number>;
  userName: string;
  /** Texto bajo el nombre; por defecto "Super Admin" o el del demo. */
  roleLabel?: string;
  isDemo: boolean;
  onLogout: () => void;
  children: ReactNode;
}

/** Chrome del panel: sidebar de vidrio (desktop), pestañas del hub, barra
 * inferior + "Más" (celular) y buscador Ctrl+K. No sabe nada de lo que
 * renderiza cada sección -- solo de ids, hubs y burbujas. */
export function AdminShell({ sections, activeSection, onOpenSection, badgeCounts, userName, roleLabel: roleLabelProp, isDemo, onLogout, children }: AdminShellProps) {
  useDarkGlassDocument();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const current = sections.find((s) => s.id === activeSection) ?? sections[0];
  const activeHub = current.hub;
  const hubSections = sections.filter((s) => s.hub === activeHub);
  const allHubs: AdminHub[] = useMemo(
    () => [...ADMIN_HUBS, { id: 'ajustes' as const, label: 'Ajustes', icon: SettingsIcon }].filter((h) => sections.some((s) => s.hub === h.id)),
    [sections],
  );
  const hubMeta = allHubs.find((h) => h.id === activeHub) ?? allHubs[0];

  // Última pestaña usada en cada hub: volver al hub vuelve a esa pestaña.
  const lastTab = useRef<Partial<Record<AdminHubId, string>>>({});
  useEffect(() => { lastTab.current[activeHub] = activeSection; }, [activeHub, activeSection]);

  const openHub = (hub: AdminHubId) => {
    const target = lastTab.current[hub] ?? sections.find((s) => s.hub === hub)?.id;
    if (target) onOpenSection(target);
    setMoreOpen(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => { writeCollapsed(!v); return !v; });
  };

  // Un hub sin secciones (todavía) no se muestra.
  const hubs = ADMIN_HUBS.filter((h) => sections.some((s) => s.hub === h.id));
  const roleLabel = roleLabelProp ?? (isDemo ? 'Invitado · solo lectura' : 'Super Admin');
  const hasSettings = sections.some((s) => s.hub === 'ajustes');
  // Con un solo hub (el panel del socio), la barra inferior del celular
  // muestra directamente sus pestañas en vez de hubs.
  const singleHub = hubs.length === 1 && !hasSettings;
  const mobileHubs = hubs.filter((h) => h.mobile);
  const moreBadge = allHubs
    .filter((h) => !h.mobile)
    .reduce((sum, h) => sum + hubBadgeCount(h.id, sections, badgeCounts), 0);

  return (
    <div data-admin-theme="dark-glass" className="admin-shell dark relative min-h-dvh">
      <div className="admin-backdrop" aria-hidden="true" />

      {/* ── Sidebar de vidrio (desktop) ── */}
      <aside
        className={`admin-sidebar fixed inset-y-0 left-0 z-40 hidden md:flex p-3 transition-[width] duration-300 ease-out ${collapsed ? 'w-[92px]' : 'w-[272px]'}`}
      >
        <div className="admin-glass-panel relative flex h-full w-full flex-col overflow-visible">
          <div className="flex items-center gap-1.5 px-5 pt-4" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>

          <div className={`flex items-center gap-2 pt-4 pb-4 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
            <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-8 w-8 shrink-0 object-contain" />
            {!collapsed && (
              <span className="min-w-0 leading-none">
                <span className="admin-brand-text block font-heading text-lg tracking-[0.08em]">MANSION</span>
                <span className="mt-1 block text-[10px] font-semibold tracking-[0.42em] text-muted-foreground">PLAYROOM</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            className="admin-collapse-btn absolute -right-3.5 top-[74px] z-10 flex h-7 w-7 items-center justify-center rounded-full"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>

          <div className="admin-divider mx-4" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`flex items-center gap-3 py-3 text-left transition-colors hover:bg-white/5 ${collapsed ? 'justify-center px-2' : 'px-5'}`}
              >
                <span className="admin-avatar flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-heading text-base font-bold">
                  {(userName.trim()[0] ?? 'M').toUpperCase()}
                </span>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{userName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              {hasSettings && (
                <DropdownMenuItem onClick={() => openHub('ajustes')}>
                  <SettingsIcon className="h-4 w-4" /> Ajustes
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="admin-divider mx-4" />

          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
            {!collapsed && <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Menú</p>}
            <ul className="space-y-1">
              {hubs.map((hub) => (
                <li key={hub.id}>
                  <HubButton
                    hub={hub}
                    active={hub.id === activeHub}
                    collapsed={collapsed}
                    badge={hubBadgeCount(hub.id, sections, badgeCounts)}
                    onClick={() => openHub(hub.id)}
                  />
                </li>
              ))}
            </ul>
          </nav>

          <div className="admin-divider mx-4" />
          <div className="space-y-1 px-3 py-3">
            {hasSettings && (
              <HubButton
                hub={{ id: 'ajustes', label: 'Ajustes', icon: SettingsIcon }}
                active={activeHub === 'ajustes'}
                collapsed={collapsed}
                badge={0}
                onClick={() => openHub('ajustes')}
              />
            )}
            <HubButton
              hub={{ id: 'ajustes', label: 'Cerrar sesión', icon: LogOut }}
              active={false}
              collapsed={collapsed}
              badge={0}
              onClick={onLogout}
              danger
            />
          </div>
        </div>
      </aside>

      {/* ── Contenido ── */}
      <div className={`relative z-10 transition-[padding] duration-300 ease-out ${collapsed ? 'md:pl-[92px]' : 'md:pl-[272px]'}`}>
        <header className="admin-topbar sticky top-0 z-30 px-3 pt-3 md:px-4">
          <div className="admin-glass-panel admin-glass-panel-sm flex items-center gap-3 px-4 py-3 md:px-5">
            <img src="/candyland/logo-isotipo-transparent.png" alt="" className="h-7 w-7 shrink-0 object-contain md:hidden" />
            <h1 className="min-w-0 flex-1 truncate font-heading text-xl md:text-2xl">{hubMeta.label}</h1>
            {isDemo && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Modo demo — solo lectura</span>
                <span className="sm:hidden">Demo</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="admin-search-btn flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground"
              aria-label="Buscar en el panel"
            >
              <Search className="h-4 w-4" />
              <span className="hidden lg:inline">Buscar…</span>
              <kbd className="hidden rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] lg:inline">Ctrl K</kbd>
            </button>
          </div>

          {hubSections.length > 1 && (
            <div className="admin-tabs-scroller -mx-3 mt-2 overflow-x-auto px-3 md:mx-0 md:px-0">
              <div className="flex w-max gap-1.5 pb-1" role="tablist" aria-label={hubMeta.label}>
                {hubSections.map((s) => {
                  const count = badgeCounts[s.id] ?? 0;
                  const isActive = s.id === activeSection;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onOpenSection(s.id)}
                      className={`admin-tab flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-medium ${isActive ? 'admin-tab-active' : ''}`}
                    >
                      <s.icon className="h-4 w-4" />
                      {s.label}
                      {count > 0 && <span className="admin-badge">{formatBadge(count)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </header>

        <main className="px-3 pb-28 pt-4 md:px-6 md:pb-10">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>

      {/* ── Barra inferior (celular) ── */}
      <nav className="admin-tabbar fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden">
        <div className="admin-glass-panel flex items-stretch justify-around px-1 py-1.5">
          {singleHub && hubSections.slice(0, 5).map((s) => (
            <TabBarButton
              key={s.id}
              icon={s.icon}
              label={s.label}
              active={s.id === activeSection}
              badge={badgeCounts[s.id] ?? 0}
              onClick={() => onOpenSection(s.id)}
            />
          ))}
          {!singleHub && mobileHubs.map((hub) => (
            <TabBarButton
              key={hub.id}
              icon={hub.icon}
              label={hub.label === 'Noche en vivo' ? 'Noche' : hub.label}
              active={hub.id === activeHub}
              badge={hubBadgeCount(hub.id, sections, badgeCounts)}
              onClick={() => openHub(hub.id)}
            />
          ))}
          <TabBarButton
            icon={MoreHorizontal}
            label={singleHub ? 'Cuenta' : 'Más'}
            active={!singleHub && !mobileHubs.some((h) => h.id === activeHub)}
            badge={singleHub ? 0 : moreBadge}
            onClick={() => setMoreOpen(true)}
          />
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="admin-glass-sheet max-h-[85dvh] overflow-y-auto rounded-t-3xl border-0 px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-5">
          <SheetTitle className="sr-only">Más secciones</SheetTitle>
          <div className="flex items-center gap-3 px-1">
            <span className="admin-avatar flex h-10 w-10 items-center justify-center rounded-xl font-heading font-bold">
              {(userName.trim()[0] ?? 'M').toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {allHubs.map((hub) => {
              const badge = hubBadgeCount(hub.id, sections, badgeCounts);
              const isActive = hub.id === activeHub;
              return (
                <button
                  key={hub.id}
                  type="button"
                  onClick={() => openHub(hub.id)}
                  className={`admin-tile relative flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center text-[13px] font-medium ${isActive ? 'admin-tab-active' : ''}`}
                >
                  <hub.icon className="h-5 w-5" />
                  <span className="leading-tight">{hub.label}</span>
                  {badge > 0 && <span className="admin-badge absolute right-2 top-2">{formatBadge(badge)}</span>}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 text-sm font-medium text-red-300"
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </button>
        </SheetContent>
      </Sheet>

      <CommandPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        sections={sections}
        hubs={allHubs}
        onSelect={(id) => { onOpenSection(id); setSearchOpen(false); }}
      />
    </div>
  );
}

function HubButton({ hub, active, collapsed, badge, onClick, danger }: {
  hub: AdminHub;
  active: boolean;
  collapsed: boolean;
  badge: number;
  onClick: () => void;
  danger?: boolean;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`admin-nav-item relative flex h-11 w-full items-center gap-3 rounded-2xl text-[15px] ${collapsed ? 'justify-center px-0' : 'px-3.5'} ${active ? 'admin-nav-item-active' : ''} ${danger ? 'admin-nav-item-danger' : ''}`}
    >
      <hub.icon className="h-[19px] w-[19px] shrink-0" />
      {!collapsed && <span className="flex-1 truncate text-left">{hub.label}</span>}
      {badge > 0 && (collapsed
        ? <span className="admin-badge-dot absolute right-3 top-2" />
        : <span className="admin-badge">{formatBadge(badge)}</span>)}
    </button>
  );
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{badge > 0 ? `${hub.label} (${badge})` : hub.label}</TooltipContent>
    </Tooltip>
  );
}

function TabBarButton({ icon: Icon, label, active, badge, onClick }: {
  icon: AdminHub['icon'];
  label: string;
  active: boolean;
  badge: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`admin-tabbar-item relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-medium ${active ? 'admin-tabbar-item-active' : ''}`}
    >
      <Icon className="h-5 w-5" />
      <span className="truncate">{label}</span>
      {badge > 0 && <span className="admin-badge absolute right-[calc(50%-22px)] top-0">{formatBadge(badge)}</span>}
    </button>
  );
}
