// Reporting a real person or room in a live build (Google Play's user content policy): the person picks a reason,
// it goes to the moderators' queue (lib/live/account liveReport) and a calm thank-you follows. For anyone or
// anything that isn't on the server (the prototype, demo people) the screen's own flow runs unchanged.
import { useState } from 'react';

import { ActionSheet } from '@/components/ActionSheet';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import { liveReport, reportsToServer, type ReportType } from '@/lib/live/account';
import { useApp } from '@/store';

/** Short reasons (the server keeps at most 60 characters). */
const REASONS: Record<ReportType, string[]> = {
  user: ['Sahte profil', 'Taciz veya hakaret', 'Uygunsuz içerik', 'Dolandırıcılık', 'Spam', '18 yaşından küçük olabilir'],
  room: ['Uygunsuz içerik', 'Taciz veya hakaret', 'Nefret söylemi', 'Spam veya reklam', 'Dolandırıcılık'],
  moment: ['Uygunsuz içerik', 'Taciz veya hakaret', 'Nefret söylemi', 'Spam veya reklam', 'Dolandırıcılık', 'Başkasının fotoğrafı'],
  comment: ['Taciz veya hakaret', 'Nefret söylemi', 'Spam veya reklam', 'Uygunsuz içerik'],
};

/** What is reported. `note` adds context for the moderators (e.g. the message); `onBlock` offers blocking after. */
export type ReportTarget = { type: ReportType; id: string; name: string; note?: string; onBlock?: () => void };

/** `start(target, prototype)` opens the reason sheet for a server target, else runs `prototype`; render `sheet`. */
export function useReport() {
  const { logSafety } = useApp();
  const [target, setTarget] = useState<ReportTarget | null>(null);

  const start = (t: ReportTarget, prototype: () => void) => {
    if (!reportsToServer(t.type, t.id)) return prototype();
    // Usually opened from a menu that is still closing: one sheet at a time.
    setTimeout(() => setTarget(t), 300);
  };

  const send = async (t: ReportTarget, reason: string) => {
    try {
      await liveReport(t.type, t.id, reason, t.note);
    } catch (e) {
      showAlert('Şikâyet gönderilemedi', `${message(e)}\n\nBiraz sonra tekrar deneyebilirsin.`);
      return;
    }
    if (t.type === 'user') logSafety('Şikâyet etti', t.id, reason);
    showAlert(
      'Teşekkürler',
      'Şikâyetin ekibimize ulaştı. İnceleyip gereğini yapacağız; kimliğin karşı tarafla paylaşılmaz.',
      t.onBlock
        ? [
            { text: 'Tamam', style: 'cancel' },
            { text: `${t.name} kişisini engelle`, style: 'destructive', onPress: t.onBlock },
          ]
        : undefined,
    );
  };

  const sheet = (
    <ActionSheet
      visible={!!target}
      title={target?.type === 'room' ? 'Bu odayı neden şikâyet ediyorsun?' : target?.type === 'moment' ? 'Bu anı neden şikâyet ediyorsun?' : target?.type === 'comment' ? 'Bu yorumu neden şikâyet ediyorsun?' : 'Neden şikâyet ediyorsun?'}
      onClose={() => setTarget(null)}
      options={(target ? REASONS[target.type] : []).map((r) => ({ label: r, onPress: () => target && void send(target, r) }))}
    />
  );
  return { start, sheet };
}
