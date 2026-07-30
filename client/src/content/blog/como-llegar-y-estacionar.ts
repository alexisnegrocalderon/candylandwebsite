import type { Article } from '../types';

/* Se apoya en la FAQ real: "Contamos con estacionamiento privado dentro del
 * recinto. También puedes llegar en app de transporte directo a la entrada" y
 * en "La dirección exacta te llega junto a tu entrada por correo, para mantener
 * la privacidad del espacio".
 *
 * ⚠️ NO se inventan horarios de micros ni datos de transporte público: nadie
 * los confirmó y sería información potencialmente falsa sobre algo de lo que
 * depende que alguien llegue de vuelta a su casa de madrugada. */

export const comoLlegarYEstacionar: Article = {
  slug: 'como-llegar-y-estacionar',
  category: 'blog',
  title: 'Cómo Llegar a un Evento Nocturno y Dónde Estacionar',
  heading: 'Cómo llegar y dónde estacionar',
  description:
    'La logística que casi nadie planifica y siempre termina siendo un problema: cómo llegar, dónde dejar el auto y —lo más importante— cómo vuelves.',
  publishedAt: '2026-07-30',
  readMinutes: 4,
  emoji: '🚗',
  sections: [
    {
      heading: 'La dirección llega con tu entrada',
      body: [
        'En eventos con un recinto privado, la dirección exacta no se publica: llega por correo junto con la entrada. No es para complicarte, es para cuidar la privacidad del espacio y de quienes van.',
        'Eso significa una cosa práctica: revisa ese correo antes de salir de tu casa, no cuando ya vas en camino. Y si no te llegó, búscalo en spam antes de escribir.',
      ],
    },
    {
      heading: 'Si vas en auto',
      body: [
        'Nuestro recinto tiene estacionamiento privado adentro, que se toma al momento de comprar. Es la opción más cómoda, sobre todo si vienes de fuera de la zona.',
      ],
      list: [
        'Asegúralo al comprar: los cupos son limitados y no se garantizan en la puerta.',
        'Llega con margen: buscar estacionamiento a último minuto es la forma más rápida de empezar la noche estresado.',
        'Si vas a tomar, define antes quién maneja. O deja el auto y resuelve la vuelta de otra forma.',
      ],
    },
    {
      heading: 'Si vas en app de transporte',
      body: [
        'Funciona bien y puedes llegar directo a la entrada. Le pasas la dirección que te llegó por correo y listo.',
        'Para la vuelta hay un detalle que vale oro: pídelo desde adentro y espera en el lugar, no en la calle. A las 04:00 la espera puede ser más larga de lo normal, y es mucho mejor esperar adentro que afuera.',
      ],
    },
    {
      heading: 'La regla que evita el peor momento de la noche',
      body: [
        'Decide cómo vuelves antes de salir de tu casa.',
        'Suena obvio y casi nadie lo hace. El final de una buena noche no debería ser media hora de frío calculando cómo llegar de vuelta. Si vas con gente, acuerden esto antes: quién maneja, o si van a pedir transporte juntos.',
      ],
      note: 'Los eventos que van hasta el amanecer tienen una ventaja: puedes quedarte hasta que amanezca y volver con luz.',
    },
  ],
  relatedSlugs: ['que-llevar', 'vina-del-mar'],
  cta: {
    text: 'Revisa los detalles y asegura tu estacionamiento al comprar.',
    label: 'Ver entradas',
    href: '/entradas',
  },
};
