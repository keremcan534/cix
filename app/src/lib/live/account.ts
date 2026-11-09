// Live mode account actions (lib/live): Google and e-mail sign-in, adding an address or checking a number in
// Ayarlar, signing out, deleting the account and reporting someone, the parts Google Play asks for. Screens call
// these only in live mode; the prototype keeps its local flows.
import { Platform } from 'react-native';

import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { googleAvailable, googleIdToken, googleSignOut } from '@/lib/google-sign-in';
import { applyServerUser, liveMode, liveSignIn, message, toServer } from '@/lib/live';
import { stopPush } from '@/lib/push';
import { retrySeconds, reusableCode, type SentCode } from '@/lib/verify-code';
import { isServerId } from '@/data/mock';

/** "Google ile devam et" on the welcome screen: a live build with the client id and the native module. */
export const googleSignInOffered = () => liveMode() && googleAvailable();

/** The server profile as the phone's own profile (`me`): every field from the server, nothing kept from the demo. */
export { profileFromServer } from '@/lib/me-view';

/**
 * Google's account picker, then the server session. Null when the person closed the picker. `needsProfile`:
 * a new account (or one without gender and age yet) goes through the profile screen first.
 */
export async function signInWithGoogle() {
  const token = await googleIdToken();
  if (!token) return null;
  const { user, isNew } = await api.googleSignIn(token, 'Android');
  // The balance into the store, like every other sign-in.
  await liveSignIn(user.name);
  return { user, isNew, needsProfile: isNew || !user.gender || user.age === null };
}

/**
 * "Giriş yap" on the welcome screen: this phone's own account again after "Çıkış yap" (one phone, one account).
 * An account that never finished its profile goes through the profile screen first.
 */
export async function signInWithDevice() {
  await forgetEndedSignIn();
  const user = (await liveSignIn('Yeni üye')) as api.ServerMe;
  return { user, needsProfile: !user.gender || user.age === null };
}

/**
 * Before this phone's own account (the welcome screen's device ways, test servers): an e-mail, phone or Google
 * sign-in whose session ended on its own (expired, ended from another phone) is still remembered here, and it
 * would refuse the device key ("yeniden giriş yap"). It is forgotten first, as "Çıkış yap" does. Never fails.
 */
export async function forgetEndedSignIn() {
  try {
    if (await api.signedInWithAccount()) await api.logout();
  } catch {
    // Storage hiccup: the sign-in after this says what went wrong.
  }
}

export type CodeKind = 'email' | 'phone';
/** The session list's name for this phone. */
const deviceLabel = () => (Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'web' ? 'Web' : 'Android');

// The last code asked for on the welcome screens: going back and asking again for the same address within the
// wait reuses it (the code in the mailbox still works) instead of a refusal to wait.
let lastCode: (SentCode & { kind: CodeKind }) | null = null;

/**
 * Signing in with a code, step 1: a code to the address (or the number, where the server allows phone sign-in).
 * `resend`: the person asked for a new one. `retryAfter` = seconds until another can be asked for.
 */
export async function startSignInCode(kind: CodeKind, target: string, resend = false) {
  const now = Date.now();
  const again = !resend && lastCode?.kind === kind ? reusableCode(lastCode, target, now) : null;
  if (again) return again;
  const r = kind === 'email' ? await api.emailStart(target) : await api.otpStart(target);
  const retryAfter = retrySeconds(r.retryAfter);
  lastCode = { kind, target, challenge: r.challenge, resendAt: now + retryAfter * 1000 };
  return { retryAfter, challenge: r.challenge };
}

/** Step 2: the code opens the session. `needsProfile`: a new account (or one without gender and age) fills its profile first. */
export async function signInWithCode(kind: CodeKind, target: string, code: string, challenge: string) {
  const { user: u, isNew } = kind === 'email' ? await api.emailVerify(target, code, challenge, deviceLabel()) : await api.otpVerify(target, code, challenge, undefined, deviceLabel());
  lastCode = null;
  // The full account (profile, e-mail) and the balance into the store, like every other sign-in.
  const user = (await liveSignIn(u.name)) as api.ServerMe;
  return { user, isNew, needsProfile: isNew || !user.gender || user.age === null };
}

/** Ayarlar: a code to an address or a number for this account. */
export const startLinkCode = (kind: CodeKind, target: string) => (kind === 'email' ? api.linkEmailStart(target) : api.linkPhoneStart(target));
/** Ayarlar: the code adds the address or checks the number; the store gets the new account at once. */
export async function verifyLinkCode(kind: CodeKind, target: string, code: string, challenge: string) {
  const user = kind === 'email' ? await api.linkEmailVerify(target, code, challenge) : await api.linkPhoneVerify(target, code, challenge);
  applyServerUser({ user });
  return user;
}

/**
 * After "Çıkış yap": a Google, e-mail or phone account's session ends on the server and on the phone, so the
 * next person signs in with their own account. A device account keeps its session (it is this phone's account
 * either way).
 */
export async function liveSignOut() {
  if (!(await api.signedInWithAccount())) return;
  const google = await api.signedInWithGoogle();
  // This phone stops getting the account's notifications (while the session can still say so).
  await stopPush();
  await api.logout();
  if (google) await googleSignOut();
}

/** Deletes the account on the server; the caller then clears this phone (store resetAll). */
export async function deleteLiveAccount() {
  await api.deleteAccount();
  await googleSignOut();
}

/**
 * Settings → Hesabı sil in a live build: asked twice, then deleted on the server (DELETE /api/me). Afterwards
 * `clearPhone` forgets everything on this phone, which lands on the welcome screen.
 */
export function confirmDeleteLiveAccount(clearPhone: () => void) {
  const run = async () => {
    try {
      await deleteLiveAccount();
    } catch (e) {
      showAlert('Hesap silinemedi', `${message(e)}\n\nBiraz sonra tekrar deneyebilirsin.`);
      return;
    }
    clearPhone();
    setTimeout(() => showAlert('Hesabın silindi', 'Kişisel bilgilerin kaldırıldı. Burada geçirdiğin zaman için teşekkürler.'), 500);
  };
  const again = () =>
    showAlert('Emin misin?', 'Silinen hesap geri getirilemez.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Hesabımı sil', style: 'destructive', onPress: () => void run() },
    ]);
  showAlert(
    'Hesabı sil',
    'Profilin, fotoğrafın, mesajların, takip ve engel listen ile odaların kalıcı olarak silinir; kalan jeton ve elmasların da kullanılamaz. Yasal olarak saklanması gereken ödeme kayıtları, adınla bağı kesilerek tutulur.',
    [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Devam et', style: 'destructive', onPress: () => setTimeout(again, 450) },
    ],
  );
}

/** 'moment' / 'comment': an Anlar post or comment (its server id). */
export type ReportType = 'user' | 'room' | 'moment' | 'comment';
/** True when the report goes to the server: a real person (not me), a real room or an Anlar post in a live build. */
export const reportsToServer = (type: ReportType, id: string) =>
  liveMode() && (type === 'user' ? id !== 'me' && !!toServer(id) : type === 'room' ? isServerId(id) : /^\d{1,18}$/.test(id));

/** A report for the moderators' queue (POST /api/report). The same thing reported twice counts once. */
export async function liveReport(type: ReportType, id: string, reason: string, note?: string) {
  const target = type === 'user' ? toServer(id) : id;
  if (!target) throw new Error('Bu kişiye şu an ulaşılamıyor');
  const clean = note?.trim().slice(0, 500);
  await api.apiRequest('POST', '/api/report', { type, id: target, reason, ...(clean ? { note: clean } : {}) });
}
