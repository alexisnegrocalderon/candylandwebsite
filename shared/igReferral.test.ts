import { describe, expect, it } from 'vitest';
import { igMeLink, igReferralLabel, parseIgReferral, referralUtmContent } from './igReferral';

describe('igReferral', () => {
  it('link ig.me con código', () => {
    const r = parseIgReferral({ ref: 'flyer octubre', source: 'SHORTLINK', type: 'OPEN_THREAD' });
    expect(r).toEqual({ source: 'link', ref: 'flyer octubre', adTitle: null });
    expect(igReferralLabel(r!)).toBe('link «flyer octubre»');
    expect(referralUtmContent(r)).toBe('ref-flyer-octubre');
  });
  it('anuncio', () => {
    const r = parseIgReferral({ source: 'ADS', ad_id: '1234', ads_context_data: { ad_title: 'Halloween' } });
    expect(r).toEqual({ source: 'ad', ref: '1234', adTitle: 'Halloween' });
    expect(igReferralLabel(r!)).toBe('anuncio «Halloween»');
  });
  it('vacío o raro', () => {
    expect(parseIgReferral(null)).toBeNull();
    expect(parseIgReferral({})).toBeNull();
  });
  it('arma el link', () => {
    expect(igMeLink('@mansionplayroom.cl', 'bio')).toBe('https://ig.me/m/mansionplayroom.cl?ref=bio');
  });
});
