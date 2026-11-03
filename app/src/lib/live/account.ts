// Live mode account actions (lib/live): Google sign-in, signing out, deleting the account and reporting someone,
// the parts Google Play asks for. Screens call these only in live mode; the prototype keeps its local flows.
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { googleAvailable, googleIdToken, googleSignOut } from '@/lib/google-sign-in';
import { liveMode, liveSignIn, message, toServer } from '@/lib/live';
import { isServerId, type User } from '@/data/mock';

/** "Google ile devam et" on the welcome screen: a live build with the client id and the native module. */
export const googleSignInOffered = () => liveMode() && googleAvailable();

/** The server profile as the phone's own profile (`me`). */
export function profileFromServer(u: api.ServerMe): Partial<User> {
  return {
    name: u.name,
    bio: u.bio,
    interests: u.interests,
    ...(u.gender && { gender: u.gender }),
    ...(u.age !== null && { age: u.age }),
    ...(u.city && { city: u.city }),
    ...(u.username && { username: u.username }),
    ...(u.avatarUrl && { avatar: u.avatarUrl }),
  };
}

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
 * After "Çıkış yap": a Google account's session ends on the server and on the phone, so the next person picks
 * their own account. A device account keeps its session (it is this phone's account either way).
 */
export async function liveSignOut() {
  if (!(await api.signedInWithGoogle())) return;
  await api.logout();
  await googleSignOut();
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

export type ReportType = 'user' | 'room';
/** True when the report goes to the server: a real person (not me) or a real room in a live build. */
export const reportsToServer = (type: ReportType, id: string) => liveMode() && (type === 'user' ? id !== 'me' && !!toServer(id) : isServerId(id));

/** A report for the moderators' queue (POST /api/report). The same thing reported twice counts once. */
export async function liveReport(type: ReportType, id: string, reason: string, note?: string) {
  const target = type === 'user' ? toServer(id) : id;
  if (!target) throw new Error('Bu kişi test sunucusunda yok');
  const clean = note?.trim().slice(0, 500);
  await api.apiRequest('POST', '/api/report', { type, id: target, reason, ...(clean ? { note: clean } : {}) });
}
