// Google sign-in on the phone: Google's account picker gives an ID token, which our server checks
// (POST /api/auth/google, lib/live/account). Android only for now. It needs the native module (a built APK, not
// Expo Go) and EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (docs/SUNUCU.md); without either the button stays hidden and
// the device sign-in is used. The web build has its own file (google-sign-in.web.ts).
import { Platform } from 'react-native';

type Lib = typeof import('@react-native-google-signin/google-signin');

// Android asks Google for a token for the web client id; that id is what the server accepts (GOOGLE_CLIENT_IDS).
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

let lib: Lib | null | undefined;
/** The library, configured; null when this build has no native module (Expo Go, an older APK). */
function load(): Lib | null {
  if (lib !== undefined) return lib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const g = require('@react-native-google-signin/google-signin') as Lib;
    g.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
    lib = g;
  } catch {
    lib = null;
  }
  return lib;
}

/** True when this build can offer "Google ile devam et". */
export const googleAvailable = () => Platform.OS === 'android' && !!WEB_CLIENT_ID && !!load();

/** Google's ID token for the account the person picks; null when they close the picker. */
export async function googleIdToken(): Promise<string | null> {
  const g = load();
  if (!g) throw new Error('Google ile giriş bu sürümde yok.');
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = g;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // The picker every time: the person chooses which Google account opens the account here.
    await GoogleSignin.signOut().catch(() => {});
    const r = await GoogleSignin.signIn();
    if (!isSuccessResponse(r)) return null;
    if (!r.data.idToken) throw new Error('Google giriş bilgisini vermedi. Biraz sonra tekrar dene.');
    return r.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('Bu telefonda Google Play Hizmetleri yok ya da güncel değil.');
      // DEVELOPER_ERROR: the APK's signing key (SHA-1) or the client id isn't registered in Google Cloud.
      if (String(e.code) === '10' || /DEVELOPER_ERROR/.test(e.message)) throw new Error('Google ile giriş bu sürüm için henüz ayarlanmadı.');
    }
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/** Forgets the Google account on this phone, so the next sign-in shows the picker again. */
export async function googleSignOut() {
  const g = WEB_CLIENT_ID ? load() : null;
  if (!g) return;
  await g.GoogleSignin.signOut().catch(() => {});
}
