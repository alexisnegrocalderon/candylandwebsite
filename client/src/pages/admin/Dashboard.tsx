import '@/admin.css';
import { Suspense, lazy, useContext, useEffect, useState, type ReactNode } from 'react';
import { HomeView } from '@/components/admin/HomeView';
import { ExpensesToday } from '@/components/admin/expenses/ExpensesToday';
import { motion } from 'framer-motion';
import { useAuth } from '@/_core/hooks/useAuth';
import { canOpenAdmin, isPartnerRole, isSupervisorRole } from '@/lib/demoMode';
import { SUPERVISOR_SECTION_IDS } from '@shared/panelSupervisor';
import { SupervisorHome } from '@/components/admin/SupervisorHome';
import { SupervisorAccessManager } from '@/components/admin/SupervisorAccessManager';
import { StaffManager, requestNewStaff } from '@/components/admin/staff/StaffManager';
import { requestGiftCoupon } from '@/components/admin/members/requestGiftCoupon';
import { useHideSplashOnMount } from '@/lib/splash';
import { useSeo } from '@/hooks/useSeo';
import { useInstallableApp } from '@/hooks/useInstallableApp';
import { Home, Flame, Calendar, DollarSign, Ticket, Users, Plus, ShoppingBag, Store, Percent, Trophy, LayoutDashboard, Settings as SettingsIcon, Contact, Mail, History, Gift, MessageCircle, Crown, Martini, Instagram, UserPlus, Ban, Receipt, Compass, Sparkles, Car, Send, ShieldAlert, Zap, Cake, Calculator, Star, FlaskConical, Palette, UserCheck, Banknote, Landmark, Headphones, ListChecks, PartyPopper, BellRing, Wine, Smartphone, Bot, TrendingUp, Link2 } from 'lucide-react';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { OPEN_SECTION_EVENT } from '@/components/admin/studio/handoff';
import { parseAdminDeepLink } from '@shared/adminDeepLink';
import { deliverAdminDeepLink } from '@/lib/adminDeepLink';
import { AdminShell, type AdminQuickAction } from '@/components/admin/shell/AdminShell';
import type { ShellSection } from '@/components/admin/shell/nav';
import { AdminNavContext, OrdersView, useAdminBadges } from './sections/shared';
import { SchemaUpdateBanner } from '@/components/admin/SchemaUpdateBanner';
import { AdminBackdropPage } from '@/components/admin/AdminBackdropPage';

