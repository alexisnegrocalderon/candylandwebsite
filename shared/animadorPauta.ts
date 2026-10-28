/* La pauta del animador (cargo «Animador / MC» en el Staff): las dinámicas cortas de la noche, el guion por bloques,
 * las señales con el creador de contenido (micrófonos y gimbal DJI) y el paso 0 de consentimiento a cámara.
 * Es contenido fijo y puro: lo sirve `member.animadorPauta` solo a quien tiene el cargo.
 *
 * Límites que valen para todo lo de aquí: mayores de 18, siempre vestidos, sin desnudez ni actos sexuales; todo es
 * opt-in y un «paso» se respeta al instante; ningún reto obliga a beber; solo se graba a quien dijo la frase. */

export const CATEGORIAS = ['rompehielos', 'retos', 'penitencias', 'beso_de_3', 'concursos', 'parejas'] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const CATEGORIA_LABEL: Record<Categoria, string> = {
  rompehielos: 'Rompehielos',
  retos: 'Retos',
  penitencias: 'Penitencias',
  beso_de_3: 'Besos de 3',
  concursos: 'Concursos',
  parejas: 'Parejas',
};

export const INTENSIDADES = ['coqueto', 'picante', 'atrevido'] as const;
export type Intensidad = (typeof INTENSIDADES)[number];

export const INTENSIDAD_LABEL: Record<Intensidad, string> = {
  coqueto: 'Coqueto',
  picante: 'Picante',
  atrevido: 'Atrevido · solo con opt-in',
};

export interface CamaraDinamica {
  /** Dónde se para el creador con el gimbal. */
  posicion: string;
  /** Qué plano abre y cuál sigue. */
  plano: string;
  /** A quién se le acerca el micrófono DJI y cuándo. */
  microfono: string;
  /** La toma de reacción que no se puede olvidar. */
  reaccion: string;
}

export interface Dinamica {
  id: string;
  titulo: string;
  categoria: Categoria;
  intensidad: Intensidad;
  duracionSeg: number;
  jugadores: string;
  props: string[];
  /** Lo que dice el animador para invitar y arrancar. */
  decirlo: string;
  reglas: string[];
  /** La versión suave si alguien duda o dice que no. */
  salidaSuave: string;
  camara: CamaraDinamica;
  /** Título sugerido para el reel. */
  gancho: string;
  /** La frase con que el animador cierra el clip. */
  cierre: string;
  /** Las dinámicas atrevidas solo se ofrecen si todas las personas involucradas lo piden y lo aceptan. */
  optIn: boolean;
}

export const CONSENTIMIENTO = {
  frase: 'Soy [apodo], tengo +18, juego porque quiero y acepto aparecer en los reels de Candyland.',
  pasos: [
    'Pregunta primero si quiere jugar. Si dice que no o duda, ofrece mirar o la salida suave: sin insistir.',
    'Pídele que diga la frase mirando a cámara, con el micrófono DJI cerca. Cada persona de la dinámica la dice, una por una.',
    'Sin la frase no se graba a esa persona: el creador encuadra otro lado o espera.',
    'Si se arrepiente en cualquier momento, se corta, y ese clip no se publica.',
  ],
  limites: [
    'Solo +18, siempre vestidos. Nada de desnudez ni de actos sexuales.',
    'No es no. Un «paso» o un gesto de duda corta la dinámica con naturalidad.',
    'Ningún reto obliga a beber.',
    'Las dinámicas «Atrevido» solo si todas las personas lo piden y lo aceptan.',
  ],
} as const;

