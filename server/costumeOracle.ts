import { invokeLLM, extractContent } from './_core/llm';
import { EVENT_BRAND } from '../shared/eventBrand';
import {
  COSTUME_ORACLE_SCHEMA, ORACLE_LABELS,
  type CostumeCard, type OracleAnswers, type OracleResult, type OracleVibe,
} from '../shared/costumeOracle';

const TIERS: CostumeCard['tier'][] = ['basico', 'intermedio', 'produccion'];

/** Catálogo curado para cuando la IA no responde (sin API key, timeout,
 * JSON inválido): la persona nunca se queda mirando una pantalla vacía. Una
 * terna por vibra, del más fácil al más producido. */
const FALLBACK: Record<OracleVibe, CostumeCard[]> = {
  sexy: [
    { tier: 'basico', name: 'Gata Negra', emoji: '🐈‍⬛', pitch: 'Todo negro ajustado, orejas y actitud felina. Imposible que falle.', pieces: ['Body o polera negra ajustada', 'Pantalón o falda negra', 'Orejas de gato (cintillo)', 'Delineado largo'], costRange: '$0 - $5.000', difficulty: 1, beautyTip: 'Delineado cat-eye bien marcado y bigotes finos con lápiz negro.', groupTip: 'En pareja: gata y ratón, o dos gatas en blanco y negro.' },
    { tier: 'intermedio', name: 'Diablesa / Diablo Seductor', emoji: '😈', pitch: 'Rojo y negro con cachos, cola y mucha seguridad.', pieces: ['Prenda roja o negra', 'Cachos de diablo', 'Cola con punta', 'Medias de red', 'Tridente (opcional)'], costRange: '$8.000 - $20.000', difficulty: 1, beautyTip: 'Labios rojo intenso y sombra ahumada en rojo/negro.', groupTip: 'En pareja: diablo y ángel caído, contraste garantizado.' },
    { tier: 'produccion', name: 'Vampira Victoriana', emoji: '🦇', pitch: 'Corsé, capa larga y colmillos: elegancia oscura de otro siglo.', pieces: ['Corsé o chaleco de época', 'Capa larga con cuello alto', 'Colmillos', 'Guantes largos', 'Joyas antiguas'], costRange: '$25.000 - $60.000 (arriendo)', difficulty: 3, beautyTip: 'Piel pálida mate, ojeras sutiles y labio borgoña.', groupTip: 'En grupo: un clan de vampiros con el mismo detalle de color.' },
  ],
  terror: [
    { tier: 'basico', name: 'Novia Cadáver', emoji: '💀', pitch: 'Ropa blanca vieja, ojeras profundas y un velo improvisado.', pieces: ['Vestido o camisa blanca vieja', 'Velo de tul o cortina', 'Flores secas', 'Maquillaje pálido'], costRange: '$0 - $6.000', difficulty: 1, beautyTip: 'Base blanca, sombra gris alrededor de los ojos y labios morados.', groupTip: 'En pareja: novio y novia cadáver.' },
    { tier: 'intermedio', name: 'Payaso Siniestro', emoji: '🤡', pitch: 'Colores gastados, sonrisa torcida y un globo rojo.', pieces: ['Ropa holgada de colores', 'Peluca de colores', 'Nariz roja', 'Globo rojo', 'Maquillaje de payaso'], costRange: '$10.000 - $20.000', difficulty: 2, beautyTip: 'Sonrisa pintada exagerada y ojos con rombos negros.', groupTip: 'En grupo: un circo del terror completo.' },
    { tier: 'produccion', name: 'Monja Maldita', emoji: '🕯️', pitch: 'Hábito completo y maquillaje de efectos especiales.', pieces: ['Hábito de monja', 'Toca con velo', 'Rosario grande', 'Lentes de contacto de color (opcional)'], costRange: '$20.000 - $45.000 (arriendo)', difficulty: 3, beautyTip: 'Ojos hundidos en negro y venas marcadas con delineador.', groupTip: 'En pareja: monja y cura poseído.' },
  ],
  divertido: [
    { tier: 'basico', name: 'Fantasma Clásico', emoji: '👻', pitch: 'Una sábana blanca... pero con lentes de sol y actitud de fiesta.', pieces: ['Sábana blanca', 'Lentes de sol', 'Algo brillante (collar, cadena)'], costRange: '$0 - $3.000', difficulty: 1, beautyTip: 'Si llevas cara descubierta, glitter plateado en pómulos.', groupTip: 'En grupo: una manada de fantasmas con accesorios distintos.' },
    { tier: 'intermedio', name: 'Calabaza Fashion', emoji: '🎃', pitch: 'Naranjo y negro en versión fiesta, con estampado de calabaza.', pieces: ['Polera o vestido naranja', 'Cintillo con hojas verdes', 'Medias rayadas negro/naranja', 'Cara de calabaza pintada'], costRange: '$6.000 - $15.000', difficulty: 1, beautyTip: 'Triángulos negros en la mejilla y sombra naranja.', groupTip: 'En pareja: calabaza y espantapájaros.' },
    { tier: 'produccion', name: 'Personaje de Película Icónico', emoji: '🎬', pitch: 'Elige un clásico (Beetlejuice, Merlina, Freddy) y hazlo completo.', pieces: ['Vestuario del personaje', 'Peluca', 'Accesorio característico', 'Maquillaje del personaje'], costRange: '$20.000 - $50.000 (arriendo)', difficulty: 2, beautyTip: 'Copia el maquillaje de una foto de referencia, paso a paso.', groupTip: 'En grupo: el elenco completo de una misma película.' },
  ],
  elegante: [
    { tier: 'basico', name: 'Máscara Veneciana', emoji: '🎭', pitch: 'Tu mejor ropa elegante + un antifaz: misterio instantáneo.', pieces: ['Ropa elegante oscura', 'Antifaz veneciano', 'Guantes o joyas'], costRange: '$3.000 - $10.000', difficulty: 1, beautyTip: 'Ojos dorados o metálicos que combinen con el antifaz.', groupTip: 'En pareja: antifaces a juego en dorado y negro.' },
    { tier: 'intermedio', name: 'Bruja Moderna', emoji: '🧙‍♀️', pitch: 'Negro total, sombrero de ala ancha y cristales.', pieces: ['Vestido o traje negro', 'Sombrero de bruja de ala ancha', 'Collar con cristal', 'Botas negras'], costRange: '$10.000 - $25.000', difficulty: 2, beautyTip: 'Labio oscuro y delineado gráfico.', groupTip: 'En grupo: un aquelarre, cada una con un cristal de color distinto.' },
    { tier: 'produccion', name: 'Reina/Rey de las Sombras', emoji: '👑', pitch: 'Capa, corona y tela con brillo: realeza gótica para la noche.', pieces: ['Capa larga de terciopelo', 'Corona o tiara oscura', 'Vestuario de gala negro', 'Guantes largos', 'Joyas llamativas'], costRange: '$25.000 - $70.000 (arriendo o confección)', difficulty: 3, beautyTip: 'Contorno marcado, iluminador plateado y labio negro o borgoña.', groupTip: 'En pareja: rey y reina de las sombras, coronas iguales.' },
  ],
};

