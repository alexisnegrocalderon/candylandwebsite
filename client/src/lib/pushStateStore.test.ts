import { describe, expect, it } from 'vitest';
import type { PushState } from './customerPush';
import { avisosNotice, pushPromptView } from './pushPromptView';
import { publishPushState, subscribePushState } from './pushStateStore';

describe('pushStateStore', () => {
  it('avisa a todas las copias del estado, no solo a la que activó', () => {
    const a: PushState[] = [];
    const b: PushState[] = [];
    const offA = subscribePushState((s) => a.push(s));
    const offB = subscribePushState((s) => b.push(s));
    publishPushState('enabled');
    expect(a).toEqual(['enabled']);
    expect(b).toEqual(['enabled']);
    offA();
    publishPushState('ask');
    expect(a).toEqual(['enabled']); // el que se bajó ya no recibe
    expect(b).toEqual(['enabled', 'ask']);
    offB();
  });

  it('un oyente que se baja mientras se avisa no hace que otro se pierda el aviso', () => {
    const got: PushState[] = [];
    const off1 = subscribePushState(() => off1());
    const off2 = subscribePushState((s) => got.push(s));
    publishPushState('denied');
    expect(got).toEqual(['denied']);
    off2();
  });

  it('el caso de la clienta: al activar, la hoja pasa de mostrar el botón al mensaje «activado», nunca queda vacía', () => {
    // La pantalla y el aviso empiezan los dos en «ask».
    let pantalla: PushState = 'ask';
    let aviso: PushState = 'ask';
    const off1 = subscribePushState((s) => { pantalla = s; });
    const off2 = subscribePushState((s) => { aviso = s; });
    const hoja = () => {
      const view = pushPromptView({ state: aviso, source: 'puntos', dismissed: false, alwaysShow: true });
      return view === 'prompt' || avisosNotice(pantalla) !== null;
    };
    expect(hoja()).toBe(true);
    publishPushState('enabled'); // la persona acepta
    expect(avisosNotice(pantalla)).toBe('enabled');
    expect(hoja()).toBe(true);
    off1(); off2();
  });
});
