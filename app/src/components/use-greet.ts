// "Selam" on Benzerler and Anlar. Whether you already greeted someone comes from the conversations in the
// store, so it holds across screens and restarts: a second tap opens the chat instead of sending another
// greeting (and can't farm the greetings task).
import { router } from 'expo-router';

import type { User } from '@/data/mock';
import { useApp } from '@/store';

export function useGreet() {
  const { conversations, sendMessage, bump } = useApp();
  const hasGreeted = (id: string) => conversations.some((c) => c.userId === id && c.messages.some((m) => m.fromMe));
  const greet = (user: User) => {
    if (hasGreeted(user.id)) return router.push(`/sohbet/${user.id}`);
    // A greeting is a free icebreaker; follow-up DMs follow the paid-DM rule in the chat screen.
    sendMessage(user.id, 'Selam! 👋');
    bump('greetings');
  };
  return { hasGreeted, greet };
}
