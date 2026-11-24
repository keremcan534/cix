// Ses tanıtımı on the server (server/api/voice-intro.mjs): the phone's recording put in the storage as kind 'voice'
// (an upload address for its size, its bytes PUT there), then saved on my profile; the server reads it back and
// refuses a wrong one with a sentence that says what to do. Taking it off deletes its file there.
import * as api from '@/lib/api';
import { parseVoice, type VoiceIntro } from '@/lib/voice-intro-core';

/** The recorder's file (an AAC .m4a) on my profile; resolves with the clip as the server keeps it. */
export async function saveVoiceIntro(uri: string): Promise<VoiceIntro> {
  let file: { data: ArrayBuffer; type: string };
  try {
    file = await api.readFile(uri);
  } catch {
    throw new Error('Ses kaydı okunamadı. Yeniden kaydet.');
  }
  if (!file.data.byteLength) throw new Error('Ses kaydı boş. Yeniden kaydet.');
  const target = await api.uploadUrl('voice', 'audio/mp4', file.data.byteLength);
  let res: Response;
  try {
    res = await fetch(target.uploadUrl, { method: target.method ?? 'PUT', headers: target.headers, body: file.data });
  } catch {
    throw new Error('Ses kaydı yüklenemedi. İnternetini kontrol edip tekrar dene.');
  }
  if (!res.ok) throw new Error(`Ses kaydı yüklenemedi (${await api.storageRefusal(res)}). Tekrar dene.`);
  const voice = parseVoice(await api.saveVoice(target.publicUrl));
  if (!voice) throw new Error('Ses kaydı kaydedilemedi. Tekrar dene.');
  return voice;
}

/** Takes my clip off my profile. */
export const removeVoiceIntro = () => api.removeVoice().then(() => null);
