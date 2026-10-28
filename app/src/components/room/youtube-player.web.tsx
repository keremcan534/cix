// Web: YouTube's official IFrame Player API (https://www.youtube.com/iframe_api). Only a validated video id is
// passed in; ads, age and region restrictions are YouTube's and are not bypassed.
import { useCallback, useEffect, useRef } from 'react';
import { View, type HostInstance } from 'react-native';

import { DRIFT_CHECK_MS, OWN_COMMAND_MS, YT_STATE, type YouTubePlayerProps } from '@/components/room/youtube-player-props';
import { expectedPosition, playerSync } from '@/lib/room-modes';
import { isVideoId } from '@/lib/youtube';

type YTPlayer = {
  loadVideoById: (o: { videoId: string; startSeconds?: number }) => void;
  cueVideoById: (o: { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allowSeekAhead: boolean) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};
type YTNamespace = { Player: new (el: HTMLElement, opts: object) => YTPlayer };
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

let api: Promise<YTNamespace> | null = null;
/** Loads the IFrame API script once per page. */
function loadApi(): Promise<YTNamespace> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!api)
    api = new Promise((resolve, reject) => {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        prev?.();
        if (w.YT) resolve(w.YT);
      };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => {
        api = null;
        s.remove();
        reject(new Error('iframe_api'));
      };
      document.head.appendChild(s);
    });
  return api;
}

export function YouTubePlayer(props: YouTubePlayerProps) {
  const host = useRef<HostInstance>(null);
  const player = useRef<YTPlayer | null>(null);
  const ready = useRef(false);
  const loaded = useRef<string | null>(null);
  const lastCmd = useRef(0);
  const blockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  /** Brings this player in line with the room (or leaves it alone while the viewer holds). */
  const apply = useCallback(() => {
    const p = player.current;
    const { playback, hold, muted, onBlocked } = latest.current;
    if (!p || !ready.current || !isVideoId(playback.videoId)) return;
    if (muted) p.mute();
    else p.unMute();
    if (playback.playbackStatus === 'error') return;
    const now = Date.now();
    if (loaded.current !== playback.videoId) {
      loaded.current = playback.videoId;
      lastCmd.current = now;
      const startSeconds = expectedPosition(playback, now);
      if (playback.playbackStatus === 'playing' && !hold) p.loadVideoById({ videoId: playback.videoId, startSeconds });
      else p.cueVideoById({ videoId: playback.videoId, startSeconds });
    } else {
      const state = p.getPlayerState();
      const sync = playerSync(playback, { position: p.getCurrentTime() || 0, playing: state === YT_STATE.playing }, now, hold);
      if (sync.seek !== null) {
        lastCmd.current = now;
        p.seekTo(sync.seek, true);
      }
      if (sync.play && state !== YT_STATE.playing && state !== YT_STATE.buffering) {
        lastCmd.current = now;
        p.playVideo();
      } else if (!sync.play && !hold && state === YT_STATE.playing) {
        lastCmd.current = now;
        p.pauseVideo();
      }
    }
    // Browsers may refuse to start a video with sound before the viewer touched the page.
    clearTimeout(blockTimer.current);
    if (playback.playbackStatus === 'playing' && !hold)
      blockTimer.current = setTimeout(() => {
        const s = player.current?.getPlayerState();
        onBlocked(s !== YT_STATE.playing && s !== YT_STATE.buffering && latest.current.playback.playbackStatus === 'playing' && !latest.current.hold);
      }, 2500);
  }, []);

  // Create the player once; it lives as long as this component.
  useEffect(() => {
    let dead = false;
    loadApi()
      .then((YT) => {
        const el = host.current as unknown as HTMLElement | null;
        if (dead || !el) return;
        const mount = document.createElement('div');
        el.appendChild(mount);
        const { playback } = latest.current;
        player.current = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          playerVars: { playsinline: 1, rel: 0, origin: window.location.origin },
          events: {
            onReady: () => {
              ready.current = true;
              apply();
            },
            onStateChange: (e: { data: number }) => {
              const p = player.current;
              if (!p) return;
              const { playback: room, hold, onReport, onUserState, onBlocked } = latest.current;
              const d = p.getDuration();
              if (d > 0) onReport({ duration: d });
              if (e.data === YT_STATE.playing) onBlocked(false);
              if (e.data === YT_STATE.ended) onReport({ ended: true });
              if (Date.now() - lastCmd.current < OWN_COMMAND_MS) return;
              // The viewer used the player's own buttons.
              if (e.data === YT_STATE.paused && room.playbackStatus === 'playing' && !hold) onUserState(false);
              if (e.data === YT_STATE.playing && (hold || room.playbackStatus !== 'playing')) onUserState(true);
            },
            onError: (e: { data: number }) => latest.current.onReport({ errorCode: e.data }),
          },
          videoId: isVideoId(playback.videoId) ? playback.videoId : undefined,
        });
        // Created with the video already cued: on ready only seek/play, no second load.
        loaded.current = isVideoId(playback.videoId) ? playback.videoId : null;
      })
      .catch(() => latest.current.onLoadError('YouTube oynatıcısı yüklenemedi. Bağlantını kontrol edip yeniden dene.'));
    return () => {
      dead = true;
      clearTimeout(blockTimer.current);
      player.current?.destroy();
      player.current = null;
      ready.current = false;
    };
  }, [apply]);

  // Follow the room: new video, play/pause, seeks, and this viewer's own mute/hold.
  const p = props.playback;
  useEffect(() => apply(), [apply, p.videoId, p.playbackStatus, p.position, p.updatedAt, props.hold, props.muted]);
  // Drift check while open (players drift apart; ads and buffering differ per viewer).
  useEffect(() => {
    const t = setInterval(apply, DRIFT_CHECK_MS);
    return () => clearInterval(t);
  }, [apply]);

  return <View ref={host} style={{ width: '100%', height: '100%', backgroundColor: '#000' }} />;
}
