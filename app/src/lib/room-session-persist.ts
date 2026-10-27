// The live room the user was in, kept on the device so a restart after the OS ended the app can offer a
// safe reconnect. Only the room id and title are stored: nothing about the voice connection is assumed to
// have survived, and the mic always starts off after a restart.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'similarclub:room-session:v1';
/** Older than this, the room has most likely moved on; no recovery is offered. */
export const RECOVERY_MAX_AGE_MS = 30 * 60_000;

export type SavedRoom = { roomId: string; title: string; at: number };

let checked: SavedRoom | null | undefined;
/**
 * The saved room as read at startup (undefined until the read finished). Read synchronously when a room
 * opens, so opening the same room right after a restart (a deep link, a reload) still counts as a restart.
 */
export const savedAtStart = () => checked;

export async function loadSavedRoom(now = Date.now()): Promise<SavedRoom | null> {
  const saved = await readSaved(now);
  if (checked === undefined) checked = saved;
  return saved;
}
async function readSaved(now: number): Promise<SavedRoom | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedRoom;
    if (!saved.roomId || now - saved.at > RECOVERY_MAX_AGE_MS) {
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

/** Called by the session on start, when the app goes to the background, and with null when the session ends. */
export function saveRoom(room: { roomId: string; title: string } | null) {
  // A session started or ended in this run: the startup record no longer describes a restart.
  checked = null;
  const write = room ? AsyncStorage.setItem(KEY, JSON.stringify({ ...room, at: Date.now() })) : AsyncStorage.removeItem(KEY);
  write.catch(() => {});
}

// Read once as early as possible (module load), before any room screen can open.
loadSavedRoom().catch(() => {});
