import { describe, expect, it } from 'vitest';
import { concatChunks, downsampleTo16k, encodeWavPcm16, isVoiceNoteWav, voiceNoteSeconds, VOICE_NOTE_RATE } from './voiceNote';

describe('nota de voz: WAV', () => {
  it('arma un WAV 16 kHz mono de 16 bits que el servidor reconoce', () => {
    const wav = encodeWavPcm16(new Float32Array(VOICE_NOTE_RATE)); // 1 s de silencio
    expect(wav.length).toBe(44 + VOICE_NOTE_RATE * 2);
    expect(isVoiceNoteWav(wav)).toBe(true);
    expect(voiceNoteSeconds(wav)).toBe(1);
  });
  it('recorta las muestras fuera de rango en vez de dar la vuelta', () => {
    const wav = encodeWavPcm16(new Float32Array([2, -2]));
    const view = new DataView(wav.buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
  it('rechaza otros formatos', () => {
    expect(isVoiceNoteWav(new Uint8Array(10))).toBe(false);
    const other = encodeWavPcm16(new Float32Array(100), 44_100);
    expect(isVoiceNoteWav(other)).toBe(false);
  });
});

describe('nota de voz: remuestreo', () => {
  it('48 kHz → 16 kHz deja un tercio de las muestras y conserva el nivel', () => {
    const input = new Float32Array(48_000).fill(0.5);
    const out = downsampleTo16k(input, 48_000);
    expect(out.length).toBe(16_000);
    expect(out[100]).toBeCloseTo(0.5, 5);
  });
  it('44,1 kHz dura lo mismo después de pasar a 16 kHz', () => {
    const out = downsampleTo16k(new Float32Array(44_100), 44_100);
    expect(Math.abs(out.length / VOICE_NOTE_RATE - 1)).toBeLessThan(0.001);
  });
  it('si ya es de 16 kHz no cambia nada', () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(downsampleTo16k(input, 16_000)).toBe(input);
  });
  it('une los trozos del micrófono en orden', () => {
    expect(Array.from(concatChunks([new Float32Array([1, 2]), new Float32Array([3])]))).toEqual([1, 2, 3]);
  });
});