export const DINAMICAS: Dinamica[] = [
  // ── Rompehielos ────────────────────────────────────────────────────────────
  {
    id: 'mirada-de-5',
    titulo: 'La mirada de 5',
    categoria: 'rompehielos',
    intensidad: 'coqueto',
    duracionSeg: 30,
    jugadores: '2 personas (se acaban de conocer o no se conocen)',
    props: [],
    decirlo: 'Ustedes dos: cinco segundos mirándose a los ojos, sin reírse y sin hablar. Quien se ría primero me debe un piropo para el otro.',
    reglas: ['Sin tocarse', 'Cuenta en voz alta hasta 5', 'Termina con un piropo sincero'],
    salidaSuave: 'Miradas de 3 segundos, o miran a la cámara en vez de mirarse entre ellos.',
    camara: {
      posicion: 'De frente, a un metro y medio, a la altura de los ojos.',
      plano: 'Plano cerrado a los dos, luego abre a medio plano cuando se ríen.',
      microfono: 'Micrófono al piropo del final.',
      reaccion: 'La risa nerviosa y la sonrisa de después.',
    },
    gancho: 'No aguantó ni 3 segundos 👀',
    cierre: 'Cinco segundos y ya hay química. Siguiente.',
    optIn: false,
  },
  {
    id: 'ruleta-de-piropos',
    titulo: 'Ruleta de piropos',
    categoria: 'rompehielos',
    intensidad: 'coqueto',
    duracionSeg: 45,
    jugadores: '1 persona elige y 1 recibe',
    props: ['Cartas de piropos'],
    decirlo: 'Saca una carta y léesela a quien tú quieras de este grupo, mirándole a la cara. El piropo va tal cual, con tu mejor voz.',
    reglas: ['Se lee con actitud, no con burla', 'Quien lo recibe puede devolver otro'],
    salidaSuave: 'Se lo dice a la cámara o a todo el grupo.',
    camara: {
      posicion: 'Al costado de quien lee, con la otra persona al fondo.',
      plano: 'Medio plano de quien lee, y rápido giro a la cara de quien recibe.',
      microfono: 'A quien lee; luego a quien responde.',
      reaccion: 'La cara de quien recibe el piropo.',
    },
    gancho: 'Piropos con carta: ¿cuál te funcionó? 💌',
    cierre: 'Esa carta fue directo al corazón.',
    optIn: false,
  },
  {
    id: 'dos-verdades-un-secreto',
    titulo: 'Dos verdades y un coqueteo',
    categoria: 'rompehielos',
    intensidad: 'coqueto',
    duracionSeg: 60,
    jugadores: '2 a 4 personas',
    props: [],
    decirlo: 'Cada uno dice dos verdades sobre sí mismo y un coqueteo inventado. El resto adivina cuál es el coqueteo falso.',
    reglas: ['Nada de datos personales sensibles', 'Gana quien engaña a más gente'],
    salidaSuave: 'Cambia «coqueteo» por «dato random de la noche».',
    camara: {
      posicion: 'En arco frente al grupo.',
      plano: 'Plano grupal y primeros planos de quien habla.',
      microfono: 'Al que habla; pasa al siguiente con un gesto.',
      reaccion: 'Las caras de quienes adivinan.',
    },
    gancho: 'Adivina cuál es mentira 😏',
    cierre: 'Mentiroso o encantador: tú decides.',
    optIn: false,
  },
  {
    id: 'brindis-a-ciegas',
    titulo: 'Brindis sin vaso',
    categoria: 'rompehielos',
    intensidad: 'coqueto',
    duracionSeg: 30,
    jugadores: 'Grupo de 3 a 6',
    props: [],
    decirlo: 'Un brindis con el vaso en la mano o sin él: cada uno brinda por algo que le gustaría que pasara esta noche. Con onda, sin pasarse.',
    reglas: ['Brindar es opcional y nadie está obligado a beber', 'Todo en positivo'],
    salidaSuave: 'Brindan con agua o con las manos.',
    camara: {
      posicion: 'Frente al grupo, un poco desde abajo.',
      plano: 'Plano general que se cierra al choque de vasos.',
      microfono: 'Al primero que brinda y luego al grupo.',
      reaccion: 'El choque de vasos y las risas.',
    },
    gancho: 'Brindo por esta noche 🥂',
    cierre: 'Que se cumpla todo lo que brindaron.',
    optIn: false,
  },
  {
    id: 'adivina-quien-es',
    titulo: 'Adivina quién es',
    categoria: 'rompehielos',
    intensidad: 'coqueto',
    duracionSeg: 60,
    jugadores: '1 con los ojos vendados + 3 voluntarios',
    props: ['Antifaz o venda'],
    decirlo: 'Con la venda puesta, adivina quién es quién por su voz. Cada voluntario te dice una frase coqueta distinta.',
    reglas: ['Solo por la voz, sin tocarse', 'Tres intentos'],
    salidaSuave: 'Sin venda: adivina de espaldas.',
    camara: {
      posicion: 'De lado, con los cuatro en cuadro.',
      plano: 'Plano medio y close-up a la venda y a los voluntarios.',
      microfono: 'A cada voluntario cuando habla.',
      reaccion: 'La cara al acertar o al fallar.',
    },
    gancho: '¿Puedes reconocer a alguien solo por la voz? 🎙️',
    cierre: 'Esa voz no se olvida.',
    optIn: false,
  },
  {
    id: 'cartel-de-primera-impresion',
    titulo: 'Primera impresión',
    categoria: 'rompehielos',
    intensidad: 'coqueto',
    duracionSeg: 45,
    jugadores: '2 personas',
    props: [],
    decirlo: 'Díganse en una palabra qué fue lo primero que pensaron del otro al verse. Solo cosas lindas o divertidas.',
    reglas: ['Una palabra, positiva', 'Se pueden devolver otra'],
    salidaSuave: 'Lo dicen sobre su mejor amigo/a en vez de hacia el otro.',
    camara: {
      posicion: 'Enfrentados, el creador de perfil.',
      plano: 'Dos primeros planos que alternan.',
      microfono: 'Al que responde en cada turno.',
      reaccion: 'La sonrisa al escuchar la palabra.',
    },
    gancho: 'Lo primero que pensé de ti fue… 😳',
    cierre: 'Primera impresión: aprobada.',
    optIn: false,
  },

  // ── Retos ──────────────────────────────────────────────────────────────────
  {
    id: 'baile-pegado-10',
    titulo: 'Baile pegado, 10 segundos',
    categoria: 'retos',
    intensidad: 'picante',
    duracionSeg: 30,
    jugadores: '2 personas que quieran bailar',
    props: ['Música'],
    decirlo: 'Diez segundos bailando bien cerquita, a lo que dé el cuerpo. Cuando yo diga tiempo, se sueltan y aplauden al otro.',
    reglas: ['Manos en la espalda o los hombros', 'Se corta si alguien se aleja', 'Diez segundos, ni uno más'],
    salidaSuave: 'Bailan a un paso de distancia, mirándose.',
    camara: {
      posicion: 'Moviéndose en semicírculo con el gimbal a la cintura.',
      plano: 'Plano medio en movimiento, termina en plano cerrado de las caras.',
      microfono: 'Al animador y a ambos en el aplauso final.',
      reaccion: 'La sonrisa cuando se sueltan.',
    },
    gancho: 'Diez segundos que parecieron una canción entera 🔥',
    cierre: 'Y eso fue solo el calentamiento.',
    optIn: false,
  },
  {
    id: 'reto-del-cuello',
    titulo: 'Un susurro al oído',
    categoria: 'retos',
    intensidad: 'picante',
    duracionSeg: 30,
    jugadores: '2 personas',
    props: [],
    decirlo: 'Acércate y dile algo al oído que lo deje pensando. Ella o él decide si lo cuenta o se lo guarda.',
    reglas: ['Susurro apropiado: nada ofensivo', 'Quien escucha decide si lo cuenta'],
    salidaSuave: 'El susurro es un cumplido o un secreto de la noche.',
    camara: {
      posicion: 'De lado, un poco detrás de quien susurra.',
      plano: 'Plano cerrado a la cara de quien escucha.',
      microfono: 'Al que escucha, cuando decide contarlo.',
      reaccion: 'Su cara en el instante del susurro.',
    },
    gancho: 'Lo que le susurró lo cambió todo 🤫',
    cierre: 'Hay secretos que se quedan en la pista.',
    optIn: false,
  },
  {
    id: 'reto-de-la-silla',
    titulo: 'La silla caliente',
    categoria: 'retos',
    intensidad: 'coqueto',
    duracionSeg: 90,
    jugadores: '1 en la silla + grupo',
    props: ['Una silla'],
    decirlo: 'Silla caliente: quien se sienta responde tres preguntas del público, pero sin repetir nada. Si se pasa, cambia el turno.',
    reglas: ['Preguntas coquetas, nada invasivo', 'El de la silla puede pasar una', 'Tres preguntas máximo'],
    salidaSuave: 'Preguntas solo sobre gustos, música o viajes.',
    camara: {
      posicion: 'Frente a la silla, con el público de fondo.',
      plano: 'Close-up a la silla y paneos al público que pregunta.',
      microfono: 'Al que responde; el animador repite la pregunta.',
      reaccion: 'La cara al escuchar una pregunta picante.',
    },
    gancho: 'La silla caliente no perdona 🪑🔥',
    cierre: 'Te salvaste de esta. ¿Quién sigue?',
    optIn: false,
  },
  {
    id: 'reto-espalda-con-espalda',
    titulo: 'Espalda con espalda',
    categoria: 'retos',
    intensidad: 'coqueto',
    duracionSeg: 60,
    jugadores: '2 personas',
    props: [],
    decirlo: 'Espalda con espalda: yo hago una pregunta tipo «¿quién es más…?» y a la cuenta de tres se giran señalando a quien creen que corresponde.',
    reglas: ['Preguntas divertidas, nada hiriente', 'Hasta 4 preguntas'],
    salidaSuave: 'Se miran de frente y responden con el dedo hacia arriba o abajo.',
    camara: {
      posicion: 'Detrás de la dupla, luego al frente.',
      plano: 'Plano medio y vuelta al giro.',
      microfono: 'Al animador y a ambos en cada reacción.',
      reaccion: 'El giro y quién señala a quién.',
    },
    gancho: '¿Quién es más celoso? 👀',
    cierre: 'La respuesta dejó dudas.',
    optIn: false,
  },
  {
    id: 'pasa-el-hielo',
    titulo: 'Pasa el hielo',
    categoria: 'retos',
    intensidad: 'picante',
    duracionSeg: 60,
    jugadores: 'Grupo de 4 a 8 en fila',
    props: ['Cubos de hielo pequeños', 'Servilletas'],
    decirlo: 'Pasen el cubo de mano en mano o de la mano al cuello, sin que se caiga. Quien lo deja caer paga una prenda suave.',
    reglas: ['Sin zonas íntimas: solo manos, brazos y cuello', 'Quien no quiere, se salta'],
    salidaSuave: 'Pasan el hielo con una cuchara.',
    camara: {
      posicion: 'Al costado de la fila.',
      plano: 'Plano medio lateral que sigue el hielo.',
      microfono: 'Al animador y a quien deja caer el hielo.',
      reaccion: 'El susto cuando el hielo toca la piel.',
    },
    gancho: 'El hielo se derritió… y no solo el hielo 🧊',
    cierre: 'Esto se puso frío y caliente a la vez.',
    optIn: false,
  },

  // ── Penitencias ────────────────────────────────────────────────────────────
  {
    id: 'verdad-o-penitencia',
    titulo: 'Verdad o penitencia',
    categoria: 'penitencias',
    intensidad: 'picante',
    duracionSeg: 90,
    jugadores: '2 a 6 personas',
    props: ['Cartas de verdad y de penitencia'],
    decirlo: 'Eligen verdad o penitencia. Sacan una carta y la cumplen. Si no se atreven, tienen una salida suave en el reverso.',
    reglas: ['Cada carta tiene su salida suave', 'Nada que humille', 'Máximo tres turnos por persona'],
    salidaSuave: 'Cambian por una carta de verdad suave.',
    camara: {
      posicion: 'Frente a la persona que saca la carta.',
      plano: 'Plano medio y close-up a la carta al leer.',
      microfono: 'A quien lee y a quien cumple.',
      reaccion: 'La reacción al leer la penitencia.',
    },
    gancho: 'Verdad o penitencia: ella eligió mal 😅',
    cierre: 'Penitencia cumplida, siguiente.',
    optIn: false,
  },
  {
    id: 'penitencia-del-piropo',
    titulo: 'Penitencia: el piropo más cursi',
    categoria: 'penitencias',
    intensidad: 'coqueto',
    duracionSeg: 30,
    jugadores: '1 persona',
    props: [],
    decirlo: 'Tu penitencia: el piropo más cursi que se te ocurra, a quien tú elijas del público, con una rodilla en el suelo.',
    reglas: ['Piropo respetuoso', 'La otra persona puede aceptarlo o devolver otro'],
    salidaSuave: 'Lo dice a la cámara.',
    camara: {
      posicion: 'Frente y abajo, para el gesto de rodilla.',
      plano: 'Plano americano y close-up a la reacción.',
      microfono: 'A quien dice el piropo.',
      reaccion: 'La risa de quien lo recibe.',
    },
    gancho: 'Su piropo fue tan cursi que funcionó 💘',
    cierre: 'Cursi, pero efectivo.',
    optIn: false,
  },
  {
    id: 'penitencia-del-baile',
    titulo: 'Penitencia: baila como nadie mira',
    categoria: 'penitencias',
    intensidad: 'coqueto',
    duracionSeg: 30,
    jugadores: '1 persona',
    props: ['Música'],
    decirlo: 'Tu penitencia: 15 segundos de baile con el estilo que yo te diga. Hoy toca: «sensual de telenovela».',
    reglas: ['Estilo lo define el animador', 'Quince segundos'],
    salidaSuave: 'Bailan un solo paso y lo repiten.',
    camara: {
      posicion: 'De frente, con el gimbal en movimiento.',
      plano: 'Plano americano y contrapicado.',
      microfono: 'Al animador al dar el estilo.',
      reaccion: 'El público aplaudiendo.',
    },
    gancho: 'Bailó sensual de telenovela y la rompió 💃',
    cierre: 'Merece un Emmy.',
    optIn: false,
  },
  {
    id: 'penitencia-del-mensaje',
    titulo: 'Penitencia: mensaje a tu crush',
    categoria: 'penitencias',
    intensidad: 'picante',
    duracionSeg: 45,
    jugadores: '1 persona',
    props: ['Celular de la persona'],
    decirlo: 'Tu penitencia: escribe un mensaje coqueto a alguien de tus contactos. Tú lo escribes, tú lo envías, y yo no lo veo si no quieres.',
    reglas: ['Solo si ella o él quiere', 'No se muestra la conversación', 'Nada de ex ni de personas en pareja ajena'],
    salidaSuave: 'Se lo manda a un amigo con un cumplido.',
    camara: {
      posicion: 'Sobre el hombro, sin mostrar la pantalla.',
      plano: 'Close-up a la cara mientras escribe.',
      microfono: 'Al animador y a quien escribe.',
      reaccion: 'Su cara al enviar el mensaje.',
    },
    gancho: 'Le mandó un mensaje en pleno reel 😳',
    cierre: 'Mensaje enviado. Ahora a esperar.',
    optIn: false,
  },
  {
    id: 'penitencia-del-grito',
    titulo: 'Penitencia: grítale al DJ',
    categoria: 'penitencias',
    intensidad: 'coqueto',
    duracionSeg: 20,
    jugadores: '1 persona',
    props: [],
    decirlo: 'Tu penitencia: grítale al DJ tu canción favorita para perrear, con todas las ganas.',
    reglas: ['Es para reír, no humilla'],
    salidaSuave: 'Lo susurra al animador, que lo grita.',
    camara: {
      posicion: 'Detrás de la persona, con el DJ de fondo.',
      plano: 'Plano americano y giro al DJ.',
      microfono: 'A quien grita.',
      reaccion: 'La cara del DJ.',
    },
    gancho: 'Le pidió la canción más prohibida al DJ 🎶',
    cierre: 'Sonó. Y ahora se baila.',
    optIn: false,
  },
  {
    id: 'penitencia-marca-en-la-mano',
    titulo: 'Penitencia: marca en la mano',
    categoria: 'penitencias',
    intensidad: 'picante',
    duracionSeg: 30,
    jugadores: '2 personas',
    props: ['Labial lavable'],
    decirlo: 'Penitencia: dejan un beso de labial en la mano del otro. Solo en la mano, con permiso, y el que pone el beso lo firma.',
    reglas: ['Siempre con permiso', 'Solo mano', 'Labial lavable'],
    salidaSuave: 'Dibujan un corazón en la mano en vez de besar.',
    camara: {
      posicion: 'Lateral, mostrando la mano y las caras.',
      plano: 'Close-up a la mano y luego a las sonrisas.',
      microfono: 'Al que firma.',
      reaccion: 'La mirada tras la marca.',
    },
    gancho: 'La marca de labial más famosa de la fiesta 💋',
    cierre: 'Firmado y sellado.',
    optIn: false,
  },

  // ── Besos de 3 ─────────────────────────────────────────────────────────────
  {
    id: 'beso-de-3-mejilla',
    titulo: 'Beso de 3 · versión mejilla',
    categoria: 'beso_de_3',
    intensidad: 'coqueto',
    duracionSeg: 30,
    jugadores: '3 personas que quieran',
    props: [],
    decirlo: 'Tres personas, una ronda: cada uno le da un beso en la mejilla a la persona de su derecha, y el último cierra el círculo. Rápido y con cariño.',
    reglas: ['Solo mejilla', 'Con permiso de cada uno', 'Pueden decir «paso» cuando quieran'],
    salidaSuave: 'Abrazo grupal de tres.',
    camara: {
      posicion: 'En el centro del círculo, lo más abajo posible.',
      plano: 'Plano circular que gira en 360 grados.',
      microfono: 'Al animador y a los tres en la ronda final.',
      reaccion: 'Las risas al cerrar el círculo.',
    },
    gancho: 'Beso de 3: ¿qué tanto te atreves? 😘',
    cierre: 'Tres besitos y todos felices.',
    optIn: false,
  },
  {
    id: 'beso-de-3-mano',
    titulo: 'Beso de 3 · mano y mirada',
    categoria: 'beso_de_3',
    intensidad: 'coqueto',
    duracionSeg: 30,
    jugadores: '3 personas',
    props: [],
    decirlo: 'Beso en la mano de la persona de al lado, mirándola a los ojos, estilo caballero y dama. Tres vueltas, cada una con un piropo.',
    reglas: ['Beso en el dorso de la mano', 'Con piropo', 'Con permiso'],
    salidaSuave: 'Chocan las manos y se dicen el piropo.',
    camara: {
      posicion: 'De frente a cada uno, en plano cerrado a las manos.',
      plano: 'Close-up a manos y caras en secuencia.',
      microfono: 'A quien dice el piropo.',
      reaccion: 'La sonrisa de quien recibe.',
    },
    gancho: 'Caballeros y damas, pero con picardía 🎩',
    cierre: 'Qué elegancia, qué mirada.',
    optIn: false,
  },
  {
    id: 'beso-de-3-pico',
    titulo: 'Beso de 3 · de pico',
    categoria: 'beso_de_3',
    intensidad: 'picante',
    duracionSeg: 30,
    jugadores: '3 personas que lo pidan',
    props: [],
    decirlo: 'Solo para quienes ya dijeron que sí: tres besos cortos de pico, uno entre cada par, con permiso de ambos antes de cada beso.',
    reglas: ['Cada par confirma antes de su beso', 'Un «paso» corta todo', 'Besos cortos, nada más'],
    salidaSuave: 'Cambian a beso en la mejilla o abrazo.',
    camara: {
      posicion: 'En el centro del círculo, sin acercarse demasiado.',
      plano: 'Plano medio del círculo y close-up a las sonrisas.',
      microfono: 'Al animador y a los tres para el sí previo.',
      reaccion: 'Las risas posteriores.',
    },
    gancho: 'Besos de 3, versión pico 💋',
    cierre: 'Eso fue rápido… y atrevido.',
    optIn: true,
  },
  {
    id: 'beso-de-3-ruleta',
    titulo: 'Ruleta de besos de 3',
    categoria: 'beso_de_3',
    intensidad: 'coqueto',
    duracionSeg: 60,
    jugadores: '3 a 6 personas',
    props: ['Botella o ruleta de la app'],
    decirlo: 'Giramos la ruleta: señala a dos personas y a ellas les toca un beso de mejilla, uno cada una; quien está en el medio hace de juez.',
    reglas: ['Siempre con permiso', 'Quien no quiere, pasa su turno'],
    salidaSuave: 'La ruleta decide quién baila una canción juntos.',
    camara: {
      posicion: 'Sobre la ruleta, mirando hacia el grupo.',
      plano: 'Overhead y rápido al grupo.',
      microfono: 'Al animador cuando la ruleta para.',
      reaccion: 'La reacción cuando la ruleta señala.',
    },
    gancho: 'La ruleta decide con quién te toca 😈',
    cierre: 'Ruleta cumplida, nadie sufrió.',
    optIn: false,
  },
  {
    id: 'beso-de-3-sin-manos',
    titulo: 'Beso de 3 sin manos',
    categoria: 'beso_de_3',
    intensidad: 'picante',
    duracionSeg: 45,
    jugadores: '3 personas',
    props: ['Gomitas o caramelo atado a un hilo'],
    decirlo: 'Reto del caramelo: pasan una gomita de boca a boca sin usar las manos, cada uno en su turno. Quien la deja caer da una vuelta de piropos.',
    reglas: ['Solo con quienes aceptan', 'Nada de lengua, solo pasar el dulce', 'Pueden decir «paso»'],
    salidaSuave: 'Pasan la gomita con una cucharita.',
    camara: {
      posicion: 'De lado, a la altura de las caras.',
      plano: 'Close-up a la boca y luego a las caras.',
      microfono: 'Al animador y a quien deja caer.',
      reaccion: 'La risa si cae la gomita.',
    },
    gancho: 'El reto de la gomita que nadie logra ✨',
    cierre: 'Dulce reto, dulce noche.',
    optIn: true,
  },

  // ── Concursos ──────────────────────────────────────────────────────────────
  {
    id: 'concurso-mejor-baile',
    titulo: 'Concurso: el mejor perreo',
    categoria: 'concursos',
    intensidad: 'picante',
    duracionSeg: 120,
    jugadores: '3 a 6 participantes',
    props: ['Música', 'Aplausómetro'],
    decirlo: 'Treinta segundos cada uno en el centro: el público decide con aplausos quién se lleva el premio. Sin tocarse, con puro ritmo.',
    reglas: ['Baile individual', 'Vestidos', 'El público vota por aplausos'],
    salidaSuave: 'Hacen un solo paso o una pose.',
    camara: {
      posicion: 'En el centro de la pista, girando.',
      plano: 'Plano americano de cada concursante y paneo al público.',
      microfono: 'Al animador y al ganador.',
      reaccion: 'El público aplaudiendo.',
    },
    gancho: 'Concurso de perreo: el ganador se llevó un premio 🏆',
    cierre: 'Y el ganador de la noche es…',
    optIn: false,
  },
  {
    id: 'concurso-mejor-pose',
    titulo: 'Concurso: la mejor pose',
    categoria: 'concursos',
    intensidad: 'coqueto',
    duracionSeg: 90,
    jugadores: '3 a 6 participantes',
    props: [],
    decirlo: 'Pose de portada de revista, cinco segundos cada uno. El público vota con aplausos y yo cuento.',
    reglas: ['Cinco segundos por pose', 'Voto por aplausos'],
    salidaSuave: 'Pose en grupo.',
    camara: {
      posicion: 'Frente a los concursantes, a un metro.',
      plano: 'Plano medio por concursante.',
      microfono: 'Al animador y al público.',
      reaccion: 'Las reacciones del público.',
    },
    gancho: 'Portada de revista versión fiesta 📸',
    cierre: 'Esa portada sí que vende.',
    optIn: false,
  },
  {
    id: 'concurso-el-mas-lindo-piropo',
    titulo: 'Concurso: el mejor piropo',
    categoria: 'concursos',
    intensidad: 'coqueto',
    duracionSeg: 90,
    jugadores: '3 a 5 participantes',
    props: [],
    decirlo: 'Cada uno tiene diez segundos para decirle el mejor piropo a la persona que elija del público. Ella o él decide quién gana.',
    reglas: ['Piropos respetuosos', 'Sin repetir'],
    salidaSuave: 'Le dicen el piropo a la cámara.',
    camara: {
      posicion: 'Al lado de quien recibe.',
      plano: 'Plano medio de cada concursante y reacción de quien recibe.',
      microfono: 'A cada concursante.',
      reaccion: 'La cara de quien decide.',
    },
    gancho: '¿Cuál piropo te hubiera conquistado? 🌹',
    cierre: 'Ganó el más sincero.',
    optIn: false,
  },
  {
    id: 'concurso-parejas-sincronizadas',
    titulo: 'Concurso: parejas sincronizadas',
    categoria: 'concursos',
    intensidad: 'coqueto',
    duracionSeg: 120,
    jugadores: '3 parejas',
    props: ['Música'],
    decirlo: 'Una canción, un movimiento: la pareja que más sincroniza gana. Se puede improvisar, pero tienen que moverse igual.',
    reglas: ['Sin tocarse si no quieren', 'Se evalúa sincronía'],
    salidaSuave: 'Cada pareja imita a la otra.',
    camara: {
      posicion: 'Frente a cada pareja, un poco elevada.',
      plano: 'Plano americano de cada pareja y detalle de pies.',
      microfono: 'Al animador y a cada pareja al terminar.',
      reaccion: 'La emoción al ganar.',
    },
    gancho: 'La pareja más sincronizada de la fiesta 💃🕺',
    cierre: 'Eso es química.',
    optIn: false,
  },
  {
    id: 'concurso-la-boca-mas-rapida',
    titulo: 'Concurso: trabalenguas picante',
    categoria: 'concursos',
    intensidad: 'coqueto',
    duracionSeg: 60,
    jugadores: '2 a 4 participantes',
    props: ['Cartas con trabalenguas'],
    decirlo: 'Trabalenguas picantes, uno por turno, sin equivocarte. Si te trabas, el público te pone una voz graciosa.',
    reglas: ['Trabalenguas sugerentes, no vulgares', 'Tres intentos'],
    salidaSuave: 'Eligen un trabalenguas fácil.',
    camara: {
      posicion: 'Frente al concursante.',
      plano: 'Close-up a la boca y a la cara.',
      microfono: 'Al concursante, muy cerca.',
      reaccion: 'La risa cuando se traban.',
    },
    gancho: 'Trabalenguas picante: pierde el que se ríe 😂',
    cierre: 'Te trabaste, pero fue épico.',
    optIn: false,
  },

  // ── Parejas ────────────────────────────────────────────────────────────────
  {
    id: 'pareja-cuanto-nos-conocemos',
    titulo: '¿Cuánto nos conocemos?',
    categoria: 'parejas',
    intensidad: 'coqueto',
    duracionSeg: 90,
    jugadores: '1 pareja',
    props: ['Dos pizarras o cartulinas'],
    decirlo: 'Les hago cinco preguntas sobre el otro y escriben la respuesta a la vez. Si coinciden, ganan un punto.',
    reglas: ['Preguntas divertidas', 'Nada que incomode'],
    salidaSuave: 'Preguntas sobre comida y música.',
    camara: {
      posicion: 'Frente a la pareja.',
      plano: 'Plano medio y close-up a las pizarras.',
      microfono: 'Al animador y a ambos en cada revelación.',
      reaccion: 'Las caras al ver las respuestas.',
    },
    gancho: '¿Cuánto conoces a tu pareja? 💞',
    cierre: 'Se conocen más de lo que parece.',
    optIn: false,
  },
  {
    id: 'pareja-intercambio-de-piropos',
    titulo: 'Intercambio de piropos',
    categoria: 'parejas',
    intensidad: 'coqueto',
    duracionSeg: 45,
    jugadores: '1 pareja',
    props: [],
    decirlo: 'Cada uno le dice a su pareja tres cosas que le encantan, como si fuera la primera vez que se ven.',
    reglas: ['Tres cosas por persona', 'Mirándose a la cara'],
    salidaSuave: 'Lo dicen al público sobre el otro.',
    camara: {
      posicion: 'De lado, a la altura de los ojos.',
      plano: 'Dos closes alternados.',
      microfono: 'Al que habla.',
      reaccion: 'Los ojos brillantes al escuchar.',
    },
    gancho: 'Tres cosas que me enamoran de ti ❤️',
    cierre: 'Eso es amor del bueno.',
    optIn: false,
  },
  {
    id: 'pareja-baile-lento',
    titulo: 'Un lento para la pareja',
    categoria: 'parejas',
    intensidad: 'picante',
    duracionSeg: 60,
    jugadores: '1 a 3 parejas',
    props: ['Canción lenta'],
    decirlo: 'Una canción lenta, un abrazo y un baile solo para ustedes. El resto de la fiesta mira y aplaude al final.',
    reglas: ['Solo parejas que lo piden', 'Vestidos', 'Un abrazo largo'],
    salidaSuave: 'Bailan a distancia, sosteniéndose las manos.',
    camara: {
      posicion: 'A un metro y medio, con el gimbal fluido.',
      plano: 'Plano cenital y close-up a las manos.',
      microfono: 'No hace falta: música limpia.',
      reaccion: 'El abrazo final.',
    },
    gancho: 'Un lento en medio de la fiesta 🌙',
    cierre: 'Qué linda postal.',
    optIn: false,
  },
  {
    id: 'pareja-reto-de-la-complicidad',
    titulo: 'Reto de la complicidad',
    categoria: 'parejas',
    intensidad: 'atrevido',
    duracionSeg: 60,
    jugadores: '1 pareja que lo pida',
    props: [],
    decirlo: 'Solo si los dos dicen que sí. Se miran y se dicen a la vez, en voz alta, una fantasía divertida y apta para todo público: viajes, fiestas, disfraces.',
    reglas: ['Opt-in de ambos antes de empezar', 'Fantasías divertidas, nada explícito', 'Se corta si uno lo pide'],
    salidaSuave: 'Cambian la fantasía por un plan de viaje.',
    camara: {
      posicion: 'De lado, con los dos en cuadro.',
      plano: 'Plano medio que se cierra a las caras.',
      microfono: 'A ambos, cerca, para la frase a la vez.',
      reaccion: 'Las risas cuando coinciden.',
    },
    gancho: 'Dijeron la misma fantasía al mismo tiempo 🔥',
    cierre: 'Eso sí que es complicidad.',
    optIn: true,
  },
];

