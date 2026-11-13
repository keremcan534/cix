// Stickers: one PNG per sticker of the sticker packs (data/catalog STICKER_PACKS), custom-drawn at 192 px
// (docs/GORSEL_URETIM_LISTESI.md §3 and §21, docs/CIKARTMA_URETIM_LISTESI.md), and the free Duygular, Müzik and Hamle
// packs (the emoji panel's Emoji tab): Google's Animated Noto Emoji as Lottie animations (CC BY 4.0), played by
// components/lottie-sticker. The dice's faces on a mic are the die pictures the games use (assets/art). Stickers are
// what the packs sell; standard Unicode emoji are free and always drawn as text. A sticker travels as a token
// (lib/stickers), so typing an emoji never shows a paid sticker. Two files are duplicates and not wired:
// tepki-eglence-yerlere-yattim (= temel-kahkaha) and tepki-vip-kristal (= vip-elmas). Every other delivered sticker is
// in a pack (Ses Odası, Çay Ocağı, Duygular+, Kutlama and Maskot Hayvanlar; the §21 VIP emojis in VIP), so none waits
// for one. A new one goes into SRC below together with its pack (data/catalog, and server/api/catalog.mjs for a sold
// pack).
import { Image, StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { Text } from '@/components/text';
import { LottieSticker, type StickerPlay } from '@/components/lottie-sticker';
import { stickerById } from '@/data/catalog';
import { bigEmojiSize, emojiOnlyCount, emojiRuns } from '@/lib/emoji-text';
import { mentionRuns } from '@/lib/room-mention';
import { MIRRORED_ART, MOVE_ART } from '@/lib/room-moves';
import { stickerIdOf, stickersOf as matchStickers, stickerText } from '@/lib/stickers';
import { colors, fonts } from '@/theme';

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
  'vip-tacli-kalp': require('../../assets/reactions/tepki-vip-tacli-kalp.png'),
  'vip-altin-mikrofon': require('../../assets/reactions/tepki-vip-altin-mikrofon.png'),
  'vip-kristal-gul': require('../../assets/reactions/tepki-vip-kristal-gul.png'),
  'vip-altin-alkis': require('../../assets/reactions/tepki-vip-altin-alkis.png'),
  'vip-alevli-elmas': require('../../assets/reactions/tepki-vip-alevli-elmas.png'),
  'vip-saygi-selami': require('../../assets/reactions/tepki-vip-saygi-selami.png'),
  'vip-monoklu-goz-kirpma': require('../../assets/reactions/tepki-vip-monoklu-goz-kirpma.png'),
  'vip-uykulu-hilal': require('../../assets/reactions/tepki-vip-uykulu-hilal.png'),
  'animasyonlu-havai-fisek': require('../../assets/reactions/tepki-animasyonlu-havai-fisek.png'),
  'animasyonlu-maytap': require('../../assets/reactions/tepki-animasyonlu-maytap.png'),
  'animasyonlu-gokkusagi': require('../../assets/reactions/tepki-animasyonlu-gokkusagi.png'),
  'animasyonlu-patlama': require('../../assets/reactions/tepki-animasyonlu-patlama.png'),
  'animasyonlu-konfeti': require('../../assets/reactions/tepki-animasyonlu-konfeti.png'),
  'animasyonlu-disko-topu': require('../../assets/reactions/tepki-animasyonlu-disko-topu.png'),
  'oda-alkis': require('../../assets/reactions/tepki-oda-alkis.png'),
  'oda-saskin': require('../../assets/reactions/tepki-oda-saskin.png'),
  // Ses Odası
  'oda-mikrofonda': require('../../assets/reactions/tepki-oda-mikrofonda.png'),
  'oda-soz-istiyorum': require('../../assets/reactions/tepki-oda-soz-istiyorum.png'),
  'oda-sessizdeyim': require('../../assets/reactions/tepki-oda-sessizdeyim.png'),
  'oda-kulakligi-taktim': require('../../assets/reactions/tepki-oda-kulakligi-taktim.png'),
  'oda-alkis-yagmuru': require('../../assets/reactions/tepki-oda-alkis-yagmuru.png'),
  'oda-pk-hazir': require('../../assets/reactions/tepki-oda-pk-hazir.png'),
  'oda-dj': require('../../assets/reactions/tepki-oda-dj.png'),
  'oda-sahne-senin': require('../../assets/reactions/tepki-oda-sahne-senin.png'),
  // Çay Ocağı
  'cay-cay-ister-misin': require('../../assets/reactions/tepki-cay-cay-ister-misin.png'),
  'cay-simit': require('../../assets/reactions/tepki-cay-simit.png'),
  'cay-turk-kahvesi': require('../../assets/reactions/tepki-cay-turk-kahvesi.png'),
  'cay-nazar': require('../../assets/reactions/tepki-cay-nazar.png'),
  'cay-lokum': require('../../assets/reactions/tepki-cay-lokum.png'),
  'cay-afiyet-olsun': require('../../assets/reactions/tepki-cay-afiyet-olsun.png'),
  'cay-kolay-gelsin': require('../../assets/reactions/tepki-cay-kolay-gelsin.png'),
  'cay-gecmis-olsun': require('../../assets/reactions/tepki-cay-gecmis-olsun.png'),
  // Duygular+
  'duygu-utandim': require('../../assets/reactions/tepki-duygu-utandim.png'),
  'duygu-kiskandim': require('../../assets/reactions/tepki-duygu-kiskandim.png'),
  'duygu-eridim': require('../../assets/reactions/tepki-duygu-eridim.png'),
  'duygu-sinirden-buhar': require('../../assets/reactions/tepki-duygu-sinirden-buhar.png'),
  'duygu-sevincten-agliyorum': require('../../assets/reactions/tepki-duygu-sevincten-agliyorum.png'),
  'duygu-kalbim-kirildi': require('../../assets/reactions/tepki-duygu-kalbim-kirildi.png'),
  'duygu-sabah-kahvesi': require('../../assets/reactions/tepki-duygu-sabah-kahvesi.png'),
  'duygu-kafam-karisik': require('../../assets/reactions/tepki-duygu-kafam-karisik.png'),
  // Kutlama
  'kutlama-dogum-gunu': require('../../assets/reactions/tepki-kutlama-dogum-gunu.png'),
  'kutlama-tebrikler': require('../../assets/reactions/tepki-kutlama-tebrikler.png'),
  'kutlama-sampanya': require('../../assets/reactions/tepki-kutlama-sampanya.png'),
  'kutlama-hediye-acti': require('../../assets/reactions/tepki-kutlama-hediye-acti.png'),
  'kutlama-yildiz': require('../../assets/reactions/tepki-kutlama-yildiz.png'),
  'kutlama-madalya': require('../../assets/reactions/tepki-kutlama-madalya.png'),
  'kutlama-dans': require('../../assets/reactions/tepki-kutlama-dans.png'),
  'kutlama-havai-fisek': require('../../assets/reactions/tepki-kutlama-havai-fisek.png'),
  // Maskot Hayvanlar
  'kostum-kedi': require('../../assets/reactions/tepki-kostum-kedi.png'),
  'kostum-ayi': require('../../assets/reactions/tepki-kostum-ayi.png'),
  'kostum-tavsan': require('../../assets/reactions/tepki-kostum-tavsan.png'),
  'kostum-dinozor': require('../../assets/reactions/tepki-kostum-dinozor.png'),
  'kostum-ari': require('../../assets/reactions/tepki-kostum-ari.png'),
  'kostum-penguen': require('../../assets/reactions/tepki-kostum-penguen.png'),
  'kostum-tilki': require('../../assets/reactions/tepki-kostum-tilki.png'),
  'kostum-aslan': require('../../assets/reactions/tepki-kostum-aslan.png'),
  // The face a Hamle die landed on (lib/room-moves diceFace).
  'hamle-zar-1': require('../../assets/art/zar-zar-yuzu-1.png'),
  'hamle-zar-2': require('../../assets/art/zar-zar-yuzu-2.png'),
  'hamle-zar-3': require('../../assets/art/zar-zar-yuzu-3.png'),
  'hamle-zar-4': require('../../assets/art/zar-zar-yuzu-4.png'),
  'hamle-zar-5': require('../../assets/art/zar-zar-yuzu-5.png'),
  'hamle-zar-6': require('../../assets/art/zar-zar-yuzu-6.png'),
};