export function fallbackResult(vibe: OracleVibe): OracleResult {
  return {
    intro: 'Las cartas hablaron... estas son tus tres visiones para la noche.',
    cards: FALLBACK[vibe],
    fallback: true,
  };
}

function buildSystemPrompt(): string {
  return `Eres "El Oráculo de Disfraces" de Mansion Playroom, una fiesta liberal +18 en la Región de Valparaíso, Chile.
La próxima fiesta es el 2º Aniversario, ${EVENT_BRAND.fechaTexto}, la noche antes de Halloween.
Código de vestimenta oficial: "${EVENT_BRAND.dressCode}"

Tu trabajo: recomendar 3 disfraces concretos y realizables para una persona según sus respuestas, en este orden:
1. "basico": armable con lo que ya tiene en casa (o casi), costo cercano a $0.
2. "intermedio": su ropa + algunos accesorios comprados.
3. "produccion": un disfraz más producido que se puede arrendar o mandar a confeccionar.

Reglas:
- Español chileno, tono misterioso, divertido y cálido. Nada de spanglish.
- Respeta la vibra y el nivel de piel que eligió. "Sexy" puede ser sensual y atrevido, pero NUNCA explícito ni vulgar.
- Valores de la marca: respeto, consentimiento y libertad. Nada ofensivo, nada que se burle de etnias, religiones reales de forma hiriente ni culturas (evita disfraces de apropiación cultural).
- Usa lo que la persona dijo que tiene a mano en la carta básica.
- Costos realistas en pesos chilenos (CLP), formato "$5.000 - $15.000". Menciona dónde conseguir cuando aporte: tiendas de disfraces, ferias, Mercado Libre, tiendas de ropa usada, arriendo de disfraces.
- Si va en pareja o grupo, "groupTip" explica cómo combinar el disfraz; si va solo/a, deja "groupTip" vacío.
- Cada disfraz debe ser distinto entre sí (no 3 variantes del mismo).
- Responde SOLO con el JSON pedido.`;
}

