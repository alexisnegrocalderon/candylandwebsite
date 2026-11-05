import {
  Home, Radio, Ticket, Users, Megaphone, ClipboardList, CircleCheckBig, Banknote, Handshake, Smartphone, Sparkles, Palette,
  type LucideIcon,
} from 'lucide-react';

/* Capa de "hubs" encima de las secciones del panel: el menú muestra ~9
 * entradas y cada una abre una pantalla con pestañas donde viven las
 * secciones de siempre. Los `id` de sección NO cambian (deep links push,
 * OPEN_SECTION_EVENT, burbujas y localStorage los siguen usando tal cual). */

export type AdminHubId =
  | 'inicio' | 'preparar' | 'coproduccion' | 'vender' | 'contenido' | 'marketing' | 'envivo' | 'cierre'
  | 'clientes' | 'app' | 'asistente' | 'finanzas' | 'ajustes';

export interface AdminHub {
  id: AdminHubId;
  label: string;
  icon: LucideIcon;
  /** Va en la barra inferior del celular (el resto queda en "Más"). */
  mobile?: boolean;
  /** El hub trabaja sobre UN evento: arriba se muestra el selector de evento. */
  perEvent?: boolean;
}

/** Orden del menú, por etapas del evento (Preparar → Vender → En vivo → Cierre) y después lo que no
 * es de una fiesta sola. "ajustes" va aparte, abajo del separador. */
export const ADMIN_HUBS: AdminHub[] = [
  { id: 'inicio', label: 'Inicio', icon: Home, mobile: true },
  { id: 'coproduccion', label: 'Playroom × Dalmore', icon: Handshake },
  { id: 'preparar', label: '1 · Preparar', icon: ClipboardList, perEvent: true },
  { id: 'vender', label: '2 · Vender', icon: Ticket, mobile: true, perEvent: true },
  // Contenido: lo que se publica (plan, estudio de diseño, revisión del perfil).
  { id: 'contenido', label: 'Contenido', icon: Palette },
  // Marketing: lo que llega a la gente (mailing, avisos a la app, Instagram, WhatsApp y el agente que contesta los mensajes).
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'envivo', label: '3 · En vivo', icon: Radio, mobile: true, perEvent: true },
  { id: 'cierre', label: '4 · Cierre', icon: CircleCheckBig, perEvent: true },
  { id: 'clientes', label: 'Clientes', icon: Users, mobile: true },
  // La app Playroom y Playmatch: el resumen de la app y las herramientas para probarla.
  { id: 'app', label: 'App y Playmatch', icon: Smartphone },
  // El asistente al que se le pregunta cualquier cosa de la productora (ventas, clientes, stock, finanzas…) con datos en vivo.
  { id: 'asistente', label: 'Asistente IA', icon: Sparkles },
  // Finanzas de la empresa, el SII y la terminal para cargar gastos (también en /gastos).
  { id: 'finanzas', label: 'Finanzas', icon: Banknote },
];

/** Lo que necesita el shell de cada sección (sin su `render`). */
export interface ShellSection {
  id: string;
  label: string;
  hub: AdminHubId;
  icon: LucideIcon;
  /** Fuera del menú (se sigue abriendo desde el buscador y los avisos): pantallas que casi no se usan. */
  hidden?: boolean;
  /** Pantallas de la caja de la plataforma: se esconden mientras el evento elegido vende solo entrada y estacionamiento por la web. */
  needsCaja?: boolean;
}

/** Palabras extra para el buscador (Ctrl+K): cómo lo diría el dueño, no cómo
 * se llama la pantalla. */
