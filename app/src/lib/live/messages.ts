// Live mode direct messages (lib/live): messages to real people go to the server (api.sendDm); new ones from
// them are picked up by polling the conversation list (LiveSync, every 15 s) and added to the local threads.
// The last message id read per person is kept on the device, so a restart doesn't add old messages twice.
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as api from '@/lib/api';
import { isContactBlocked } from '@/lib/contact-filter';
import { noteRefusal } from '@/lib/sanctions';
import { liveMode, message, myServerId, rememberUser, toLocal, toServer } from '@/lib/live';
import { isServerId } from '@/data/mock';

const SEEN_KEY = 'similarclub:dm-seen';
let seen: Record<string, number> | null = null;

async function loadSeen() {
  if (seen) return seen;
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    seen = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {};
  } catch {
    seen = {};
  }
  return seen;
}
const saveSeen = () => AsyncStorage.setItem(SEEN_KEY, JSON.stringify(seen ?? {})).catch(() => {});
/** Signed out: the next account on this phone reads its chats from the start. */
export function forgetSeen() {
  seen = {};
  void AsyncStorage.removeItem(SEEN_KEY).catch(() => {});
}

/** A chat with a real person (free, no demo replies, sent through the server). */
export const isLiveUser = (id: string) => liveMode() && isServerId(id);

/**
 * Sends a message I already put in the local thread. `ref` is its request id: a retry sends the same one, so
 * the server never stores it twice. `done` gets null when it went through, or the reason it didn't (shown on
 * the bubble with "tekrar dene", not as one alert per message). `contact` is true when the server refused it for
 * contact details (lib/contact-filter): sending it again would fail the same way.
 */
export function liveDm(to: string, text: string, ref: string, done: (failed: string | null, contact?: boolean) => void) {
  const id = toServer(to);
  if (!id) return;
  api
    .sendDm(id, text, ref)
    // "Last seen" stays where the poll left it: moving it up to my message would skip a reply with a lower id
    // that is already on the server (the poll skips my own messages anyway).
    .then(() => done(null))
    .catch((e) => {
      // Muted for DMs (403 muted): the details and the appeal open, besides the note on the bubble.
      noteRefusal(e, true);
      done(message(e), isContactBlocked(e));
    });
}

type Inbox = { receiveMessage: (userId: string, text: string) => void };

/** New messages from real people since the last poll go into the local threads (unread). */
export async function pollMessages(app: Inbox) {
  const me = myServerId();
  if (!me) return;
  const s = await loadSeen();
  const list = await api.conversations();
  let changed = false;
  for (const c of list) {
    rememberUser(c.user);
    const peer = c.user.id;
    const last = s[peer] ?? 0;
    if (c.last.id <= last) continue;
    // First time this phone sees the chat: start from its newest message without replaying the history.
    if (last === 0 && c.last.from === me) {
      s[peer] = c.last.id;
      changed = true;
      continue;
    }
    const thread = await api.dmThread(peer);
    const fresh = thread.filter((m) => m.id > last && m.from === peer).sort((a, b) => a.id - b.id);
    fresh.forEach((m) => app.receiveMessage(toLocal(peer), m.text));
    s[peer] = Math.max(last, ...thread.map((m) => m.id));
    changed = true;
  }
  if (changed) void saveSeen();
}
