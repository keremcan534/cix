// What this phone tells the server about itself (server/api/sanctions.mjs deviceSignals), so a device ban holds
// for every account on the phone. The server hashes each id at once and never keeps the raw value.
//
//   installId   the app's random device key (lib/api): new after every reinstall
//   hardwareId  Android: the ANDROID_ID, the same after a reinstall of the same signed app
//   keychainId  a random id in the secure store; on iOS the keychain keeps it across reinstalls
//
// None of these can be read by a web page, so the web build sends only the install id (device-info.web.ts).
// They are one input of several: the server also flags reinstalls and changed ids for staff to look at.
import { Platform } from 'react-native';

// Loaded lazily: an older APK without these native modules must not crash at start when it gets this code.
/* eslint-disable @typescript-eslint/no-require-imports */
function load<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}
const Application = load(() => require('expo-application') as typeof import('expo-application'));
const SecureStore = load(() => require('expo-secure-store') as typeof import('expo-secure-store'));
/* eslint-enable @typescript-eslint/no-require-imports */

export type DeviceInfo = { installId: string; hardwareId?: string; keychainId?: string; platform: 'android' | 'ios' | 'web'; model?: string; os?: string; app?: string };

const KEYCHAIN_KEY = 'similarclub.device';
let keychain: Promise<string | undefined> | null = null;

/** A random id kept in the keychain (iOS keeps it after a reinstall; Android clears it with the app). */
function keychainId(newId: () => string) {
  keychain ??= (async () => {
    if (!SecureStore) return undefined;
    try {
      const saved = await SecureStore.getItemAsync(KEYCHAIN_KEY);
      if (saved) return saved;
      const id = newId();
      await SecureStore.setItemAsync(KEYCHAIN_KEY, id, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
      return id;
    } catch {
      return undefined;
    }
  })();
  return keychain;
}

export async function deviceInfo(installId: string, newId: () => string): Promise<DeviceInfo> {
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  let hardwareId: string | undefined;
  try {
    hardwareId = platform === 'android' ? Application?.getAndroidId() || undefined : undefined;
  } catch {
    hardwareId = undefined;
  }
  const c = Platform.constants as { Model?: string; Brand?: string } | undefined;
  return {
    installId,
    hardwareId,
    keychainId: await keychainId(newId),
    platform,
    model: [c?.Brand, c?.Model].filter(Boolean).join(' ') || undefined,
    os: String(Platform.Version),
    app: Application?.nativeApplicationVersion ?? undefined,
  };
}
