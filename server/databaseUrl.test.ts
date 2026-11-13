import { describe, expect, it } from 'vitest';
import { resolveDatabaseUrl, usingPreviewDatabase } from './databaseUrl';

const PROD = 'mysql://prod@host/real';
const TEST = 'mysql://test@host/pruebas';

describe('qué base usa la app', () => {
  it('producción usa DATABASE_URL, aunque PREVIEW_DATABASE_URL esté puesta', () => {
    const env = { VERCEL_ENV: 'production', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: TEST };
    expect(resolveDatabaseUrl(env)).toBe(PROD);
    expect(usingPreviewDatabase(env)).toBe(false);
  });
  it('producción nunca usa la de pruebas, ni siquiera si falta DATABASE_URL', () => {
    expect(resolveDatabaseUrl({ VERCEL_ENV: 'production', PREVIEW_DATABASE_URL: TEST })).toBeUndefined();
  });
  it('un Preview con PREVIEW_DATABASE_URL usa la base de pruebas', () => {
    const env = { VERCEL_ENV: 'preview', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: TEST };
    expect(resolveDatabaseUrl(env)).toBe(TEST);
    expect(usingPreviewDatabase(env)).toBe(true);
  });
  it('un Preview sin PREVIEW_DATABASE_URL (o vacía) sigue como antes', () => {
    expect(resolveDatabaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: PROD })).toBe(PROD);
    expect(resolveDatabaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: '' })).toBe(PROD);
    expect(resolveDatabaseUrl({ VERCEL_ENV: 'preview', DATABASE_URL: PROD, PREVIEW_DATABASE_URL: '   ' })).toBe(PROD);
  });
  it('sin VERCEL_ENV (desarrollo local, scripts) nunca cambia de base', () => {
    const env = { DATABASE_URL: PROD, PREVIEW_DATABASE_URL: TEST };
    expect(resolveDatabaseUrl(env)).toBe(PROD);
    expect(usingPreviewDatabase(env)).toBe(false);
    expect(resolveDatabaseUrl({ VERCEL_ENV: 'development', ...env })).toBe(PROD);
  });
  it('sin ninguna variable devuelve undefined (la app ya lo trata como «sin base»)', () => {
    expect(resolveDatabaseUrl({})).toBeUndefined();
  });
});
