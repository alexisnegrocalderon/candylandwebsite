import { describe, expect, it } from 'vitest';
import { pushErrorMessage } from './pushErrors';

describe('pushErrorMessage', () => {
  it('el error de la clienta («push service error») se explica y dice qué hacer', () => {
    const err = new DOMException('Registration failed - push service error', 'AbortError');
    const msg = pushErrorMessage(err);
    expect(msg).not.toMatch(/Registration failed/);
    expect(msg).toMatch(/otra red/);
    expect(msg).toMatch(/Google Play Services/);
  });

  it('un AbortError sin texto conocido también cae en el aviso de conexión', () => {
    expect(pushErrorMessage(new DOMException('', 'AbortError'))).toMatch(/otra red/);
  });

  it('permiso negado: dice que están bloqueados', () => {
    expect(pushErrorMessage(new DOMException('Registration failed - permission denied', 'NotAllowedError'))).toMatch(/bloqueados/);
  });

  it('el mismo texto lanzado como Error normal se traduce igual', () => {
    expect(pushErrorMessage(new Error('Registration failed - push service error'))).toMatch(/otra red/);
  });

  it('un error de nuestro servidor, que ya viene en español, se muestra tal cual', () => {
    expect(pushErrorMessage(new Error('Los avisos todavía no están disponibles.'))).toBe('Los avisos todavía no están disponibles.');
  });

  it('cualquier otra cosa en inglés o desconocida da el mensaje general, nunca el texto crudo', () => {
    expect(pushErrorMessage(new Error('Something went wrong'))).toMatch(/No se pudieron activar/);
    expect(pushErrorMessage(new DOMException('boom', 'InvalidStateError'))).toMatch(/No se pudieron activar/);
    expect(pushErrorMessage(undefined)).toMatch(/No se pudieron activar/);
    expect(pushErrorMessage('texto suelto')).toMatch(/No se pudieron activar/);
  });
});