// Cada hub del panel es su propio archivo y se descarga al abrir una de sus secciones.
const SolterosManager = lazy(() => import('@/components/admin/solteros/SolterosManager').then((m) => ({ default: m.SolterosManager })));
const BlockedManager = lazy(() => import('@/components/admin/blocked/BlockedManager').then((m) => ({ default: m.BlockedManager })));
const CartaManager = lazy(() => import('@/components/admin/carta/CartaManager').then((m) => ({ default: m.CartaManager })));
const InsumosManager = lazy(() => import('@/components/admin/insumos/InsumosManager').then((m) => ({ default: m.InsumosManager })));
const ContentPlanView = lazy(() => import('@/components/admin/ContentPlanView').then((m) => ({ default: m.ContentPlanView })));
const ContestsView = lazy(() => import('@/components/admin/ContestsView').then((m) => ({ default: m.ContestsView })));
const AppOverview = lazy(() => import('@/components/admin/app/AppOverview').then((m) => ({ default: m.AppOverview })));
const AppInstallsView = lazy(() => import('@/components/admin/push/AppInstallsView').then((m) => ({ default: m.AppInstallsView })));
const CustomerPushView = lazy(() => import('@/components/admin/push/CustomerPushView').then((m) => ({ default: m.CustomerPushView })));
const EventSurveyView = lazy(() => import('@/components/admin/EventSurveyView').then((m) => ({ default: m.EventSurveyView })));
const ExpenseTerminal = lazy(() => import('@/components/admin/expenses/ExpenseTerminal').then((m) => ({ default: m.ExpenseTerminal })));
const AgentSection = lazy(() => import('@/components/admin/InstagramInbox').then((m) => ({ default: m.AgentSection })));
const InstagramInbox = lazy(() => import('@/components/admin/InstagramInbox').then((m) => ({ default: m.InstagramInbox })));
const MembersManager = lazy(() => import('@/components/admin/members/MembersManager').then((m) => ({ default: m.MembersManager })));
const ProfileAuditView = lazy(() => import('@/components/admin/ProfileAuditView').then((m) => ({ default: m.ProfileAuditView })));
const SalesStrategyView = lazy(() => import('@/components/admin/SalesStrategyView').then((m) => ({ default: m.SalesStrategyView })));
const WhatsAppInbox = lazy(() => import('@/components/admin/WhatsAppInbox').then((m) => ({ default: m.WhatsAppInbox })));
const WinbackView = lazy(() => import('@/components/admin/WinbackView').then((m) => ({ default: m.WinbackView })));
const FinanzasView = lazy(() => import('./Finanzas'));
const SiiView = lazy(() => import('./Sii'));
const CoproResumen = lazy(() => import('@/components/admin/coproduction/CoproductionViews').then((m) => ({ default: m.CoproResumen })));
const CoproAsistentes = lazy(() => import('@/components/admin/coproduction/CoproductionViews').then((m) => ({ default: m.CoproAsistentes })));
const CoproCortesias = lazy(() => import('@/components/admin/coproduction/CoproductionViews').then((m) => ({ default: m.CoproCortesias })));
const CoproGastos = lazy(() => import('@/components/admin/coproduction/CoproductionViews').then((m) => ({ default: m.CoproGastos })));
const CoproReparto = lazy(() => import('@/components/admin/coproduction/CoproductionViews').then((m) => ({ default: m.CoproReparto })));
const CoproConfig = lazy(() => import('@/components/admin/coproduction/CoproductionViews').then((m) => ({ default: m.CoproConfig })));
const AmbassadorsView = lazy(() => import('./sections/comunidad').then((m) => ({ default: m.AmbassadorsView })));
const BirthdaysView = lazy(() => import('./sections/clientes').then((m) => ({ default: m.BirthdaysView })));
const CajaAdminView = lazy(() => import('./sections/noche').then((m) => ({ default: m.CajaAdminView })));
const CommunityCodesManager = lazy(() => import('./sections/eventos').then((m) => ({ default: m.CommunityCodesManager })));
const CuentaDemoView = lazy(() => import('./sections/noche').then((m) => ({ default: m.CuentaDemoView })));
const CustomersView = lazy(() => import('./sections/clientes').then((m) => ({ default: m.CustomersView })));
const DenunciasView = lazy(() => import('./sections/noche').then((m) => ({ default: m.DenunciasView })));
const DiscountsManager = lazy(() => import('./sections/eventos').then((m) => ({ default: m.DiscountsManager })));
const EmailTemplatesManager = lazy(() => import('./sections/mensajes').then((m) => ({ default: m.EmailTemplatesManager })));
const EventBudgetSimulatorView = lazy(() => import('./sections/finanzas').then((m) => ({ default: m.EventBudgetSimulatorView })));
const EventOverview = lazy(() => import('./sections/noche').then((m) => ({ default: m.EventOverview })));
const EventsManager = lazy(() => import('./sections/eventos').then((m) => ({ default: m.EventsManager })));
const FlashPromoCard = lazy(() => import('./sections/noche').then((m) => ({ default: m.FlashPromoCard })));
const ResultadosView = lazy(() => import('./sections/resultados').then((m) => ({ default: m.ResultadosView })));
const GastosView = lazy(() => import('./sections/finanzas').then((m) => ({ default: m.GastosView })));
const LeadsView = lazy(() => import('./sections/clientes').then((m) => ({ default: m.LeadsView })));
const MailingHistoryView = lazy(() => import('./sections/mensajes').then((m) => ({ default: m.MailingHistoryView })));
const MailingSection = lazy(() => import('./sections/mensajes').then((m) => ({ default: m.MailingSection })));
const ManualAccessSection = lazy(() => import('./sections/ventas').then((m) => ({ default: m.ManualAccessSection })));
const MejorDisfrazView = lazy(() => import('./sections/noche').then((m) => ({ default: m.MejorDisfrazView })));
const ParkingReportView = lazy(() => import('./sections/ventas').then((m) => ({ default: m.ParkingReportView })));
const PartnerCampaignView = lazy(() => import('./sections/eventos').then((m) => ({ default: m.PartnerCampaignView })));
const PartyGiftsView = lazy(() => import('./sections/noche').then((m) => ({ default: m.PartyGiftsView })));
const PlaymatchTestView = lazy(() => import('./sections/noche').then((m) => ({ default: m.PlaymatchTestView })));
const PlaymatchControlView = lazy(() => import('./sections/playmatchAdmin').then((m) => ({ default: m.PlaymatchControlView })));
const ReferralsView = lazy(() => import('./sections/comunidad').then((m) => ({ default: m.ReferralsView })));
const SalesByOriginView = lazy(() => import('./sections/ventas').then((m) => ({ default: m.SalesByOriginView })));
const SettingsManager = lazy(() => import('./sections/ajustes').then((m) => ({ default: m.SettingsManager })));

