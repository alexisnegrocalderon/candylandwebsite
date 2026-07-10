/**
 * CANDYLAND — Configuración editable del evento.
 * Todo el contenido de la landing sale de este archivo.
 * Cuando el evento exista en la base de datos con el slug de abajo,
 * la sección de entradas usa los datos reales automáticamente.
 */

export type EstadoAcceso = 'available' | 'last_tickets' | 'soldout' | 'coming_soon';

export interface Acceso {
  id: string;
  nombre: string;
  precio: number;
  descripcion: string;
  beneficios: string[];
  estado: EstadoAcceso;
  exclusivoComunidad: boolean;
}

// Precios placeholder — EDITAR con los valores reales
const ACCESOS: Acceso[] = [
  {
    id: 'duo',
    nombre: 'Dúo',
    precio: 30000,
    descripcion: 'Acceso para 2 personas. La entrada clásica de la mansión.',
    beneficios: ['2 accesos', 'Todas las zonas', 'Playground XXL'],
    estado: 'available',
    exclusivoComunidad: false,
  },
  {
    id: 'soltera',
    nombre: 'Soltera',
    precio: 12000,
    descripcion: 'Acceso individual para ella.',
    beneficios: ['1 acceso', 'Todas las zonas', 'Playground XXL'],
    estado: 'available',
    exclusivoComunidad: false,
  },
  {
    id: 'soltero',
    nombre: 'Soltero',
    precio: 18000,
    descripcion: 'Acceso individual para él. Solo miembros de la comunidad.',
    beneficios: ['1 acceso', 'Todas las zonas', 'Requiere validación'],
    estado: 'available',
    exclusivoComunidad: true,
  },
  {
    id: 'trio',
    nombre: 'Trío',
    precio: 40000,
    descripcion: 'Acceso para 3 personas. Más dulce entre más son.',
    beneficios: ['3 accesos', 'Todas las zonas', 'Playground XXL'],
    estado: 'available',
    exclusivoComunidad: false,
  },
  {
    id: 'cumpleaneros',
    nombre: 'Cumpleañeros',
    precio: 8000,
    descripcion: 'Si cumples en agosto, Candyland te celebra con acceso especial.',
    beneficios: ['1 acceso', 'Sorpresa de cumpleaños', 'Requiere carnet'],
    estado: 'available',
    exclusivoComunidad: false,
  },
  {
    id: 'vip',
    nombre: 'VIP',
    precio: 60000,
    descripcion: 'La experiencia completa: zona VIP, atención dedicada y más.',
    beneficios: ['Acceso VIP', 'Zona exclusiva', 'Sorpresas dulces'],
    estado: 'available',
    exclusivoComunidad: false,
  },
];

