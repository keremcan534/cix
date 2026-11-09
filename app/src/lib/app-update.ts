// "Uygulama sürümü" in Ayarlar: this app's version and build, and whether a newer build is out.
// The side-loaded APK is built by CI with its build number (EXPO_PUBLIC_BUILD, the run number of the
// "preview-N" release); a newer "latest" release on GitHub means an update is ready to download.
// A store build has no build number here: the store shows its own updates, so nothing is checked.
import { useEffect, useState } from 'react';

export const APP_BUILD = Math.max(0, Math.floor(Number(process.env.EXPO_PUBLIC_BUILD) || 0));
const LATEST = 'https://api.github.com/repos/keremcan534/cix/releases/latest';

/** "1.0.0 · yapı 93" (or the version alone when there is no build number). */
export const versionLabel = (version: string, build = APP_BUILD) => (build > 0 ? `${version} · yapı ${build}` : version);

export type Update = { build: number; url: string };

/** The newer build in a GitHub "latest release" answer, or null when there is none (or the answer is odd). */
export function updateFrom(release: unknown, current = APP_BUILD): Update | null {
  if (!release || typeof release !== 'object' || current <= 0) return null;
  const r = release as { tag_name?: unknown; html_url?: unknown; assets?: unknown };
  const m = typeof r.tag_name === 'string' ? /^preview-(\d+)$/.exec(r.tag_name) : null;
  const build = m ? Number(m[1]) : 0;
  if (!(build > current)) return null;
  const apk = Array.isArray(r.assets)
    ? (r.assets as { name?: unknown; browser_download_url?: unknown }[]).find((a) => typeof a?.name === 'string' && a.name.endsWith('.apk'))
    : undefined;
  const url = typeof apk?.browser_download_url === 'string' ? apk.browser_download_url : typeof r.html_url === 'string' ? r.html_url : '';
  return /^https:\/\/\S+$/.test(url) ? { build, url } : null;
}

// One check per app start is enough: the answer is kept for every later visit to Ayarlar.
let checked: Promise<Update | null> | null = null;
function check(): Promise<Update | null> {
  if (APP_BUILD <= 0) return Promise.resolve(null);
  checked ??= (async () => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(LATEST, { headers: { Accept: 'application/vnd.github+json' }, signal: ctl.signal });
      return res.ok ? updateFrom(await res.json()) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  })();
  return checked;
}

/** The update that is ready, if any (null while checking, offline, or up to date). */
export function useAppUpdate(): Update | null {
  const [u, setU] = useState<Update | null>(null);
  useEffect(() => {
    let on = true;
    check().then((x) => on && setU(x));
    return () => {
      on = false;
    };
  }, []);
  return u;
}
