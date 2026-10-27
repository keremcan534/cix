// The one place the live room lives. Mounted once above the navigation stack (like MatchLayer), so the room
// screen, its chat, mic and timers survive navigation: the route /oda/[id] only decides whether it is shown
// full screen. Elsewhere the same instance stays mounted but hidden, and the mini card stands in for it.
// Also connects the session to the OS: app foreground/background, the realtime connection, and the saved
// room for a restart.
import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { LiveRoom } from '@/components/room/live-room';
import { EndedDialog, LeaveSheet, MiniRoom, RecoveryCard, SessionToast, SwitchDialog } from '@/components/room/session-ui';
import { useOnline } from '@/lib/room-presence';
import { endRoom, getSession, onAppState, onNetwork, setPersist, setRecovery, useRoomSession } from '@/lib/room-session';
import { loadSavedRoom, saveRoom } from '@/lib/room-session-persist';

export function RoomHost() {
  const { session, recovery } = useRoomSession();
  const path = usePathname();
  const full = !!session && path === `/oda/${session.roomId}`;
  const live = !!session && session.status !== 'ended';

  // Restart: the room saved by the last run (if the OS ended the app while in it) is offered, never rejoined silently.
  useEffect(() => {
    setPersist(saveRoom);
    let cancelled = false;
    loadSavedRoom().then((saved) => {
      if (!cancelled && saved && !getSession().session) setRecovery({ roomId: saved.roomId, title: saved.title });
    });
    return () => {
      cancelled = true;
      // Logged out: the room is left properly (mic, connection, membership).
      endRoom('left');
    };
  }, []);

  // Foreground / background (web: page visibility). Background never ends the session.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') onAppState('active');
      else if (next === 'background') onAppState('background');
    });
    return () => sub.remove();
  }, []);

  // The device's realtime connection drives reconnection.
  const online = useOnline();
  useEffect(() => {
    onNetwork(online);
  }, [online]);

  return (
    <>
      {live && (
        <View style={full ? StyleSheet.absoluteFill : styles.hidden} pointerEvents={full ? 'auto' : 'none'}>
          <LiveRoom key={session.roomId} id={session.roomId} via={session.via} full={full} />
        </View>
      )}
      {session && !full && <MiniRoom session={session} />}
      {session && full && session.status === 'ended' && <EndedDialog session={session} />}
      {!session && recovery && <RecoveryCard roomId={recovery.roomId} title={recovery.title} />}
      <LeaveSheet />
      <SwitchDialog />
      <SessionToast />
    </>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
});
