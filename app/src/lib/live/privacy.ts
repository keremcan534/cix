// Live mode (lib/live): my Gizlilik and "Kimler ulaşabilir" choices are kept on the server, which enforces them
// (server/api/privacy.mjs). They are read after signing in (LiveSync) and when Ayarlar opens, and saved as soon as
// one changes: the choice moves at once and goes back, with a note, if the server refuses (lib/privacy-sync). The
// demo keeps them in the store only. Without a server address nothing here runs.
import { useEffect, useSyncExternalStore } from 'react';

import * as api from '@/lib/api';
import { showAlert } from '@/lib/alert';
import { liveMode, message, onAccountChange } from '@/lib/live';
import { PRIVACY_KEYS, marksShown, privacyBody, privacySync, type PrivacyKey } from '@/lib/privacy-sync';
import { demoPrivacyPerks, perksFromServer } from '@/lib/privacy-perks';
import { useApp, type Settings } from '@/store';

export { PRIVACY_KEYS, type PrivacyKey };
type Put = <K extends keyof Settings>(k: K, v: Settings[K]) => void;

const sync = privacySync();
// The Gizlilik rights I have (lib/privacy-perks): null until read; undefined from an older server (all shown).
let perks: Set<string> | null | undefined = null;
const perkListeners = new Set<() => void>();
const putPerks = (p: Set<string> | null | undefined) => {
  perks = p;
  perkListeners.forEach((l) => l());
};
onAccountChange(() => (sync.reset(), putPerks(null)));

/** My Gizlilik rights: live, the server's; the demo, from my VIP level and Rütbe tier. */
export function usePrivacyPerks(): Set<string> | null | undefined {
  const { svipLevel, nobleTier } = useApp();
  const live = useSyncExternalStore(
    (l) => (perkListeners.add(l), () => void perkListeners.delete(l)),
    () => perks,
    () => perks,
  );
  return liveMode() ? live : demoPrivacyPerks(svipLevel, nobleTier);
}

/** Reads my choices from the server into the store (`put`: the store's setSetting). */
export async function loadPrivacy(put: Put) {
  if (!liveMode()) return;
  const all = await api.myPrivacyAll();
  const p = all.privacy;
  putPerks(perksFromServer(all.perks));
  const shown = sync.loaded(p);
  for (const k of PRIVACY_KEYS) if (shown[k] !== undefined) put(k, shown[k] as Settings[typeof k]);
  // A server before "Kimler profilime iz bırakabilir": its switch alone (on: everyone could).
  const marks = p.marksFrom === undefined && shown.profileMarks !== undefined ? marksShown(p) : null;
  if (marks) put('marksFrom', marks.marksFrom);
}

/** The setter Ayarlar uses for these choices: live, shown at once and saved on the server; the demo, the store only. */
export function usePrivacySetter() {
  const { settings, setSetting } = useApp();
  return <K extends PrivacyKey>(k: K, v: Settings[K]) => {
    const before = settings[k];
    setSetting(k, v);
    if (!liveMode()) return;
    const id = sync.begin(k);
    // Profil izleri: the switch and "Kimler profilime iz bırakabilir" are one setting (nobody = off): the other moves too.
    if (k === 'marksFrom') setSetting('profileMarks', v !== 'nobody');
    if (k === 'profileMarks' && v === false) setSetting('marksFrom', 'nobody');
    // A server before marksFrom (rolled back) takes the switch's own key only (lib/privacy-sync privacyBody).
    const body = privacyBody(k, v as api.ServerPrivacy[K], sync.known());
    api
      .updatePrivacy(body)
      .then((p) => {
        sync.saved(k, id, p);
        // Both as the server keeps them now (a server before marksFrom: "Yalnız takip ettiklerim" shows as Herkes, what
        // its switch on does).
        const marks = k === 'marksFrom' || k === 'profileMarks' ? marksShown(p) : null;
        if (marks) {
          setSetting('marksFrom', marks.marksFrom);
          setSetting('profileMarks', marks.profileMarks);
        }
      })
      .catch((e) => {
        const back = sync.failed(k, id, before as api.ServerPrivacy[K]);
        if (back === undefined) return;
        setSetting(k, back as Settings[K]);
        // Profil izleri: the other one moved with it; both go back to what the server last confirmed.
        const marks = k === 'marksFrom' || k === 'profileMarks' ? marksShown(sync.known()) : null;
        if (marks) {
          setSetting('marksFrom', marks.marksFrom);
          setSetting('profileMarks', marks.profileMarks);
        }
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
