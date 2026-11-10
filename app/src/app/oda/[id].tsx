// /oda/[id] opens a room and marks where the full room is shown. The room itself is rendered once by
// RoomHost above the stack (components/room/room-host.tsx), so leaving this route never ends the session.
// System back, the room's close button or any navigation that would remove this route asks first:
// "Odayı küçült" (stay in the room, mini card) or "Odadan çık".
import { router, useIsFocused, useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CreateRoomSheet } from '@/components/room/create-room-sheet';
import { Text, TextInput } from '@/components/text';
import { Button, StateIcon } from '@/components/ui';
import { isServerId, roomById, serverRoomKnown } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { refusalTitle } from '@/lib/contact-filter';
import { isLockedRoom, isMyServerRoom, liveMode, liveSignIn, loadRooms, message, myServerId } from '@/lib/live';
import { roomPassword, setRoomPassword } from '@/lib/live/room-password';
import { roomStaff } from '@/lib/live/room-staff';
import { endRoom, getSession, openRoom, registerOpener, requestLeave, setLeaving, useRoomSession } from '@/lib/room-session';
import { savedAtStart } from '@/lib/room-session-persist';
import { useApp } from '@/store';
import { colors, radius, space } from '@/theme';
import { BrandLoader } from '@/components/fx/brand-loader';

const stepBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * Live mode (lib/live): only server rooms exist here (the sample rooms and their bots stay in the demo). "Oda aç"
 * (/oda/yeni) goes to my open room, or shows the create sheet when I have none; a server room this phone hasn't
 * listed yet (a link, a restart) is read from the server first, and a password room asks for its password.
 */
export default function RoomRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (liveMode() && id !== 'yeni' && !isServerId(id)) return <RoomMissing />;
  if (liveMode()) return <LiveRoomGate key={id} id={id} />;
  return <RoomOpen />;
}

/** A sample room's link (r1, a demo notification) in a live build: nothing to open. */
function RoomMissing() {
  return (
    <View style={st.center}>
      <StateIcon name="radio-outline" />
      <Text style={st.title}>Oda bulunamadı</Text>
      <Text style={st.lead}>Bu oda artık yok ya da bağlantı hatalı. Açık odaları ana sayfada bulabilirsin.</Text>
      <Button title="Geri dön" icon="arrow-back" onPress={stepBack} style={st.wide} />
    </View>
  );
}

type Gate = 'loading' | 'create' | 'password' | 'open';

/** A password room whose password I haven't typed this run and that I'm not already inside. */
const maybeLocked = (id: string) => {
  const s = getSession().session;
  return isLockedRoom(id) && !roomPassword(id) && !(s?.roomId === id && s.status !== 'ended');
};
/** A listed room opens at once unless it may need its password; then the server is asked first (the effect
 *  below), unless it is surely mine (my server id known and the list read with it). */
const gateFor = (id: string): Gate =>
  id === 'yeni' || !serverRoomKnown(id) ? 'loading' : !maybeLocked(id) || (!!myServerId() && isMyServerRoom(id)) ? 'open' : 'loading';

/** Whether I run this room (its owner or one of its admins): the server lets them in without the password.
 *  When that can't be read, the password is asked (the server still lets staff in with any). */
async function runsRoom(id: string) {
  const mine = myServerId();
  if (!mine) return false;
  try {
    const s = await roomStaff(id);
    return s.owner === mine || s.admins.some((a) => a.id === mine);
  } catch {
    return false;
  }
}

function LiveRoomGate({ id }: { id: string }) {
  const { me } = useApp();
  const [gate, setGate] = useState<Gate>(() => gateFor(id));
  useEffect(() => {
    if (gate !== 'loading') return;
    let alive = true;
    const fail = (title: string, text: string) => {
      if (!alive) return;
      showAlert(title, text);
      stepBack();
    };
    void (async () => {
      // "Is it mine, do I run it?" needs my server id (a cold start can list rooms before it is known): sign in
      // first if this run hasn't yet, then read the list with it.
      if (!myServerId()) await liveSignIn(me.name);
      const list = await loadRooms();
      if (!alive) return;
      if (id === 'yeni') {
        const mine = list.find((r) => r.hostId === 'me');
        if (mine) router.replace(`/oda/${mine.id}`);
        else setGate('create');
        return;
      }
      if (!serverRoomKnown(id)) return fail('Oda bulunamadı', 'Bu oda kapanmış olabilir.');
      const free = !maybeLocked(id) || isMyServerRoom(id) || (await runsRoom(id));
      if (alive) setGate(free ? 'open' : 'password');
    })().catch((e) => fail(refusalTitle(e, 'Oda açılamadı'), message(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, id]);

  if (gate === 'create')
    return (
      <View style={st.screen}>
        <CreateRoomSheet visible onClose={stepBack} onCreated={(r) => router.replace(`/oda/${r.id}`)} />
      </View>
    );
  if (gate === 'password') return <PasswordGate id={id} onDone={() => setGate('open')} />;
  if (gate === 'open') return <RoomOpen />;
  return (
    <View style={[st.screen, st.center]}>
      <BrandLoader />
    </View>
  );
}

/** A password room: the password goes with the voice token request (the server checks it; a wrong one ends the
 *  entry with "Oda şifresi yanlış" and the next visit asks again). */
function PasswordGate({ id, onDone }: { id: string; onDone: () => void }) {
  const [value, setValue] = useState('');
  const title = roomById(id)?.title ?? 'Oda';
  const enter = () => {
    const p = value.trim();
    if (!p) return;
    setRoomPassword(id, p);
    onDone();
  };
  return (
    <View style={st.center}>
      <StateIcon name="lock-closed" />
      <Text style={st.title} numberOfLines={2}>
        {title}
      </Text>
      <Text style={st.lead}>Bu oda şifreli. Girmek için oda sahibinin paylaştığı şifreyi yaz.</Text>
      <TextInput
        style={st.input}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={enter}
        maxLength={32}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        returnKeyType="go"
        placeholder="Oda şifresi"
        placeholderTextColor={colors.textDim}
        accessibilityLabel="Oda şifresi"
      />
      <Button title="Odaya gir" icon="enter-outline" disabled={!value.trim()} onPress={enter} style={st.wide} />
      <Button title="Vazgeç" variant="ghost" onPress={stepBack} style={st.wide} />
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl, gap: space.md },
  title: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  lead: { color: colors.textDim, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  input: { alignSelf: 'stretch', color: colors.text, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  wide: { alignSelf: 'stretch' },
});

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
