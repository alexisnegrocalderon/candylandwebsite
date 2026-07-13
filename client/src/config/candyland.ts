/**
 * CANDYLAND — Configuración editable del evento.
 * Todo el contenido de la landing sale de este archivo.
 * Cuando el evento exista en la base de datos con el slug de abajo,
 * la sección de entradas usa los datos reales automáticamente.
 */

export type EstadoAcceso = 'available' | 'last_tickets' | 'soldout' | 'coming_soon';

// ── Motor de formularios ─────────────────────────────────────
// Cada acceso define qué campos extra pide en el checkout.
// EDITAR libremente: agrega/quita campos o cambia required.
export type CampoTipo = 'text' | 'email' | 'tel' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox';

export interface CampoForm {
  name: string; // clave única (sin espacios)
  label: string;
  type: CampoTipo;
  required?: boolean;
  placeholder?: string;
  options?: string[]; // solo para type: 'select'
  help?: string;
}

// Datos que SIEMPRE pide el comprador (cabecera del pedido)
// NOTA: Instagram es el ÚNICO dato opcional. Todo lo demás es obligatorio.
export const CAMPOS_COMPRADOR: CampoForm[] = [
  { name: 'nombre', label: 'Nombre completo', type: 'text', required: true, placeholder: 'Tu nombre y apellido' },
  { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'tu@email.com', help: 'Aquí llega tu entrada y la dirección.' },
  { name: 'whatsapp', label: 'WhatsApp', type: 'tel', required: true, placeholder: '+56 9 1234 5678' },
  { name: 'rut', label: 'RUT', type: 'text', required: true, placeholder: '12.345.678-9' },
  { name: 'instagram', label: 'Instagram (opcional)', type: 'text', required: false, placeholder: '@tu_usuario' },
  { name: 'mayorEdad', label: 'Confirmo que soy mayor de 18 años', type: 'checkbox', required: true },
];

export interface Acceso {
  id: string;
  nombre: string;
  precio: number;
  personas: number; // cuántas personas suma este acceso a la Misión 300
  descripcion: string;
  beneficios: string[];
  estado: EstadoAcceso;
  exclusivoComunidad: boolean;
  nota?: string; // texto destacado bajo la card (ej. "+1 gratis")
  campos?: CampoForm[]; // campos extra específicos de este acceso
}

