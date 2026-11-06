/* Asistente IA del panel: lo que comparten el servidor (server/assistant/) y la pantalla (client/src/components/assistant/). */

/** Un gráfico que el asistente pide dibujar con datos que ya consultó. */
export interface AssistantChart {
  titulo: string;
  tipo: 'barras' | 'lineas';
  unidad: 'CLP' | 'unidades' | '%' | null;
  serie: { etiqueta: string; valor: number }[];
}

/** Una acción que el asistente propone y que solo se ejecuta si el dueño la confirma. */
export type AssistantActionInput =
  | { tipo: 'regalar'; evento_id: number; correos: string[]; items: { ticket_type_id: number; cantidad: number }[]; modo: 'directo' | 'pase'; cualquier_evento: boolean; mensaje: string | null }
  | { tipo: 'cupon'; correo: string; descuento: 'percentage' | 'fixed'; valor: number; dias: number; titulo: string | null; evento_id: number | null }
  | { tipo: 'push'; correo: string; titulo: string; texto: string };

export interface AssistantProposal {
  id: string;
  /** Lo que se va a hacer, en una frase para la tarjeta de confirmación. */
  resumen: string;
  accion: AssistantActionInput;
  /** A quién va (nombre y correo del contacto, para corroborar; no se edita). */
  para?: AssistantRecipient[];
  estado: 'pendiente' | 'hecha' | 'cancelada' | 'fallida';
  resultado?: string;
}

/** Una pregunta con botones: cuando hay varias personas o tragos que podrían ser, el dueño toca el correcto. */
export interface AssistantChoice {
  pregunta: string;
  opciones: { valor: string; titulo: string; detalle: string | null }[];
}

/** A quién va una acción, solo como información en la tarjeta de confirmar (nombre y correo). */
export interface AssistantRecipient { nombre: string | null; correo: string }

/** Un botón para ir a una pantalla del panel («llévame a…»). */
export interface AssistantLink { section: string; label: string }

/** Lo que la pantalla muestra de un mensaje. */
export interface AssistantUi {
  text: string;
  charts?: AssistantChart[];
  proposals?: AssistantProposal[];
  links?: AssistantLink[];
  choices?: AssistantChoice[];
  /** De qué herramientas salieron los datos (para los chips de «fuente»). */
  sources?: string[];
  error?: boolean;
}

export interface AssistantMessageView { id: number; role: 'user' | 'assistant'; ui: AssistantUi; createdAt: string }

/** Nombre legible de cada herramienta (chips de fuente y «Revisando…»). */
export const TOOL_LABELS: Record<string, string> = {
  abrir_seccion: 'el panel',
  elegir_opciones: 'opciones por elegir',
  listar_eventos: 'eventos',
  productos_evento: 'entradas y carta',
  resultados_evento: 'ventas del evento',
  finanzas_evento: 'finanzas del evento',
  en_vivo: 'la noche en vivo',
  finanzas_empresa: 'resultado de la empresa',
  por_pagar: 'cuentas por pagar',
  comparar_eventos: 'comparación de fiestas',
  gastos: 'gastos',
  clientes: 'clientes',
  cliente: 'ficha del cliente',
  stock_barra: 'stock de barra',
  compras_necesarias: 'lista de compras',
  consumo_evento: 'consumo del evento',
  staff: 'staff',
  regalos: 'regalos y cortesías',
  mostrar_grafico: 'gráfico',
  proponer_accion: 'acción por confirmar',
};

/** Una conversación larga se corta aquí: se ofrece empezar otra (repetirla entera sale caro y lento). */
export const ASSISTANT_MAX_EXCHANGES = 30;
export const ASSISTANT_QUESTION_MAX = 2000;

/** Título de una conversación a partir de su primera pregunta. */
export function threadTitle(question: string): string {
  const t = question.replace(/\s+/g, ' ').trim();
  return t.length > 70 ? `${t.slice(0, 67).trimEnd()}…` : t || 'Conversación';
}
