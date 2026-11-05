// Room staff mute someone in a server room (server/api/rooms.mjs POST /api/rooms/mute): chat or mic, for a set
// time. The server enforces it through the voice token, keeps the record and decides who may do it (an admin up
// to 7 days, the owner longer or until lifted; nobody mutes the owner). The first sheet picks what, the second
// for how long.
import { useRef, useState } from 'react';

import { ActionSheet } from '@/components/ActionSheet';
import { showAlert } from '@/lib/alert';
import { roomMute } from '@/lib/api';
import { message, toServer } from '@/lib/live';

const TIMES: { label: string; minutes: number | null; ownerOnly?: boolean }[] = [
  { label: '5 dakika', minutes: 5 },
  { label: '15 dakika', minutes: 15 },
  { label: '1 saat', minutes: 60 },
  { label: '1 gün', minutes: 1440 },
  { label: '7 gün', minutes: 10080 },
  { label: '30 gün', minutes: 43200, ownerOnly: true },
  { label: 'Ben kaldırana kadar', minutes: null, ownerOnly: true },
];

type Target = { uid: string; name: string };

/** `start(uid, name)` opens the sheets; render `sheet`. `owner`: the room's owner (longer times). */
export function useRoomMute(roomId: string, owner: boolean, onDone?: (text: string) => void) {
  const [target, setTarget] = useState<Target | null>(null);
  const [kind, setKind] = useState<'text' | 'voice' | null>(null);

  const [picking, setPicking] = useState(false);
  const picked = useRef(false);
  const close = () => {
    picked.current = false;
    setTarget(null);
    setKind(null);
    setPicking(false);
  };
  // One sheet at a time: the second opens once the first has slid away.
  const pick = (k: 'text' | 'voice') => {
    picked.current = true;
    setPicking(true);
    setTimeout(() => {
      setKind(k);
      setPicking(false);
    }, 250);
  };
  const apply = async (t: Target, k: 'text' | 'voice', minutes: number | null, label: string) => {
    const user = toServer(t.uid);
    if (!user) return;
    try {
      await roomMute(roomId, user, k, minutes);
      onDone?.(`${t.name} ${k === 'text' ? 'sohbette' : 'mikrofonda'} susturuldu · ${label}`);
    } catch (e) {
      showAlert('Susturulamadı', message(e));
    }
  };

  const sheet = (
    <>
      <ActionSheet
        visible={!!target && !kind && !picking}
        title={target ? `${target.name} · ne susturulsun?` : ''}
        // A pick closes this sheet too (ActionSheet calls onClose just before the option): only a real dismissal
        // forgets the target, so wait until the option has had its say.
        onClose={() => setTimeout(() => !picked.current && close(), 0)}
        options={[
          { label: 'Oda sohbeti (yazılı)', icon: 'chatbubble-outline', onPress: () => pick('text') },
          { label: 'Mikrofon (sesli)', icon: 'mic-off-outline', onPress: () => pick('voice') },
        ]}
      />
      <ActionSheet
        visible={!!target && !!kind}
        title="Ne kadar süre?"
        onClose={close}
        options={TIMES.filter((x) => owner || !x.ownerOnly).map((x) => ({
          label: x.label,
          onPress: () => {
            const t = target;
            const k = kind;
            close();
            if (t && k) void apply(t, k, x.minutes, x.label);
          },
        }))}
      />
    </>
  );
  return { start: (uid: string, name: string) => setTimeout(() => setTarget({ uid, name }), 300), sheet };
}
