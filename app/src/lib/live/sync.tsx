// Live mode background sync (lib/live): while signed in, keeps the balance and the Gelir locks in step with the
// server (a gift someone sends from another phone shows up here within seconds), polls direct messages and
// passes on the contact filter's refusals made on this phone, and tells me about new followers. On signing in it also takes the server's follow
// and block lists (a reinstall or a new sign-in starts from them). An open chat reads its own thread more often
// (lib/live/messages useLiveThread).
// Mounted once above the stack (app/_layout); renders nothing and does nothing without a server address.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { showAlert } from '@/lib/alert';
import { SignInAgain, countContactRefusal } from '@/lib/api';
import { onContactRefusal } from '@/lib/contact-filter';
import { liveMode, liveSignIn, message, refreshEarnings, refreshWallet } from '@/lib/live';
import { resumePurchases } from '@/lib/live/billing';
import { loadBlocks, loadFollowing } from '@/lib/live/blocks';
import { checkNewFollowers } from '@/lib/live/follows';
import { onLine, startLiveLine } from '@/lib/live/live-line';
import { pollMessages } from '@/lib/live/messages';
import { settleWithdrawals } from '@/lib/live/withdraw';
import { startPush } from '@/lib/push';
import { useApp } from '@/store';

const TICK_MS = 15_000;

export function LiveSync() {
  const app = useApp();
  // Read by the timer, which outlives a render.
  const appRef = useRef(app);
  useEffect(() => {
    appRef.current = app;
  });
  const name = app.me.name;

  // Room and group chats, moments, room polls … are refused on this phone and never reach the server, so the
  // refusal is reported for the moderators' count: its kind and place only, never the text. Best effort.
  useEffect(() => {
    if (!liveMode()) return;
    return onContactRefusal((r) => void countContactRefusal(r.category, r.place).catch(() => {}));
  }, []);

  useEffect(() => {
    if (!liveMode()) return;
    let alive = true;
    let tick = 0;
    let signedIn = false;
    // The timer and a return to the foreground can fire together: two runs at once would read the same
    // "last seen" message id and add the same messages twice.
    let running = false;
    let again = false;
    let resumed = false;
    const run = async () => {
      // A nudge from the live line while a run is going: one more run right after it, so nothing waits a tick.
      if (running) {
        again = true;
        return;
      }
      running = true;
      try {
        if (!signedIn) {
          await liveSignIn(name);
          signedIn = true;
          // Calls ring and messages arrive while the app is closed (lib/push; off until the build has Firebase).
          void startPush();
          // A Play purchase whose server answer was lost last time is verified now.
          resumePurchases();
          // Follows and blocks are kept on the server; one failing leaves this phone's list as it is.
          void loadFollowing()
            .then((ids) => alive && appRef.current.takeServerSocial({ following: ids }))
            .catch(() => {});
          void loadBlocks()
            .then((ids) => alive && appRef.current.takeServerSocial({ blocked: ids }))
            .catch(() => {});
          await refreshEarnings();
        } else {
          // A rejected withdrawal gives diamonds back: known before the balance is read, so it isn't a gift.
          await settleWithdrawals().catch(() => {});
          await refreshWallet();
          if (tick % 4 === 0) await refreshEarnings();
        }
        if (alive) await pollMessages(appRef.current);
        // New followers are noticed here as well, every minute and on returning to the app (push may be off).
        if (alive && (tick % 4 === 0 || resumed)) {
          resumed = false;
          void checkNewFollowers((n) => alive && appRef.current.notify(n)).catch(() => {});
        }
      } catch (e) {
        if (e instanceof SignInAgain) {
          // A Google, e-mail or phone account's session ended (signed out on the server, or expired): back to the welcome screen.
          signedIn = false;
          if (alive && appRef.current.loggedIn) {
            appRef.current.logout();
            showAlert('Oturumun sona erdi', 'Devam etmek için yeniden giriş yap.');
          }
          return;
        }
        // No network or the server is down: the next tick tries again; the screens keep the last state.
        console.warn(`[canlı] ${message(e)}`);
      } finally {
        running = false;
      }
      tick++;
      if (again && alive) {
        again = false;
        void run();
      }
    };
    void run();
    const t = setInterval(() => void run(), TICK_MS);
    // The live line (lib/live/live-line): a message, follow, gift, bond, family or team note for me is read now.
    // Calls and an open chat listen for their own events (lib/live/one-on-one, useLiveThread).
    const stopLine = startLiveLine();
    const offLine = onLine((e) => {
      if (e.type === 'call' || e.type === 'message_read') return;
      if (e.type === 'follow' || e.type === 'reconnected') resumed = true;
      void run();
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      resumed = true;
      void run();
    });
    return () => {
      alive = false;
      clearInterval(t);
      sub.remove();
      offLine();
      stopLine();
    };
    // Signing in uses the name once; a later rename goes through the profile screen (saveProfile).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
