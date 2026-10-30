// SimilarClub 3D glass icon set (assets/icons, 192 px PNG). Use for value, social and feature
// symbols shown at 16–64 pt. Navigation and small UI glyphs stay vector (Ionicons).
import { Image, type ImageStyle, type StyleProp } from 'react-native';

import { Text } from '@/components/text';

const SRC = {
  coin: require('../../assets/icons/coin.png'),
  diamond: require('../../assets/icons/diamond.png'),
  gift: require('../../assets/icons/gift.png'),
  crown: require('../../assets/icons/crown.png'),
  heart: require('../../assets/icons/heart.png'),
  chat: require('../../assets/icons/chat.png'),
  envelope: require('../../assets/icons/envelope.png'),
  bolt: require('../../assets/icons/bolt.png'),
  mic: require('../../assets/icons/mic.png'),
  wheel: require('../../assets/icons/wheel.png'),
  trophy: require('../../assets/icons/trophy.png'),
  swords: require('../../assets/icons/swords.png'),
  tasks: require('../../assets/icons/tasks.png'),
  tent: require('../../assets/icons/tent.png'),
  briefcase: require('../../assets/icons/briefcase.png'),
  bag: require('../../assets/icons/bag.png'),
  group: require('../../assets/icons/group.png'),
  userAdd: require('../../assets/icons/user-add.png'),
} as const;
export type Icon3DName = keyof typeof SRC;

/** Emoji that have a 3D icon in the set. */
const FROM_EMOJI: Record<string, Icon3DName> = {
  '🪙': 'coin',
  '💎': 'diamond',
  '🎁': 'gift',
  '👑': 'crown',
  '❤️': 'heart',
  '💬': 'chat',
  '✉️': 'envelope',
  '💌': 'envelope',
  '⚡': 'bolt',
  '🎤': 'mic',
  '🎙️': 'mic',
  '🎡': 'wheel',
  '🎰': 'wheel',
  '🏆': 'trophy',
  '⚔️': 'swords',
  '📋': 'tasks',
  '⛺': 'tent',
  '💼': 'briefcase',
  '🛍️': 'bag',
  '👥': 'group',
};
export const icon3dFor = (emoji?: string): Icon3DName | undefined => (emoji ? FROM_EMOJI[emoji] : undefined);
/** The picture itself, for components that draw the image themselves (fx/float). */
export const icon3dSource = (name: Icon3DName): number => SRC[name];
/** The picture behind an emoji, for components that draw the image themselves (fx/float). */
export const icon3dSourceFor = (emoji?: string): number | undefined => {
  const name = icon3dFor(emoji);
  return name ? SRC[name] : undefined;
};

export function Icon3D({ name, size = 24, style }: { name: Icon3DName; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={SRC[name]} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityIgnoresInvertColors />;
}

/** Shows the 3D icon for an emoji when the set has one, otherwise the emoji itself. */
export function EmojiIcon({ emoji, size = 24 }: { emoji: string; size?: number }) {
  const name = icon3dFor(emoji);
  return name ? <Icon3D name={name} size={size * 1.15} /> : <Text style={{ fontSize: size, lineHeight: size * 1.25 }}>{emoji}</Text>;
}
