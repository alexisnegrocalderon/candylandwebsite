import { describe, expect, it } from 'vitest';
import { PERSONAL_HANDOFF_REASON } from './instagramAgentConfig';
import { buildKnowledgeBlock, classifyHandoffNoise, cleanFactText, hasPersonalData, KNOWLEDGE_PROMPT_MAX_CHARS, statusForNewFact } from './agentKnowledge';

describe('classifyHandoffNoise', () => {
  it('descarta adjuntos, mensajes personales y solo emojis', () => {
    expect(classifyHandoffNoise({ incomingText: '', reason: 'Llegó un adjunto sin texto (reel, foto, audio)' })).toBe('adjunto');
    expect(classifyHandoffNoise({ incomingText: 'HOLIS 🌷 Bienvenid@ Dime Miyu', reason: PERSONAL_HANDOFF_REASON })).toBe('personal');
    expect(classifyHandoffNoise({ incomingText: '👏', reason: 'La IA no pudo responder' })).toBe('emoji');
    expect(classifyHandoffNoise({ incomingText: '...!!', reason: 'x' })).toBe('emoji');
  });
  it('deja pasar las preguntas reales', () => {
    expect(classifyHandoffNoise({ incomingText: '¿Hay estacionamiento?', reason: 'La IA no pudo responder' })).toBeNull();
    expect(classifyHandoffNoise({ incomingText: 'ok', reason: 'No supo' })).toBe('emoji'); // demasiado corto para aprender algo
  });
});

describe('hasPersonalData', () => {
  it('detecta correos, teléfonos, RUT y @ de personas', () => {
    expect(hasPersonalData('escríbele a ana@gmail.com')).toBe(true);
    expect(hasPersonalData('su celular es +56 9 1234 5678')).toBe(true);
    expect(hasPersonalData('su rut 12.345.678-5')).toBe(true);
    expect(hasPersonalData('instagram: @camila_r')).toBe(true);
  });
  it('no confunde datos de la fiesta', () => {
    expect(hasPersonalData('El estacionamiento cuesta $5.000 y abre a las 22:00')).toBe(false);
    expect(hasPersonalData('Hay 2 pistas y la fiesta termina a las 5 am')).toBe(false);
    expect(hasPersonalData('Síguenos en instagram: @mansionplayroom.cl')).toBe(false);
  });
});

describe('estado de un dato nuevo', () => {
  it('lo del dueño queda activo; lo aprendido solo pasa por revisión si toca precios o reglas', () => {
    expect(statusForNewFact('precios', 'dueno')).toBe('activo');
    expect(statusForNewFact('general', 'respuesta')).toBe('activo');
    expect(statusForNewFact('precios', 'respuesta')).toBe('revisar');
    expect(statusForNewFact('reglas', 'respuesta')).toBe('revisar');
  });
});

describe('bloque para el prompt', () => {
  it('vacío sin datos, con tope de caracteres y sin romper los datos', () => {
    expect(buildKnowledgeBlock([])).toEqual([]);
    const block = buildKnowledgeBlock([{ text: 'Hay guardarropía gratis.' }, { text: 'Se puede pagar con PlayCard.' }]);
    expect(block[0]).toContain('LO QUE HAS APRENDIDO');
    expect(block.slice(1, 3)).toEqual(['- Hay guardarropía gratis.', '- Se puede pagar con PlayCard.']);
    const many = buildKnowledgeBlock(Array.from({ length: 40 }, () => ({ text: 'x'.repeat(500) })));
    expect(many.join('\n').length).toBeLessThan(KNOWLEDGE_PROMPT_MAX_CHARS + 600);
  });
  it('limpia espacios y acota el texto', () => {
    expect(cleanFactText('  hola   mundo \n ')).toBe('hola mundo');
    expect(cleanFactText('a'.repeat(900)).length).toBe(600);
  });
});
