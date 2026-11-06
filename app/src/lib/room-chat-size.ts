// How tall the room chat is: a share of the screen height the person chose by dragging the handle above the
// chat tabs (components/room/chat-feed). It stays the same while banners, boards and mics come and go above
// it (the stage takes the rest and scrolls), and is kept on this phone for the next room.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'similarclub:roomChatShare:v1';
export const CHAT_MIN = 0.2;
export const CHAT_DEFAULT = 0.36;
export const CHAT_MAX = 0.56;

/** Any number → a share the chat may take (NaN and junk → the default). */
export const clampChatShare = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(CHAT_MAX, Math.max(CHAT_MIN, x)) : CHAT_DEFAULT);

/** A tap on the handle: a small or normal chat grows to the largest, the largest goes back to normal. */
export const toggledChatShare = (share: number) => (share < (CHAT_DEFAULT + CHAT_MAX) / 2 ? CHAT_MAX : CHAT_DEFAULT);

let share = CHAT_DEFAULT;
AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (raw !== null) share = clampChatShare(Number(raw));
  })
  .catch(() => {});

export const getChatShare = () => share;
export function setChatShare(x: number) {
  share = clampChatShare(x);
  AsyncStorage.setItem(KEY, String(Math.round(share * 1000) / 1000)).catch(() => {});
  return share;
}
