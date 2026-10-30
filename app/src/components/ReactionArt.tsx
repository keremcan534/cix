// Custom-drawn stickers (docs/GORSEL_URETIM_LISTESI.md §3): one 192 px PNG per sticker of the sticker
// packs (data/catalog STICKER_PACKS). Stickers are what the packs sell; standard Unicode emoji are
// free and always drawn as text. A sticker travels as a token (lib/stickers), so typing an emoji
// never shows a paid sticker. Two files are duplicates and not wired: tepki-eglence-yerlere-yattim
// (= temel-kahkaha) and tepki-vip-kristal (= vip-elmas).
import { Image, View, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/text';
import { stickerById } from '@/data/catalog';
import { stickerIdOf, stickersOf as matchStickers, stickerText } from '@/lib/stickers';

const SRC: Record<string, number> = {
  'temel-gulumseme': require('../../assets/reactions/tepki-temel-gulumseme.png'),
  'temel-kahkaha': require('../../assets/reactions/tepki-temel-kahkaha.png'),
  'temel-asik': require('../../assets/reactions/tepki-temel-asik.png'),
  'temel-duygulandim': require('../../assets/reactions/tepki-temel-duygulandim.png'),
  'temel-mutlu': require('../../assets/reactions/tepki-temel-mutlu.png'),
  'temel-uzgun': require('../../assets/reactions/tepki-temel-uzgun.png'),
  'temel-kizgin': require('../../assets/reactions/tepki-temel-kizgin.png'),
  'temel-begendim': require('../../assets/reactions/tepki-temel-begendim.png'),
  'temel-tesekkurler': require('../../assets/reactions/tepki-temel-tesekkurler.png'),
  'temel-selam': require('../../assets/reactions/tepki-temel-selam.png'),
  'temel-dusunuyorum': require('../../assets/reactions/tepki-temel-dusunuyorum.png'),
  'temel-uykulu': require('../../assets/reactions/tepki-temel-uykulu.png'),
  'eglence-cilgin': require('../../assets/reactions/tepki-eglence-cilgin.png'),
  'eglence-havali': require('../../assets/reactions/tepki-eglence-havali.png'),
  'eglence-parti': require('../../assets/reactions/tepki-eglence-parti.png'),
  'eglence-palyaco': require('../../assets/reactions/tepki-eglence-palyaco.png'),
  'eglence-hayalet': require('../../assets/reactions/tepki-eglence-hayalet.png'),
  'eglence-ters-gulus': require('../../assets/reactions/tepki-eglence-ters-gulus.png'),
  'eglence-beynim-yandi': require('../../assets/reactions/tepki-eglence-beynim-yandi.png'),
  'ask-kalp': require('../../assets/reactions/tepki-ask-kalp.png'),
  'ask-iki-kalp': require('../../assets/reactions/tepki-ask-iki-kalp.png'),
  'ask-opucuk': require('../../assets/reactions/tepki-ask-opucuk.png'),
  'ask-kalp-eller': require('../../assets/reactions/tepki-ask-kalp-eller.png'),
  'ask-oklu-kalp': require('../../assets/reactions/tepki-ask-oklu-kalp.png'),
  'ask-opucuk-at': require('../../assets/reactions/tepki-ask-opucuk-at.png'),
  'ask-gul': require('../../assets/reactions/tepki-ask-gul.png'),
  'ask-donen-kalpler': require('../../assets/reactions/tepki-ask-donen-kalpler.png'),
  'hayvanlar-kopek': require('../../assets/reactions/tepki-hayvanlar-kopek.png'),
  'hayvanlar-kedi': require('../../assets/reactions/tepki-hayvanlar-kedi.png'),
  'hayvanlar-tilki': require('../../assets/reactions/tepki-hayvanlar-tilki.png'),
  'hayvanlar-panda': require('../../assets/reactions/tepki-hayvanlar-panda.png'),
  'hayvanlar-kurbaga': require('../../assets/reactions/tepki-hayvanlar-kurbaga.png'),
  'hayvanlar-tek-boynuzlu-at': require('../../assets/reactions/tepki-hayvanlar-tek-boynuzlu-at.png'),
  'hayvanlar-penguen': require('../../assets/reactions/tepki-hayvanlar-penguen.png'),
  'hayvanlar-ari': require('../../assets/reactions/tepki-hayvanlar-ari.png'),
  'vip-tac': require('../../assets/reactions/tepki-vip-tac.png'),
  'vip-elmas': require('../../assets/reactions/tepki-vip-elmas.png'),
  'vip-ates': require('../../assets/reactions/tepki-vip-ates.png'),
  'vip-isilti': require('../../assets/reactions/tepki-vip-isilti.png'),
  'vip-kupa': require('../../assets/reactions/tepki-vip-kupa.png'),
  'vip-aslan': require('../../assets/reactions/tepki-vip-aslan.png'),
  'vip-zambak-armasi': require('../../assets/reactions/tepki-vip-zambak-armasi.png'),
  'animasyonlu-havai-fisek': require('../../assets/reactions/tepki-animasyonlu-havai-fisek.png'),
  'animasyonlu-maytap': require('../../assets/reactions/tepki-animasyonlu-maytap.png'),
  'animasyonlu-gokkusagi': require('../../assets/reactions/tepki-animasyonlu-gokkusagi.png'),
  'animasyonlu-patlama': require('../../assets/reactions/tepki-animasyonlu-patlama.png'),
  'animasyonlu-konfeti': require('../../assets/reactions/tepki-animasyonlu-konfeti.png'),
  'animasyonlu-disko-topu': require('../../assets/reactions/tepki-animasyonlu-disko-topu.png'),
  'oda-alkis': require('../../assets/reactions/tepki-oda-alkis.png'),
  'oda-saskin': require('../../assets/reactions/tepki-oda-saskin.png'),
};

export const REACTION_TAB_ANIMATED = require('../../assets/reactions/tepki-sekme-hareketli.png');
export const REACTION_TAB_RECENT = require('../../assets/reactions/tepki-sekme-son-kullanilanlar.png');
export const EMOJI_PACKS_ICON = require('../../assets/reactions/magaza-emoji-paketleri.png');

export const stickerArtOf = (id: string): number | undefined => SRC[id];

/** The stickers of a stickers-only message (at most 3), or null for anything else. */
export const stickersOf = (text: string) => matchStickers(text, (id) => id in SRC);

/** Text for previews (inbox, notifications): sticker tokens become their names. */
export const messagePreview = (text: string) => stickerText(text, (id) => stickerById(id)?.name);

/** A sticker by id. */
export function StickerArt({ id, size }: { id: string; size: number }) {
  const src = SRC[id];
  const sticker = stickerById(id);
  if (!src) return <Text style={{ fontSize: Math.round(size * 0.82), lineHeight: Math.round(size * 1.05) }}>{sticker?.emoji ?? '❔'}</Text>;
  return <Image source={src} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={sticker?.name} accessibilityIgnoresInvertColors />;
}

/** A reaction: a sticker token draws its sticker, a standard emoji is drawn as text. */
export function ReactionArt({ emoji, size, textStyle }: { emoji: string; size: number; textStyle?: StyleProp<TextStyle> }) {
  const id = stickerIdOf(emoji);
  if (id) return <StickerArt id={id} size={size} />;
  return <Text style={[{ fontSize: Math.round(size * 0.82), lineHeight: Math.round(size * 1.05) }, textStyle]}>{emoji}</Text>;
}

/** Message body: a stickers-only message shows its stickers large; anything else is text. */
export function MessageText({ text, style, size = 44 }: { text: string; style?: StyleProp<TextStyle>; size?: number }) {
  const stickers = stickersOf(text);
  if (!stickers) return <Text style={style}>{messagePreview(text)}</Text>;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={messagePreview(text)}>
      {stickers.map((id, i) => (
        <StickerArt key={i} id={id} size={size} />
      ))}
    </View>
  );
}
