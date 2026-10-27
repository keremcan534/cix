// Reaction stickers (docs/GORSEL_URETIM_LISTESI.md §3): one 192 px PNG per emoji of the emoji packs
// (data/catalog EMOJI_PACKS) plus the two seat reactions. Packs still store and send the Unicode
// emoji, so search, copy and older messages keep working; these images only change how it is drawn:
// in the picker, over a seat and in a message that is nothing but reactions. Mixed text stays text.
import { Image, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { emojiKey, stickersOf as matchStickers } from '@/lib/stickers';

const SRC: Record<string, number> = {
  '😀': require('../../assets/reactions/tepki-temel-gulumseme.png'),
  '😂': require('../../assets/reactions/tepki-temel-kahkaha.png'),
  '😍': require('../../assets/reactions/tepki-temel-asik.png'),
  '🥹': require('../../assets/reactions/tepki-temel-duygulandim.png'),
  '😊': require('../../assets/reactions/tepki-temel-mutlu.png'),
  '😢': require('../../assets/reactions/tepki-temel-uzgun.png'),
  '😡': require('../../assets/reactions/tepki-temel-kizgin.png'),
  '👍': require('../../assets/reactions/tepki-temel-begendim.png'),
  '🙏': require('../../assets/reactions/tepki-temel-tesekkurler.png'),
  '👋': require('../../assets/reactions/tepki-temel-selam.png'),
  '🤔': require('../../assets/reactions/tepki-temel-dusunuyorum.png'),
  '😴': require('../../assets/reactions/tepki-temel-uykulu.png'),
  '🤣': require('../../assets/reactions/tepki-eglence-yerlere-yattim.png'),
  '🤪': require('../../assets/reactions/tepki-eglence-cilgin.png'),
  '😎': require('../../assets/reactions/tepki-eglence-havali.png'),
  '🥳': require('../../assets/reactions/tepki-eglence-parti.png'),
  '🤡': require('../../assets/reactions/tepki-eglence-palyaco.png'),
  '👻': require('../../assets/reactions/tepki-eglence-hayalet.png'),
  '🙃': require('../../assets/reactions/tepki-eglence-ters-gulus.png'),
  '🤯': require('../../assets/reactions/tepki-eglence-beynim-yandi.png'),
  '❤️': require('../../assets/reactions/tepki-ask-kalp.png'),
  '💕': require('../../assets/reactions/tepki-ask-iki-kalp.png'),
  '💋': require('../../assets/reactions/tepki-ask-opucuk.png'),
  '🫶': require('../../assets/reactions/tepki-ask-kalp-eller.png'),
  '💘': require('../../assets/reactions/tepki-ask-oklu-kalp.png'),
  '😘': require('../../assets/reactions/tepki-ask-opucuk-at.png'),
  '🌹': require('../../assets/reactions/tepki-ask-gul.png'),
  '💞': require('../../assets/reactions/tepki-ask-donen-kalpler.png'),
  '🐶': require('../../assets/reactions/tepki-hayvanlar-kopek.png'),
  '🐱': require('../../assets/reactions/tepki-hayvanlar-kedi.png'),
  '🦊': require('../../assets/reactions/tepki-hayvanlar-tilki.png'),
  '🐼': require('../../assets/reactions/tepki-hayvanlar-panda.png'),
  '🐸': require('../../assets/reactions/tepki-hayvanlar-kurbaga.png'),
  '🦄': require('../../assets/reactions/tepki-hayvanlar-tek-boynuzlu-at.png'),
  '🐧': require('../../assets/reactions/tepki-hayvanlar-penguen.png'),
  '🐝': require('../../assets/reactions/tepki-hayvanlar-ari.png'),
  '👑': require('../../assets/reactions/tepki-vip-tac.png'),
  '💎': require('../../assets/reactions/tepki-vip-elmas.png'),
  '🔥': require('../../assets/reactions/tepki-vip-ates.png'),
  '✨': require('../../assets/reactions/tepki-vip-isilti.png'),
  '🏆': require('../../assets/reactions/tepki-vip-kupa.png'),
  '🦁': require('../../assets/reactions/tepki-vip-aslan.png'),
  '⚜️': require('../../assets/reactions/tepki-vip-zambak-armasi.png'),
  '💠': require('../../assets/reactions/tepki-vip-kristal.png'),
  '🎆': require('../../assets/reactions/tepki-animasyonlu-havai-fisek.png'),
  '🎇': require('../../assets/reactions/tepki-animasyonlu-maytap.png'),
  '🌈': require('../../assets/reactions/tepki-animasyonlu-gokkusagi.png'),
  '💥': require('../../assets/reactions/tepki-animasyonlu-patlama.png'),
  '🎉': require('../../assets/reactions/tepki-animasyonlu-konfeti.png'),
  '🪩': require('../../assets/reactions/tepki-animasyonlu-disko-topu.png'),
  '👏': require('../../assets/reactions/tepki-oda-alkis.png'),
  '😮': require('../../assets/reactions/tepki-oda-saskin.png'),
};
const ART = new Map(Object.entries(SRC).map(([e, src]) => [emojiKey(e), src]));
const KEYS = [...ART.keys()];

export const REACTION_TAB_ANIMATED = require('../../assets/reactions/tepki-sekme-hareketli.png');
export const REACTION_TAB_RECENT = require('../../assets/reactions/tepki-sekme-son-kullanilanlar.png');
export const EMOJI_PACKS_ICON = require('../../assets/reactions/magaza-emoji-paketleri.png');

export const reactionArtOf = (emoji: string): number | undefined => ART.get(emojiKey(emoji));

/** The stickers of a reactions-only message (at most 3), or null for anything else. */
export const stickersOf = (text: string) => matchStickers(text, KEYS);

/** A reaction's sticker, or the emoji itself when it has none. */
export function ReactionArt({ emoji, size, textStyle }: { emoji: string; size: number; textStyle?: StyleProp<TextStyle> }) {
  const src = reactionArtOf(emoji);
  if (src) return <Image source={src} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={emoji} accessibilityIgnoresInvertColors />;
  return <Text style={[{ fontSize: Math.round(size * 0.82), lineHeight: Math.round(size * 1.05) }, textStyle]}>{emoji}</Text>;
}

/** Message body: a reactions-only message shows its stickers large; anything else is plain text. */
export function MessageText({ text, style, size = 44 }: { text: string; style?: StyleProp<TextStyle>; size?: number }) {
  const stickers = stickersOf(text);
  if (!stickers) return <Text style={style}>{text}</Text>;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={text}>
      {stickers.map((e, i) => (
        <ReactionArt key={i} emoji={e} size={size} />
      ))}
    </View>
  );
}
