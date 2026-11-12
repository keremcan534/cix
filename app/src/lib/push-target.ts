// Where a tapped push notification opens (lib/push), from the data the server's notify calls send
// (server/api: messages, gifts, follows, families, withdrawals, calls, room invites). Plain logic: the unit tests import it.
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
    case 'family_invite':
      return '/aile';
    case 'withdrawal':
      return '/cuzdan';
    // An invite reward paid (server/api/referrals.mjs): Arkadaşını Getir.
    case 'invite':
      return '/davet';
    // A room invite from an account I follow (server/api/room-social.mjs): the room. An Odalar arası PK invite to my
    // room (server/api/pk-cross.mjs): my room, where its answer card waits.
    case 'room_invite':
    case 'pk_invite':
      return s('room') ? (`/oda/${s('room')}` as Href) : '/bildirimler';
    // A staff reply on a support ticket (server/api/support.mjs): Destek › Taleplerim.
    case 'support':
      return '/destek?tab=talepler';
    // An event's review result, cancel or removal (server/api/events.mjs): Etkinlik Merkezi on that event.
    case 'event':
      return s('id') && /^\d{1,12}$/.test(s('id')!) ? (`/?etkinlik=${s('id')}` as Href) : '/';
    // A call: the app opens and its incoming call card rings; a missed one shows in the notifications.
    case 'call':
      return data.missed ? '/bildirimler' : null;
    default:
      return '/bildirimler';
  }
}