/** The animated stickers (Duygular): each animation is read only when it is first drawn (it is code-sized data). */
const ANIM: Record<string, () => object> = {
  'duygu-kahkaha': () => require('../../assets/reactions/duygu/duygu-kahkaha.json'),
  'duygu-yerlere-yattim': () => require('../../assets/reactions/duygu/duygu-yerlere-yattim.json'),
  'duygu-sirit': () => require('../../assets/reactions/duygu/duygu-sirit.json'),
  'duygu-asik': () => require('../../assets/reactions/duygu/duygu-asik.json'),
  'duygu-opucuk': () => require('../../assets/reactions/duygu/duygu-opucuk.json'),
  'duygu-sevgi': () => require('../../assets/reactions/duygu/duygu-sevgi.json'),
  'duygu-kalbim': () => require('../../assets/reactions/duygu/duygu-kalbim.json'),
  'duygu-yanan-kalp': () => require('../../assets/reactions/duygu/duygu-yanan-kalp.json'),
  'duygu-havali': () => require('../../assets/reactions/duygu/duygu-havali.json'),
  'duygu-goz-kirp': () => require('../../assets/reactions/duygu/duygu-goz-kirp.json'),
  'duygu-sarildim': () => require('../../assets/reactions/duygu/duygu-sarildim.json'),
  'duygu-yalvaris': () => require('../../assets/reactions/duygu/duygu-yalvaris.json'),
  'duygu-duygulandim': () => require('../../assets/reactions/duygu/duygu-duygulandim.json'),
  'duygu-hungur': () => require('../../assets/reactions/duygu/duygu-hungur.json'),
  'duygu-uyudum': () => require('../../assets/reactions/duygu/duygu-uyudum.json'),
  'duygu-of-ya': () => require('../../assets/reactions/duygu/duygu-of-ya.json'),
  'duygu-olamaz': () => require('../../assets/reactions/duygu/duygu-olamaz.json'),
  'duygu-dusunceli': () => require('../../assets/reactions/duygu/duygu-dusunceli.json'),
  'duygu-afalladim': () => require('../../assets/reactions/duygu/duygu-afalladim.json'),
  'duygu-beyin-yakti': () => require('../../assets/reactions/duygu/duygu-beyin-yakti.json'),
  'duygu-parti': () => require('../../assets/reactions/duygu/duygu-parti.json'),
  'duygu-alkis': () => require('../../assets/reactions/duygu/duygu-alkis.json'),
  'duygu-super': () => require('../../assets/reactions/duygu/duygu-super.json'),
  'duygu-alev': () => require('../../assets/reactions/duygu/duygu-alev.json'),
  'duygu-sinirli': () => require('../../assets/reactions/duygu/duygu-sinirli.json'),
  'duygu-sus': () => require('../../assets/reactions/duygu/duygu-sus.json'),
  'duygu-yildiz-goz': () => require('../../assets/reactions/duygu/duygu-yildiz-goz.json'),
  'duygu-eriyorum': () => require('../../assets/reactions/duygu/duygu-eriyorum.json'),
  'duygu-selam-dur': () => require('../../assets/reactions/duygu/duygu-selam-dur.json'),
  'duygu-deli-dolu': () => require('../../assets/reactions/duygu/duygu-deli-dolu.json'),
  'duygu-kikirdama': () => require('../../assets/reactions/duygu/duygu-kikirdama.json'),
  'duygu-yuz-numara': () => require('../../assets/reactions/duygu/duygu-yuz-numara.json'),
  'muzik-dans': () => require('../../assets/reactions/duygu/muzik-dans.json'),
  'muzik-disko': () => require('../../assets/reactions/duygu/muzik-disko.json'),
  'muzik-eller-havaya': () => require('../../assets/reactions/duygu/muzik-eller-havaya.json'),
  'muzik-rock': () => require('../../assets/reactions/duygu/muzik-rock.json'),
  'muzik-notalar': () => require('../../assets/reactions/duygu/muzik-notalar.json'),
  'muzik-konfeti': () => require('../../assets/reactions/duygu/muzik-konfeti.json'),
  'muzik-davul': () => require('../../assets/reactions/duygu/muzik-davul.json'),
  'muzik-gitar': () => require('../../assets/reactions/duygu/muzik-gitar.json'),
  'muzik-marakas': () => require('../../assets/reactions/duygu/muzik-marakas.json'),
  'muzik-trompet': () => require('../../assets/reactions/duygu/muzik-trompet.json'),
  'muzik-saksafon': () => require('../../assets/reactions/duygu/muzik-saksafon.json'),
  'muzik-keman': () => require('../../assets/reactions/duygu/muzik-keman.json'),
  'hamle-yumruk-sol': () => require('../../assets/reactions/duygu/hamle-yumruk-sol.json'),
  'hamle-yumruk-sag': () => require('../../assets/reactions/duygu/hamle-yumruk-sag.json'),
  'hamle-zar': () => require('../../assets/reactions/duygu/hamle-zar.json'),
  'hamle-tas': () => require('../../assets/reactions/duygu/hamle-tas.json'),
  'hamle-kagit': () => require('../../assets/reactions/duygu/hamle-kagit.json'),
  'hamle-makas': () => require('../../assets/reactions/duygu/hamle-makas.json'),
  'hamle-carpma': () => require('../../assets/reactions/duygu/hamle-carpma.json'),
  'hamle-opucuk': () => require('../../assets/reactions/duygu/hamle-opucuk.json'),
  // Hamle picks that share another sticker's art: the kiss to either side is the blowing kiss (the left one drawn
  // turned round, lib/room-moves MIRRORED_ART), in the panel and on the mic alike; Taş Kağıt Makas shows its fist.
  'hamle-opucuk-sol': () => require('../../assets/reactions/duygu/duygu-opucuk.json'),
  'hamle-opucuk-sag': () => require('../../assets/reactions/duygu/duygu-opucuk.json'),
  'hamle-tkm': () => require('../../assets/reactions/duygu/hamle-tas.json'),
};
/** Whether a sticker moves (an animation, not a picture). */
export const isAnimatedSticker = (id: string) => id in ANIM;

