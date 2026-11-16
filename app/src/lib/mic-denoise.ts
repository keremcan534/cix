// "Mikrofon denoise" on a phone with real voice (Efektler ve ses). The voice engine's own noise suppression (the
// phone's built-in one where it has it, WebRTC's otherwise), echo cancellation and gain control are always on, as in
// a phone call; the switch adds the AI cleaning (modules/similar-denoise, RNNoise on Android) on top of them.
import type { AiDenoiseStatus } from '../../modules/similar-denoise';

export type DenoiseLine = { text: string; tone: 'ok' | 'wait' | 'bad' };

/**
 * The line under the switch: whether the AI cleaning really runs on this phone, so a phone where it can't start is
 * seen. Null: nothing to say (the switch is off, or this phone has no AI cleaning or no real voice).
 */
export function denoiseLine(on: boolean, status: AiDenoiseStatus | null, before?: number): DenoiseLine | null {
  if (!on || !status) return null;
  if (!status.attached) return { text: 'Bu telefonda yapay zekâ temizleme başlatılamadı; temel gürültü engelleme açık.', tone: 'bad' };
  // `before`: the count a second ago (the sheet reads it every second). The count only grows (since the app started),
  // so "working" means it grew just now: the mic is on and its sound goes through the cleaning (güncelleme 6).
  const running = before === undefined ? status.frames > 0 : status.frames > before;
  if (running) return { text: 'Çalışıyor: odadakilere giden sesin yapay zekâyla temizleniyor. Farkı karşı taraf duyar, sen kendi telefonunda duymazsın.', tone: 'ok' };
  return { text: 'Mikrofonun açıkken devreye girer.', tone: 'wait' };
}