function buildUserPrompt(a: OracleAnswers): string {
  const items = a.items.length ? a.items.map((i) => ORACLE_LABELS.items[i]).join(', ') : 'Nada especial';
  return [
    `Vibra: ${ORACLE_LABELS.vibe[a.vibe]}`,
    `Va: ${ORACLE_LABELS.company[a.company]}`,
    `Nivel de producción que busca: ${ORACLE_LABELS.level[a.level]}`,
    `Cuánta piel quiere mostrar: ${ORACLE_LABELS.skin[a.skin]}`,
    `Tiene a mano: ${items}`,
    a.extra?.trim() ? `Algo más que le contó al oráculo: """${a.extra.trim()}"""` : '',
  ].filter(Boolean).join('\n');
}

/** Valida y ordena lo que devolvió el modelo -- si algo no calza (menos de 3
 * cartas, tiers raros), se considera respuesta inválida y cae al fallback. */
function normalize(raw: any): OracleResult | null {
  if (!raw || !Array.isArray(raw.cards)) return null;
  const cards: CostumeCard[] = [];
  for (const tier of TIERS) {
    const c = raw.cards.find((x: any) => x?.tier === tier);
    if (!c || typeof c.name !== 'string' || !c.name.trim()) return null;
    cards.push({
      tier,
      name: String(c.name).slice(0, 80),
      emoji: String(c.emoji || '🎭').slice(0, 8),
      pitch: String(c.pitch || '').slice(0, 300),
      pieces: (Array.isArray(c.pieces) ? c.pieces : []).map((p: any) => String(p).slice(0, 100)).slice(0, 6),
      costRange: String(c.costRange || '').slice(0, 60),
      difficulty: Math.min(3, Math.max(1, Math.round(Number(c.difficulty) || 1))),
      beautyTip: String(c.beautyTip || '').slice(0, 200),
      groupTip: String(c.groupTip || '').slice(0, 200),
    });
  }
  return { intro: String(raw.intro || '').slice(0, 200), cards, fallback: false };
}

export async function generateCostumeIdeas(answers: OracleAnswers): Promise<OracleResult> {
  try {
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(answers) },
      ],
      responseFormat: { type: 'json_schema', json_schema: COSTUME_ORACLE_SCHEMA as any },
      maxTokens: 1500,
    });
    const text = extractContent(result.choices[0]?.message ?? { content: '' });
    return normalize(JSON.parse(text)) ?? fallbackResult(answers.vibe);
  } catch (err) {
    console.warn('[costumeOracle] IA no disponible, se usa el catálogo estático:', err instanceof Error ? err.message : err);
    return fallbackResult(answers.vibe);
  }
}
