import { describe, expect, it } from 'vitest';
import { canGift } from './gifts';

describe('canGift', () => {
  it('solo el administrador dueño puede regalar', () => {
    expect(canGift({ role: 'admin', email: 'contacto@mansionplayroom.cl' })).toBe(true);
    expect(canGift({ role: 'admin', email: ' Contacto@MansionPlayroom.cl ' })).toBe(true);
  });
  it('la sesión del panel (contraseña o correo + app autenticadora) no trae correo y es la del dueño', () => {
    expect(canGift({ role: 'admin', email: null })).toBe(true);
    expect(canGift({ role: 'admin' })).toBe(true);
  });
  it('otro correo, un viewer o un socio no pueden', () => {
    expect(canGift({ role: 'admin', email: 'otro@mansionplayroom.cl' })).toBe(false);
    expect(canGift({ role: 'viewer', email: 'contacto@mansionplayroom.cl' })).toBe(false);
    expect(canGift(null)).toBe(false);
    expect(canGift({ role: 'partner', email: null })).toBe(false);
  });
});
