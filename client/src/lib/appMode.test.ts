import { describe, expect, it } from 'vitest';
import { decideAppMode, isCrawler, isPhoneBrowser } from './appMode';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const INSTAGRAM = `${IPHONE} Instagram 350.0.0.0`;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const base = { installed: false, webdriver: false, forced: null } as const;

describe('modo app', () => {
  it('los teléfonos ven la app; computadores y tablets, el sitio', () => {
    expect(isPhoneBrowser(IPHONE)).toBe(true);
    expect(isPhoneBrowser(INSTAGRAM)).toBe(true);
    expect(isPhoneBrowser(ANDROID)).toBe(true);
    expect(isPhoneBrowser(ANDROID_TABLET)).toBe(false);
    expect(isPhoneBrowser(MAC)).toBe(false);
    expect(decideAppMode({ ...base, ua: INSTAGRAM })).toBe(true);
    expect(decideAppMode({ ...base, ua: MAC })).toBe(false);
  });

  it('Google y las vistas previas de links siguen viendo el sitio', () => {
    expect(isCrawler(GOOGLEBOT)).toBe(true);
    expect(decideAppMode({ ...base, ua: GOOGLEBOT })).toBe(false);
    expect(decideAppMode({ ...base, ua: IPHONE, webdriver: true })).toBe(false);
  });

  it('la app instalada siempre es app, y ?app=1 / ?sitio=1 mandan', () => {
    expect(decideAppMode({ ...base, ua: MAC, installed: true })).toBe(true);
    expect(decideAppMode({ ...base, ua: MAC, forced: 'app' })).toBe(true);
    expect(decideAppMode({ ...base, ua: IPHONE, forced: 'sitio' })).toBe(false);
  });
});
