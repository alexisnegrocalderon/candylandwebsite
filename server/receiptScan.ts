import { invokeLLM, extractContent } from './_core/llm';
import { EXPENSE_CATEGORIES, EXPENSE_DOCUMENT_TYPES } from '../shared/expenses';
import { RECEIPT_SCAN_SCHEMA, type ReceiptScanResult } from '../shared/receiptScan';

/** Lee una foto de boleta/factura con IA y devuelve los campos del gasto ya
 * extraídos, para que ExpenseForm (Dashboard.tsx) los precargue -- el admin
 * siempre revisa y confirma antes de guardar, esto nunca escribe en la BD.
 * Primer llamador de invokeLLM que manda una imagen (ver el fix de
 * toAnthropicContent en server/_core/llm.ts). */
export async function scanReceiptImage(imageUrl: string): Promise<ReceiptScanResult> {
  const categoriesList = EXPENSE_CATEGORIES.map((c) => `- ${c.value}: ${c.label}`).join('\n');
  const docTypesList = EXPENSE_DOCUMENT_TYPES.map((d) => `- ${d.value}: ${d.label}`).join('\n');

  const systemPrompt = `Eres un asistente que lee boletas y facturas chilenas (documentos del SII) desde una foto y extrae sus datos en JSON estructurado.

Vocabulario de documentos (elige uno de estos valores exactos para "documentType"):
${docTypesList}
- Una "Boleta Electrónica" impresa dice justamente eso. Una "Factura Electrónica" dice eso. Una "Boleta de Honorarios Electrónica" (BHE) es para servicios profesionales, no lleva IVA, lleva retención. Si no se ve ningún documento formal, usa "sin_documento".
- Solo una factura NO exenta da crédito fiscal. Si el documento dice "EXENTA" o "EXENTO", marca ivaExempt=true.
- Si la foto no trae ningún documento de compra (es otra cosa, o es ilegible), pon isReceipt=false, amountTotal=0, todos los campos de texto en "" (string vacío, nunca null) y explica por qué en "notes".
- Ningún campo puede ser null: si no se lee un dato, usa "" para texto, 0 para números, "otros" para category y "sin_documento" para documentType.

Categorías de gasto (elige la que mejor calce para "category", o null si no es claro):
${categoriesList}

Reglas:
- "amountTotal" es el monto TOTAL pagado (bruto, con IVA incluido si aplica), como número entero en pesos chilenos, sin puntos ni símbolo.
- "expenseDate" en formato "YYYY-MM-DD", tomado de la fecha impresa en el documento (no inventes la fecha de hoy).
- "supplierRut" en formato "12.345.678-9" si se ve, o null si no aparece.
- "description" es un resumen corto (máx. 6 palabras) de qué se compró, en español, ej. "Hielo y bebidas" o "Arriendo de luces".
- "confidence": "alta" si los datos clave (monto, tipo de documento) se leen con claridad; "media" si hay alguna duda razonable; "baja" si la foto está borrosa/incompleta.
- "notes": null si todo está claro, o una frase corta avisando qué revisar (ej. "el monto final está tapado por un dedo, confírmalo").
- Responde SOLO con el JSON pedido, ningún texto extra.`;

  const result = await invokeLLM({
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extrae los datos de esta boleta o factura.' },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ],
    responseFormat: { type: 'json_schema', json_schema: RECEIPT_SCAN_SCHEMA as any },
    maxTokens: 1024,
  });

  const text = extractContent(result.choices[0]?.message ?? { content: '' });
  return JSON.parse(text) as ReceiptScanResult;
}
