/**
 * Forma de la extracción de IA a partir de una foto de boleta/factura (ver
 * server/receiptScan.ts). Compartida para que el cliente tipe la respuesta
 * de `expenses.scanReceipt` sin duplicar el shape.
 *
 * Sin `null` a propósito -- mismo criterio que RESPONSE_SCHEMA en
 * server/instagramAgent.ts (comentario ahí: la salida estructurada de
 * Claude no soporta bien uniones tipo `["string","null"]`/`anyOf`). Un campo
 * "no se pudo leer" usa un sentinel vacío ('', 0) en vez de null; el cliente
 * solo pisa el campo del formulario si vino un valor no vacío.
 */
import type { ExpenseCategory, ExpenseDocumentType } from './expenses';

export type ReceiptScanResult = {
  /** false si la foto no se parece a una boleta/factura legible -- el resto
   * de los campos vienen vacíos/en 0 y no hay que rellenar nada. */
  isReceipt: boolean;
  amountTotal: number; // CLP, bruto, IVA incluido si corresponde. 0 = no se leyó.
  documentType: ExpenseDocumentType; // 'sin_documento' si no queda claro cuál es
  documentNumber: string; // '' si no se ve folio
  expenseDate: string; // "YYYY-MM-DD", '' si no se leyó
  supplier: string; // '' si no se ve
  supplierRut: string; // '' si no se ve
  category: ExpenseCategory; // 'otros' si no queda claro
  description: string; // resumen corto, ej. "Hielo y bebidas"
  ivaExempt: boolean;
  confidence: 'alta' | 'media' | 'baja';
  notes: string; // '' si no hay nada que avisar, si no una frase corta
};

const EXPENSE_CATEGORY_VALUES = [
  'decoracion', 'barra', 'merch', 'staff', 'produccion', 'arriendo',
  'marketing', 'transporte', 'suscripciones', 'comisiones', 'otros',
];
const EXPENSE_DOCUMENT_TYPE_VALUES = ['boleta', 'factura', 'boleta_honorarios', 'sin_documento'];

/** json_schema para responseFormat de invokeLLM (server/_core/llm.ts) --
 * mismo patrón que RESPONSE_SCHEMA/INSTAGRAM_RESPONSE_SCHEMA en
 * server/instagramAgent.ts (sin campos nullable, sin maxLength/maxItems). */
export const RECEIPT_SCAN_SCHEMA = {
  name: 'receipt_scan',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      isReceipt: {
        type: 'boolean',
        description: 'true si la foto muestra una boleta/factura/documento de compra legible.',
      },
      amountTotal: {
        type: 'number',
        description: 'Monto TOTAL pagado, bruto (con IVA incluido si aplica), como entero en pesos chilenos. 0 si no se pudo leer.',
      },
      documentType: { type: 'string', enum: EXPENSE_DOCUMENT_TYPE_VALUES },
      documentNumber: { type: 'string', description: 'Folio del documento. Vacío si no se ve.' },
      expenseDate: { type: 'string', description: 'Fecha impresa en el documento, formato YYYY-MM-DD. Vacío si no se ve.' },
      supplier: { type: 'string', description: 'Nombre del negocio/proveedor. Vacío si no se ve.' },
      supplierRut: { type: 'string', description: 'RUT del proveedor, formato 12.345.678-9. Vacío si no se ve.' },
      category: { type: 'string', enum: EXPENSE_CATEGORY_VALUES },
      description: { type: 'string', description: 'Resumen corto (máx. 6 palabras) de qué se compró.' },
      ivaExempt: { type: 'boolean', description: 'true si el documento dice EXENTA/EXENTO.' },
      confidence: { type: 'string', enum: ['alta', 'media', 'baja'] },
      notes: { type: 'string', description: 'Vacío si todo se ve claro, o una frase corta avisando qué revisar.' },
    },
    required: [
      'isReceipt', 'amountTotal', 'documentType', 'documentNumber', 'expenseDate',
      'supplier', 'supplierRut', 'category', 'description', 'ivaExempt', 'confidence', 'notes',
    ],
    additionalProperties: false,
  },
} as const;
