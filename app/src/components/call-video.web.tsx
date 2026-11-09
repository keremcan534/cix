// One video of a 1v1 call (lib/call-media) in a browser: the track's own <video> element.
import { createElement, useEffect, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';

import type { TrackRef } from '@/lib/call-media';

export function CallVideo({ track, style, mirror }: { track: TrackRef; style: ViewStyle; mirror?: boolean; onTop?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const media = track.publication.track;
  useEffect(() => {
    const el = ref.current;
    if (!el || !media) return;
    media.attach(el);
    return () => void media.detach(el);
  }, [media]);
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      {createElement('video', { ref, autoPlay: true, playsInline: true, muted: true, style: { width: '100%', height: '100%', objectFit: 'cover', transform: mirror ? 'scaleX(-1)' : undefined } })}
    </View>
  );
}
