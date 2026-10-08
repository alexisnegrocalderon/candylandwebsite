import { emptySlide, type StudioFormat, type StudioSlide, type StudioTheme } from '@shared/contentStudio';

/* Láminas de ejemplo al crear un diseño nuevo: las mismas de los carruseles
 * que ya funcionaron en la cuenta, para partir editando en vez de en blanco. */

function s(partial: Partial<StudioSlide> & Pick<StudioSlide, 'layout'>): StudioSlide {
  return { ...emptySlide(partial.layout), ...partial };
}

const STARTERS: Record<StudioTheme, StudioSlide[]> = {
  azul: [
    s({ layout: 'portada', script: 'Desafío', title: '¿Sabes jugar en Playroom?', body: 'Elige tu respuesta y comprueba si entiendes las reglas básicas de nuestro espacio.', swipeHint: true }),
    s({ layout: 'pregunta', number: '01.', title: 'Sientes una mano en tu cintura sin previo aviso', options: ['Está bien, de seguro le gustó', 'No corresponde, el consentimiento es clave y debemos comunicarlo'], swipeHint: true }),
    s({ layout: 'cierre', title: '¿Elegiste bien?', body: 'En Playroom todo se trata de respeto, consentimiento y buena vibra.', cta: 'Comenta cuántas acertaste', footnote: 'y etiqueta a alguien que necesita este mini manual.' }),
  ],
  pastel: [
    s({ layout: 'portada', script: 'Test', title: '¿Qué monstruo eres en Playroom?', body: 'Responde 4 preguntas y comenta tu letra para descubrirlo.' }),
    s({ layout: 'pregunta', number: '01', title: 'Tu plan ideal de viernes', options: ['Llegar tarde y elegante, que todos me miren', 'Tomar un rico trago y leer las señales', 'Aparecer, saludar y desaparecer sin avisar', 'Ser la primera en llegar y el último en irme'] }),
    s({ layout: 'resultados', title: 'Tu letra, tu monstruo', body: 'La letra que más elegiste:', items: [
      { badge: '🧛', title: 'Vampiro/a', body: 'Seductor/a, misterioso/a, mirada que lo dice todo' },
      { badge: '🧙', title: 'Bruja/o', body: 'Intuitiva/o, provocadora/or, siempre con un plan' },
      { badge: '👻', title: 'Fantasma', body: 'Aparece, coquetea y desaparece' },
      { badge: '🧟', title: 'Zombie', body: 'Alma de la fiesta, jamás sale de la pista' },
    ] }),
    s({ layout: 'cierre', title: '¿Qué monstruo saliste?', body: 'Cuéntanos tu letra o tu emoji: 🧛 🧙 👻 🧟', cta: 'Comenta tu letra', footnote: 'y etiqueta a quien es puro Halloween.' }),
  ],
  playcard: [
    s({ layout: 'portada', title: 'Tarjeta PlayCard', body: 'Un solo QR para todo: tu acceso, tu saldo y tus Playcoins.', footnote: 'Solo tu celular', swipeHint: true }),
    s({ layout: 'pasos', script: 'Paso a paso', title: 'Cómo funciona', items: [
      { badge: 'Paso 1', title: 'Se activa con tu entrada', body: 'Al comprar, tu tarjeta queda lista. En tu primera carga defines un PIN de 4 dígitos.' },
      { badge: 'Paso 2', title: 'Guarda saldo y Playcoins', body: 'Carga con tu entrada o en caja el día de la fiesta. Cada compra suma Playcoins.' },
      { badge: 'Paso 3', title: 'Pagas sin billetera', body: 'Muestras tu QR, ingresas tu PIN y se descuenta al instante.' },
      { badge: 'Paso 4', title: 'Te sigue de fiesta en fiesta', body: 'Lo que no gastes queda en tu cuenta para la próxima.' },
    ] }),
    s({ layout: 'cierre', title: 'Se activa sola con tu entrada', body: 'No hay nada más que hacer.', cta: 'Comprar mi entrada', footnote: '@mansionplayroom.cl' }),
  ],
};

export function starterSlides(theme: StudioTheme, format: StudioFormat): StudioSlide[] {
  const slides = STARTERS[theme].map((slide) => ({ ...slide, options: [...slide.options], items: slide.items.map((i) => ({ ...i })) }));
  // Un post o una historia es una sola imagen: se parte de la última (la de
  // llamado a la acción), que funciona sola.
  return format === 'carrusel' ? slides : [{ ...slides[slides.length - 1], swipeHint: false }];
}

/** Lámina nueva dentro de un diseño, con texto de ejemplo según el tipo. */
export function newSlide(layout: StudioSlide['layout']): StudioSlide {
  switch (layout) {
    case 'portada': return s({ layout, title: 'Tu título acá', body: 'Una bajada corta.', swipeHint: true });
    case 'pregunta': return s({ layout, number: '01.', title: 'La pregunta', options: ['Opción a', 'Opción b'], swipeHint: true });
    case 'resultados': return s({ layout, title: 'Tus resultados', items: [{ badge: '✨', title: 'Resultado', body: 'Descripción corta' }] });
    case 'pasos': return s({ layout, script: 'Paso a paso', title: 'Cómo funciona', items: [{ badge: 'Paso 1', title: 'Primer paso', body: 'Explicación corta.' }] });
    case 'cierre': return s({ layout, title: '¿Y tú?', body: 'Cuéntanos en los comentarios.', cta: 'Comenta', footnote: '' });
    default: return s({ layout });
  }
}
