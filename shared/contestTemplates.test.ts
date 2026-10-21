import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEST_CONFIG } from './contest';
import { buildTemplateConfig, CONTEST_TEMPLATES, getContestTemplate } from './contestTemplates';
import { renderContestTemplate } from './contest';

const input = { startsAt: '2026-10-20T12:00:00.000Z', drawAt: '2026-10-22T12:00:00.000Z', prizeTicketTypeId: 7 };

describe('plantillas de concurso', () => {
  it('el ranking trae los valores propuestos más lo elegido', () => {
    const c = buildTemplateConfig('ranking', input);
    expect(c.prizes.prizeTicketTypeId).toBe(7);
    expect(c.prizes.guaranteedLeader).toBe(true);
    expect(c.chances).toEqual(DEFAULT_CONTEST_CONFIG.chances);
    expect(c.ranking.dailyComment).toBe(true);
    expect(c.verify.enabled).toBe(true);
    expect(c.startsAt).toBe(input.startsAt);
  });

  it('el sorteo simple apaga puntos, ranking y premio seguro, y deja verificación', () => {
    const c = buildTemplateConfig('draw', input);
    expect(c.chances.perMention).toBe(0);
    expect(c.chances.buyerMultiplier).toBe(1);
    expect(c.prizes.guaranteedLeader).toBe(false);
    expect(c.prizes.vipWinners).toBe(0);
    expect(c.prizes.doubleWinners).toBe(1);
    expect(c.ranking).toMatchObject({ dailyComment: false, publicReplies: false, dmTips: false, emailBuyers: false });
    expect(c.verify.enabled).toBe(true);
    // lo que no toca la plantilla queda con el valor propuesto
    expect(c.prizes.couponPercent).toBe(DEFAULT_CONTEST_CONFIG.prizes.couponPercent);
    expect(c.messages.winnerVerify).toBe(DEFAULT_CONTEST_CONFIG.messages.winnerVerify);
  });

  it('likes y referidos: sin puntos, sin premio seguro ni ranking de puntos, con parcial diario', () => {
    for (const key of ['likes', 'referrals'] as const) {
      const c = buildTemplateConfig(key, input);
      expect(c.prizes.guaranteedLeader, key).toBe(false);
      expect(c.chances.perMention, key).toBe(0);
      expect(c.ranking, key).toMatchObject({ dailyComment: true, publicReplies: false, dmTips: false, emailBuyers: false });
      expect(c.verify.enabled, key).toBe(true);
    }
    expect(buildTemplateConfig('likes', input).prizes.doubleWinners).toBe(1);
    expect(buildTemplateConfig('referrals', input).prizes.doubleWinners).toBe(2);
    expect(buildTemplateConfig('referrals', input).chances.perInvitedPurchase).toBe(1);
  });

  it('los textos de cada plantilla solo usan variables que existen y no nombran un evento', () => {
    const known = new Set(['nombre', 'chances', 'ganadores_doble', 'premio', 'premio_singular', 'premio_vip', 'por_etiqueta', 'max_etiquetas',
      'bonus_historia', 'bonus_compra_amigo', 'multiplicador', 'porcentaje', 'horas', 'cupon', 'porcentaje_amigo', 'codigo_amigo', 'link_invitar',
      'fecha_sorteo', 'link_bases', 'evento', 'lista_regalos', 'codigo_premio', 'plazo', 'congelado_hasta', 'link_elegir', 'monto_devolucion',
      'faltante', 'link_reel', 'frase', 'puntos_texto', 'comentarios', 'hito_porcentaje', 'hito_codigo', 'proximo_hito', 'proximo_porcentaje', 'faltan']);
    for (const t of CONTEST_TEMPLATES) {
      const c = buildTemplateConfig(t.key, input);
      const all = Object.values(c.messages).flat().join('\n');
      const used = Array.from(all.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)).map((m) => m[1]);
      expect(used.filter((k) => !known.has(k)), t.key).toEqual([]);
      expect(all).not.toMatch(/aniversario/i);
    }
  });

  it('una plantilla desconocida cae en el ranking', () => {
    expect(getContestTemplate('nope').key).toBe('ranking');
    expect(renderContestTemplate('{{x}}', {})).toBe('');
  });
});
