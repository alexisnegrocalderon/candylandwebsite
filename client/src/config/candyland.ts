/**
 * Configuración del sitio. Todo el contenido de la landing sale de acá.
 *
 * ⚠️ IMPORTANTE — la marca es MANSION PLAYROOM, no el nombre del evento.
 * "Candyland" es el nombre de UNA fiesta; después vendrá otra. Por eso este
 * archivo separa dos cosas:
 *
 *   • `MARCA`  → lo permanente (recinto, valores, edad mínima, redes, FAQ).
 *   • `EVENTO` → lo que cambia con cada fiesta (nombre, fecha, dress code,
 *                accesos, precios, Misión 300, pistas).
 *
 * 👉 Para montar el próximo evento se edita `EVENTO` (y `accesos`, `mision`,
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
    // Precio Founders (Tanda 1) del 2º Aniversario: 60% del precio general
    // ($50.000), que se carga en el admin como `originalPrice` del ticket
    // type para que el sitio lo muestre tachado (ver TandaUrgencyCard en
    // Home.tsx) -- acá solo va el precio Founders, que es el que se cobra
    // mientras dure esta tanda.
    precio: 30000,
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
    // Founders: 60% de $20.000.
    precio: 12000,
    personas: 1,
    descripcion: 'Acceso individual para ella.',
    beneficios: ['1 acceso', 'Todas las zonas'],
    estado: 'available',
    exclusivoComunidad: false,
  },
  {
    id: 'duo_mujeres',
    nombre: 'Dúo Mujeres',
    // Founders: 60% de $25.000. Ya NO es "el mismo valor que Soltera" (antes
    // ambos eran $20.000 parejos) -- con el pricing del aniversario quedan en
    // valores distintos, así que se corrigió la descripción y el beneficio
    // de abajo para no publicar un dato falso.
    precio: 15000,
    personas: 2,
    descripcion: 'Acceso 2x1 para 2 mujeres a un valor conveniente.',
    beneficios: ['2 accesos', 'Valor conveniente para dos', 'Todas las zonas'],
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
    // Founders: 60% de $35.000.
    precio: 21000,
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
    // Founders: 60% de $60.000.
    precio: 36000,
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
    // Founders: 60% de $70.000.
    precio: 42000,
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
  // Cumpleañeros: fuera del sitio por ahora (decisión del dueño en el
  // lanzamiento del 2º aniversario). No tiene precio Founders definido
  // todavía y el viejo ($8.000) no corresponde a esta campaña -- dejarlo
  // acá además hundía el "precio desde" del JSON-LD (PRECIO_MINIMO_ACCESO
  // en Home.tsx) a $8.000, que no es un precio real de venta. Se vuelve a
  // habilitar apenas se defina su valor.
  // {
  //   id: 'cumpleaneros',
  //   nombre: 'Cumpleañeros',
  //   ...
  // },
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
 * `mision`, `pistas` y `lineup` más abajo). Los textos del sitio que
 * nombran el evento leen `EVENTO.nombre`, así que se actualizan solos.
 * ═══════════════════════════════════════════════════════════════ */
