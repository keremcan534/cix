// Test-only module stand-ins for lib/api (tests/api-session.test.ts): the phone's storage, random bytes and
// device signals are replaced by small in-memory versions, so the real request logic runs under Node.
const mod = (code) => ({ shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(code)}` });

const STUBS = {
  '@react-native-async-storage/async-storage': `
    const store = (globalThis.__asyncStore ??= new Map());
    export default {
      getItem: async (k) => (globalThis.__asyncDelay ? await globalThis.__asyncDelay() : undefined, store.has(k) ? store.get(k) : null),
      setItem: async (k, v) => void store.set(k, v),
      removeItem: async (k) => void store.delete(k),
      multiRemove: async (ks) => ks.forEach((k) => store.delete(k)),
    };`,
  'expo-crypto': `export const getRandomBytes = (n) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);`,
  '@/lib/device-info': `export const deviceInfo = async () => ({ platform: 'test' });`,
};

export async function resolve(specifier, context, next) {
  if (specifier in STUBS) return mod(STUBS[specifier]);
  return next(specifier, context);
}
