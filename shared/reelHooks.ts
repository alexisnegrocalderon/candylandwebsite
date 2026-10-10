/* Fórmulas de gancho para Reels (los primeros 2-3 segundos). Adaptadas al
 * español y a Playroom desde la idea de las 26 fórmulas del paquete
 * github.com/Jakeschincariol/instagram-agent-skill (MIT). La IA elige una por
 * gancho y el panel muestra cuál usó. Es para editarla. */

export interface ReelHookFormula {
  id: string;
  name: string;
  /** Plantilla con [huecos]. */
  template: string;
  /** Ejemplo para Playroom. */
  example: string;
}

export const REEL_HOOK_FORMULAS: ReelHookFormula[] = [
  { id: 'nadie-te-cuenta', name: 'Nadie te cuenta', template: 'Nadie te cuenta que [verdad incómoda o sorpresa]', example: 'Nadie te cuenta que la primera vez en Playroom lo más común es… solo mirar.' },
  { id: 'error-comun', name: 'El error que todos cometen', template: 'El error que comete [quien sea] en [situación]', example: 'El error que comete todo el que viene por primera vez a una fiesta liberal.' },
  { id: 'pregunta-directa', name: 'Pregunta directa', template: '¿[Pregunta que la persona se hace en silencio]?', example: '¿Se puede ir a Playroom solo a bailar? Sí, y pasa más de lo que crees.' },
  { id: 'numero-concreto', name: 'Número concreto', template: '[Número] [cosas] que [resultado]', example: '3 reglas de Playroom que nadie se salta.' },
  { id: 'antes-despues', name: 'Antes / después', template: 'Así llega la gente… y así se va', example: 'Así llega la gente a las 23:00. Así está a las 3 de la mañana.' },
  { id: 'mito-realidad', name: 'Mito vs. realidad', template: 'Mito: [creencia]. Realidad: [dato]', example: 'Mito: en una fiesta liberal todos tienen que hacer algo. Realidad: no.' },
  { id: 'detras-escena', name: 'Detrás de escena', template: 'Lo que pasa [antes / mientras] [momento] que nadie ve', example: 'Lo que pasa 6 horas antes de abrir la Mansión.' },
  { id: 'pov', name: 'POV', template: 'POV: [situación con la que se identifican]', example: 'POV: es tu primera vez y tu pareja ya está en la pista.' },
  { id: 'desafio', name: 'Desafío / quiz', template: '¿Cuántas de estas [cosas] sabías?', example: '¿Sabes jugar en Playroom? 3 preguntas, sin trampa.' },
  { id: 'cuenta-regresiva', name: 'Cuenta regresiva real', template: '[Tiempo] para [evento] y [dato real]', example: 'Faltan 9 días para el aniversario y ya cambió la tanda.' },
  { id: 'confesion', name: 'Confesión del equipo', template: 'Te confieso algo: [verdad de la productora]', example: 'Te confieso algo: la regla que más cuidamos no es la del disfraz.' },
  { id: 'opinion', name: 'Opinión que divide', template: '[Postura clara que no todos comparten]', example: 'Una fiesta sin reglas de consentimiento no es libre, es descuidada.' },
];

export const REEL_HOOK_IDS = REEL_HOOK_FORMULAS.map((f) => f.id);

export function hookFormulaName(id: string): string {
  return REEL_HOOK_FORMULAS.find((f) => f.id === id)?.name ?? 'Libre';
}
