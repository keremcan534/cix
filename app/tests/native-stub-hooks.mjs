// Test-only stand-ins for the app's own native modules (tests/mask.test.ts): expo's requireOptionalNativeModule hands
// out globalThis.__nativeModules[name] (null when a test leaves it out, as on iOS or the web), and a folder import of
// modules/<name> loads its index.ts, as Metro does.
const mod = (code) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(code)}` });

export async function resolve(specifier, context, next) {
  if (specifier === 'expo') return mod('export const requireOptionalNativeModule = (name) => globalThis.__nativeModules?.[name] ?? null;');
  if (/(^|\/)modules\/[\w-]+$/.test(specifier)) return next(`${specifier}/index.ts`, context);
  return next(specifier, context);
}
