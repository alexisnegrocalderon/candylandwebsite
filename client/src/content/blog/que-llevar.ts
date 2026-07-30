import type { Article } from '../types';

/* Basado en amenities reales del config (guardarropía, barra completa,
 * estacionamiento privado, zona de fumadores) y en la FAQ de edad mínima. */

export const queLlevar: Article = {
  slug: 'que-llevar',
  category: 'blog',
  title: 'Qué Llevar a un Evento Nocturno — La Lista Corta',
  heading: 'Qué llevar a un evento nocturno',
  description:
    'La lista corta de lo que sí necesitas y lo que te va a estorbar toda la noche. Incluye lo que mucha gente olvida y termina lamentando.',
  publishedAt: '2026-07-30',
  readMinutes: 3,
  emoji: '🎒',
  sections: [
    {
      heading: 'Lo que no puede faltar',
      body: ['Tres cosas. Sin la primera no entras, así de simple.'],
      list: [
        'Carnet de identidad. Los eventos +18 lo piden en la puerta sin excepciones, y una foto en el celular no siempre sirve.',
        'Tu entrada o el código que te llegó por correo. Ténlo a mano antes de llegar a la fila, no cuando ya estés adelante.',
        'Medio de pago para la barra. Aunque hayas comprado todo online, la barra se paga aparte.',
      ],
    },
    {
      heading: 'Lo que se agradece a las 03:00',
      list: [
        'Cargador o batería portátil: entre fotos y pedir transporte, el celular no llega al final.',
        'Algo de abrigo para la salida. Entras con calor y sales a otra temperatura.',
        'Un cambio de calzado si vas con tacos. Bailar seis horas con el mismo par es una decisión que se paga.',
      ],
    },
    {
      heading: 'Lo que mejor dejas en la casa',
      body: [
        'Todo lo que tengas que estar cuidando toda la noche te va a arruinar la experiencia. Si el lugar tiene guardarropía —el nuestro tiene— úsala apenas llegues, en vez de andar cargando cosas.',
      ],
      list: [
        'Bolsos grandes: incómodos en la pista y difíciles de vigilar.',
        'Objetos de valor que no vas a usar.',
        'Expectativas rígidas sobre cómo tiene que salir la noche.',
      ],
    },
    {
      heading: 'Antes de salir de la casa',
      body: [
        'Dos decisiones que se toman antes y no después: cómo vuelves, y qué te vas a poner. La primera evita el peor momento de la noche; la segunda evita que te devuelvan en la puerta por no cumplir el dress code.',
      ],
    },
  ],
  relatedSlugs: ['dress-code-explicado', 'como-llegar-y-estacionar'],
  cta: {
    text: 'Revisa el dress code y los detalles de la próxima fecha antes de comprar.',
    label: 'Ver próximos eventos',
    href: '/eventos',
  },
};
