// "Selam" on Benzerler and Anlar. Whether you already greeted someone comes from the conversations in the
// store, so it holds across screens and restarts: a second tap opens the chat instead of sending another
// greeting (and can't farm the greetings task). A greeting to a real person goes through the server like any
// other message (lib/live/messages liveDm); it counts for the greetings task once the server took it, and if it
// didn't go, the chat shows why (with "Tekrar dene" when a retry can help).
import { router } from 'expo-router';

import type { User } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { newRef } from '@/lib/api';
import { liveMode } from '@/lib/live';
import { isLiveUser, liveDm } from '@/lib/live/messages';
import { useApp } from '@/store';

const GREETING = 'Selam! 👋';

export function useGreet() {
  const { conversations, sendMessage, bump, markMessageSent, setMessageFailed } = useApp();
  const hasGreeted = (id: string) => conversations.some((c) => c.userId === id && c.messages.some((m) => m.fromMe));
  /** A live build greets only real people: a sample profile has no one behind it. */
  const canGreet = (id: string) => !liveMode() || isLiveUser(id);
  const greet = (user: User) => {
    if (hasGreeted(user.id)) return router.push(`/sohbet/${user.id}`);
    if (!canGreet(user.id)) return showAlert('Kullanıcı bulunamadı', 'Bu kişiye selam gönderilemiyor.');
    // A greeting is a free icebreaker; follow-up DMs follow the paid-DM rule in the chat screen.
    if (!isLiveUser(user.id)) {
      sendMessage(user.id, GREETING);
      bump('greetings');
      return;
    }
    const ref = newRef();
    sendMessage(user.id, GREETING, true, undefined, ref);
    liveDm(user.id, GREETING, ref, (r) => {
      if (!r.ok) return setMessageFailed(user.id, ref, r.reason, r.retry);
      markMessageSent(user.id, ref, r.message);
      bump('greetings');
    });
  };
  return { hasGreeted, greet, canGreet };
}
