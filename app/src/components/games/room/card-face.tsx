// Renk Kartları's cards as they are drawn: our own deck (lib/room-games/cards), four colours each with an emblem of
// its own (so a colour is never told by its tint alone), the cards that do something as a sign, the Jokers as a
// disc of all four. A face is a printed card: a pearl edge and a hairline, the colour lit from its upper corner,
// the big index top left, a soft light across the top. Views, gradients and icons until the drawn faces come
// (docs/GORSEL_URETIM_LISTESI.md §18); those are wired in components/games/room/table-art and used once delivered.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { CARD_EMBLEM_ART, CARD_FACE_ART, RoomArtImage, roomArt, roomArtSet, type RoomArtName } from '@/components/games/room/table-art';
import { Text } from '@/components/text';
import { COLOR_NAMES, cardName, cardOf, type CardValue } from '@/lib/room-games/cards';

type Icon = keyof typeof Ionicons.glyphMap;
/** A colour as the table draws it: its light, its own and its deep tone, the ink on it and its emblem. */
export const CARD_COLORS: { name: string; light: string; base: string; deep: string; ink: string; icon: Icon }[] = [
  { name: COLOR_NAMES[0], light: '#5DEBEF', base: '#12B5C4', deep: '#086C7C', ink: '#02343C', icon: 'water' },
  { name: COLOR_NAMES[1], light: '#FF99A4', base: '#F2506A', deep: '#A91F3D', ink: '#4A0716', icon: 'flame' },
  { name: COLOR_NAMES[2], light: '#FFE08A', base: '#F2A93B', deep: '#B36A0C', ink: '#4A2A00', icon: 'sunny' },
  { name: COLOR_NAMES[3], light: '#7BEA9E', base: '#22B45A', deep: '#0C6E34', ink: '#03331A', icon: 'leaf' },
];
const SIGN: Partial<Record<string, Icon>> = { Atla: 'ban', Yön: 'swap-vertical' };
const SIGN_ART: Partial<Record<string, RoomArtName>> = { Atla: 'renk-isaret-atla', Yön: 'renk-isaret-yon', '+2': 'renk-isaret-arti2' };
/** A card's height for its width. */
export const cardHeight = (w: number) => Math.round(w * 1.44);
const INK_SHADOW = { textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } } as const;

/** Colour `c`'s emblem `size` dp: the drawn one when the set is here, else its icon. */
export function Emblem({ color, size, tint = '#FFFFFF' }: { color: number; size: number; tint?: string }) {
  const art = roomArtSet(CARD_EMBLEM_ART);
  if (art) return <RoomArtImage source={art[color]} w={size} style={{ tintColor: tint }} />;
  return <Ionicons name={CARD_COLORS[color].icon} size={size} color={tint} />;
}

/** The four colours as one disc: the Jokers' face, and the sign for "any colour". */
export function ColorDisc({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, boxShadow: '0 2px 6px rgba(0,0,0,0.5)' }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', transform: [{ rotate: '45deg' }], borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }}>
        {[0, 1, 3, 2].map((c) => (
          <LinearGradient key={c} colors={[CARD_COLORS[c].light, CARD_COLORS[c].base]} style={{ width: '50%', height: '50%' }} />
        ))}
      </View>
      <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} style={{ position: 'absolute', left: size * 0.18, top: size * 0.06, width: size * 0.64, height: size * 0.4, borderRadius: size }} />
    </View>
  );
}

function Corner({ value, color, size }: { value: CardValue; color: number | null; size: number }) {
  const sign = SIGN[String(value)];
  if (color === null) return <Text style={[{ color: '#FFFFFF', fontSize: size * 0.66, lineHeight: size * 0.84, fontWeight: '900' }, INK_SHADOW]}>{value === '+4' ? '+4' : 'J'}</Text>;
  if (sign) return <Ionicons name={sign} size={size * 0.84} color="#FFFFFF" style={INK_SHADOW} />;
  return <Text style={[{ color: '#FFFFFF', fontSize: size * (typeof value === 'number' ? 0.98 : 0.74), lineHeight: size * 1.04, fontWeight: '900', letterSpacing: -0.5 }, INK_SHADOW]}>{value}</Text>;
}

/** The middle of a coloured card: its sign, or its number big, on a soft round of light. */
function Middle({ value, w, deep }: { value: CardValue; w: number; deep: string }) {
  const sign = SIGN[String(value)];
  const art = SIGN_ART[String(value)] ? roomArt(SIGN_ART[String(value)]!) : null;
  const round = w * 0.7;
  const big = { textShadowColor: deep, textShadowRadius: 0.1, textShadowOffset: { width: w * 0.025, height: w * 0.03 } } as const;
  return (
    <View style={{ width: round, height: round, alignItems: 'center', justifyContent: 'center' }}>
      <LinearGradient colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.04)']} style={{ position: 'absolute', width: round, height: round, borderRadius: round / 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' }} />
      {art ? (
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <RoomArtImage source={art} w={w * 0.5} />
          {value === '+2' && <Text style={[{ position: 'absolute', color: '#FFFFFF', fontSize: w * 0.26, lineHeight: w * 0.32, fontWeight: '900' }, big]}>+2</Text>}
        </View>
      ) : sign ? (
        <Ionicons name={sign} size={w * 0.48} color="#FFFFFF" style={big} />
      ) : (
        <Text style={[{ color: '#FFFFFF', fontSize: w * (typeof value === 'number' ? 0.56 : 0.4), lineHeight: w * 0.66, fontWeight: '900', letterSpacing: -1 }, big]}>{value}</Text>
      )}
    </View>
  );
}