export interface BloqueNoche {
  id: string;
  titulo: string;
  /** Minutos desde que abre la fiesta, solo como referencia. */
  desdeMin: number;
  hastaMin: number;
  meta: string;
  dinamicas: string[];
}

export const GUION_NOCHE: BloqueNoche[] = [
  {
    id: 'apertura',
    titulo: 'Apertura',
    desdeMin: 0,
    hastaMin: 45,
    meta: 'Dar la bienvenida, explicar las reglas de respeto y soltar el ambiente.',
    dinamicas: ['mirada-de-5', 'brindis-a-ciegas', 'cartel-de-primera-impresion'],
  },
  {
    id: 'calentamiento',
    titulo: 'Calentamiento',
    desdeMin: 45,
    hastaMin: 120,
    meta: 'Sumar gente a los juegos y encontrar a los más animados.',
    dinamicas: ['ruleta-de-piropos', 'dos-verdades-un-secreto', 'reto-de-la-silla', 'beso-de-3-mejilla', 'concurso-mejor-pose'],
  },
  {
    id: 'pico',
    titulo: 'Pico de la noche',
    desdeMin: 120,
    hastaMin: 210,
    meta: 'Las dinámicas más intensas y los mejores clips. Solo con opt-in claro.',
    dinamicas: ['baile-pegado-10', 'beso-de-3-ruleta', 'verdad-o-penitencia', 'concurso-mejor-baile', 'beso-de-3-pico', 'pareja-baile-lento'],
  },
  {
    id: 'cierre',
    titulo: 'Cierre',
    desdeMin: 210,
    hastaMin: 240,
    meta: 'Bajar la energía, agradecer, grabar el cierre y reunir a quienes quieran salir en la despedida.',
    dinamicas: ['pareja-intercambio-de-piropos', 'brindis-a-ciegas'],
  },
];

