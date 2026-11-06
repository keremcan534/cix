// The "Oda oluştur" form's rules (components/room/create-room-sheet), the same limits the server checks again
// (server/api/rooms.mjs POST /api/rooms: title 1–40, bulletin 0–200, password 4–32, all trimmed).
export const ROOM_FORM = { title: 40, announcement: 200, passwordMin: 4, passwordMax: 32 } as const;

/** The form's problem in plain Turkish, or null when it can be sent. */
export function roomFormError(title: string, password: string): string | null {
  if (!title.trim()) return 'Odana bir ad ver.';
  const p = password.trim();
  if (p && (p.length < ROOM_FORM.passwordMin || p.length > ROOM_FORM.passwordMax)) return `Şifre ${ROOM_FORM.passwordMin}–${ROOM_FORM.passwordMax} karakter olmalı.`;
  return null;
}
