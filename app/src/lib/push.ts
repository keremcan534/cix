// Push notifications in a live build (server/api/push.mjs): calls ring, messages, gifts and follows arrive while
// the app is closed. This phone's Firebase token goes to the server, which sends through Firebase Cloud
// Messaging. It needs the Firebase file in the build (preview.yml writes it from the GOOGLE_SERVICES_JSON secret)
// and the server's Firebase key (FCM_SERVICE_ACCOUNT); without the file the token can't be read and nothing
// happens (no permission prompt for notifications that could never come).
//
// Calls use their own Android channel (highest importance, the phone's ringtone sound), so a call shows on top
// and rings; a tap opens the app, where the incoming call card (components/incoming-call) answers it.
import { router } from 'expo-router';
import { Platform } from 'react-native';

import * as api from '@/lib/api';
import { pushTarget } from '@/lib/push-target';

type Notifications = typeof import('expo-notifications');
type Sub = { remove: () => void };

let started: Promise<void> | null = null;
let token: string | null = null;
const subs: Sub[] = [];

const open = (data: Record<string, unknown> | undefined) => {
  const to = pushTarget(data);
  if (to) router.push(to);
};

/** After a live sign-in: reads this phone's token, sends it to the server and listens for taps. Once per sign-in. */
export function startPush(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return Promise.resolve();
  started ??= (async () => {
    const N: Notifications = await import('expo-notifications');
    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync('calls', {
        name: 'Aramalar',
        importance: N.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 600, 400, 600],
        lockscreenVisibility: N.AndroidNotificationVisibility.PUBLIC,
      });
      await N.setNotificationChannelAsync('default', { name: 'Bildirimler', importance: N.AndroidImportance.HIGH, sound: 'default' });
    }
    // Shown while the app is open as well (a message in another chat, a gift), with its sound.
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    let device: string;
    try {
      device = String((await N.getDevicePushTokenAsync()).data);
    } catch {
      // No Firebase file in this build (or no Play services): push stays off, quietly.
      started = null;
      return;
    }
    const perm = await N.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) await N.requestPermissionsAsync();
    await send(device);
    subs.push(N.addPushTokenListener((t) => void send(String(t.data))));
    subs.push(N.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data)));
    // The tap that opened the app from closed.
    const first = N.getLastNotificationResponse();
    if (first) open(first.notification.request.content.data);
  })().catch((e) => {
    started = null;
    console.warn('[bildirim]', e instanceof Error ? e.message : String(e));
  });
  return started;
}

async function send(t: string) {
  token = t;
  await api.registerPush(t, Platform.OS === 'ios' ? 'ios' : 'android', 'fcm');
}

/** Before signing out: this phone stops getting the account's notifications. Best effort. */
export async function stopPush() {
  for (const s of subs.splice(0)) s.remove();
  const t = token;
  token = null;
  started = null;
  if (t) await api.unregisterPush(t).catch(() => {});
}
