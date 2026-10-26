// Cazibe Seviyesi (charm level): Lv.0–50 from charm points, shown on every user. It reflects how much
// others engage with you and directly affects two things:
//   - earnings: a bonus on diamonds from received gifts (charmBonusPct),
//   - popularity: a higher place in Keşfet and suggestions (charmRankBoost).
// Points: 1 diamond received from gifts = 1 point, plus small amounts for likes on moments and
// one-to-one conversations (capped per day so they can't be farmed).
import { levelFromTable, type LevelPerk, type LevelTier } from '@/data/wealth';

export const CHARM_XP = [
  0, 2, 4, 8, 16, 32, 64, 128, 256, 512, // 0–9
  1_024, 1_536, 2_304, 3_456, 5_184, 7_776, 11_664, 17_496, 26_244, 39_366, // 10–19
  59_049, 76_763, 99_791, 129_728, 168_646, 219_239, 285_010, 370_513, 481_666, 626_165, // 20–29
  814_014, 1_000_001, 1_278_981, 1_697_450, 2_325_153, 3_266_707, 4_396_572, 5_752_409, 7_379_414, 9_331_819, // 30–39
  11_674_705, 14_486_168, 17_859_924, 21_908_430, 26_766_638, 32_596_487, 39_592_306, 47_987_288, 58_061_266, 70_150_040, // 40–49
  84_656_568, // 50
];
export const CHARM_MAX = CHARM_XP.length - 1;
export const charmLevelOf = (xp: number) => levelFromTable(CHARM_XP, xp);

export const CHARM_TIERS: LevelTier[] = [
  { from: 0, to: 5, name: 'Kıvılcım', icon: 'flash', colors: ['#94A3B8', '#334155'], ink: '#F8FAFC' },
  { from: 6, to: 10, name: 'Işıltı', icon: 'sparkles', colors: ['#5EEAD4', '#115E59'], ink: '#F0FDFA' },
  { from: 11, to: 15, name: 'Ay Işığı', icon: 'moon', colors: ['#FCD34D', '#92400E'], ink: '#FFFBEB' },
  { from: 16, to: 20, name: 'Kalp', icon: 'heart', colors: ['#FB7185', '#9F1239'], ink: '#FFF1F2' },
  { from: 21, to: 25, name: 'Melodi', icon: 'musical-notes', colors: ['#FB923C', '#9A3412'], ink: '#FFF7ED' },
  { from: 26, to: 30, name: 'Yıldız', icon: 'star', colors: ['#F472B6', '#831843'], ink: '#FDF2F8' },
  { from: 31, to: 35, name: 'Palet', icon: 'color-palette', colors: ['#E879F9', '#86198F'], ink: '#FDF4FF' },
  { from: 36, to: 40, name: 'Çiçek', icon: 'flower', colors: ['#F9A8D4', '#BE185D'], ink: '#500724' },
  { from: 41, to: 45, name: 'Kraliçe Gül', icon: 'rose', colors: ['#EF4444', '#450A0A'], ink: '#FEF2F2' },
  { from: 46, to: 50, name: 'Efsane Cazibe', icon: 'diamond', colors: ['#C084FC', '#3B0764'], ink: '#FAF5FF' },
];
export const charmTier = (level: number) => CHARM_TIERS.find((t) => level >= t.from && level <= t.to) ?? CHARM_TIERS[0];

/** Extra diamonds (%) on received gift diamonds. */
export const charmBonusPct = (level: number) => (level >= 46 ? 5 : level >= 36 ? 4 : level >= 26 ? 3 : level >= 16 ? 2 : level >= 6 ? 1 : 0);
/** Ranking weight in Keşfet and suggestions (0–50). */
export const charmRankBoost = (level: number) => level;

export const CHARM_PERKS: LevelPerk[] = [
  { key: 'badge', title: 'Cazibe rozeti', detail: 'Profilde, odada ve sohbette adının yanında', emoji: '🏅', from: 1, kind: 'privilege' },
  { key: 'rank', title: 'Keşfette öne çıkma', detail: 'Seviyen yükseldikçe önerilerde daha üstte', emoji: '📈', from: 1, kind: 'privilege' },
  { key: 'bonus', title: 'Kazanç bonusu', detail: 'Aldığın hediyelerin elmasına ek', emoji: '💎', from: 6, kind: 'privilege' },
  { key: 'bubble', title: 'Sohbet balonu', detail: 'Oda sohbetinde seviye renginde balon', emoji: '💬', from: 6, kind: 'costume' },
  { key: 'medal', title: 'Cazibe madalyası', detail: 'Profil vitrininde grubunun amblemi', emoji: '🎖️', from: 11, kind: 'costume' },
  { key: 'entry', title: 'Giriş efekti', detail: 'Odaya girişte seviye renginde karşılama', emoji: '✨', from: 11, kind: 'costume' },
  { key: 'wave', title: 'Mikrofon dalgası', detail: 'Konuşurken seviye renginde ses halkası', emoji: '🎙️', from: 16, kind: 'costume' },
  { key: 'frame', title: 'Profil çerçevesi', detail: 'Grubunun renklerinde avatar çerçevesi', emoji: '🖼️', from: 21, kind: 'costume' },
  { key: 'ride', title: 'Özel araç', detail: 'Odaya girişte gösterilen araç', emoji: '🛸', from: 31, kind: 'costume' },
];
