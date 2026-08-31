/**
 * Configuración del sitio. Todo el contenido de la landing sale de acá.
 *
 * ⚠️ IMPORTANTE — la marca es MANSION PLAYROOM, no el nombre del evento.
 * "Candyland" es el nombre de UNA fiesta; después vendrá otra. Por eso este
 * archivo separa dos cosas:
 *
 *   • `MARCA`  → lo permanente (recinto, valores, edad mínima, redes, FAQ).
 *   • `EVENTO` → lo que cambia con cada fiesta (nombre, fecha, dress code,
 *                accesos, precios, pistas).
 *
 * 👉 Para montar el próximo evento se edita `EVENTO` (y `accesos`,
 * `pistas`, `lineup`). Los textos del sitio que nombran al evento leen
 * `EVENTO.nombre`, así que se actualizan solos; los que hablan de la marca
 * dicen Mansion Playroom y no hay que tocarlos. Los extras (estacionamiento,
 * covers, etc.) ya no se configuran acá — se cargan desde Admin → Entradas
 * como `ticketTypes` con `category='extra'`.
 *
 * Cuando el evento exista en la base de datos con el slug de `EVENTO.slug`,
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
  personas: number; // cuántas personas cubre este acceso
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
    beneficios: ['1 acceso', 'Todas las zonas'],
    estado: 'available',
    exclusivoComunidad: false,
  },
  {
    id: 'duo_mujeres',
    nombre: 'Dúo Mujeres',
    precio: 20000,
    personas: 2,
    descripcion: 'Acceso 2x1 para 2 mujeres — mismo valor que el acceso Soltera.',
    beneficios: ['2 accesos', 'Mismo valor que Soltera sola', 'Todas las zonas'],
    estado: 'available',
    exclusivoComunidad: false,
    campos: [
      { name: 'acomp1_nombre', label: 'Acompañante — Nombre', type: 'text', required: true, placeholder: 'Nombre y apellido' },
      { name: 'acomp1_rut', label: 'Acompañante — RUT', type: 'text', required: true, placeholder: '12.345.678-9' },
      { name: 'acomp1_instagram', label: 'Acompañante — Instagram (opcional)', type: 'text', required: false, placeholder: '@usuario' },
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
    id: 'grupo',
    nombre: 'Grupo',
    precio: 60000,
    personas: 4,
    descripcion: 'Acceso para 4 personas. La forma más dulce de venir en banda.',
    beneficios: ['4 accesos', 'Todas las zonas', 'Playground XXL'],
    estado: 'available',
    exclusivoComunidad: false,
    campos: [
      { name: 'acomp1_nombre', label: 'Acompañante 1 — Nombre', type: 'text', required: true, placeholder: 'Nombre y apellido' },
      { name: 'acomp1_rut', label: 'Acompañante 1 — RUT', type: 'text', required: true, placeholder: '12.345.678-9' },
      { name: 'acomp1_instagram', label: 'Acompañante 1 — Instagram (opcional)', type: 'text', required: false, placeholder: '@usuario' },
      { name: 'acomp2_nombre', label: 'Acompañante 2 — Nombre', type: 'text', required: true, placeholder: 'Nombre y apellido' },
      { name: 'acomp2_rut', label: 'Acompañante 2 — RUT', type: 'text', required: true, placeholder: '12.345.678-9' },
      { name: 'acomp2_instagram', label: 'Acompañante 2 — Instagram (opcional)', type: 'text', required: false, placeholder: '@usuario' },
      { name: 'acomp3_nombre', label: 'Acompañante 3 — Nombre', type: 'text', required: true, placeholder: 'Nombre y apellido' },
      { name: 'acomp3_rut', label: 'Acompañante 3 — RUT', type: 'text', required: true, placeholder: '12.345.678-9' },
      { name: 'acomp3_instagram', label: 'Acompañante 3 — Instagram (opcional)', type: 'text', required: false, placeholder: '@usuario' },
    ],
  },
  {
    id: 'cumpleaneros',
    nombre: 'Cumpleañeros',
    precio: 8000,
    personas: 1,
    descripcion: 'Si cumples el mes del evento, te celebramos con acceso especial.',
    beneficios: ['1 acceso', 'Sorpresa de cumpleaños', 'Requiere carnet'],
    estado: 'available',
    exclusivoComunidad: false,
    campos: [
      { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', required: true, help: 'Se valida en la entrada con tu carnet.' },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════
 * MARCA — lo permanente de Mansion Playroom.
 *
 * "Candyland" es el nombre de UN evento; después vendrá otro. Todo lo que
 * sobreviva al cambio de evento va acá, y los textos del sitio que hablan de
 * la marca deben decir Mansion Playroom, no el nombre del evento de turno.
 * ═══════════════════════════════════════════════════════════════ */
export const MARCA = {
  nombre: 'Mansion Playroom',
  ciudad: 'Valparaíso, Chile',
  lugar: 'La Mansión — dirección exacta al comprar',
  valores: ['Respeto', 'Consentimiento', 'Libertad'] as const,
  edadMinima: 18,
} as const;

/* ═══════════════════════════════════════════════════════════════
 * EVENTO — lo que cambia con cada fiesta.
 *
 * 👉 PARA MONTAR EL PRÓXIMO EVENTO se edita ESTE bloque (y `accesos`,
 * `pistas` y `lineup` más abajo). Los textos del sitio que
 * nombran el evento leen `EVENTO.nombre`, así que se actualizan solos.
 * ═══════════════════════════════════════════════════════════════ */
