// Kimlik ve yüz doğrulaması on the server (server/api/verify.mjs): my state, opening the provider's page in the
// browser under the consent the screen showed, asking again on the way back, and withdrawing consent. The provider's
// page sends the person back to the app (similarclub://kimlik-dogrulama); the screen asks the server then.
import * as api from '@/lib/api';
import { parseCheck, parseVerifyState, verifyUrl, type VerifyCheck, type VerifyKind, type VerifyState } from '@/lib/verify-core';

const readOrThrow = (v: unknown): VerifyState => {
  const s = parseVerifyState(v);
  if (!s) throw new Error('Doğrulama bilgisi okunamadı. Tekrar dene.');
  return s;
};

/** My checks, the badge and the consent texts. An older server has no such call: null. */
export async function loadVerify(): Promise<VerifyState | null> {
  try {
    return readOrThrow(await api.verifyState());
  } catch (e) {
    if (e instanceof api.ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Opens a session for `kind` under consent `version`: { url } to open, or { check } when it is already decided or
 * waits for staff (no page). A changed consent text comes back as { consentChanged } with the new state to show.
 */
export async function startVerify(kind: VerifyKind, version: string): Promise<{ url: string | null; check: VerifyCheck | null; consentChanged?: true }> {
  try {
    const r = await api.verifyStart(kind, version);
    return { url: verifyUrl(r.url), check: parseCheck(r.check) };
  } catch (e) {
    if (e instanceof api.ApiError && e.status === 409 && (e.data as { code?: string }).code === 'consent_changed') return { url: null, check: null, consentChanged: true };
    throw e;
  }
}

/** Back from the provider's page: the state as the server reads it from the provider now. */
export async function refreshVerify(kind: VerifyKind): Promise<VerifyState> {
  await api.verifyRefresh(kind);
  return readOrThrow(await api.verifyState());
}

/** Consent withdrawn for `kind`: my checks and the provider's copy go; resolves with the state after. */
export async function withdrawVerify(kind: VerifyKind): Promise<VerifyState> {
  await api.verifyWithdraw(kind);
  return readOrThrow(await api.verifyState());
}