export const SECTION_KEYWORDS: Record<string, string> = {
  home: 'inicio resumen kpi pendientes',
  overview: 'evento noche hoy en vivo aforo',
  caja: 'barra tragos turnos cierre',
  staff: 'equipo personal cargos pin operadores bartender seguridad puerta agregar staff',
  solteros: 'soltero solteros aprobar aprobacion hombres solos codigo comunidad solicitudes',
  'flash-promo': 'promocion oferta relampago',
  'party-gifts': 'regalos tragos gratis',
  'playmatch-control': 'playmatch en vivo conteo super like superlike cobros ingresos regalar devolver tope interruptor pausar disfraz podio anfitriones meta',
  denuncias: 'reportes playmatch seguridad',
  'playmatch-test': 'prueba invitados qr',
  'mejor-disfraz': 'concurso disfraz halloween votos ganador',
  'cuenta-demo': 'cuenta de prueba demo probar app staff',
  contests: 'concurso sorteo instagram ganadores participantes',
  'orders-web': 'entradas tickets ordenes compras online',
  'orders-caja': 'ordenes puerta efectivo',
  'sales-origin': 'utm atribucion canal campañas',
  'sales-strategy': 'ia estrategia director',
  'manual-access': 'cortesia invitacion lista gratis',
  parking: 'autos estacionamiento',
  events: 'fiesta crear evento ficha precios tandas',
  carta: 'menu tragos productos',
  'event-survey': 'encuesta opiniones calificacion',
  discounts: 'cupones codigos descuento',
  community: 'codigos comunidad',
  'partner-electronica': 'electronica partner alianza',
  customers: 'clientes base crm personas',
  leads: 'interesados prospectos',
  winback: 'reactivar recuperar clientes inactivos',
  birthdays: 'cumpleaños cumpleañeros',
  members: 'socios cuenta mi cuenta cupones regalar cupon preventa anticipada login beneficios pagos tarjeta recarga app',
  'app-resumen': 'app resumen playroom cupones saldo playcard playcoins instalaciones',
  'app-clientes': 'app instalada quien tiene la app clientes correos telefonos instalar qr',
  'blocked-customers': 'bloqueo lista negra vetados',
  instagram: 'dm mensajes chat ig comentarios bandeja',
  asistente: 'asistente ia inteligencia artificial preguntar pregunta datos reporte informe ventas clientes stock finanzas cuanto chat claude',
  'agente-conocimiento': 'agente de mensajes agente ia bot tono voz marca conocimiento responder instagram whatsapp dm',
  'agente-ajustes': 'agente ia bot ajustes derivar equipo horario respuestas ejemplos estilo',
  'agente-ventas': 'agente ia bot ventas aprendizaje coach fans derivaciones',
  'agente-automatizaciones': 'agente ia automatizacion palabra clave comentario regalo respuesta automatica',
  'agente-links': 'agente ia kit de links botones compra instagram',
  'agente-whatsapp': 'agente ia whatsapp bot wsp activar conexion meta',
  whatsapp: 'wsp chat mensajes',
  mailing: 'correo email newsletter campaña',
  'mailing-history': 'correos enviados historial',
  'push-clientes': 'notificaciones push avisos telefono app promociones clientes',
  'email-templates': 'plantillas correo email',
  'content-plan': 'calendario publicaciones posts',
  studio: 'diseño carrusel slides historias',
  'profile-audit': 'auditoria perfil instagram bio',
  referrals: 'referidos invita amigos',
  ambassadors: 'embajadores vip rrpp',
  finanzas: 'dinero ingresos resultados',
  gastos: 'gastos p&l costos boletas',
  sii: 'impuestos iva f29 boletas',
  'event-budget': 'presupuesto simulador costos',
  'cargar-gasto': 'gasto cargar nuevo boleta factura escanear terminal compra',
  'gastos-hoy': 'gastos hoy cargados lista boletas',
  settings: 'ajustes configuracion alertas push seguridad',
  'copro-resumen': 'dalmore playmore coproduccion socio hipodromo',
  'copro-asistentes': 'dalmore asistentes lista',
  'copro-cortesias': 'dalmore cortesias invitaciones',
  'copro-gastos': 'dalmore gastos aprobar boletas',
  'copro-reparto': 'dalmore reparto utilidad 50/50',
  'copro-config': 'dalmore configuracion landing clave activar lanzar',
};

/** Normaliza para buscar sin tildes ni mayúsculas. */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Suma de burbujas de las secciones de un hub. */
export function hubBadgeCount(hub: AdminHubId, sections: ShellSection[], counts: Record<string, number>): number {
  return sections.filter((s) => s.hub === hub).reduce((sum, s) => sum + (counts[s.id] ?? 0), 0);
}
