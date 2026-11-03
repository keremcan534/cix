// Web: no Google sign-in yet (the native library has no free web version). The button stays hidden and the web
// preview keeps the device sign-in. Same exports as google-sign-in.ts.
export const googleAvailable = () => false;
export async function googleIdToken(): Promise<string | null> {
  throw new Error('Google ile giriş web sürümünde henüz yok.');
}
export async function googleSignOut() {}
