import { describe, it, expect } from 'vitest';
import { eventImage, absoluteImageUrl, isBlockedBlobUrl, BLOCKED_BLOB_HOST } from './eventImage';

const BLOCKED = `https://${BLOCKED_BLOB_HOST}/events/123-flyer.jpeg`;
const NEW_STORE = 'https://abcd1234.public.blob.vercel-storage.com/events/999-flyer.jpeg';

describe('eventImage', () => {
  it('usa la copia local del 2º Aniversario cuando la URL está en el almacén bloqueado', () => {
    expect(eventImage('2do-aniversario-playroom', BLOCKED)).toBe('/candyland/flyer-aniversario.jpg');
  });
  it('devuelve null para un evento sin copia local cuya URL está bloqueada', () => {
    expect(eventImage('poolparty1', BLOCKED)).toBeNull();
  });
  it('deja pasar tal cual una URL del almacén nuevo, incluso del aniversario', () => {
    expect(eventImage('2do-aniversario-playroom', NEW_STORE)).toBe(NEW_STORE);
  });
  it('deja pasar rutas locales y devuelve null si no hay imagen', () => {
    expect(eventImage('candyland-agosto-2026', '/candyland/flyer-08-agosto.jpg')).toBe('/candyland/flyer-08-agosto.jpg');
    expect(eventImage('x', null)).toBeNull();
    expect(eventImage('x', '')).toBeNull();
  });
  it('isBlockedBlobUrl no se confunde con URLs inválidas', () => {
    expect(isBlockedBlobUrl('no es url')).toBe(false);
    expect(isBlockedBlobUrl(undefined)).toBe(false);
    expect(isBlockedBlobUrl(BLOCKED)).toBe(true);
  });
  it('absoluteImageUrl completa solo las rutas locales', () => {
    expect(absoluteImageUrl('/candyland/x.jpg')).toBe('https://mansionplayroom.cl/candyland/x.jpg');
    expect(absoluteImageUrl(NEW_STORE)).toBe(NEW_STORE);
    expect(absoluteImageUrl(null)).toBeNull();
  });
});
