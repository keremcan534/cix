// Renk Kartları's cards as they are drawn: our own deck (lib/room-games/cards), four colours each with an emblem of
// its own (so a colour is never told by its tint alone), the cards that do something as a sign, the Jokers as a
// disc of all four. Views, gradients and icons only: stand-ins until drawn art comes (docs/GORSEL_URETIM_LISTESI.md).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { View } from 'react-native';

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
/** A card's height for its width. */
export const cardHeight = (w: number) => Math.round(w * 1.44);

/** The four colours as one disc: the Jokers' face, and the sign for "any colour". */
export function ColorDisc({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', flexDirection: 'row', flexWrap: 'wrap', transform: [{ rotate: '45deg' }], borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }}>
      {[0, 1, 3, 2].map((c) => (
        <View key={c} style={{ width: '50%', height: '50%', backgroundColor: CARD_COLORS[c].base }} />
      ))}
    </View>
  );
}

function Corner({ value, color, size }: { value: CardValue; color: number | null; size: number }) {
  const sign = SIGN[String(value)];
  if (color === null) return <Text style={{ color: '#FFFFFF', fontSize: size * 0.62, lineHeight: size * 0.8, fontWeight: '900' }}>{value === '+4' ? '+4' : 'J'}</Text>;
  if (sign) return <Ionicons name={sign} size={size * 0.82} color="#FFFFFF" />;
  return <Text style={{ color: '#FFFFFF', fontSize: size * (typeof value === 'number' ? 0.92 : 0.72), lineHeight: size, fontWeight: '900' }}>{value}</Text>;
}

/** Card `id` face up, `w` wide. `dim`: one that can't be played now. */
function CardFaceBase({ id, w, dim }: { id: number; w: number; dim?: boolean }) {
  const { color, value } = cardOf(id);
  const h = cardHeight(w);
  const c = color === null ? null : CARD_COLORS[color];
  const sign = SIGN[String(value)];
  const corner = Math.max(12, w * 0.3);
  return (
    <View style={{ width: w, height: h, borderRadius: w * 0.15, backgroundColor: '#F8FAFF', padding: Math.max(1.5, w * 0.035), boxShadow: '0 2px 6px rgba(0,0,0,0.45)' }} accessibilityLabel={cardName(id)}>
      <LinearGradient colors={c ? [c.light, c.base, c.deep] : ['#2B3F63', '#16253C', '#080F1E']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1, borderRadius: w * 0.12, overflow: 'hidden' }}>
        {/* The emblem large and faint behind the face. */}
        {c && <Ionicons name={c.icon} size={w * 0.92} color="rgba(255,255,255,0.16)" style={{ position: 'absolute', right: -w * 0.16, bottom: -w * 0.1 }} />}
        <View style={{ position: 'absolute', left: w * 0.07, top: w * 0.04, alignItems: 'center' }}>
          <Corner value={value} color={color} size={corner} />
          {c && <Ionicons name={c.icon} size={corner * 0.62} color="rgba(255,255,255,0.92)" />}
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: h * 0.1 }}>
          {color === null ? (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <ColorDisc size={w * 0.6} />
              {value === '+4' && (
                <View style={{ position: 'absolute', backgroundColor: '#080F1E', borderRadius: 999, paddingHorizontal: w * 0.07, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' }}>
                  <Text style={{ color: '#FFFFFF', fontSize: w * 0.26, lineHeight: w * 0.34, fontWeight: '900' }}>+4</Text>
                </View>
              )}
            </View>
          ) : sign ? (
            <Ionicons name={sign} size={w * 0.52} color="#FFFFFF" style={{ textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }} />
          ) : (
            <Text style={{ color: '#FFFFFF', fontSize: w * (typeof value === 'number' ? 0.56 : 0.4), lineHeight: w * 0.66, fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } }}>{value}</Text>
          )}
        </View>
        {dim && <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,15,30,0.5)' }} />}
      </LinearGradient>
    </View>
  );
}
export const CardFace = memo(CardFaceBase);

/** A card face down. */
function CardBackBase({ w }: { w: number }) {
  const h = cardHeight(w);
  return (
    <View style={{ width: w, height: h, borderRadius: w * 0.15, backgroundColor: '#13D9DF', padding: Math.max(1, w * 0.035), boxShadow: '0 2px 5px rgba(0,0,0,0.45)' }}>
      <LinearGradient colors={['#1F3A66', '#0E1C36']} style={{ flex: 1, borderRadius: w * 0.12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View style={{ width: w * 0.46, height: w * 0.46, borderRadius: w * 0.1, borderWidth: Math.max(1, w * 0.04), borderColor: 'rgba(19,217,223,0.75)', transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: w * 0.14, height: w * 0.14, borderRadius: w * 0.07, backgroundColor: '#FF6576' }} />
        </View>
      </LinearGradient>
    </View>
  );
}
export const CardBack = memo(CardBackBase);
