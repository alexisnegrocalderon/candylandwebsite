import { afterEach, describe, expect, it, vi } from 'vitest';

const load = async () => { vi.resetModules(); return (await import('./const')).ADMIN_NOTIFICATION_EMAIL; };

describe('correo de avisos del admin', () => {
  afterEach(() => { delete process.env.ADMIN_NOTIFICATION_EMAIL; });

  it('sin la variable usa el de siempre', async () => {
    expect(await load()).toBe('contacto@mansionplayroom.cl');
  });

  it('con la variable, los avisos van a ese correo', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = '  Dueno@Ejemplo.cl ';
    expect(await load()).toBe('dueno@ejemplo.cl');
  });

  it('si la variable no es un correo, no se rompe: queda el de siempre', async () => {
    process.env.ADMIN_NOTIFICATION_EMAIL = 'no-es-un-correo';
    expect(await load()).toBe('contacto@mansionplayroom.cl');
  });
});
