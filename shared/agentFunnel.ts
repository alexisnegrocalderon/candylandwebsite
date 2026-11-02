/* Embudo de ventas del agente: de la conversación a la compra. Acá vive lo
 * PURO (etapas, porcentajes y dónde se cae más gente) para probarlo sin base;
 * los conteos salen de `getAgentFunnel` (server/db.ts). */

export interface AgentFunnelCounts {
  /** Conversaciones con mensajes entrantes en el período. */
  conversations: number;
  /** De esas, las que preguntaron precio, entradas o cómo comprar. */
  interested: number;
  /** A las que el agente les mandó un botón de compra. */
  buttonSent: number;
  /** Tocaron el botón (clic contado por conversación). */
  clicked: number;
  /** Órdenes iniciadas con un botón del agente (cualquier estado). */
  checkoutStarted: number;
  /** Compras aprobadas atribuidas al agente (por el botón o por el @ de Instagram). */
  paid: number;
  paidByButton: number;
  paidByHandle: number;
  revenue: number;
}

export interface FunnelStage {
  key: 'conversations' | 'interested' | 'buttonSent' | 'clicked' | 'checkoutStarted' | 'paid';
  label: string;
  count: number;
  /** % respecto de la etapa anterior (null en la primera o si la anterior es 0). */
  ofPrevious: number | null;
}

const STAGES: { key: FunnelStage['key']; label: string }[] = [
  { key: 'conversations', label: 'Conversaciones' },
  { key: 'interested', label: 'Preguntaron por entradas' },
  { key: 'buttonSent', label: 'Recibieron el botón de compra' },
  { key: 'clicked', label: 'Tocaron el botón' },
  { key: 'checkoutStarted', label: 'Empezaron a pagar' },
  { key: 'paid', label: 'Compraron' },
];

export function funnelStages(c: AgentFunnelCounts): FunnelStage[] {
  return STAGES.map((s, i) => {
    const count = c[s.key];
    const prev = i === 0 ? null : c[STAGES[i - 1].key];
    return { key: s.key, label: s.label, count, ofPrevious: prev && prev > 0 ? Math.round((count / prev) * 100) : null };
  });
}

/** La etapa donde se pierde la mayor parte de la gente (la de menor % respecto
 * de la anterior, con al menos 3 personas en la etapa previa para no mirar ruido). */
export function biggestDrop(stages: FunnelStage[]): FunnelStage | null {
  let worst: FunnelStage | null = null;
  for (let i = 1; i < stages.length; i++) {
    const prev = stages[i - 1].count;
    const st = stages[i];
    if (prev < 3 || st.ofPrevious == null) continue;
    if (!worst || st.ofPrevious < (worst.ofPrevious ?? 101)) worst = st;
  }
  return worst;
}

/** Qué hacer según dónde está la caída (texto para el panel y el coach). */
export const DROP_ADVICE: Record<FunnelStage['key'], string> = {
  conversations: '',
  interested: 'Muchos escriben pero pocos preguntan por entradas: conviene que el agente lleve la conversación al precio antes (ver la regla de los dos mensajes).',
  buttonSent: 'Preguntan por entradas pero no reciben el botón: el agente se está demorando en ofrecerlo o deriva demasiado.',
  clicked: 'Reciben el botón pero no lo tocan: probar un mensaje más claro (precio + «toca el botón») o un seguimiento más temprano.',
  checkoutStarted: 'Tocan el botón pero no llegan a pagar: revisar el checkout en el celular (pasos, datos de acompañantes) y acompañar con el rescate de compra.',
  paid: 'Empiezan a pagar pero no terminan: problemas con la tarjeta o dudas de último minuto; el rescate de compra abandonada ayuda acá.',
};
