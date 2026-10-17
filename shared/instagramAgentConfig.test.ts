import { describe, expect, it } from 'vitest';
import { normalizeIgUsername, normalizeInstagramAgentConfig } from './instagramAgentConfig';

describe('normalizeIgUsername', () => {
  it('saca la @, los espacios y las mayúsculas', () => {
    expect(normalizeIgUsername('  @Otra.Organizadora ')).toBe('otra.organizadora');
  });

  it('descarta lo que no es un usuario de Instagram', () => {
    expect(normalizeIgUsername('no es un usuario')).toBe('');
    expect(normalizeIgUsername(null)).toBe('');
  });
});

describe('trustedAccounts en la config del agente', () => {
  it('arranca vacía en una config vieja', () => {
    expect(normalizeInstagramAgentConfig({}).trustedAccounts).toEqual([]);
  });

  it('normaliza y quita repetidos e inválidos', () => {
    const config = normalizeInstagramAgentConfig({ trustedAccounts: ['@Otra.Org', 'otra.org', 'con espacio', 42] });
    expect(config.trustedAccounts).toEqual(['otra.org']);
  });
});
