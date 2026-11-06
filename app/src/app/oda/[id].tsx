// /oda/[id] opens a room and marks where the full room is shown. The room itself is rendered once by
// RoomHost above the stack (components/room/room-host.tsx), so leaving this route never ends the session.
// System back, the room's close button or any navigation that would remove this route asks first:
// "Odayı küçült" (stay in the room, mini card) or "Odadan çık".
import { router, useIsFocused, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { isServerId, roomById, serverRoomKnown } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { refusalTitle } from '@/lib/contact-filter';
import { liveMode, loadRooms, message, openServerRoom } from '@/lib/live';
import { endRoom, getSession, openRoom, registerOpener, requestLeave, setLeaving, useRoomSession } from '@/lib/room-session';
import { savedAtStart } from '@/lib/room-session-persist';
import { useApp } from '@/store';
import { colors } from '@/theme';

const stepBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * Live mode (lib/live): "Oda aç" opens my room on the server first and comes back as /oda/<its id>; a server room
 * this phone hasn't listed yet (a link, a restart) is read from the server before it opens.
 */
export default function RoomRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { myRoom } = useApp();
  const [, setLoaded] = useState(0);
  const pending = liveMode() && (id === 'yeni' || (isServerId(id) && !serverRoomKnown(id)));
  useEffect(() => {
    if (!pending) return;
    let alive = true;
    const fail = (title: string, text: string) => {
      if (!alive) return;
      showAlert(title, text);
      stepBack();
    };
    const work =
      id === 'yeni'
        ? openServerRoom(myRoom.title, myRoom.announcement).then((r) => alive && router.replace(`/oda/${r.id}`))
        : loadRooms().then(() => (serverRoomKnown(id) ? alive && setLoaded((n) => n + 1) : fail('Oda bulunamadı', 'Bu oda kapanmış olabilir.')));
    work.catch((e) => fail(refusalTitle(e, 'Oda açılamadı'), message(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pending]);
  if (pending)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  return <RoomOpen />;
}

function RoomOpen() {
  const { id, via } = useLocalSearchParams<{ id: string; via?: string }>();
  const { myRoom } = useApp();
  const { session, switchTo, leaving } = useRoomSession();
  const focused = useIsFocused();
  const mine = !!session && session.roomId === id && session.status !== 'ended';
  const base = id === 'yeni' ? { title: myRoom.title, cover: myRoom.cover } : roomById(id);

  // Open once per visit; an already open room comes back as it is (no reconnect).
  useEffect(() => {
    if (!base) {
      showAlert('Oda bulunamadı', 'Bu oda kapanmış veya bağlantı hatalı olabilir.');
      stepBack();
      return;
    }
    // After a restart (recovery card, deep link or reload into the same room) the mic starts off.
    const recovered = getSession().recovery?.roomId === id || savedAtStart()?.roomId === id;
    openRoom(id, { title: base.title, cover: base.cover, via, recovered });
    setLeaving(false);
    const unregister = registerOpener(id);
    return () => {
      unregister();
      setLeaving(false);
      // Left before getting in (password screen, entry refused): nothing to keep.
      const s = getSession().session;
      if (s?.roomId === id && !s.joined && s.status !== 'ended') endRoom('left');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Any removal of this route while the user is in the room asks first. Repeated back presses only reopen the
  // same question; nothing leaves the room except "Odadan çık".
  usePreventRemove(mine && !!session?.joined && focused && !leaving, ({ repeat }) => requestLeave(repeat));

  // Nothing to show here any more (left from the mini card, switch declined, room ended and read): step back.
  // Reads the session fresh, so it also sees what the open effect above just did.
  const switchHere = switchTo?.roomId === id;
  const found = !!base;
  useEffect(() => {
    if (!focused || !found) return;
    const st = getSession();
    if (st.leaving || st.session?.roomId === id || st.switchTo?.roomId === id) return;
    stepBack();
  }, [focused, found, id, mine, switchHere, leaving, session]);

  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
