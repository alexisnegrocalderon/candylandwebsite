import type { Article } from '../types';

/* Ángulo distinto al de la guía de Viña a propósito: acá el foco es la vida
 * nocturna de Valparaíso y cómo elegir según lo que buscas, para que las dos
 * guías no compitan entre sí por la misma búsqueda (era justamente el problema
 * que se arregló en la fase 1). */

export const guiaValparaiso: Article = {
  slug: 'valparaiso',
  category: 'guia',
  title: 'Vida Nocturna en Valparaíso — Dónde Salir de Noche',
  heading: 'Vida nocturna en Valparaíso',
  description:
    'Cómo funciona la noche en Valparaíso, qué tipos de panorama existen y cómo elegir según lo que buscas. Guía práctica escrita desde adentro de la escena.',
  publishedAt: '2026-07-30',
  readMinutes: 5,
  emoji: '🎭',
  sections: [
    {
      heading: 'Valparaíso no tiene una sola noche, tiene varias',
      body: [
        'Lo que hace distinta a la noche porteña es que conviven escenas que en otras ciudades estarían separadas. La misma noche puede ser bohemia, electrónica, under o de fiesta grande, según dónde estés parado y a qué hora.',
        'Esa variedad es una ventaja y un problema al mismo tiempo: hay para todos los gustos, pero es fácil terminar en el panorama equivocado si uno sale sin decidir qué anda buscando.',
      ],
    },
    {
      heading: 'Primero decide la energía, después el lugar',
      body: [
        'El error más común es elegir por lugar. Funciona mucho mejor al revés: decidir primero qué tipo de noche quieres y recién ahí buscar dónde. Cuatro energías distintas:',
      ],
      list: [
        'Bailar sin parar: la música manda y la noche se mide en horas de pista.',
        'Conocer gente: importa que el espacio permita hablar y moverse, no solo bailar.',
        'Celebrar algo: cumpleaños, cierre de mes, lo que sea. Ahí pesa el grupo y el ambiente.',
        'Vivir algo distinto: cuando la rutina de siempre ya aburre y se busca una propuesta con identidad propia.',
      ],
      note: 'Las dos últimas son las que más han crecido en la Región de Valparaíso, y las que peor resuelve un panorama improvisado.',
    },
    {
      heading: 'El fin de semana largo de la Quinta Región',
      body: [
        'Algo particular de la zona: la noche no se concentra solo en el sábado. Entre Valparaíso y Viña del Mar hay movimiento distribuido, y los eventos con propuesta propia suelen elegir fechas donde no compiten con todo lo demás.',
        'Para quien planifica, eso significa que vale la pena mirar el calendario con anticipación en vez de decidir el mismo día. Los eventos que valen la pena venden antes, no en la puerta.',
      ],
    },
    {
      heading: 'Salir de noche sin auto',
      body: [
        'Valparaíso y Viña están conectadas, pero la noche cambia las reglas: a las 04:00 las opciones se reducen. Lo que funciona:',
      ],
      list: [
        'Resolver la vuelta antes de salir, no cuando ya terminó la fiesta.',
        'Si es un evento cerrado, pedir el transporte desde adentro y esperar en el lugar.',
        'Si vas en auto y vas a tomar, definir de antemano quién maneja o dejarlo estacionado.',
      ],
    },
    {
      heading: 'Qué esperar de un evento con propuesta',
      body: [
        'Si te decides por la cuarta opción —vivir algo distinto— hay un par de cosas que conviene tener claras antes de comprar.',
        'Estos eventos suelen ser +18 estrictos con revisión de carnet, tienen código de vestimenta que se aplica en la puerta, y funcionan con reglas de convivencia explícitas: respeto, consentimiento y libertad. No son reglas decorativas, son lo que hace que el espacio funcione.',
        'A cambio, la experiencia es otra cosa: zonas con identidades distintas, música pensada, y gente que llegó por lo mismo que tú.',
      ],
    },
  ],
  relatedSlugs: ['vina-del-mar', 'primera-vez-que-esperar', 'dress-code-explicado'],
  cta: {
    text: 'Si buscas una noche con propuesta propia, mira las próximas fechas.',
    label: 'Ver próximos eventos',
    href: '/eventos',
  },
};
