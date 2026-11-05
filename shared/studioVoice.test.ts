import { describe, expect, it } from 'vitest';
import { estimateSecs, normalizeVoice, starterVoice, voiceIsFresh, voiceScriptHash, voiceScriptOf, voiceTotalSecs, VOICE_GAP, VOICE_LEAD, VOICE_TAIL } from './studioVoice';
import { normalizeStudioVideo, projectAssets, voiceVideo } from './studioVideo';
import { beatTimings, voiceReelHtml, wordTimes } from './studioVoiceReel';

const fresh = () => {
  const v = starterVoice();
  v.voiceUrl = 'https://abc.public.blob.vercel-storage.com/studio-voice/voz.wav';
  v.voiceHash = voiceScriptHash(voiceScriptOf(v));
  return v;
};

describe('reel con voz: datos', () => {
  it('el guion de partida es válido y sobrevive a normalizar', () => {
    const v = starterVoice();
    expect(normalizeVoice(v)).toEqual(v);
    expect(v.beats.at(-1)?.kind).toBe('end');
  });

  it('recorta y corrige lo que viene del panel', () => {
    const v = normalizeVoice({ beats: [{ kind: 'nada', say: 'a'.repeat(500), chips: ['1', '2', '3', '4'], bg: 'javascript:alert(1)' }], rate: 999, pitch: -999, voice: 'otra' })!;
    expect(v.beats[0].kind).toBe('big');
    expect(v.beats[0].say.length).toBe(180);
    expect(v.beats[0].chips).toHaveLength(3);
    expect(v.beats[0].bg).toBeUndefined();
    expect(v.rate).toBe(30);
    expect(v.pitch).toBe(-12);
    expect(v.voice).toBe('catalina');
    expect(normalizeVoice({ beats: [] })).toBeUndefined();
  });

  it('la voz solo está al día si el guion no cambió', () => {
    const v = fresh();
    expect(voiceIsFresh(v)).toBe(true);
    expect(voiceIsFresh({ ...v, rate: v.rate + 1 })).toBe(false);
    expect(voiceIsFresh({ ...v, beats: v.beats.map((b, i) => (i === 1 ? { ...b, say: 'Otra cosa.' } : b)) })).toBe(false);
    expect(voiceIsFresh(starterVoice())).toBe(false);
  });

  it('el video «voz» se guarda y se lee de vuelta', () => {
    const v = voiceVideo();
    const back = normalizeStudioVideo(JSON.parse(JSON.stringify(v)), () => null);
    expect(back?.template).toBe('voz');
    expect(back?.voice?.beats).toHaveLength(v.voice!.beats.length);
    expect(normalizeStudioVideo({ ...v, voice: undefined }, () => null)).toBeNull();
  });

  it('estima segundos por palabras', () => {
    expect(estimateSecs('uno dos tres cuatro cinco')).toBeGreaterThan(1.5);
    expect(estimateSecs('')).toBe(0.8);
  });
});

describe('reel con voz: tiempos', () => {
  it('cada escena empieza cuando termina la anterior, con su respiro', () => {
    const t = beatTimings([{ secs: 2 }, { secs: 3 }, { secs: 1 }]);
    expect(t[0].start).toBe(VOICE_LEAD);
    expect(t[1].start).toBeCloseTo(t[0].end + VOICE_GAP, 5);
    expect(t[2].showEnd).toBeCloseTo(t[2].end + VOICE_TAIL, 5);
  });

  it('el total calza con el último cierre', () => {
    const v = starterVoice();
    expect(voiceTotalSecs(v)).toBeCloseTo(beatTimings(v.beats).at(-1)!.showEnd, 1);
  });

  it('las palabras del subtítulo entran en orden y dentro de la frase', () => {
    const w = wordTimes('Segundo: consentimiento. Un sí claro.', 5, 4);
    expect(w.map((x) => x.word)).toEqual(['Segundo:', 'consentimiento.', 'Un', 'sí', 'claro.']);
    expect(w[0].at).toBe(5);
    w.slice(1).forEach((x, i) => expect(x.at).toBeGreaterThan(w[i].at));
    expect(w.at(-1)!.at).toBeLessThan(9);
  });
});

describe('reel con voz: composición', () => {
  const build = (v = fresh()) => {
    const video = { ...voiceVideo(), voice: v };
    const { assetUrl, files } = projectAssets();
    return { html: voiceReelHtml(video, { asset: assetUrl }), files };
  };

  it('trae la línea de tiempo y la voz solo cuando está al día', () => {
    const a = build();
    expect(a.html).toContain('window.__timelines');
    expect(a.html).toContain('<audio id="voice"');
    expect(Array.from(a.files.values())).toContain(fresh().voiceUrl);
    expect(build(starterVoice()).html).not.toContain('<audio id="voice"');
  });

  it('el guion de animación corre sin errores y deja la línea de tiempo registrada', () => {
    const html = build().html;
    const script = html.split('<script>').at(-1)!.split('</script>')[0];
    const calls: string[] = [];
    const tl: Record<string, (...a: unknown[]) => unknown> = new Proxy({}, { get: (_t, name) => (...a: unknown[]) => { calls.push(`${String(name)}:${JSON.stringify(a)}`); return tl; } });
    const timelines: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('gsap', 'window', script)({ timeline: () => tl }, { __timelines: timelines });
    expect(timelines.main).toBe(tl);
    expect(calls.length).toBeGreaterThan(100);
    // Nada de «undefined» ni «NaN» en los tiempos o valores.
    expect(calls.filter((c) => /NaN|undefined/.test(c))).toEqual([]);
  });

  it('escapa el texto del guion', () => {
    const v = fresh();
    v.beats[1].big = '<b>X</b>';
    const html = build(v).html;
    expect(html).not.toContain('<b>X</b>');
    expect(html).toContain('>&lt;</span>');
  });
});
