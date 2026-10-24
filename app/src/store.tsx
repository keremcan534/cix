import { createContext, useContext, useState, type ReactNode } from 'react';

import { CONVERSATIONS, type Conversation } from '@/data/mock';

type AppState = {
  coins: number;
  addCoins: (n: number) => void;
  spendCoins: (n: number) => boolean;
  following: Set<string>;
  toggleFollow: (userId: string) => void;
  conversations: Conversation[];
  sendMessage: (userId: string, text: string, fromMe?: boolean) => void;
  markRead: (userId: string) => void;
};

const Ctx = createContext<AppState | null>(null);

const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [coins, setCoins] = useState(250);
  const [following, setFollowing] = useState<Set<string>>(new Set(['u1']));
  const [conversations, setConversations] = useState(CONVERSATIONS);

  const value: AppState = {
    coins,
    addCoins: (n) => setCoins((c) => c + n),
    spendCoins: (n) => {
      if (coins < n) return false;
      setCoins((c) => c - n);
      return true;
    },
    following,
    toggleFollow: (id) =>
      setFollowing((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    conversations,
    sendMessage: (userId, text, fromMe = true) =>
      setConversations((prev) => {
        const msg = { id: String(Date.now() + Math.random()), fromMe, text, time: now() };
        const existing = prev.find((c) => c.userId === userId);
        if (!existing) return [{ id: `c-${userId}`, userId, unread: 0, messages: [msg] }, ...prev];
        return [
          { ...existing, messages: [...existing.messages, msg] },
          ...prev.filter((c) => c.userId !== userId),
        ];
      }),
    markRead: (userId) =>
      setConversations((prev) => prev.map((c) => (c.userId === userId ? { ...c, unread: 0 } : c))),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
