// Şans Çarkı is a casino game now (Cömertlik level 2+) (Oyun Merkezi spec §4.1); old links land on it in the game center,
// where the same VIP check, limits and history apply as from a room.
// While the game admin keeps the wheel switched off, the link opens the game center instead of a locked screen.
import { Redirect } from 'expo-router';

import { useGames } from '@/lib/games';

export default function LuckyWheel() {
  const on = useGames().casino.some((g) => g.id === 'wheel' && g.active);
  return <Redirect href={on ? { pathname: '/oyunlar', params: { oyun: 'wheel' } } : '/oyunlar'} />;
}
