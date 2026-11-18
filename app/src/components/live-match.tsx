// Hemen Tanış in a live build (/eslesme): random voice or video matches on the server (lib/live/one-on-one).
// The server pairs, charges and ends; this screen picks the mode, waits in the queue (asking every few seconds,
// or the server drops me), and shows the match. Non-streamers get a few free matches a day (each a short one);
// after that every minute is charged. The first use asks for an 18+ confirmation (kept on this phone).
// Leaving the screen leaves the queue and ends the match.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';

import { CallStage, Ctrl } from '@/components/call-stage';
import { MatchLobby } from '@/components/match-lobby';
import { joinCallMedia, leaveCallMedia } from '@/lib/call-media';
import { callToken, currentCall, dismissCall, endText, hangUp, isOpen, joinMatch, leaveMatch, matchState, MODE_NAME, otherId, refusal, useCall, type CallMode, type CallView, type MatchRights } from '@/lib/live/one-on-one';
import { useApp } from '@/store';

const ADULT_KEY = 'similarclub:match-18';
/** The queue forgets a phone that doesn't ask for 12 s (server/api/one-on-one.mjs QUEUE_S). */
const POLL_MS = 2_500;

type Phase = 'pick' | 'waiting' | 'matched';

export function LiveMatch() {
  const { me, settings } = useApp();
  const current = useCall();
  const [adult, setAdult] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('pick');
  const [mode, setMode] = useState<CallMode>('voice');
  const [rights, setRights] = useState<MatchRights | null>(null);
  const [error, setError] = useState<{ text: string; coins: boolean } | null>(null);
  const [matchId, setMatchId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  // My match as last seen (the store moves on once another call rings).
  const [kept, setKept] = useState<CallView | null>(null);
  if (current && current.id === matchId && current !== kept) setKept(current);
  const match = matchId && kept?.id === matchId ? kept : null;
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const take = (r: Awaited<ReturnType<typeof matchState>>) => {
    setRights(r.rights);
    if (r.state === 'matched' && r.call) {
      setMatchId(r.call.id);
      setPhase('matched');
    } else if (r.state === 'waiting') setPhase('waiting');
    else if (phaseRef.current === 'waiting') setPhase('pick');
  };

  useEffect(() => {
    void AsyncStorage.getItem(ADULT_KEY)
      .then((v) => setAdult(v === '1'))
      .catch(() => setAdult(false));
    void matchState()
      .then(take)
      .catch(() => {});
  }, []);

  // Waiting: ask every few seconds (the server pairs me with whoever comes, or keeps me in the queue).
  useEffect(() => {
    if (phase !== 'waiting') return;
    const t = setInterval(() => void matchState().then(take).catch(() => {}), POLL_MS);
    return () => clearInterval(t);
  }, [phase]);

  // Matched and live: join the voice and video. Over: leave them.
  const joined = useRef<number | null>(null);
  const status = match?.status;
  useEffect(() => {
    if (!match) return;
    if (status === 'live' && joined.current !== match.id) {
      const id = match.id;
      joined.current = id;
      void callToken(id)
        .then((token) => joinCallMedia(id, token, match.mode === 'video', otherId(match)))
        .catch(() => (joined.current = null));
    }
    if (status && !isOpen(match)) {
      leaveCallMedia();
      void matchState()
        .then((r) => setRights(r.rights))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, match?.id]);

  // Leaving the screen: out of the queue, the match ends.
  useEffect(
    () => () => {
      leaveCallMedia();
      const c = currentCall();
      if (c?.kind === 'match' && isOpen(c)) void hangUp(c.id).catch(() => {});
      else if (phaseRef.current === 'waiting') void leaveMatch().catch(() => {});
      if (c?.kind === 'match') dismissCall(c.id);
    },
    [],
  );

  const start = async (m: CallMode) => {
    if (starting) return;
    setMode(m);
    setError(null);
    setStarting(true);
    try {
      if (matchId) dismissCall(matchId);
      setMatchId(null);
      take(await joinMatch(m));
    } catch (e) {
      setError(refusal(e));
      setPhase('pick');
    } finally {
      setStarting(false);
    }
  };
  const cancel = () => {
    setPhase('pick');
    void leaveMatch()
      .then(take)
      .catch(() => {});
  };
  const end = () => match && isOpen(match) && void hangUp(match.id).catch(() => {});
  const next = async () => {
    if (match && isOpen(match)) await hangUp(match.id).catch(() => {});
    void start(match?.mode ?? mode);
  };

  if (match?.status === 'live') {
    return <CallStage call={match} onEnd={end} extra={<Ctrl icon="play-skip-forward" label="Sıradaki" onPress={() => void next()} />} />;
  }

  const minor = me.age > 0 && me.age < 18;
  const waiting = phase === 'waiting';
  return (
    <MatchLobby
      avatar={me.avatar}
      waiting={waiting}
      status={waiting ? `${MODE_NAME[mode]} · sana uygun biri aranıyor…` : match ? endText(match) : 'Rastgele biriyle sesli ya da görüntülü tanış'}
      still={settings.reduceMotion || settings.effectsOff}
      gate={minor ? 'minor' : adult === false ? 'adult' : adult === null ? 'loading' : null}
      rights={rights}
      busy={starting}
      error={error}
      onAccept={() => (setAdult(true), void AsyncStorage.setItem(ADULT_KEY, '1').catch(() => {}))}
      onStart={(m) => void start(m)}
      onCancel={cancel}
    />
  );
}
