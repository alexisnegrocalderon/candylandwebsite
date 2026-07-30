import type { Article } from '../types';

/* Guía escrita desde la experiencia de la marca, NO como listado de locales de
 * terceros (decisión del dueño). Todo lo que afirma sale de datos verificables
 * en client/src/config/candyland.ts: horarios (21:00 a 04:30 + after),
 * dress code, edad mínima, estacionamiento privado, app de transporte,
 * amenities y valores. */

export const guiaVinaDelMar: Article = {
  slug: 'vina-del-mar',
  category: 'guia',
  title: 'Qué Hacer en Viña del Mar de Noche — Guía',
  heading: 'Qué hacer en Viña del Mar de noche',
  description:
    'Cómo se vive realmente la noche en Viña del Mar y alrededores: horarios, qué esperar, cómo llegar y cómo elegir tu panorama. Guía escrita por quienes producen las noches.',
  publishedAt: '2026-07-30',
  readMinutes: 6,
  emoji: '🌙',
  sections: [
    {
      heading: 'La noche en Viña empieza más tarde de lo que crees',
      body: [
        'Si vienes de otra ciudad, lo primero que sorprende es el horario. Acá la noche no arranca a las 22:00: arranca cuando en otras partes ya está terminando. Las puertas de un evento pueden abrir a las 21:00, pero el momento real —cuando el lugar está lleno y la música ya encontró su ritmo— llega bastante después.',
        'Eso cambia cómo se planifica la salida. Llegar demasiado temprano significa esperar; llegar demasiado tarde significa perderse la primera parte, que suele ser la más tranquila para conocer gente antes de que todo se ponga intenso.',
      ],
      note: 'Regla práctica: si el evento abre a las 21:00 y termina a las 04:30, el punto medio de la noche está más cerca de la 01:00 que de las 23:00.',
    },
    {
      heading: 'Tres tipos de panorama nocturno, y para quién es cada uno',
      body: [
        'No todos los panoramas nocturnos buscan lo mismo, y elegir mal es la razón más común de una noche que no funcionó. A grandes rasgos hay tres caminos:',
      ],
      list: [
        'Salir a bailar sin más: lo que importa es la música y la pista. Se decide por el género, no por el lugar.',
        'Salir a conversar: bares y espacios donde se puede escuchar a la otra persona. La música es fondo, no protagonista.',
        'Salir a vivir una experiencia: eventos con una propuesta propia —temática, zonas distintas, código de vestimenta— donde el lugar mismo es parte del panorama.',
      ],
      note: 'El tercero es el que más se ha movido en la Quinta Región en los últimos años, y es donde entra lo que hacemos nosotros.',
    },
    {
      heading: 'Qué hace distinto a un evento con propuesta propia',
      body: [
        'La diferencia entre "una fiesta" y "una experiencia" está en si el lugar te propone algo o simplemente te abre la puerta. En un evento con propuesta hay zonas con identidades distintas, un código de vestimenta que todo el mundo respeta, y reglas de convivencia explícitas.',
        'En nuestro caso eso se traduce en dos pistas con música distinta —una de house y techno, otra de reggaetón y perreo—, además de espacios que no son pista: barra completa, zona de fumadores techada, guardarropía y áreas pensadas para otra cosa que bailar.',
        'El dress code no es un capricho: cuando todos llegan vestidos para la ocasión, el ambiente cambia por completo. Es la diferencia entre un lugar donde la gente se arregló y uno donde llegó de paso.',
      ],
    },
    {
      heading: 'Cómo llegar y volver',
      body: [
        'La logística es lo que más frena a quien no conoce la zona, y tiene solución simple. Hay dos formas de resolverlo:',
      ],
      list: [
        'En auto: conviene asegurar estacionamiento con anticipación. En nuestros eventos hay estacionamiento privado dentro del recinto, que se toma al comprar.',
        'En app de transporte: se puede llegar directo a la entrada. Para la vuelta, a esa hora conviene pedirlo desde adentro y esperar en el lugar, no en la calle.',
      ],
      note: 'Si vas a tomar, la decisión del transporte se toma antes de salir de la casa, no a las 04:00.',
    },
    {
      heading: 'Lo que conviene saber antes de ir',
      body: [
        'Tres cosas que se preguntan siempre y que vale resolver antes de comprar:',
      ],
      list: [
        'Edad: los eventos de este tipo son estrictamente +18 y se pide carnet en la entrada, sin excepciones.',
        'Dress code: se revisa en la puerta. Vale la pena leerlo antes y no improvisar.',
        'Acceso: hay eventos donde no todos los tipos de entrada están abiertos a todo el mundo. Conviene revisarlo antes de llegar.',
      ],
    },
    {
      heading: 'Cómo elegir tu próxima noche',
      body: [
        'Si estás decidiendo qué hacer un fin de semana en Viña del Mar o alrededores, la pregunta útil no es "dónde hay fiesta" sino "qué quiero que pase esta noche". Bailar hasta que cierren, conocer gente, celebrar algo o simplemente salir de la rutina son noches distintas y se resuelven con panoramas distintos.',
        'Una vez que sabes eso, elegir es fácil: revisa qué eventos hay en las fechas que te sirven, mira la propuesta de cada uno y compra con anticipación. Los que valen la pena se agotan.',
      ],
    },
  ],
  relatedSlugs: ['valparaiso', 'como-llegar-y-estacionar', 'primera-vez-que-esperar'],
  cta: {
    text: '¿Buscas un panorama para este fin de semana? Revisa las próximas fechas.',
    label: 'Ver próximos eventos',
    href: '/eventos',
  },
};
