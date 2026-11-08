// One video of a 1v1 call (lib/call-media) on a phone: @livekit/react-native's VideoTrack.
import { VideoTrack } from '@livekit/react-native';
import type { ViewStyle } from 'react-native';

import type { TrackRef } from '@/lib/call-media';

export function CallVideo({ track, style, mirror, onTop }: { track: TrackRef; style: ViewStyle; mirror?: boolean; onTop?: boolean }) {
  return <VideoTrack trackRef={track as Parameters<typeof VideoTrack>[0]['trackRef']} style={style} objectFit="cover" mirror={mirror} zOrder={onTop ? 1 : 0} />;
}
