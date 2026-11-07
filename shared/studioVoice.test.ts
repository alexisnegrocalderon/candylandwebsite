import { describe, expect, it } from 'vitest';
import { voiceScriptHash, VOICE_GAP, VOICE_LEAD, VOICE_TAIL } from './studioVoice';
import { MOTION_VOICE_GAP, MOTION_VOICE_LEAD, MOTION_VOICE_TAIL } from './motionSpec';

describe('voz del Estudio', () => {
  it('la huella cambia con el texto, la voz o la velocidad, y no con espacios de más', () => {
    const base = { says: ['Hola', 'Sábado 14'], voice: 'catalina' as const, rate: 0, pitch: 0 };
    expect(voiceScriptHash(base)).toBe(voiceScriptHash({ ...base, says: [' Hola ', 'Sábado 14'] }));
    expect(voiceScriptHash(base)).not.toBe(voiceScriptHash({ ...base, says: ['Hola', 'Sábado 15'] }));
    expect(voiceScriptHash(base)).not.toBe(voiceScriptHash({ ...base, voice: 'lorenzo' }));
    expect(voiceScriptHash(base)).not.toBe(voiceScriptHash({ ...base, rate: 5 }));
  });

  it('los silencios del WAV son los mismos que usa la línea de tiempo del video', () => {
    expect([VOICE_LEAD, VOICE_GAP, VOICE_TAIL]).toEqual([MOTION_VOICE_LEAD, MOTION_VOICE_GAP, MOTION_VOICE_TAIL]);
  });
});
