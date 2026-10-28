// 3D pictures for profile facts that are stored as plain strings: interests ('🎤 Karaoke') and gender.
// Look one up by its label; when there is none, the caller keeps the emoji.
import type { ArtName } from '@/components/Art';

const INTEREST_ART: Record<string, ArtName> = {
  Karaoke: 'ilgi-karaoke',
  Oyun: 'ilgi-oyun',
  Sohbet: 'ilgi-sohbet',
  Spor: 'ilgi-spor',
  Seyahat: 'ilgi-seyahat',
  Film: 'ilgi-film',
  Dans: 'ilgi-dans',
  Kitap: 'ilgi-kitap',
  Müzik: 'ilgi-muzik',
  Kahve: 'ilgi-kahve',
};

/** Splits an interest label ('🎤 Karaoke') into its picture (if any), emoji and name. */
export function interestParts(label: string): { art?: ArtName; emoji: string; name: string } {
  const i = label.indexOf(' ');
  const emoji = i > 0 ? label.slice(0, i) : '';
  const name = i > 0 ? label.slice(i + 1) : label;
  return { art: INTEREST_ART[name], emoji, name };
}

export const GENDER_ART: Record<'Kadın' | 'Erkek', ArtName> = { Kadın: 'cinsiyet-kadin', Erkek: 'cinsiyet-erkek' };