// Precios y campos — EDITAR con los valores/datos reales
const ACCESOS: Acceso[] = [
  {
    id: 'duo',
    nombre: 'Dúo',
    precio: 40000,
    personas: 2,
    descripcion: 'Acceso para 2 personas. La entrada clásica de la mansión.',
    beneficios: ['2 accesos', 'Todas las zonas', 'Playground XXL'],
    estado: 'available',
    exclusivoComunidad: false,
    campos: [
      { name: 'acomp1_nombre', label: 'Acompañante — Nombre', type: 'text', required: true, placeholder: 'Nombre y apellido' },
      { name: 'acomp1_rut', label: 'Acompañante — RUT', type: 'text', required: true, placeholder: '12.345.678-9' },
      { name: 'acomp1_instagram', label: 'Acompañante — Instagram (opcional)', type: 'text', required: false, placeholder: '@usuario' },
    ],
  },
  {
    id: 'soltera',
    nombre: 'Soltera',
    precio: 20000,
    personas: 1,
    descripcion: 'Acceso individual para ella.',
    beneficios: ['1 acceso', 'Ven con una amiga +1 gratis', 'Todas las zonas'],
    estado: 'available',
    exclusivoComunidad: false,
    nota: '🍒 Incluye un +1 gratis para que vengas con una amiga, totalmente liberada. Puedes agregar sus datos ahora o después.',
    campos: [
      { name: 'acomp1_nombre', label: 'Tu +1 — Nombre (opcional)', type: 'text', required: false, placeholder: 'Nombre y apellido de tu amiga' },
      { name: 'acomp1_rut', label: 'Tu +1 — RUT (opcional)', type: 'text', required: false, placeholder: '12.345.678-9' },
      { name: 'acomp1_instagram', label: 'Tu +1 — Instagram (opcional)', type: 'text', required: false, placeholder: '@usuario' },
    ],
  },
  {
    id: 'soltero',
    nombre: 'Soltero',
    precio: 30000,
    personas: 1,
    descripcion: 'Acceso individual para él. Exclusivo para miembros validados de la comunidad.',
    beneficios: ['1 acceso', 'Requiere código de comunidad', 'Todas las zonas'],
    estado: 'available',
    exclusivoComunidad: true,
    nota: '🔑 Necesitas un código de comunidad. ¿No lo tienes? Escríbenos por WhatsApp para validarte. Si no eres parte de la comunidad, tu opción es el acceso Dúo (con una acompañante).',
    campos: [
      { name: 'codigo_acceso', label: 'Código de acceso (comunidad)', type: 'text', required: true, placeholder: 'Tu código de validación', help: 'Sin código no se puede completar la compra. Solicítalo por WhatsApp.' },
    ],
  },
  {
    id: 'trio',
    nombre: 'Trío',
    precio: 50000,
    personas: 3,
    descripcion: 'Acceso para 3 personas. Más dulce entre más son.',
    beneficios: ['3 accesos', 'Todas las zonas', 'Playground XXL'],
    estado: 'available',
    exclusivoComunidad: false,
    campos: [
      { name: 'acomp1_nombre', label: 'Acompañante 1 — Nombre', type: 'text', required: true, placeholder: 'Nombre y apellido' },
      { name: 'acomp1_rut', label: 'Acompañante 1 — RUT', type: 'text', required: true, placeholder: '12.345.678-9' },
      { name: 'acomp1_instagram', label: 'Acompañante 1 — Instagram (opcional)', type: 'text', required: false, placeholder: '@usuario' },
      { name: 'acomp2_nombre', label: 'Acompañante 2 — Nombre', type: 'text', required: true, placeholder: 'Nombre y apellido' },
      { name: 'acomp2_rut', label: 'Acompañante 2 — RUT', type: 'text', required: true, placeholder: '12.345.678-9' },
      { name: 'acomp2_instagram', label: 'Acompañante 2 — Instagram (opcional)', type: 'text', required: false, placeholder: '@usuario' },
    ],
  },
  {
    id: 'cumpleaneros',
    nombre: 'Cumpleañeros',
    precio: 8000,
    personas: 1,
    descripcion: 'Si cumples en agosto, Candyland te celebra con acceso especial.',
    beneficios: ['1 acceso', 'Sorpresa de cumpleaños', 'Requiere carnet'],
    estado: 'available',
    exclusivoComunidad: false,
    campos: [
      { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', required: true, help: 'Se valida en la entrada con tu carnet.' },
    ],
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
  ciudad: 'Valparaíso, Chile',
  lugar: 'La Mansión — dirección exacta al comprar',

  valores: ['Respeto', 'Consentimiento', 'Libertad'] as const,
  edadMinima: 18,
  dressCode: 'Candy sensual: brillos, rosa, látex, lo que te haga sentir así de rico. Nada de tenida deportiva.',

  // ── Misión 300 ─────────────────────────────────────────────
  mision: {
    meta: 300,
    // Fallback manual mientras no hay base de datos conectada.
    // Con DB, se usa la suma real de PERSONAS vendidas (dúo=2, trío=3, etc.).
    confirmadosFallback: 48,
    titulo: 'Misión 300',
    copy: 'Cada dulce representa una entrada confirmada.',
    // EDITAR: cuando generes el loop ambiental en Higgsfield (corto, sin audio),
    // ponlo en client/public/candyland/ y escribe aquí la ruta, ej: '/candyland/machine-loop.mp4'
    videoLoop: '',
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

  // ── Accesos ────────────────────────────────────────────────
  accesos: ACCESOS,

  // ── Add-ons (se suman al total en el checkout) ─────────────
  // estacionamiento: cupo asegurado. covers: consumos anticipados con precio
  // early-bird (más barato antes) y tope de días antes del evento.
  addons: {
    estacionamiento: {
      id: 'estacionamiento',
      nombre: 'Estacionamiento',
      descripcion: 'Asegura tu cupo de estacionamiento privado.',
      precio: 5000,
      tipo: 'checkbox' as const, // uno por compra
    },
    // covers: consumos anticipados. Se compran por cantidad y se suman al total.
    // Solo disponibles hasta `maxDiasAntes` días antes del evento.
    covers: {
      activo: true,
      maxDiasAntes: 3,
      titulo: 'Covers anticipados',
      descripcion: 'Compra tus consumos ahora y ahórrate la fila. Precio anticipado.',
      // EDITAR: agrega más productos o cambia precios
      productos: [
        { id: 'piscolon', nombre: 'Piscolón', precio: 5000 },
      ],
    },
  },

  // WhatsApp para validación del acceso Soltero (comunidad)
  whatsappSoltero: '+56933135140',

  // ── FAQ ────────────────────────────────────────────────────
  faqs: [
    {
      q: '¿Dónde es la fiesta?',
      a: 'En La Mansión, Valparaíso. La dirección exacta te llega junto a tu entrada por correo, para mantener la privacidad del espacio.',
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
    instagram: 'https://instagram.com/mansionplayroom.cl',
    tiktok: 'https://tiktok.com/@mansionplayroom',
    whatsapp: 'https://wa.me/56933135140',
    web: 'https://www.mansionplayroom.cl',
  },
} as const;

export function formatCLP(value: number): string {
  return value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
}

/** ¿Los covers todavía se pueden comprar? (hasta maxDiasAntes días antes del evento) */
export function coversDisponibles(now: Date = new Date()): boolean {
  const c = CANDYLAND.addons.covers;
  if (!c.activo) return false;
  const limite = CANDYLAND.eventDate.getTime() - c.maxDiasAntes * 86_400_000;
  return now.getTime() < limite;
}

/** Link de WhatsApp con mensaje para validar el acceso Soltero. */
export function whatsappSolteroLink(): string {
  const num = CANDYLAND.whatsappSoltero.replace(/[^0-9]/g, '');
  const msg = encodeURIComponent('Hola! Quiero validarme como miembro de la comunidad para comprar el acceso Soltero de Candyland 🍭');
  return `https://wa.me/${num}?text=${msg}`;
}
