import {
  Home, Radio, Ticket, Calendar, Users, MessagesSquare, Palette, Crown, Banknote, Handshake, Receipt,
  type LucideIcon,
} from 'lucide-react';

/* Capa de "hubs" encima de las secciones del panel: el menú muestra ~9
 * entradas y cada una abre una pantalla con pestañas donde viven las
 * secciones de siempre. Los `id` de sección NO cambian (deep links push,
 * OPEN_SECTION_EVENT, burbujas y localStorage los siguen usando tal cual). */

export type AdminHubId =
  | 'inicio' | 'noche' | 'ventas' | 'eventos' | 'clientes'
  | 'mensajes' | 'contenido' | 'comunidad' | 'finanzas' | 'gastos' | 'coproduccion' | 'ajustes';

export interface AdminHub {
  id: AdminHubId;
  label: string;
  icon: LucideIcon;
  /** Va en la barra inferior del celular (el resto queda en "Más"). */
  mobile?: boolean;
}

/** Orden del menú. "ajustes" va aparte, abajo del separador. */
export const ADMIN_HUBS: AdminHub[] = [
  { id: 'inicio', label: 'Inicio', icon: Home, mobile: true },
  { id: 'noche', label: 'Noche en vivo', icon: Radio, mobile: true },
  { id: 'ventas', label: 'Ventas', icon: Ticket, mobile: true },
  { id: 'eventos', label: 'Eventos', icon: Calendar },
  { id: 'coproduccion', label: 'Playroom × Dalmore', icon: Handshake },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'mensajes', label: 'Mensajes', icon: MessagesSquare, mobile: true },
  { id: 'contenido', label: 'Contenido', icon: Palette },
  { id: 'comunidad', label: 'Comunidad', icon: Crown },
  { id: 'finanzas', label: 'Finanzas', icon: Banknote },
  // Terminal para cargar gastos desde el celular (también en /gastos).
  { id: 'gastos', label: 'Gastos', icon: Receipt },
];

/** Lo que necesita el shell de cada sección (sin su `render`). */
export interface ShellSection {
  id: string;
  label: string;
  hub: AdminHubId;
  icon: LucideIcon;
}

/** Palabras extra para el buscador (Ctrl+K): cómo lo diría el dueño, no cómo
 * se llama la pantalla. */
export const SECTION_KEYWORDS: Record<string, string> = {
  home: 'inicio resumen kpi pendientes',
  overview: 'evento noche hoy en vivo aforo',
  caja: 'barra tragos turnos cierre',
  staff: 'equipo personal cargos pin operadores bartender seguridad puerta agregar staff',
  'flash-promo': 'promocion oferta relampago',
  'party-gifts': 'regalos tragos gratis',
  denuncias: 'reportes playmatch seguridad',
  'playmatch-test': 'prueba invitados qr',
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
  members: 'socios cuenta mi cuenta cupones preventa anticipada login beneficios',
  'blocked-customers': 'bloqueo lista negra vetados',
  instagram: 'dm mensajes chat agente ig comentarios',
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
