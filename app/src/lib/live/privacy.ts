// Live mode (lib/live): my Gizlilik and "Kimler ulaşabilir" choices are kept on the server, which enforces them
// (server/api/privacy.mjs). They are read after signing in (LiveSync) and when Ayarlar opens, and saved as soon as
// one changes: the choice moves at once and goes back, with a note, if the server refuses (lib/privacy-sync). The
// demo keeps them in the store only. Without a server address nothing here runs.
import { useEffect } from 'react';

import * as api from '@/lib/api';
import { showAlert } from '@/lib/alert';
import { liveMode, message, onAccountChange } from '@/lib/live';
import { PRIVACY_KEYS, privacySync, type PrivacyKey } from '@/lib/privacy-sync';
import { useApp, type Settings } from '@/store';

export { PRIVACY_KEYS, type PrivacyKey };
type Put = <K extends keyof Settings>(k: K, v: Settings[K]) => void;

const sync = privacySync();
onAccountChange(() => sync.reset());

/** Reads my choices from the server into the store (`put`: the store's setSetting). */
export async function loadPrivacy(put: Put) {
  if (!liveMode()) return;
  const shown = sync.loaded(await api.myPrivacy());
  for (const k of PRIVACY_KEYS) if (shown[k] !== undefined) put(k, shown[k] as Settings[typeof k]);
}

/** The setter Ayarlar uses for these choices: live, shown at once and saved on the server; the demo, the store only. */
export function usePrivacySetter() {
  const { settings, setSetting } = useApp();
  return <K extends PrivacyKey>(k: K, v: Settings[K]) => {
    const before = settings[k];
    setSetting(k, v);
    if (!liveMode()) return;
    const id = sync.begin(k);
    api
      .updatePrivacy({ [k]: v })
      .then((p) => sync.saved(k, id, p))
      .catch((e) => {
        const back = sync.failed(k, id, before as api.ServerPrivacy[K]);
        if (back === undefined) return;
        setSetting(k, back as Settings[K]);
        showAlert('Ayar kaydedilemedi', message(e));
      });
  };
}

/** Ayarlar reads them again when it opens: another phone may have changed them. */
export function useLivePrivacy() {
  const { setSetting } = useApp();
  useEffect(() => {
    if (liveMode()) void loadPrivacy(setSetting).catch(() => {});
    // Once per opening; setSetting only writes into the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
