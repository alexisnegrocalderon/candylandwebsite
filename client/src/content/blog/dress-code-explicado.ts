import type { Article } from '../types';

/* Desarrolla `CANDYLAND.dressCode`: "Candy sensual: brillos, rosa, látex, lo
 * que te haga sentir así de rico. Nada de tenida deportiva." No agrega reglas
 * que no existan en el config. */

export const dressCodeExplicado: Article = {
  slug: 'dress-code-explicado',
  category: 'blog',
  title: 'Dress Code Explicado: Qué Significa "Candy Sensual"',
  heading: 'Dress code explicado',
  description:
    'Qué significa realmente un código de vestimenta en un evento nocturno, por qué se aplica en la puerta y cómo resolverlo sin gastar en ropa nueva.',
  publishedAt: '2026-07-30',
  readMinutes: 4,
  emoji: '✨',
  sections: [
    {
      heading: 'Por qué existe el dress code',
      body: [
        'La respuesta corta: porque funciona. Cuando todos llegan vestidos para la ocasión, el ambiente es otro. No es una barrera de entrada ni un tema de estatus, es lo que separa una noche especial de una salida cualquiera.',
        'La respuesta larga es que el código de vestimenta es una señal de acuerdo. Quien se tomó el tiempo de armar una tenida está diciendo que entiende de qué se trata la noche. Y eso, en la práctica, se nota en cómo se comporta la gente adentro.',
      ],
    },
    {
      heading: 'Qué significa "candy sensual"',
      body: [
        'Nuestro código es "candy sensual": brillos, rosa, látex, transparencias. La idea es sentirse irresistible, no disfrazarse.',
        'Lo importante es el espíritu, no la lista literal. No necesitas látex si el látex no es lo tuyo. Necesitas algo que te haga sentir bien y que converse con la estética de la noche.',
      ],
      list: [
        'Brillos y lentejuelas: lo más fácil de conseguir y siempre funciona.',
        'Rosa en cualquier tono: es el color de la casa.',
        'Látex, cuero o vinilo: para quien ya se mueve en ese código.',
        'Transparencias y encajes: sensual sin necesidad de mostrar de más.',
        'Negro con un accesorio fuerte: la salida elegante cuando no tienes nada más.',
      ],
    },
    {
      heading: 'Lo único que no entra',
      body: [
        'La regla dura es simple: nada de tenida deportiva. Buzo, zapatillas de correr, polera de fútbol, jockey. No es esnobismo, es coherencia con el resto de la propuesta.',
      ],
      note: 'El dress code se revisa en la puerta. Vale más resolverlo antes de salir que discutirlo cuando ya estás en la fila.',
    },
    {
      heading: 'Cómo resolverlo sin comprar nada',
      body: [
        'La mayoría de la gente ya tiene con qué. Tres caminos que funcionan:',
      ],
      list: [
        'Revisa lo que ya tienes: esa prenda que guardas para una ocasión especial probablemente es esta ocasión.',
        'Un accesorio cambia todo: un antifaz, unos guantes largos o algo con brillo levanta una tenida simple.',
        'Segunda mano y tiendas de disfraces: para látex o piezas más específicas, sale mucho más barato que una tienda de diseño.',
      ],
    },
    {
      heading: 'La duda que todos tienen',
      body: [
        '"¿No voy a ir demasiado producido?" Casi nunca. El error habitual es al revés: quedarse corto por miedo a destacar y después sentirse fuera de lugar cuando todo el mundo llegó impecable.',
        'Si dudas entre dos opciones, elige la más audaz. Es la noche para eso.',
      ],
    },
  ],
  relatedSlugs: ['que-llevar', 'primera-vez-que-esperar'],
  cta: {
    text: 'Mira los detalles y el dress code de la próxima fecha.',
    label: 'Ver próximos eventos',
    href: '/eventos',
  },
};
