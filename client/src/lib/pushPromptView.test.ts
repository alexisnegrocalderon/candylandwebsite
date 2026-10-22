import { describe, expect, it } from 'vitest';
import type { PushState } from './customerPush';
import { avisosNotice, pushPromptView } from './pushPromptView';

const STATES: PushState[] = ['loading', 'unsupported', 'ios-install', 'denied', 'ask', 'enabled'];

describe('pushPromptView', () => {
  it('el aviso cerrado antes se esconde en la home, pero no en la hoja «Avisos»', () => {
    expect(pushPromptView({ state: 'ask', source: 'puntos', dismissed: true })).toBe('none');
    expect(pushPromptView({ state: 'ask', source: 'puntos', dismissed: true, alwaysShow: true })).toBe('prompt');
    expect(pushPromptView({ state: 'ios-install', source: 'puntos', dismissed: true, alwaysShow: true })).toBe('prompt');
  });

  it('la entrada y el pago nunca se esconden, y la entrada muestra activado y bloqueado', () => {
    expect(pushPromptView({ state: 'ask', source: 'ticket', dismissed: true })).toBe('prompt');
    expect(pushPromptView({ state: 'ask', source: 'pago', dismissed: true })).toBe('prompt');
    expect(pushPromptView({ state: 'enabled', source: 'ticket', dismissed: false })).toBe('activated');
    expect(pushPromptView({ state: 'denied', source: 'ticket', dismissed: false })).toBe('blocked');
    expect(pushPromptView({ state: 'enabled', source: 'home', dismissed: false })).toBe('none');
  });

  it('cargando o sin soporte: el aviso no se muestra', () => {
    expect(pushPromptView({ state: 'loading', source: 'puntos', dismissed: false, alwaysShow: true })).toBe('none');
    expect(pushPromptView({ state: 'unsupported', source: 'puntos', dismissed: false, alwaysShow: true })).toBe('none');
  });
});

describe('hoja «Avisos» de Mi cuenta', () => {
  it('con cualquier estado y aunque el aviso se haya cerrado, nunca queda vacía', () => {
    for (const state of STATES) {
      for (const dismissed of [false, true]) {
        const view = pushPromptView({ state, source: 'puntos', dismissed, alwaysShow: true });
        expect(view === 'prompt' || avisosNotice(state) !== null, `${state} / cerrado=${dismissed}`).toBe(true);
      }
    }
  });

  it('el botón y el mensaje no se muestran a la vez', () => {
    for (const state of STATES) {
      const view = pushPromptView({ state, source: 'puntos', dismissed: false, alwaysShow: true });
      expect(view === 'prompt' && avisosNotice(state) !== null, state).toBe(false);
    }
  });
});
