// Test-only stand-in for expo-file-system/legacy (tests/fx-videos.test.ts): the phone's documents folder is a temp
// folder on this machine (globalThis.__fsRoot, set before the module under test loads) and a download asks
// globalThis.__download(url) for {status, body}.
const mod = (code) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(code)}` });

const STUBS = {
  'expo-file-system/legacy': `
    import fs from 'node:fs';
    const at = (uri) => decodeURIComponent(String(uri).replace(/^file:\\/\\//, ''));
    export const documentDirectory = globalThis.__fsRoot ? 'file://' + globalThis.__fsRoot + '/' : null;
    export const cacheDirectory = documentDirectory;
    export async function makeDirectoryAsync(uri) { fs.mkdirSync(at(uri), { recursive: true }); }
    export async function readDirectoryAsync(uri) { return fs.readdirSync(at(uri)); }
    export async function deleteAsync(uri) { fs.rmSync(at(uri), { force: true, recursive: true }); }
    export async function getInfoAsync(uri) {
      try { const st = fs.statSync(at(uri)); return { exists: true, size: st.size, isDirectory: st.isDirectory(), uri }; }
      catch { return { exists: false, isDirectory: false, uri }; }
    }
    export async function moveAsync({ from, to }) { fs.renameSync(at(from), at(to)); }
    export async function downloadAsync(url, uri) {
      const r = await globalThis.__download(url);
      if (r.body) fs.writeFileSync(at(uri), r.body);
      return { status: r.status, uri, headers: {} };
    }`,
};

export async function resolve(specifier, context, next) {
  if (specifier in STUBS) return mod(STUBS[specifier]);
  return next(specifier, context);
}
