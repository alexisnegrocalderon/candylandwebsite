import { describe, expect, it } from 'vitest';
import { canGift } from './gifts';

describe('canGift', () => {
  it('solo el administrador dueño puede regalar', () => {
    expect(canGift({ role: 'admin', email: 'contacto@mansionplayroom.cl' })).toBe(true);
    expect(canGift({ role: 'admin', email: ' Contacto@MansionPlayroom.cl ' })).toBe(true);
  });
  it('otro admin, un viewer o una sesión sin correo no pueden', () => {
    expect(canGift({ role: 'admin', email: 'otro@mansionplayroom.cl' })).toBe(false);
    expect(canGift({ role: 'viewer', email: 'contacto@mansionplayroom.cl' })).toBe(false);
    expect(canGift({ role: 'admin', email: null })).toBe(false);
    expect(canGift(null)).toBe(false);
  });
});
