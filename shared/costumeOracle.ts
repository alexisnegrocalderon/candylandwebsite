/**
 * Oráculo de Disfraces (/disfraces): las respuestas del visitante, la forma
 * de las 3 cartas que devuelve la IA y el json_schema estricto que se le
 * pasa a invokeLLM. Compartido entre client y server para no duplicar los
 * enums de las preguntas.
 *
 * Sin `null` en el schema, mismo criterio que shared/receiptScan.ts: la
 * salida estructurada de Claude no se lleva bien con uniones nullables.
 */

export const ORACLE_VIBES = ['sexy', 'terror', 'divertido', 'elegante'] as const;
export const ORACLE_COMPANY = ['solo', 'pareja', 'grupo'] as const;
export const ORACLE_LEVELS = ['casa', 'accesorios', 'produccion'] as const;
export const ORACLE_SKIN = ['poca', 'algo', 'mucha'] as const;
export const ORACLE_ITEMS = [
  'negro', 'lenceria', 'cuero', 'blanco', 'rojo', 'disfraz_viejo', 'maquillaje', 'nada',
] as const;

export type OracleVibe = typeof ORACLE_VIBES[number];
export type OracleCompany = typeof ORACLE_COMPANY[number];
export type OracleLevel = typeof ORACLE_LEVELS[number];
export type OracleSkin = typeof ORACLE_SKIN[number];
export type OracleItem = typeof ORACLE_ITEMS[number];

export type OracleAnswers = {
  vibe: OracleVibe;
  company: OracleCompany;
  level: OracleLevel;
  skin: OracleSkin;
  items: OracleItem[];
  extra?: string;
};

export const ORACLE_EXTRA_MAX = 200;

/** Textos legibles de cada opción -- los usa la UI para las tarjetas y el
 * server para armar el prompt, así la IA lee lo mismo que vio la persona. */
export const ORACLE_LABELS = {
  vibe: { sexy: 'Sexy / seductor', terror: 'Terror', divertido: 'Divertido', elegante: 'Elegante / misterioso' },
  company: { solo: 'Solo/a', pareja: 'En pareja', grupo: 'En grupo' },
  level: { casa: 'Con lo que tengo en casa', accesorios: 'Compro algunos accesorios', produccion: 'Full producción (arriendo o confección)' },
  skin: { poca: 'Poca piel', algo: 'Algo de piel', mucha: 'Mucha piel' },
  items: {
    negro: 'Ropa negra', lenceria: 'Lencería', cuero: 'Cuero / látex', blanco: 'Ropa blanca',
    rojo: 'Algo rojo', disfraz_viejo: 'Un disfraz viejo', maquillaje: 'Maquillaje', nada: 'Nada especial',
  },
} as const;

export type CostumeCard = {
  tier: 'basico' | 'intermedio' | 'produccion';
  name: string;
  emoji: string;
  pitch: string;
  pieces: string[];
  costRange: string;
  difficulty: number;
  beautyTip: string;
  groupTip: string;
};

export type OracleResult = {
  intro: string;
  cards: CostumeCard[];
  /** true si la respuesta viene del catálogo estático (la IA falló o no está configurada). */
  fallback: boolean;
};

export const COSTUME_ORACLE_SCHEMA = {
  name: 'oraculo_disfraces',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      intro: { type: 'string', description: 'Frase corta y misteriosa del oráculo presentando las 3 cartas (máx. 20 palabras).' },
      cards: {
        type: 'array',
        description: 'Exactamente 3 cartas, en orden: basico, intermedio, produccion.',
        items: {
          type: 'object',
          properties: {
            tier: { type: 'string', enum: ['basico', 'intermedio', 'produccion'] },
            name: { type: 'string', description: 'Nombre del disfraz, corto y evocador.' },
            emoji: { type: 'string', description: 'Un solo emoji que lo represente.' },
            pitch: { type: 'string', description: '1-2 frases describiendo el look.' },
            pieces: { type: 'array', items: { type: 'string' }, description: '3 a 6 prendas/accesorios concretos.' },
            costRange: { type: 'string', description: 'Rango de costo estimado en pesos chilenos, ej. "$0 - $10.000".' },
            difficulty: { type: 'number', description: '1 (fácil) a 3 (difícil).' },
            beautyTip: { type: 'string', description: 'Tip corto de maquillaje o peinado.' },
            groupTip: { type: 'string', description: 'Cómo combinarlo en pareja/grupo. Vacío si va solo/a.' },
          },
          required: ['tier', 'name', 'emoji', 'pitch', 'pieces', 'costRange', 'difficulty', 'beautyTip', 'groupTip'],
          additionalProperties: false,
        },
      },
    },
    required: ['intro', 'cards'],
    additionalProperties: false,
  },
} as const;
