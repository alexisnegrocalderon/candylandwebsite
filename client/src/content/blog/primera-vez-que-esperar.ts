import type { Article } from '../types';

/* Se apoya en `CANDYLAND.valores` (Respeto, Consentimiento, Libertad), en las
 * amenities reales (2 pistas, Playground XXL, Kink Room, barra, guardarropía,
 * zona de fumadores, ambiente seguro) y en la FAQ. Es el artículo que responde
 * la duda que más frena a alguien nuevo. */

export const primeraVezQueEsperar: Article = {
  slug: 'primera-vez-que-esperar',
  category: 'blog',
  title: 'Primera Vez en una Fiesta Liberal: Qué Esperar',
  heading: 'Primera vez: qué esperar',
  description:
    'Cómo funciona realmente una fiesta liberal, qué pasa cuando entras, cuáles son las reglas y qué NO va a pasar. Para quien nunca ha ido y tiene dudas.',
  publishedAt: '2026-07-30',
  readMinutes: 6,
  emoji: '🚪',
  sections: [
    {
      heading: 'Lo primero: nadie te va a presionar a nada',
      body: [
        'Esta es la duda que frena a casi todo el mundo, así que va primero. En un espacio bien llevado, no pasa nada que tú no quieras que pase. Puedes ir, bailar toda la noche, tomarte algo y volver a tu casa sin haber hecho nada más. Es completamente válido y pasa todo el tiempo.',
        'El consentimiento no es un eslogan en la pared: es la regla que hace que el lugar funcione. Un "no" se respeta a la primera, sin explicaciones y sin insistir.',
      ],
    },
    {
      heading: 'Las tres reglas que sostienen todo',
      body: ['Respeto, consentimiento y libertad. En la práctica se traducen así:'],
      list: [
        'Respeto: nadie comenta, juzga ni fotografía lo que hacen los demás.',
        'Consentimiento: todo se pregunta. Un no es un no, y no se insiste.',
        'Libertad: cada quien decide su noche. Mirar es válido, participar es válido, y no hacer ninguna de las dos también.',
      ],
      note: 'Si alguien no respeta esto, se lo saca. No hay una segunda conversación.',
    },
    {
      heading: 'Cómo es entrar',
      body: [
        'La entrada es más simple de lo que uno imagina: se revisa el carnet (son eventos estrictamente +18), se valida la entrada y se revisa el dress code. Nada más.',
        'Adentro, lo primero que conviene hacer es dejar las cosas en guardarropía y dar una vuelta completa para ubicarse. Saber dónde está cada cosa quita la mitad de la ansiedad inicial.',
      ],
    },
    {
      heading: 'No todo el lugar es lo mismo',
      body: [
        'Este es el punto que más tranquiliza a quien va por primera vez: los espacios están separados y cada uno tiene su propia intensidad.',
      ],
      list: [
        'Las pistas son pistas: se baila, se conversa, se toma algo. Es una fiesta normal.',
        'La barra y la zona de fumadores son los lugares donde la gente conversa y se conoce.',
        'Las zonas más íntimas están aparte, y entrar es una decisión activa: nadie llega ahí por accidente.',
      ],
      note: 'Puedes pasar toda la noche solo en las pistas. Mucha gente lo hace, sobre todo la primera vez.',
    },
    {
      heading: 'Ir en pareja, ir solo, ir con amigos',
      body: [
        'Las tres formas funcionan, pero conviene saber qué esperar de cada una.',
        'En pareja: es la más común. Lo que sí conviene es conversar antes qué quieren y qué no. Las conversaciones incómodas se tienen en la casa, no adentro.',
        'Con amigos: la más relajada para una primera vez, porque llegas con tu grupo y no dependes de nadie.',
        'Solo o sola: acá hay que revisar bien qué tipo de acceso corresponde, porque no todos los eventos tienen las mismas condiciones para quien va sin acompañante.',
      ],
    },
    {
      heading: 'Qué hacer si algo te incomoda',
      body: [
        'Te vas de esa zona. Así de simple, y no le debes una explicación a nadie.',
        'Si alguien no respeta un no o te hace sentir inseguro, se le avisa al equipo del local. Están para eso y actúan. Un espacio que no cuida a quien está adentro no dura, y quien lo produce lo sabe mejor que nadie.',
      ],
    },
  ],
  relatedSlugs: ['dress-code-explicado', 'que-llevar', 'como-llegar-y-estacionar'],
  cta: {
    text: '¿Te dieron ganas de conocerlo? Mira la próxima fecha.',
    label: 'Ver próximos eventos',
    href: '/eventos',
  },
};
