// Where a tapped push notification opens (lib/push), from the data the server's notify calls send
// (server/api: messages, gifts, follows, families, withdrawals, calls). Plain logic: the unit tests import it.
import type { Href } from 'expo-router';

/** Where a tapped notification opens (its data from the server's notify calls). */
export function pushTarget(data: Record<string, unknown> | undefined): Href | null {
  const s = (k: string) => (typeof data?.[k] === 'string' ? (data[k] as string) : null);
  switch (data?.type) {
    case 'message':
      return s('from') ? (`/sohbet/${s('from')}` as Href) : '/(tabs)/mesajlar';
    case 'gift':
    case 'follow':
      return s('from') ? (`/kullanici/${s('from')}` as Href) : '/bildirimler';
    case 'family_joined':
    case 'family_request':
      return '/aile';
    case 'withdrawal':
      return '/cuzdan';
    // A call: the app opens and its incoming call card rings; a missed one shows in the notifications.
    case 'call':
      return data.missed ? '/bildirimler' : null;
    default:
      return '/bildirimler';
  }
}
