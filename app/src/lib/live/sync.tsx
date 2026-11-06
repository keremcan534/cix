// Live mode background sync (lib/live): while signed in, keeps the balance and the Gelir locks in step with the
// server (a gift someone sends from another phone shows up here within seconds), polls direct messages and
// passes on the contact filter's refusals made on this phone.
// Mounted once above the stack (app/_layout); renders nothing and does nothing without a server address.
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { showAlert } from '@/lib/alert';
import { SignInAgain, countContactRefusal } from '@/lib/api';
import { onContactRefusal } from '@/lib/contact-filter';
import { liveMode, liveSignIn, message, refreshEarnings, refreshWallet } from '@/lib/live';
import { resumePurchases } from '@/lib/live/billing';
import { pollMessages } from '@/lib/live/messages';
import { settleWithdrawals } from '@/lib/live/withdraw';
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
    const run = async () => {
      if (running) return;
      running = true;
      try {
        if (!signedIn) {
          await liveSignIn(name);
          signedIn = true;
          // A Play purchase whose server answer was lost last time is verified now.
          resumePurchases();
          await refreshEarnings();
        } else {
          // A rejected withdrawal gives diamonds back: known before the balance is read, so it isn't a gift.
          await settleWithdrawals().catch(() => {});
          await refreshWallet();
          if (tick % 4 === 0) await refreshEarnings();
        }
        if (alive) await pollMessages(appRef.current);
      } catch (e) {
        if (e instanceof SignInAgain) {
          // A Google account's session ended (signed out on the server, or expired): back to the welcome screen.
          signedIn = false;
          if (alive && appRef.current.loggedIn) {
            appRef.current.logout();
            showAlert('Oturumun sona erdi', 'Devam etmek için Google ile yeniden giriş yap.');
          }
          return;
        }
        // No network or the server is down: the next tick tries again; the screens keep the last state.
        console.warn(`[canlı] ${message(e)}`);
      } finally {
        running = false;
      }
      tick++;
    };
    void run();
    const t = setInterval(() => void run(), TICK_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void run());
    return () => {
      alive = false;
      clearInterval(t);
      sub.remove();
    };
    // Signing in uses the name once; a later rename goes through the profile screen (saveProfile).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
