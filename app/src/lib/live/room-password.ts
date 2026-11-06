// The password someone typed for a password room (server/api/rooms.mjs `voiceAccess`): kept in memory for this
// app run only, so the voice token request (lib/api voiceToken) can send it. A refused token forgets it, and the
// room screen asks again. Never saved to the device.
const passwords = new Map<string, string>();

export const setRoomPassword = (roomId: string, password: string) => void passwords.set(roomId, password);
export const roomPassword = (roomId: string): string | undefined => passwords.get(roomId);
export const forgetRoomPassword = (roomId: string) => void passwords.delete(roomId);
/** Signed out: the next account starts without them. */
export const forgetRoomPasswords = () => passwords.clear();