export const EVENTO = {
  // Debe coincidir con el slug real del evento en la base de datos (lo que
  // el admin le puso al crearlo en /admin) — si no coincide, todos los CTA
  // del sitio apuntan a un evento que no existe y el checkout cae en modo
  // demo silenciosamente, fallando recién al intentar pagar.
  slug: 'candyland-agosto-2026',
  // Nombre corto que se usa en el título grande del Hero. La marca completa
  // ("Mansion Playroom") vive en MARCA.nombre y se usa en el logo del Hero y
  // en el splash del Intro -- el título grande no la repite.
  nombre: 'PLAYROOM',
  tagline: 'Se viene el 2° Aniversario. Y viene con sorpresa',
  heroTitulo: 'El 2° Aniversario se acerca. Algo grande viene con él.',

  // ⚠️ Todavía no hay fecha confirmada para la próxima fiesta (ni venta de
  // entradas activa). Mientras `fechaConfirmada` sea false, el Hero y la
  // sección de countdown ocultan fecha/hora/countdown y muestran un mensaje
  // "Próximamente" en su lugar -- ver Hero() y UrgencySection() en Home.tsx.
  // `eventDate` se deja con un valor futuro cualquiera solo para no romper
  // el tipo Date; no se renderiza en ningún lado mientras esto sea false.
  fechaConfirmada: false,
  eventDate: new Date('2026-09-30T21:00:00-04:00'),
  fechaTexto: 'Próximamente',
  horarioTexto: '',
  afterTexto: 'After hasta el amanecer',
  // Temático del evento: "candy" era de Candyland. El próximo tendrá el suyo
  // -- por ahora se deja un dress code genérico hasta definir el de Playroom.
  dressCode: 'Elegante y sensual: lo que te haga sentir irresistible. Nada de tenida deportiva.',
} as const;

/* `CANDYLAND` se conserva como objeto compuesto para no romper los archivos
 * que ya lo importan. El código nuevo puede usar `MARCA` y `EVENTO` directo,
 * que dicen mucho mejor qué es cada cosa. */
export const CANDYLAND = {
  ...MARCA,
  ...EVENTO,
  // `MARCA.nombre` es "Mansion Playroom" y `EVENTO.nombre` es el del evento;
  // en el objeto compuesto gana el del evento porque es lo que esperaban
  // todos los usos que ya existían.
  nombre: EVENTO.nombre,

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
      a: EVENTO.dressCode,
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
    // Estas preguntas se agregaron pensando en SEO: el acordeón del home y el
    // schema FAQPage de Google salen AMBOS de este arreglo, así que cada
    // pregunta nueva suma contenido indexable sin tocar ningún componente.
    // Todas se responden con datos que ya existen en este mismo archivo.
    {
      q: '¿Puedo ir sin pareja?',
      a: 'Sí. Hay accesos individuales tanto para ellas como para ellos. El acceso Soltero es exclusivo para miembros validados de la comunidad; si no tienes código, tu opción es el acceso Dúo con una acompañante. Escríbenos por WhatsApp si quieres validarte.',
    },
    {
      q: '¿Qué incluye cada acceso?',
      a: 'Todos los accesos dan entrada a todas las zonas del recinto: las dos pistas, el Playground XXL, la Kink Room, la barra y la zona de fumadores. La diferencia entre ellos es a cuántas personas cubre cada uno y su valor.',
    },
    {
      q: '¿Qué pasa si llego tarde?',
      a: 'Puedes entrar en cualquier momento mientras el evento esté abierto. Las puertas abren a las 21:00 y la fiesta va hasta las 04:30, con after hasta el amanecer. Eso sí, si compraste estacionamiento conviene llegar temprano.',
    },
    {
      q: '¿Hay dónde dejar mis cosas?',
      a: 'Sí, hay guardarropía en el recinto. Te recomendamos usarla apenas llegues en vez de andar cargando bolsos toda la noche.',
    },
    {
      q: '¿Hay barra? ¿Se paga aparte?',
      a: 'Hay barra completa dentro del recinto y se paga aparte de la entrada. Considera llevar un medio de pago aunque hayas comprado todo por la web.',
    },
    {
      q: '¿Qué son el Playground XXL y la Kink Room?',
      a: 'Son zonas del recinto separadas de las pistas de baile, con una propuesta más íntima. Entrar a ellas es siempre una decisión tuya: puedes pasar toda la noche solo en las pistas y en la barra, y mucha gente lo hace, sobre todo la primera vez.',
    },
    {
      q: '¿Se puede comprar la entrada en la puerta?',
      a: 'Te recomendamos comprar con anticipación por la web: los cupos son limitados y los eventos suelen agotarse antes de la fecha. Además, la dirección exacta del recinto llega junto con tu entrada por correo.',
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

/** Link de WhatsApp con mensaje para validar el acceso Soltero. */
export function whatsappSolteroLink(): string {
  return whatsappComunidadLink('Soltero');
}

/** Link de WhatsApp genérico para conseguir el código de comunidad (Soltero, Dúo Dos Hombres, etc). */
export function whatsappComunidadLink(contexto: string): string {
  const num = CANDYLAND.whatsappSoltero.replace(/[^0-9]/g, '');
  const msg = encodeURIComponent(`Hola! Quiero validarme como miembro de la comunidad para comprar el acceso ${contexto} de ${EVENTO.nombre} 🍭`);
  return `https://wa.me/${num}?text=${msg}`;
}
