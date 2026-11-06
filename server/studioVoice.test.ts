import { describe, expect, it } from 'vitest';
import { buildSsml, joinTrack, pcmFromWav, pronounce } from './studioVoice';
import { VOICE_GAP, VOICE_LEAD, VOICE_TAIL } from '../shared/studioVoice';

function wav(pcm: Buffer, extraChunk = false): Buffer {
  const extra = extraChunk ? Buffer.concat([Buffer.from('LIST'), Buffer.from([4, 0, 0, 0]), Buffer.from('abcd')]) : Buffer.alloc(0);
  const fmt = Buffer.concat([Buffer.from('fmt '), Buffer.from([16, 0, 0, 0]), Buffer.alloc(16)]);
  const data = Buffer.concat([Buffer.from('data'), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(pcm.length); return b; })(), pcm]);
  return Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), fmt, extra, data]);
}

describe('voz del Estudio (Azure es-CL)', () => {
  it('arma el SSML con la voz chilena, el ritmo y el tono', () => {
    const ssml = buildSsml('Mansion Playroom & más <3', { voice: 'catalina', rate: 6, pitch: -2 });
    expect(ssml).toContain('xml:lang="es-CL"');
    expect(ssml).toContain('name="es-CL-CatalinaNeural"');
    expect(ssml).toContain('rate="+6%"');
    expect(ssml).toContain('pitch="-2%"');
    expect(ssml).toContain('Pleirrum');
    expect(ssml).toContain('&amp;');
    expect(ssml).toContain('&lt;3');
  });

  it('limita ritmo y tono a lo permitido', () => {
    const ssml = buildSsml('hola', { voice: 'lorenzo', rate: 500, pitch: -500 });
    expect(ssml).toContain('rate="+30%"');
    expect(ssml).toContain('pitch="-12%"');
    expect(ssml).toContain('es-CL-LorenzoNeural');
  });

  it('cambia las marcas a como se dicen', () => {
    expect(pronounce('Solo +18 en PLAYROOM y Playmore')).toBe('Solo más dieciocho en Pleirrum y Pleimor');
  });

  it('saca el audio del WAV aunque haya otros trozos antes', () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
    expect(pcmFromWav(wav(pcm)).equals(pcm)).toBe(true);
    expect(pcmFromWav(wav(pcm, true)).equals(pcm)).toBe(true);
    expect(() => pcmFromWav(Buffer.from('nada'))).toThrow(/WAV/);
  });

  it('une las frases con sus pausas y dice cuánto dura cada una', () => {
    const one = Buffer.alloc(24000 * 2); // 1 s
    const two = Buffer.alloc(24000 * 2 * 2); // 2 s
    const { wav: out, secs } = joinTrack([one, two]);
    expect(secs).toEqual([1, 2]);
    const total = VOICE_LEAD + 1 + VOICE_GAP + 2 + VOICE_TAIL;
    expect((out.length - 44) / 48000).toBeCloseTo(total, 1);
    expect(out.toString('ascii', 0, 4)).toBe('RIFF');
    expect(out.readUInt32LE(24)).toBe(24000);
  });
});