export const REACTION_TAB_ANIMATED = require('../../assets/reactions/tepki-sekme-hareketli.png');
export const EMOJI_PACKS_ICON = require('../../assets/reactions/magaza-emoji-paketleri.png');

export const stickerArtOf = (id: string): number | undefined => SRC[id];

/** The stickers of a stickers-only message (at most 3), or null for anything else. */
export const stickersOf = (text: string) => matchStickers(text, (id) => id in SRC || id in ANIM);

/** Text for previews (inbox, notifications): sticker tokens become their names. */
export const messagePreview = (text: string) => stickerText(text, (id) => stickerById(id)?.name);

export type { StickerPlay };

/** A sticker by id. One drawn facing the other way (the kiss to the left) is turned round here, wherever it shows. */
export function StickerArt({ id, size, play = 'still' }: { id: string; size: number; play?: StickerPlay }) {
  if (MIRRORED_ART.has(id)) {
    return (
      <View style={{ transform: [{ scaleX: -1 }] }}>
        <StickerFace id={id} size={size} play={play} />
      </View>
    );
  }
  return <StickerFace id={id} size={size} play={play} />;
}

function StickerFace({ id, size, play }: { id: string; size: number; play: StickerPlay }) {
  const src = SRC[id];
  // A catalog sticker, or one of the pictures a Hamle plays (lib/room-moves).
  const sticker = stickerById(id) ?? MOVE_ART[id];
  const anim = ANIM[id];
  if (anim) return <LottieSticker source={anim()} size={size} play={play} label={sticker?.name} fallback={sticker?.emoji ?? '❔'} />;
  if (!src) return <Text style={{ fontSize: Math.round(size * 0.82), lineHeight: Math.round(size * 1.05) }}>{sticker?.emoji ?? '❔'}</Text>;
  return <Image source={src} style={{ width: size, height: size }} resizeMode="contain" accessibilityLabel={sticker?.name} accessibilityIgnoresInvertColors />;
}

