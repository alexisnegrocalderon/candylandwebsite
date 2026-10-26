import { describe, expect, it } from 'vitest';
import { BRAND_BLOCKS, SALES_BLOCKS, joinBlocks, splitBlocks } from './agentKnowledgeBlocks';

const sales = `TIPOS DE CLIENTE Y CÓMO ACOMPAÑAR A CADA UNO:
- Primera vez: calidez.
- Pareja curiosa: en plural.

OBJECIONES TÍPICAS:
- "Está caro": mostrar lo que incluye.`;

describe('splitBlocks / joinBlocks', () => {
  it('separa Tipos de cliente y Objeciones y vuelve a juntar el mismo texto', () => {
    const { rest, blocks } = splitBlocks(sales, SALES_BLOCKS);
    expect(rest).toBe('');
    expect(blocks.clientTypes).toBe('- Primera vez: calidez.\n- Pareja curiosa: en plural.');
    expect(blocks.objections).toBe('- "Está caro": mostrar lo que incluye.');
    expect(joinBlocks(rest, blocks, SALES_BLOCKS)).toBe(sales);
  });

  it('lo de antes de la primera sección queda en «resto» y no se pierde', () => {
    const text = `Regla general: siempre amable.\n\n${sales}`;
    const { rest, blocks } = splitBlocks(text, SALES_BLOCKS);
    expect(rest).toBe('Regla general: siempre amable.');
    expect(joinBlocks(rest, blocks, SALES_BLOCKS)).toBe(text);
  });

  it('reconoce el encabezado sin tildes, en minúsculas o con otra redacción', () => {
    const { blocks } = splitBlocks('Objeciones comunes:\n- precio', SALES_BLOCKS);
    expect(blocks.objections).toBe('- precio');
  });

  it('un encabezado desconocido se queda dentro del bloque en que está', () => {
    const { blocks } = splitBlocks('OBJECIONES TÍPICAS:\n- precio\nOTRO TEMA:\n- algo', SALES_BLOCKS);
    expect(blocks.objections).toBe('- precio\nOTRO TEMA:\n- algo');
  });

  it('un texto sin secciones es todo «resto» (marca y tono)', () => {
    const text = 'Mansion Playroom es una productora.\nTono: cercano.';
    const { rest, blocks } = splitBlocks(text, BRAND_BLOCKS);
    expect(rest).toBe(text);
    expect(blocks.faq).toBe('');
    expect(joinBlocks(rest, blocks, BRAND_BLOCKS)).toBe(text);
  });

  it('un bloque que se vacía no deja su encabezado', () => {
    expect(joinBlocks('Marca.', { faq: '' }, BRAND_BLOCKS)).toBe('Marca.');
    expect(joinBlocks('Marca.', { faq: '¿Hay guardarropía? Sí.' }, BRAND_BLOCKS)).toBe('Marca.\n\nPREGUNTAS FRECUENTES:\n¿Hay guardarropía? Sí.');
  });

  it('«Tono:» y otras líneas con dos puntos no se confunden con una sección', () => {
    const { rest, blocks } = splitBlocks('Tono: cercano, chileno.', BRAND_BLOCKS);
    expect(rest).toBe('Tono: cercano, chileno.');
    expect(blocks.faq).toBe('');
  });
});