export interface Senal {
  id: string;
  accion: string;
  quien: 'animador' | 'creador';
  gesto: string;
}

export const SENALES: Senal[] = [
  { id: 'grabando', accion: 'Estoy listo, grabando', quien: 'creador', gesto: 'Pulgar arriba y luz del gimbal encendida' },
  { id: 'consentimiento', accion: 'Ya dijo la frase de consentimiento', quien: 'animador', gesto: 'Toco mi pecho y levanto el pulgar' },
  { id: 'corte', accion: 'Corte, no se publica', quien: 'creador', gesto: 'Mano plana horizontal cruzando el cuello' },
  { id: 'repetir', accion: 'Repetimos la toma', quien: 'animador', gesto: 'Círculo con el dedo en el aire' },
  { id: 'reaccion', accion: 'Toma de reacción', quien: 'animador', gesto: 'Señalo mis propios ojos y luego al participante' },
  { id: 'stop', accion: 'Alguien dijo «paso»: paramos todo', quien: 'animador', gesto: 'Palma abierta al frente, voz tranquila' },
];

export interface ItemChecklist {
  id: string;
  grupo: 'Equipo' | 'Antes de abrir' | 'Orden de tomas';
  texto: string;
}

export const CHECKLIST_CREADOR: ItemChecklist[] = [
  { id: 'baterias', grupo: 'Equipo', texto: 'Baterías cargadas: gimbal, micrófonos DJI, cámara o celular y una de repuesto' },
  { id: 'mics', grupo: 'Equipo', texto: 'Micrófonos DJI emparejados con el receptor, con la ganancia revisada y el cortaviento puesto' },
  { id: 'gimbal', grupo: 'Equipo', texto: 'Gimbal calibrado y balanceado, modo de seguimiento probado' },
  { id: 'tarjeta', grupo: 'Equipo', texto: 'Espacio libre en la tarjeta o el celular' },
  { id: 'lente', grupo: 'Equipo', texto: 'Lente limpio, y modo vertical 9:16 configurado' },
  { id: 'senales', grupo: 'Antes de abrir', texto: 'Señales con el animador practicadas' },
  { id: 'zona', grupo: 'Antes de abrir', texto: 'Zona de grabación definida y avisada al público' },
  { id: 'consentimiento', grupo: 'Antes de abrir', texto: 'Tarjeta con la frase de consentimiento a mano' },
  { id: 'toma-apertura', grupo: 'Orden de tomas', texto: 'Apertura: fachada, fila, ambiente y sonrisas' },
  { id: 'toma-ambiente', grupo: 'Orden de tomas', texto: 'Ambiente: barra, pista y detalles de decoración' },
  { id: 'toma-dinamicas', grupo: 'Orden de tomas', texto: 'Dinámicas: frase de consentimiento, la dinámica, la reacción y el cierre' },
  { id: 'toma-cierre', grupo: 'Orden de tomas', texto: 'Cierre: despedida con quienes quieran salir y un plano general final' },
];

export interface PautaAnimador {
  consentimiento: typeof CONSENTIMIENTO;
  dinamicas: Dinamica[];
  guion: BloqueNoche[];
  senales: Senal[];
  checklist: ItemChecklist[];
}

export function pautaAnimador(): PautaAnimador {
  return { consentimiento: CONSENTIMIENTO, dinamicas: DINAMICAS, guion: GUION_NOCHE, senales: SENALES, checklist: CHECKLIST_CREADOR };
}

export function dinamicaPorId(id: string): Dinamica | undefined {
  return DINAMICAS.find((d) => d.id === id);
}
