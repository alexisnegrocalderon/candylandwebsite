/** Páginas de contenido que viven FUERA de `ALL_ARTICLES` (son componentes
 * standalone con su propia ruta a mano en `App.tsx`, no artículos del
 * registro de `content/index.ts`): la Tarjeta PlayCard, "Qué son las
 * fiestas liberales" y el quiz de "Disfraz Obligatorio" (antes vivía en
 * `ALL_ARTICLES` como texto plano, salió de ahí al volverse interactivo --
 * ver `client/src/pages/DressCodeArticle.tsx`). Se listan acá, con el mismo
 * shape visual mínimo que usa un `Article` (título, resumen, emoji, ruta),
 * para que Navbar, Home y Footer puedan mezclarlas con `ALL_ARTICLES` en
 * una sola lista sin duplicar esta info en cada archivo. */
export type StandalonePage = {
  title: string;
  description: string;
  emoji: string;
  path: string;
};

export const STANDALONE_PAGES: StandalonePage[] = [
  {
    title: '¿Qué son las fiestas liberales?',
    description: 'Mitos, realidad y un quiz de 2 minutos para saber si es para ti.',
    emoji: '✨',
    path: '/blog/que-son-las-fiestas-liberales',
  },
  {
    title: 'La Tarjeta PlayCard',
    description: 'Tu QR de acceso, saldo prepagado y Playcoins en un solo lugar.',
    emoji: '💳',
    path: '/blog/tarjeta-playcard',
  },
  {
    title: 'Disfraz obligatorio: ¿qué me pongo?',
    description: 'No tiene que ser profesional, pero sí es obligatorio -- tips y un quiz de 1 minuto.',
    emoji: '🎭',
    path: '/blog/dress-code-explicado',
  },
  {
    title: 'Beneficios Cumpleañeros',
    description: 'Postula si tu cumpleaños cae cerca de la fiesta y desbloquea entrada gratis, espumante y más.',
    emoji: '🎂',
    path: '/beneficios-cumpleaneros',
  },
];
