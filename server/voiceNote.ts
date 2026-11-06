/* Transcribe la nota de voz del Asistente IA con el reconocimiento de voz de Azure (la misma clave que la voz de los
 * reels, server/studioVoice.ts). El teléfono ya la manda como WAV 16 kHz mono (shared/voiceNote.ts), el formato que
 * la API de audio corto acepta en todas las regiones. */
import { ENV } from "./_core/env";
import { isVoiceNoteWav, VOICE_NOTE_MAX_BASE64, VOICE_NOTE_MAX_SECS, VOICE_NOTE_RATE, voiceNoteSeconds } from "../shared/voiceNote";

export async function transcribeVoiceNote(base64: string): Promise<{ text: string }> {
  if (!ENV.azureSpeechKey || !ENV.azureSpeechRegion) throw new Error('Falta configurar el reconocimiento de voz (AZURE_SPEECH_KEY y AZURE_SPEECH_REGION).');
  if (base64.length > VOICE_NOTE_MAX_BASE64) throw new Error(`La nota es muy larga: máximo ${VOICE_NOTE_MAX_SECS} segundos.`);
  const wav = new Uint8Array(Buffer.from(base64, 'base64'));
  if (!isVoiceNoteWav(wav)) throw new Error('El audio no llegó en el formato esperado. Vuelve a grabar.');
  if (voiceNoteSeconds(wav) > VOICE_NOTE_MAX_SECS + 2) throw new Error(`La nota es muy larga: máximo ${VOICE_NOTE_MAX_SECS} segundos.`);

  const url = `https://${ENV.azureSpeechRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=es-CL&format=simple&profanity=raw`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': ENV.azureSpeechKey,
      'Content-Type': `audio/wav; codecs=audio/pcm; samplerate=${VOICE_NOTE_RATE}`,
      Accept: 'application/json',
      'User-Agent': 'mansion-playroom-assistant',
    },
    body: wav,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    console.error('[VoiceNote] Azure respondió', res.status, detail);
    throw new Error(res.status === 401 || res.status === 403
      ? 'Azure rechazó la clave de voz (AZURE_SPEECH_KEY o AZURE_SPEECH_REGION incorrectos).'
      : res.status === 429 ? 'Azure dice que se pasó de la cuota de voz. Prueba de nuevo en un minuto.'
        : `Azure no pudo transcribir la nota (${res.status}).`);
  }
  const data = await res.json() as { RecognitionStatus?: string; DisplayText?: string };
  const text = (data.DisplayText ?? '').trim();
  if (data.RecognitionStatus !== 'Success' || !text) {
    throw new Error(data.RecognitionStatus === 'InitialSilenceTimeout' || data.RecognitionStatus === 'NoMatch'
      ? 'No se escuchó nada. Acerca el teléfono y vuelve a intentarlo.'
      : 'No se entendió la nota. Vuelve a intentarlo.');
  }
  return { text };
}
