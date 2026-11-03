// Live mode direct messages (lib/live): messages to real people go to the server (api.sendDm); new ones from
// them are picked up by polling the conversation list (LiveSync, every 15 s) and added to the local threads.
// The last message id read per person is kept on the device, so a restart doesn't add old messages twice.
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as api from '@/lib/api';
import { liveMode, message, myServerId, rememberUser, toLocal, toServer } from '@/lib/live';
import { showAlert } from '@/lib/alert';
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

/** A chat with a real person (free, no demo replies, sent through the server). */
export const isLiveUser = (id: string) => liveMode() && isServerId(id);

/** Sends a message I already put in the local thread; tells me if the server refuses it. */
export function liveDm(to: string, text: string) {
  const id = toServer(to);
  if (!id) return;
  api
    .sendDm(id, text)
    .then((m) => {
      if (seen) seen[id] = Math.max(seen[id] ?? 0, m.id);
    })
    .catch((e) => showAlert('Mesaj gönderilemedi', message(e)));
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