/** A reaction: a sticker token draws its sticker (an animated one plays as `play` says), a standard emoji is text. */
export function ReactionArt({ emoji, size, textStyle, play }: { emoji: string; size: number; textStyle?: StyleProp<TextStyle>; play?: StickerPlay }) {
  const id = stickerIdOf(emoji);
  if (id) return <StickerArt id={id} size={size} play={play} />;
  return <Text style={[{ fontSize: Math.round(size * 0.82), lineHeight: Math.round(size * 1.05) }, textStyle]}>{emoji}</Text>;
}

/** Message body: a stickers-only message shows its stickers large; anything else is text. */
/** Message text with its emoji drawn larger: one to three emoji alone are drawn large, emoji in text a size up. */
/** A plain run with its emoji drawn a little larger than the text around them. */
function emojiPieces(text: string, base: number, key: string) {
  return emojiRuns(text).map((r, i) =>
    r.emoji ? (
      <Text key={`${key}-${i}`} style={{ fontSize: base + 5 }}>
        {r.text}
      </Text>
    ) : (
      r.text
    ),
  );
}

// @bahset: a name in the line stands out; mine in gold on a light of its own, so I see it's me at a glance.
const MENTION: TextStyle = { color: '#FF94C2', fontFamily: fonts.displayBold };
const MENTION_ME: TextStyle = { color: colors.gold, fontFamily: fonts.displayBold, backgroundColor: 'rgba(246,189,96,0.18)' };
const same = (a: string, b?: string) => !!b && a.trim().toLocaleLowerCase('tr-TR') === b.trim().toLocaleLowerCase('tr-TR');

