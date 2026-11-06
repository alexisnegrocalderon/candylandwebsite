import { describe, expect, it } from 'vitest';
import { encodeWavPcm16, isVoiceNoteWav, voiceNoteSeconds, VOICE_NOTE_RATE } from './voiceNote';

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
