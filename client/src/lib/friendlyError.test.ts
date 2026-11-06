import { describe, expect, it } from 'vitest';
import { friendlyMessage } from './friendlyError';

describe('friendlyMessage', () => {
  it('saca el texto de un error de validación en JSON', () => {
    const raw = JSON.stringify([{ code: 'custom', message: 'El link propio tiene que ser https y de mansionplayroom.cl.', path: ['button'] }]);
    expect(friendlyMessage(raw)).toBe('El link propio tiene que ser https y de mansionplayroom.cl.');
  });
  it('junta varios mensajes sin repetir', () => {
    const raw = JSON.stringify([{ message: 'Falta el nombre' }, { message: 'Falta el correo' }, { message: 'Falta el nombre' }]);
    expect(friendlyMessage(raw)).toBe('Falta el nombre\nFalta el correo');
  });
  it('deja intacto un mensaje normal o un JSON sin mensajes', () => {
    expect(friendlyMessage('No se pudo guardar')).toBe('No se pudo guardar');
    expect(friendlyMessage('[1,2]')).toBe('[1,2]');
    expect(friendlyMessage('[no es json')).toBe('[no es json');
  });
});
