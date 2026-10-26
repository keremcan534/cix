// Şans Çarkı is a casino game now (Servet Seviyesi 2+) (Oyun Merkezi spec §4.1); old links land on it in the game center,
// where the same VIP check, limits and history apply as from a room.
import { Redirect } from 'expo-router';

export default function LuckyWheel() {
  return <Redirect href={{ pathname: '/oyunlar', params: { oyun: 'wheel' } }} />;
}