// El Estudio trae sus propias fuentes, html-to-image y jszip: se carga recién
// cuando se abre, para no sumarle peso al resto del panel.
const ContentStudio = lazy(() => import('@/components/admin/ContentStudio').then((m) => ({ default: m.ContentStudio })));

/** Quita el splash de apertura al montar (pantallas que no pasan por AdminShell). */
function SplashGone() {
  useHideSplashOnMount();
  return null;
}

/** Inicio y «Hoy» de gastos son mínimos y el inicio es lo primero que se ve: van fijos, no lazy. */
function HomeSection() {
  const { badgeCounts, openSection } = useContext(AdminNavContext);
  return <HomeView badgeCounts={badgeCounts} onOpen={openSection} />;
}

function ExpensesTodaySection() {
  const { openSection } = useContext(AdminNavContext);
  return <ExpensesToday onAdd={() => openSection('cargar-gasto')} />;
}

/** Mientras se descarga el archivo de una sección (cada hub se carga al abrirlo). */
function SectionLoading() {
  return <div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
}

/** Atajos de la hoja del «+» en el celular (solo los de secciones visibles). */
const ADMIN_QUICK_ACTIONS: AdminQuickAction[] = [
  { key: 'staff', label: 'Agregar staff', icon: UserPlus, section: 'staff', onSelect: requestNewStaff },
  { key: 'gasto', label: 'Cargar gasto', icon: Receipt, section: 'cargar-gasto' },
  { key: 'acceso', label: 'Acceso manual', icon: Gift, section: 'manual-access' },
  { key: 'evento', label: 'Crear evento', icon: Calendar, section: 'events' },
  { key: 'cupon', label: 'Regalar cupón', icon: Gift, section: 'members', onSelect: requestGiftCoupon },
  { key: 'push', label: 'Enviar push', icon: BellRing, section: 'push-clientes' },
  { key: 'agente', label: 'Agente IA', icon: Bot, section: 'agente-conocimiento' },
  { key: 'esperando', label: 'Conversaciones esperando', icon: MessageCircle, section: 'instagram' },
];