/** Card `id` face up, `w` wide. `dim`: one that can't be played now. */
function CardFaceBase({ id, w, dim }: { id: number; w: number; dim?: boolean }) {
  const { color, value } = cardOf(id);
  const h = cardHeight(w);
  const c = color === null ? null : CARD_COLORS[color];
  const corner = Math.max(13, w * 0.31);
  const faces = roomArtSet(CARD_FACE_ART);
  const face: ImageSourcePropType | null = c ? (faces?.[color!] ?? null) : roomArt(value === '+4' ? 'renk-joker-arti4' : 'renk-joker');
  const r = w * 0.15;
  const ri = w * 0.12;
  return (
    <View style={[f.card, { width: w, height: h, borderRadius: r, padding: Math.max(1.5, w * 0.04) }]} accessibilityLabel={cardName(id)}>
      <LinearGradient colors={['#FFFFFF', '#E6ECF8']} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <View style={{ flex: 1, borderRadius: ri, overflow: 'hidden' }}>
        {face ? (
          <RoomArtImage source={face} w={w} h={h} style={StyleSheet.absoluteFill} />
        ) : (
          <>
            <LinearGradient colors={c ? [c.light, c.base, c.deep] : ['#2B3F63', '#16253C', '#080F1E']} locations={[0, 0.5, 1]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
            {/* The emblem large and faint behind the face. */}
            {color !== null && (
              <View style={{ position: 'absolute', right: -w * 0.16, bottom: -w * 0.1, opacity: 0.17 }}>
                <Emblem color={color} size={w * 0.92} />
              </View>
            )}
          </>
        )}
        <View style={{ position: 'absolute', left: w * 0.07, top: w * 0.04, alignItems: 'center' }}>
          <Corner value={value} color={color} size={corner} />
          {color !== null && <Emblem color={color} size={corner * 0.6} tint="rgba(255,255,255,0.95)" />}
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: h * 0.12 }}>
          {color === null ? (
            face ? null : (
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                <ColorDisc size={w * 0.6} />
                {value === '+4' && (
                  <View style={f.plate}>
                    <Text style={{ color: '#FFFFFF', fontSize: w * 0.26, lineHeight: w * 0.34, fontWeight: '900', paddingHorizontal: w * 0.07 }}>+4</Text>
                  </View>
                )}
              </View>
            )
          ) : (
            <Middle value={value} w={w} deep={c!.deep} />
          )}
        </View>
        {/* Light across the top of the card, and the printed hairline just inside its edge. */}
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']} style={f.gloss} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, f.hair, { borderRadius: ri }]} />
        {dim && <View style={f.unplayable} />}
      </View>
    </View>
  );
}
export const CardFace = memo(CardFaceBase);

// The back's fine diagonal lines.
const LINES = [0, 1, 2, 3, 4, 5, 6, 7];

/** A card face down: night blue in a turquoise frame, fine lines across it, a turquoise diamond with a coral heart. */
function CardBackBase({ w }: { w: number }) {
  const h = cardHeight(w);
  const art = roomArt('renk-kart-arka');
  const r = w * 0.15;
  if (art) return <RoomArtImage source={art} w={w} h={h} style={{ borderRadius: r }} />;
  const gem = w * 0.44;
  return (
    <View style={[f.card, { width: w, height: h, borderRadius: r, padding: Math.max(1, w * 0.04) }]}>
      <LinearGradient colors={['#7CF4F7', '#13D9DF', '#0A8F95']} style={[StyleSheet.absoluteFill, { borderRadius: r }]} />
      <View style={{ flex: 1, borderRadius: w * 0.12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        <LinearGradient colors={['#24467A', '#132849', '#0A1830']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
        {LINES.map((i) => (
          <View key={i} style={{ position: 'absolute', top: -h * 0.3, bottom: -h * 0.3, left: `${i * 14 - 4}%`, width: 1, backgroundColor: 'rgba(19,217,223,0.12)', transform: [{ rotate: '30deg' }] }} />
        ))}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, f.backHair, { borderRadius: w * 0.09, margin: w * 0.05 }]} />
        <View style={{ width: gem, height: gem, borderRadius: w * 0.1, borderWidth: Math.max(1, w * 0.045), borderColor: '#5DEBEF', transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 8px rgba(19,217,223,0.7)', backgroundColor: 'rgba(19,217,223,0.12)' }}>
          <LinearGradient colors={['#FFB1BA', '#FF6576', '#C93C4F']} style={{ width: w * 0.15, height: w * 0.15, borderRadius: w * 0.08 }} />
        </View>
        <LinearGradient pointerEvents="none" colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={f.gloss} />
      </View>
    </View>
  );
}
export const CardBack = memo(CardBackBase);

const f = StyleSheet.create({
  card: { boxShadow: '0 3px 8px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(0,0,0,0.35)' },
  plate: { position: 'absolute', backgroundColor: '#080F1E', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', boxShadow: '0 2px 5px rgba(0,0,0,0.5)' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '38%' },
  hair: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  backHair: { borderWidth: 1, borderColor: 'rgba(93,235,239,0.35)' },
  unplayable: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,15,30,0.5)' },
});
