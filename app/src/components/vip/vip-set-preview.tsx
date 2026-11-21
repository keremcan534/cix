// VIP › VIP: the level's frame and entry effect previewed (Güncelleme 8), as Çarşı previews them (app/magaza): the
// frame round my own photo, large, on a room seat and on my profile (components/frame-preview); the entry effect
// played as in a room with my name on its plate. They are the VIP set's own items (server/api/vip-set.mjs: sf / se
// 900000 + level), read from the shop as the server has it; without them (the demo, an older server) the card's
// note is shown instead. Local only: nothing is worn or bought from here.
import { useState, type ReactNode } from 'react';

import { EntryEffect, type EntryShow } from '@/components/fx/entry';
import { PlateName, VideoFx, entryClipOf } from '@/components/fx/video-fx';
import { FramePreviewSheet } from '@/components/frame-preview';
import { cosmeticById } from '@/data/catalog';
import { LEVEL_ART_TOP } from '@/lib/vip-screen';
import { useApp } from '@/store';

/** The VIP set's item for a level (vip-set.mjs vipSetId); levels above the set's top use its top. */
export const vipSetItemId = (kind: 'frame' | 'entry', level: number) => `${kind === 'frame' ? 'sf' : 'se'}${900_000 + Math.min(Math.max(1, level), LEVEL_ART_TOP)}`;

/**
 * `open(kind, level)`: true when it shows a preview (false: no such item here, say the note instead). `view`: what to
 * render on the page.
 */
export function useVipSetPreview(): { open: (kind: 'frame' | 'entry', level: number) => boolean; view: ReactNode } {
  const { me, settings } = useApp();
  const [frame, setFrame] = useState<string | null>(null);
  const [entry, setEntry] = useState<EntryShow | null>(null);
  const [media, setMedia] = useState<ReturnType<typeof entryClipOf>>(null);
  const open = (kind: 'frame' | 'entry', level: number) => {
    const c = cosmeticById(vipSetItemId(kind, level));
    if (!c) return false;
    if (kind === 'frame') {
      setFrame(c.id);
      return true;
    }
    if (!c.remote?.video) return false;
    const clip = { clip: c.id, plate: c.remote.plate ?? null };
    setMedia(settings.reduceMotion ? null : entryClipOf({ fx: 'vip', ...clip }));
    setEntry({ name: me.name, avatar: me.avatar, fx: 'vip', ...clip });
    return true;
  };
  const frameItem = frame ? (cosmeticById(frame) ?? null) : null;
  const view = (
    <>
      <FramePreviewSheet item={frameItem} onClose={() => setFrame(null)} />
      {entry &&
        (media ? (
          <VideoFx key={`${entry.clip}-video`} media={media} muted={false} onDone={() => setEntry(null)}>
            {entry.plate ? <PlateName name={entry.name} plate={entry.plate} /> : <EntryEffect show={entry} still top={140} />}
          </VideoFx>
        ) : (
          <EntryEffect key={entry.clip} show={entry} still={settings.reduceMotion} top={140} onDone={() => setEntry(null)} />
        ))}
    </>
  );
  return { open, view };
}
