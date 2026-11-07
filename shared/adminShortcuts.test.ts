import { describe, it, expect } from 'vitest';
import { normalizeShortcuts, DEFAULT_ADMIN_SHORTCUTS, ADMIN_SHORTCUTS_MAX } from './adminShortcuts';

describe('normalizeShortcuts', () => {
  it('sin lista guardada devuelve null (se usa la de siempre)', () => {
    expect(normalizeShortcuts(undefined)).toBeNull();
    expect(normalizeShortcuts('x')).toBeNull();
    expect(DEFAULT_ADMIN_SHORTCUTS.length).toBeGreaterThan(0);
  });
  it('descarta atajos sin nombre o con una sección inválida', () => {
    expect(normalizeShortcuts([
      { label: ' Gastos ', section: 'cargar-gasto' },
      { label: '', section: 'overview' },
      { label: 'Mala', section: '../admin' },
      null,
    ])).toEqual([{ label: 'Gastos', section: 'cargar-gasto' }]);
  });
  it('respeta el máximo y permite la lista vacía', () => {
    expect(normalizeShortcuts([])).toEqual([]);
    const many = Array.from({ length: ADMIN_SHORTCUTS_MAX + 5 }, (_, i) => ({ label: `a${i}`, section: 'home' }));
    expect(normalizeShortcuts(many)).toHaveLength(ADMIN_SHORTCUTS_MAX);
  });
});