export const CANDYLAND = {
  slug: 'candyland',
  nombre: 'CANDYLAND',
  tagline: 'Donde la libertad sabe más dulce',
  heroTitulo: 'Una noche demasiado dulce para olvidar.',

  // Fecha y hora del evento (hora de Chile continental, invierno = UTC-4)
  eventDate: new Date('2026-08-08T21:00:00-04:00'),
  fechaTexto: 'Sábado 08 de Agosto',
  horarioTexto: '21:00 — 04:30 hrs',
  afterTexto: 'After hasta el amanecer',
  ciudad: 'Santiago, Chile',
  lugar: 'La Mansión — dirección exacta al comprar',

  valores: ['Respeto', 'Consentimiento', 'Libertad'] as const,
  edadMinima: 18,
  dressCode: 'Candy sensual: brillos, rosa, látex, lo que te haga sentir así de rico. Nada de tenida deportiva.',

  // ── Misión 300 ─────────────────────────────────────────────
  mision: {
    meta: 300,
    // Fallback manual mientras no hay base de datos conectada.
    // Con DB, se usa la suma real de entradas vendidas.
    confirmadosFallback: 187,
    titulo: 'Misión 300',
    copy: 'Cada acceso desbloquea una Candyland más grande: más producción, más sorpresas, más dulce. Esto lo construimos entre todos.',
  },

  // ── Pistas / Line-up ───────────────────────────────────────
  pistas: [
    { nombre: 'Pista 1', genero: 'TECH', descripcion: 'House y techno toda la noche' },
    { nombre: 'Pista 2', genero: 'PERREO', descripcion: 'Reggaetón y perreo sin pausa' },
  ],
  lineup: [
    // Agrega artistas aquí cuando estén confirmados:
    // { nombre: 'DJ NOMBRE', pista: 'TECH', horario: '23:00', imagen: '/candyland/dj.webp' },
  ] as { nombre: string; pista: string; horario?: string; imagen?: string }[],

  // ── Amenities (del afiche oficial) ─────────────────────────
  amenities: [
    { icono: 'Music', texto: '2 pistas de baile' },
    { icono: 'Car', texto: 'Estacionamiento privado' },
    { icono: 'Shirt', texto: 'Guardarropía' },
    { icono: 'Gamepad2', texto: 'Playground XXL' },
    { icono: 'VenetianMask', texto: 'Kink Room' },
    { icono: 'Martini', texto: 'Barra completa' },
    { icono: 'Cigarette', texto: 'Zona fumadores techada' },
    { icono: 'ShieldCheck', texto: 'Ambiente seguro' },
  ],

  // ── Accesos (precios placeholder — EDITAR) ─────────────────
  accesos: ACCESOS,

  // ── Galería ────────────────────────────────────────────────
  galeria: [
    { src: '/candyland/mansion-noche.webp', alt: 'La mansión de noche', span: 'tall' },
    { src: '/candyland/candy-girl.webp', alt: 'Candy girl', span: 'tall' },
    { src: '/candyland/gomitas.webp', alt: 'Ositos de gomita', span: 'tall' },
    { src: '/candyland/cubo-dj-2.webp', alt: 'Cubo DJ neón', span: 'normal' },
    { src: '/candyland/paletas-ositos.webp', alt: 'Paletas de ositos', span: 'normal' },
    { src: '/candyland/audifonos-neon.webp', alt: 'Audífonos neón', span: 'normal' },
    { src: '/candyland/banana-lips.webp', alt: 'Banana lips', span: 'normal' },
    { src: '/candyland/banana-tape.webp', alt: 'Banana tape art', span: 'normal' },
  ],

  // ── FAQ ────────────────────────────────────────────────────
  faqs: [
    {
      q: '¿Dónde es la fiesta?',
      a: 'En La Mansión, Santiago. La dirección exacta te llega junto a tu entrada por correo, para mantener la privacidad del espacio.',
    },
    {
      q: '¿A qué hora empieza y termina?',
      a: 'Puertas a las 21:00. La fiesta oficial va hasta las 04:30, y el after sigue hasta el amanecer.',
    },
    {
      q: '¿Cuál es el dress code?',
      a: 'Candy sensual: brillos, rosa, látex, transparencias, lo que te haga sentir irresistible. Evita tenida deportiva.',
    },
    {
      q: '¿Hay edad mínima?',
      a: 'Sí, evento estrictamente +18. Se pide carnet en la entrada, sin excepciones.',
    },
    {
      q: '¿Qué significa "exclusivo comunidad" en el acceso Soltero?',
      a: 'El acceso Soltero está reservado para miembros validados de la comunidad Mansion Playroom, para cuidar el equilibrio y la seguridad del espacio.',
    },
    {
      q: '¿Cómo llego? ¿Hay estacionamiento?',
      a: 'Contamos con estacionamiento privado dentro del recinto. También puedes llegar en app de transporte directo a la entrada.',
    },
    {
      q: '¿Puedo devolver mi entrada?',
      a: 'Las entradas no tienen devolución, pero sí puedes transferirla a otra persona escribiéndonos por Instagram antes del evento.',
    },
  ],

  // ── Redes ──────────────────────────────────────────────────
  redes: {
    instagram: 'https://instagram.com/mansionplayroom',
    tiktok: 'https://tiktok.com/@mansionplayroom',
    whatsapp: 'https://wa.me/56900000000', // EDITAR: número real
    web: 'https://www.mansionplayroom.cl',
  },
} as const;

export function formatCLP(value: number): string {
  return value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}
