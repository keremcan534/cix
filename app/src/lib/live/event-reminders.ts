// Live mode (lib/live): Ayarlar › Bildirimler › Etkinlik hatırlatmaları is kept on the server, which sends the
// reminders of Etkinlik Merkezi (server/api/events.mjs, GET/POST /api/events/reminders). It is read when Ayarlar
// opens; a change shows at once and goes back, with a note, if the server refuses it. A server without the route
// (an older one) leaves the switch on this phone. The demo keeps it in the store only. One event's reminders are
// on its detail screen (components/events/event-detail).
import { useEffect, useRef } from 'react';

import * as api from '@/lib/api';
import { showAlert } from '@/lib/alert';
import { liveMode, message } from '@/lib/live';
import { useApp } from '@/store';

/** The setter for the switch; reads the server's choice into the store once per opening. */
export function useEventReminderSetting() {
  const { settings, setSetting } = useApp();
  // The latest switches, for answers that arrive after another change.
  const types = useRef(settings.notifyTypes);
  useEffect(() => {
    types.current = settings.notifyTypes;
  });
  const put = (on: boolean) => setSetting('notifyTypes', { ...types.current, event: on });
  // The newest change on its way: an older answer doesn't put the switch back.
  const seq = useRef(0);

  useEffect(() => {
    if (!liveMode()) return;
    let alive = true;
    const n = seq.current;
    api
      .eventReminders()
      .then((r) => alive && n === seq.current && types.current.event !== r.on && put(r.on))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Once per opening; put only writes into the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (on: boolean) => {
    const before = types.current.event;
    put(on);
    if (!liveMode()) return;
    const n = ++seq.current;
    api.setEventReminders(on).catch((e: unknown) => {
      if (n !== seq.current || (e instanceof api.ApiError && e.status === 404)) return;
      put(before);
      showAlert('Ayar kaydedilemedi', message(e));
    });
  };
}