const ADMIN_SECTIONS = [
  { id: 'home', label: 'Inicio', hub: 'inicio', icon: Home, render: () => <HomeSection /> },
  // 1 · Preparar: armar el evento antes de vender (ficha, precios, códigos, equipo, cajas, carta y stock).
  { id: 'events', label: 'Eventos', hub: 'preparar', icon: Calendar, render: () => <EventsManager /> },
  { id: 'discounts', label: 'Descuentos', hub: 'preparar', icon: Percent, render: () => <DiscountsManager /> },
  { id: 'community', label: 'Códigos Comunidad', hub: 'preparar', icon: Users, render: () => <CommunityCodesManager /> },
  { id: 'staff', label: 'Staff', hub: 'preparar', icon: Users, render: () => <StaffManager /> },
  { id: 'caja', needsCaja: true, label: 'Caja', hub: 'preparar', icon: Store, render: () => <CajaAdminView /> },
  { id: 'carta', needsCaja: true, label: 'Carta de la Fiesta', hub: 'preparar', icon: Martini, render: () => <CartaManager /> },
  { id: 'insumos', needsCaja: true, label: 'Stock de Barra', hub: 'preparar', icon: Wine, render: () => <InsumosManager /> },
  // Co-producción (Playroom × Dalmore): aparece junto a la preparación porque se arma con el evento.
  { id: 'copro-resumen', label: 'Resumen', hub: 'coproduccion', icon: LayoutDashboard, render: () => <CoproResumen /> },
  { id: 'copro-asistentes', label: 'Asistentes', hub: 'coproduccion', icon: Users, render: () => <CoproAsistentes /> },
  { id: 'copro-cortesias', label: 'Cortesías', hub: 'coproduccion', icon: Gift, render: () => <CoproCortesias /> },
  { id: 'copro-gastos', label: 'Gastos', hub: 'coproduccion', icon: Receipt, render: () => <CoproGastos /> },
  { id: 'copro-reparto', label: 'Reparto', hub: 'coproduccion', icon: DollarSign, render: () => <CoproReparto /> },
  { id: 'copro-config', label: 'Configuración', hub: 'coproduccion', icon: SettingsIcon, render: () => <CoproConfig /> },
  // 2 · Vender: las ventas del evento, cortesías y lo que trae ventas (concursos, embajadores, referidos).
  { id: 'orders-web', label: 'Ventas Web', hub: 'vender', icon: Ticket, render: () => <OrdersView channel="web" /> },
  { id: 'manual-access', label: 'Accesos Manuales', hub: 'vender', icon: Gift, render: () => <ManualAccessSection /> },
  { id: 'parking', label: 'Estacionamiento', hub: 'vender', icon: Car, render: () => <ParkingReportView /> },
  { id: 'sales-origin', label: 'Ventas por Origen', hub: 'vender', icon: Compass, render: () => <SalesByOriginView /> },
  { id: 'contests', label: 'Concursos', hub: 'vender', icon: PartyPopper, render: () => <ContestsView /> },
  { id: 'ambassadors', label: 'Embajadores VIP', hub: 'vender', icon: Crown, render: () => <AmbassadorsView /> },
  { id: 'referrals', label: 'Referidos', hub: 'vender', icon: Trophy, render: () => <ReferralsView /> },
  { id: 'partner-electronica', label: 'Comunidad Electrónica', hub: 'vender', hidden: true, icon: Headphones, render: () => <PartnerCampaignView /> },
  { id: 'sales-strategy', label: 'Director comercial', hub: 'vender', hidden: true, icon: Sparkles, render: () => <SalesStrategyView /> },
  // Comunicar: mailing, avisos a la app, contenido y las bandejas de Instagram/WhatsApp.
  { id: 'mailing', label: 'Mailing', hub: 'comunicar', icon: Mail, render: () => <MailingSection /> },
  { id: 'mailing-history', label: 'Historial de Mailing', hub: 'comunicar', icon: History, render: () => <MailingHistoryView /> },
  { id: 'email-templates', label: 'Plantillas de correo', hub: 'comunicar', icon: Send, render: () => <EmailTemplatesManager /> },
  { id: 'push-clientes', label: 'Notificaciones', hub: 'comunicar', icon: BellRing, render: () => <CustomerPushView /> },
  { id: 'content-plan', label: 'Plan de contenido', hub: 'comunicar', icon: Calendar, render: () => <ContentPlanView /> },
  { id: 'studio', label: 'Estudio', hub: 'comunicar', icon: Palette, render: () => (
    <Suspense fallback={<div className="py-12 flex justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <ContentStudio />
    </Suspense>
  ) },
  { id: 'profile-audit', label: 'Revisar mi perfil', hub: 'comunicar', icon: UserCheck, render: () => <ProfileAuditView /> },
  { id: 'instagram', label: 'Instagram', hub: 'comunicar', icon: Instagram, render: () => <InstagramInbox /> },
  { id: 'whatsapp', label: 'WhatsApp', hub: 'comunicar', icon: MessageCircle, render: () => <WhatsAppInbox /> },
  // 3 · En vivo: la noche en control (resumen, caja, Playmatch, denuncias, promos).
  { id: 'overview', label: 'Resumen de la noche', hub: 'envivo', icon: LayoutDashboard, render: () => <EventOverview /> },
  { id: 'sup-home', label: 'Esta noche', hub: 'envivo', icon: LayoutDashboard, render: () => <SupervisorHome /> },
  { id: 'orders-caja', label: 'Ventas Caja', hub: 'envivo', icon: ShoppingBag, render: () => <OrdersView channel="caja" /> },
  { id: 'playmatch-control', label: 'Playmatch en vivo', hub: 'envivo', icon: Flame, render: () => <PlaymatchControlView /> },
  { id: 'denuncias', label: 'Denuncias Playmatch', hub: 'envivo', icon: ShieldAlert, render: () => <DenunciasView /> },
  { id: 'party-gifts', label: 'Tragos de la Fiesta', hub: 'envivo', icon: Martini, render: () => <PartyGiftsView /> },
  { id: 'mejor-disfraz', label: 'Mejor disfraz', hub: 'envivo', icon: Trophy, render: () => <MejorDisfrazView /> },
  { id: 'flash-promo', label: 'Promo Flash', hub: 'envivo', icon: Zap, render: () => <FlashPromoCard /> },
  // 4 · Cierre: resultados y P&L del evento, y la encuesta a los asistentes.
  { id: 'cierre-resultados', label: 'Resultados', hub: 'cierre', icon: ListChecks, render: () => <ResultadosView /> },
  { id: 'gastos', label: 'Gastos y P&L', hub: 'cierre', icon: Receipt, render: () => <GastosView /> },
  { id: 'event-survey', label: 'Encuestas', hub: 'cierre', icon: Star, render: () => <EventSurveyView /> },
  // Clientes: la base y todo lo que se hace con una persona (ficha, solteros, cupones y regalos a su app).
  { id: 'customers', label: 'Clientes', hub: 'clientes', icon: Contact, render: () => <CustomersView /> },
  { id: 'leads', label: 'Leads', hub: 'clientes', icon: UserPlus, render: () => <LeadsView /> },
  { id: 'winback', label: 'Reactivar clientes', hub: 'clientes', icon: Users, render: () => <WinbackView /> },
  { id: 'birthdays', label: 'Cumpleañeros', hub: 'clientes', icon: Cake, render: () => <BirthdaysView /> },
  { id: 'blocked-customers', label: 'Bloqueo de Clientes', hub: 'clientes', icon: Ban, render: () => <BlockedManager /> },
  { id: 'solteros', label: 'Solteros', hub: 'clientes', icon: UserCheck, render: () => <SolterosManager /> },
  { id: 'members', label: 'Cupones y pagos', hub: 'clientes', icon: Crown, render: () => <MembersManager /> },
  { id: 'app-clientes', label: 'Clientes con la app', hub: 'clientes', icon: Smartphone, render: () => <AppInstallsView /> },
  // App y Playmatch: el resumen de la app y las herramientas para probarla.
  { id: 'app-resumen', label: 'Resumen', hub: 'app', icon: LayoutDashboard, render: () => <AppOverview /> },
  { id: 'playmatch-test', label: 'Probar Playmatch', hub: 'app', icon: FlaskConical, render: () => <PlaymatchTestView /> },
  { id: 'cuenta-demo', label: 'Cuenta de prueba', hub: 'app', icon: UserCheck, render: () => <CuentaDemoView /> },
  // Agente IA: cada pestaña del agente es una sección (comparten el borrador de «Conocimiento» y «Ajustes»).
  { id: 'agente-conocimiento', label: 'Conocimiento y tono', hub: 'agente', icon: Bot, render: () => <AgentSection tab="conocimiento" /> },
  { id: 'agente-ajustes', label: 'Ajustes', hub: 'agente', icon: SettingsIcon, render: () => <AgentSection tab="ajustes" /> },
  { id: 'agente-ventas', label: 'Ventas y aprendizaje', hub: 'agente', icon: TrendingUp, render: () => <AgentSection tab="ventas" /> },
  { id: 'agente-automatizaciones', label: 'Automatizaciones', hub: 'agente', icon: Zap, render: () => <AgentSection tab="automatizaciones" /> },
  { id: 'agente-links', label: 'Kit de links', hub: 'agente', icon: Link2, render: () => <AgentSection tab="links" /> },
  { id: 'agente-whatsapp', label: 'WhatsApp', hub: 'agente', icon: MessageCircle, render: () => <AgentSection tab="whatsapp" /> },
  // Finanzas de la empresa: el mes, el SII y la terminal para cargar gastos.
  { id: 'finanzas', label: 'Finanzas', hub: 'finanzas', icon: Banknote, render: () => <FinanzasView /> },
  { id: 'sii', label: 'SII', hub: 'finanzas', icon: Landmark, render: () => <SiiView /> },
  { id: 'cargar-gasto', label: 'Cargar gasto', hub: 'finanzas', icon: Plus, render: () => <ExpenseTerminal inShell /> },
  { id: 'gastos-hoy', label: 'Hoy', hub: 'finanzas', icon: ListChecks, render: () => <ExpensesTodaySection /> },
  { id: 'event-budget', label: 'Simulador de Evento', hub: 'finanzas', hidden: true, icon: Calculator, render: () => <EventBudgetSimulatorView /> },
  { id: 'supervisoras', label: 'Supervisoras', hub: 'ajustes', icon: Users, render: () => <SupervisorAccessManager /> },
  { id: 'settings', label: 'Ajustes', hub: 'ajustes', icon: SettingsIcon, render: () => <SettingsManager /> },
] as const satisfies readonly (ShellSection & { render: () => ReactNode })[];

export default function AdminDashboard() {
  // El panel nunca debe aparecer en Google. robots.txt no basta -- ademas
  // publica la ruta a quien lo lea; la etiqueta noindex es lo que de verdad
  // lo mantiene fuera del indice.
  useSeo({ title: 'Panel — Mansion Playroom', description: '', path: '/admin', noindex: true });
  // Instalable en la pantalla de inicio, sin la barra del navegador.
  useInstallableApp('/admin/sw.js', '/admin/');

  const { user, loading, isAuthenticated, logout } = useAuth();
  // El socio de una co-producción (ej. Dalmore) ve SOLO su co-producción,
  // sin la Configuración (que es del dueño). El servidor igual le rechaza
  // todo lo demás (`partnerProcedure`); esto solo arma su vista.
  const isPartner = isPartnerRole(user?.role);
  // La supervisora (ej. Belén) ve solo sus secciones; el servidor igual rechaza el resto.
  const isSupervisor = isSupervisorRole(user?.role);
  const sections = isPartner
    ? ADMIN_SECTIONS.filter((s) => s.hub === 'coproduccion' && s.id !== 'copro-config')
    : isSupervisor
      ? SUPERVISOR_SECTION_IDS.map((id) => ADMIN_SECTIONS.find((s) => s.id === id)!).filter(Boolean)
      : ADMIN_SECTIONS.filter((s) => s.id !== 'sup-home');
  const [activeSection, setActiveSection] = useState<typeof ADMIN_SECTIONS[number]['id']>('home');
  const { counts: badgeCounts, markSeen } = useAdminBadges(!!user && !isPartner && !isSupervisor);

  const openSection = (id: typeof ADMIN_SECTIONS[number]['id']) => {
    setActiveSection(id);
    markSeen(id);
  };

  // Otra sección pide cambiar de pantalla (ej. "Abrir en Estudio" desde el
  // Plan de contenido -- studio/handoff.ts).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (ADMIN_SECTIONS.some((s) => s.id === id)) openSection(id as typeof ADMIN_SECTIONS[number]['id']);
    };
    window.addEventListener(OPEN_SECTION_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SECTION_EVENT, onOpen);
  });

  // Aviso push tocado: la URL trae a dónde ir (?section=…&tab=…&thread=…).
  // Al cargar se lee de la dirección; con la app ya abierta llega como
  // mensaje del service worker (client/public/admin/sw.js).
  useEffect(() => {
    const go = (search: string) => {
      const link = parseAdminDeepLink(search);
      if (!link) return;
      // Los avisos viejos apuntan a «instagram» con la pestaña del agente: ahora son secciones de «Agente IA».
      if (link.section === 'instagram' && link.tab && ['conocimiento', 'ajustes', 'ventas', 'automatizaciones', 'links'].includes(link.tab)) {
        openSection(`agente-${link.tab}` as typeof ADMIN_SECTIONS[number]['id']);
        return;
      }
      if (!ADMIN_SECTIONS.some((s) => s.id === link.section)) return;
      openSection(link.section as typeof ADMIN_SECTIONS[number]['id']);
      deliverAdminDeepLink(link);
    };
    if (window.location.search.includes('section=')) {
      go(window.location.search);
      try { window.history.replaceState(null, '', window.location.pathname); } catch { /* sin history: no pasa nada */ }
    }
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'admin-open' && typeof e.data.url === 'string') go(e.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verificando la sesión: el splash oscuro de apertura sigue a la vista
  // (lo quitan AdminShell o el login al montar), así que acá solo va el fondo
  // oscuro -- un círculo girando sería un segundo loader.
  if (loading) {
    return <div data-admin-theme="dark-glass" className="min-h-screen bg-[#0b0612]" />;
  }

  if (!isAuthenticated) {
    return <AdminLoginForm />;
  }

  if (!canOpenAdmin(user?.role)) {
    return (
      <AdminBackdropPage>
        <SplashGone />
        <div className="admin-clay text-center p-8">
          <h2 className="font-heading text-3xl mb-4">Sin Permisos</h2>
          <p className="text-muted-foreground">No tienes permisos de administrador.</p>
        </div>
      </AdminBackdropPage>
    );
  }

  const isDemo = user?.role === 'viewer';

  const active = sections.find((s) => s.id === activeSection) ?? sections[0];
  const navContext = {
    badgeCounts,
    openSection: (id: string) => {
      if (sections.some((s) => s.id === id)) openSection(id as typeof ADMIN_SECTIONS[number]['id']);
    },
  };

  return (
    <AdminShell
      sections={sections as unknown as ShellSection[]}
      activeSection={active.id}
      onOpenSection={(id) => openSection(id as typeof ADMIN_SECTIONS[number]['id'])}
      badgeCounts={badgeCounts}
      userName={isDemo ? 'Invitado (demo)' : (user?.name?.trim() || 'Mansion Playroom')}
      roleLabel={isPartner ? 'Socio · Playroom × Dalmore' : isSupervisor ? 'Supervisora' : undefined}
      isDemo={isDemo}
      onLogout={() => logout()}
      quickActions={ADMIN_QUICK_ACTIONS}
    >
      <AdminNavContext.Provider value={navContext}>
        {!isSupervisor && <SchemaUpdateBanner />}
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <Suspense fallback={<SectionLoading />}>{active.render()}</Suspense>
        </motion.div>
      </AdminNavContext.Provider>
    </AdminShell>
  );
}