export const EVENTO = {
  // Debe coincidir con el slug real del evento en la base de datos (lo que
  // el admin le puso al crearlo en /admin) — si no coincide, todos los CTA
  // del sitio apuntan a un evento que no existe y el checkout cae en modo
  // demo silenciosamente, fallando recién al intentar pagar.
  slug: '2do-aniversario-playroom',
  // Nombre corto que se usa en el título grande del Hero. La marca completa
  // ("Mansion Playroom") vive en MARCA.nombre y se usa en el logo del Hero y
  // en el splash del Intro -- el título grande no la repite. Sin temática
  // Halloween acá a propósito (decisión del dueño): el foco es el
  // aniversario, no Halloween -- el disfraz obligatorio va solo en el dress
  // code, como dato práctico, no como estética del sitio.
  nombre: 'ANIVERSARIO',
  tagline: 'Dos años de la fiesta liberal más grande de la V Región',
  heroTitulo: 'Dos años de mansión. Una noche para celebrarlo -- con disfraz obligatorio.',

  // Fecha confirmada: viernes 30 de octubre de 2026. La hora de puertas
  // todavía no está definida -- `eventDate` usa 21:00 (mismo horario que
  // Candyland) solo como marcador interno para que el countdown y el
  // JSON-LD tengan una fecha-hora válida, pero esa hora NO se muestra en
  // ningún lado: `horarioTexto` dice "Hora por confirmar" a propósito.
  // ⚠️ Reemplazar `eventDate` por la hora real apenas esté definida.
  fechaConfirmada: true,
  eventDate: new Date('2026-10-30T21:00:00-03:00'),
  fechaTexto: 'Viernes 30 de octubre',
  horarioTexto: 'Hora por confirmar',
  afterTexto: 'After hasta el amanecer',
  // Disfraz obligatorio como dato práctico del dress code, sin tematizar el
  // resto del sitio en Halloween (decisión del dueño: eso queda para la
  // landing especial de la campaña, no para el home).
  dressCode: 'Disfraz obligatorio: es nuestro 2º aniversario y lo celebramos en grande. Además de tu disfraz, que te haga sentir irresistible -- nada de tenida deportiva.',
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

  // ── Misión 300 ─────────────────────────────────────────────
  mision: {
    meta: 300,
    // Personas que ya estaban confirmadas ANTES de esta web: vendidas por la
    // ticketera anterior (no existen como orden en esta base de datos) más
    // amigos/invitados que el dueño cuenta a mano y tampoco quedan
    // registrados como compra. Se suma siempre por encima del conteo real
    // de la DB, así el contador no "retrocede" al migrar y sigue creciendo
    // normal con cada venta nueva.
    //
    // Ajustado el 2026-08-02 (pedido explícito del dueño): con las ventas
    // web reales confirmadas ese día (39 personas, ya con la migración de
    // schema aplicada y la consulta real funcionando), el total debía
    // marcar 102 personas.
    //
    // Reajustado el 2026-08-03: se corrigió un bug donde el conteo real de
    // la DB incluía abonos de Misión 300 sin resolver (ver PR #54) -- con
    // el bug arreglado, el conteo real de la DB (vendidasDb) bajó a 7
    // (verificado en vivo contra producción: 51 personas en accesos vendidos
    // en bruto, menos 44 personas de abonos todavía sin resolver). El dueño
    // pidió sumar un grupo de antes de este sistema (ticketera anterior /
    // contadas a mano, que todavía no había agregado) para que el total
    // público quede en 112 -- baseline = 112 - 7 = 105.
    //
    // ⚠️ Ojo con este cálculo la próxima vez: el número que reporta el dueño
    // mirando la Home es el TOTAL YA MOSTRADO (baseline + vendidasDb), no
    // vendidasDb sola -- un primer intento restó mal (112 - 70, tratando el
    // 70 reportado como si fuera solo la parte de la DB) y dejó el total en
    // 49 en vez de 112. Para recalibrar: pedir/confirmar el valor real de
    // vendidasDb (o consultar `/api/trpc/events.getTicketTypes` +
    // `/api/trpc/mission300.pendingPersonas` en vivo) y restar ESO al total
    // deseado, no el número que aparece en pantalla.
    baseline: 105,
    // Fallback manual para cuando la consulta a la base de datos falla
    // (ej. una migración de schema pendiente de aplicar en producción).
    // Con DB funcionando, se usa baseline + la suma real de PERSONAS
    // vendidas (dúo=2, trío=3, etc.) -- mantenido igual al total de arriba
    // para que una falla temporal no muestre un número viejo o al azar.
    confirmadosFallback: 112,
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
      a: 'Puertas por confirmar -- te avisamos apenas esté el horario definitivo. El after sigue hasta el amanecer.',
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
      a: 'Puedes entrar en cualquier momento mientras el evento esté abierto. El horario de puertas todavía está por confirmarse, y el after sigue hasta el amanecer. Eso sí, si compraste estacionamiento conviene llegar temprano.',
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
