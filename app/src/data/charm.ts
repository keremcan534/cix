// Yankı Seviyesi (charm level): Lv.0–50 from charm points, shown on every user. It reflects how much
// others engage with you and directly affects two things:
//   - earnings: a bonus on diamonds from received gifts (charmBonusPct),
//   - popularity: a higher place in Keşfet and suggestions (charmRankBoost).
// Points: 1 diamond received from gifts = 1 point, plus small amounts for likes on moments and
// one-to-one conversations (capped per day so they can't be farmed).
import { levelCurve, levelFromTable, type LevelPerk, type LevelTier } from '@/data/wealth';

/**
 * Same curve as Cömertlik (levelCurve), with a higher top: received diamonds add up from many senders, so the
 * last levels ask for twice the points. Lv.1 at 10 points (the first Gül received), Lv.50 at 60 million.
 */
export const CHARM_XP = levelCurve(10, 60_000_000);
export const CHARM_MAX = CHARM_XP.length - 1;
export const charmLevelOf = (xp: number) => levelFromTable(CHARM_XP, xp);

export const CHARM_TIERS: LevelTier[] = [
  { from: 0, to: 5, name: 'Kıvılcım', icon: 'flash', colors: ['#94A3B8', '#334155'], ink: '#F8FAFC' },
  { from: 6, to: 10, name: 'Işıltı', icon: 'sparkles', colors: ['#5EEAD4', '#115E59'], ink: '#F0FDFA' },
  { from: 11, to: 15, name: 'Parıltı', icon: 'moon', colors: ['#FCD34D', '#92400E'], ink: '#FFFBEB' },
  { from: 16, to: 20, name: 'Şafak', icon: 'heart', colors: ['#FB7185', '#9F1239'], ink: '#FFF1F2' },
  { from: 21, to: 25, name: 'Ay Işığı', icon: 'musical-notes', colors: ['#FB923C', '#9A3412'], ink: '#FFF7ED' },
  { from: 26, to: 30, name: 'Yıldız', icon: 'star', colors: ['#F472B6', '#831843'], ink: '#FDF2F8' },
  { from: 31, to: 35, name: 'Kutup Yıldızı', icon: 'color-palette', colors: ['#E879F9', '#86198F'], ink: '#FDF4FF' },
  { from: 36, to: 40, name: 'Gökkuşağı', icon: 'flower', colors: ['#F9A8D4', '#BE185D'], ink: '#500724' },
  { from: 41, to: 45, name: 'Kutup Işığı', icon: 'rose', colors: ['#EF4444', '#450A0A'], ink: '#FEF2F2' },
  { from: 46, to: 50, name: 'Efsane Yankı', icon: 'diamond', colors: ['#C084FC', '#3B0764'], ink: '#FAF5FF' },
];
export const charmTier = (level: number) => CHARM_TIERS.find((t) => level >= t.from && level <= t.to) ?? CHARM_TIERS[0];

/** Extra diamonds (%) on received gift diamonds. */
export const charmBonusPct = (level: number) => (level >= 46 ? 5 : level >= 36 ? 4 : level >= 26 ? 3 : level >= 16 ? 2 : level >= 6 ? 1 : 0);
/** Ranking weight in Keşfet and suggestions (0–50). */
export const charmRankBoost = (level: number) => level;

export const CHARM_PERKS: LevelPerk[] = [
  { key: 'badge', title: 'Yankı rozeti', detail: 'Profilde, odada ve sohbette adının yanında', emoji: '🏅', art: 'ayricalik-cazibe-rozeti', from: 1, kind: 'privilege' },
  { key: 'rank', title: 'Keşfette öne çıkma', detail: 'Seviyen yükseldikçe önerilerde daha üstte', emoji: '📈', art: 'ayricalik-kesfette-one-cikma', from: 1, kind: 'privilege' },
  { key: 'bonus', title: 'Kazanç bonusu', detail: 'Aldığın hediyelerin elmasına ek', emoji: '💎', art: 'ayricalik-kazanc-bonusu', from: 6, kind: 'privilege' },
  { key: 'bubble', title: 'Sohbet balonu', detail: 'Oda sohbetinde seviye renginde balon', emoji: '💬', art: 'ayricalik-sohbet-balonu', from: 6, kind: 'costume' },
  { key: 'medal', title: 'Yankı madalyası', detail: 'Profil vitrininde grubunun amblemi', emoji: '🎖️', art: 'ayricalik-cazibe-madalyasi', from: 11, kind: 'costume' },
  { key: 'entry', title: 'Giriş efekti', detail: 'Odaya girişte seviye renginde karşılama', emoji: '✨', art: 'ayricalik-giris-efekti', from: 11, kind: 'costume' },
  { key: 'wave', title: 'Mikrofon halkası', detail: 'Konuşurken seviye renginde ses halkası', emoji: '🎙️', art: 'ayricalik-mikrofon-dalgasi', from: 16, kind: 'costume' },
  { key: 'frame', title: 'Profil çerçevesi', detail: 'Grubunun renklerinde avatar çerçevesi', emoji: '🖼️', art: 'ayricalik-profil-cercevesi', from: 21, kind: 'costume' },
  { key: 'ride', title: 'Özel araç', detail: 'Odaya girişte gösterilen araç', emoji: '🛸', art: 'ayricalik-ozel-arac', from: 31, kind: 'costume' },
];