/** A line of text. `mentions` (the room's names) draws each "@Name" in its own color; `me` (my name) in gold. */
export function EmojiText({ text, style, mentions, me }: { text: string; style?: StyleProp<TextStyle>; mentions?: readonly string[]; me?: string }) {
  const named = mentions?.length ? mentionRuns(text, mentions) : null;
  if (named?.some((r) => r.name)) {
    const base = StyleSheet.flatten(style)?.fontSize ?? 15;
    return (
      <Text style={style}>
        {named.map((r, i) =>
          r.name ? (
            <Text key={i} style={same(r.name, me) ? MENTION_ME : MENTION}>
              {r.text}
            </Text>
          ) : (
            emojiPieces(r.text, base, String(i))
          ),
        )}
      </Text>
    );
  }
  const big = bigEmojiSize(emojiOnlyCount(text));
  if (big) return <Text style={[style, { fontSize: big, lineHeight: Math.round(big * 1.2) }]}>{text.trim()}</Text>;
  const runs = emojiRuns(text);
  if (!runs.some((r) => r.emoji)) return <Text style={style}>{text}</Text>;
  const base = StyleSheet.flatten(style)?.fontSize ?? 15;
  return <Text style={style}>{emojiPieces(text, base, 'e')}</Text>;
}

export function MessageText({ text, style, size = 44 }: { text: string; style?: StyleProp<TextStyle>; size?: number }) {
  const stickers = stickersOf(text);
  if (!stickers) return <EmojiText text={messagePreview(text)} style={style} />;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }} accessibilityLabel={messagePreview(text)}>
      {stickers.map((id, i) => (
        <StickerArt key={i} id={id} size={size} play="once" />
      ))}
    </View>
  );
}
