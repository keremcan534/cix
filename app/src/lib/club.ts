// Anlık Kulüp: the app's name in action. The people most like you who are online right now, gathered in
// one room with a name and an icebreaker drawn from what you share, and a warm welcome when you walk in.
// It answers the moment new users leave voice apps ("nobody talks to me") and gives a reason to come
// back every day.
//
// A club is a pure function of the user, the day and a round ("Başka kişiler" moves to the next round),
// encoded in its room id. So it needs no storage: after a restart the same id rebuilds the same room.
import { ME, USERS, setRoomSource, type Category, type Room, type User } from '@/data/mock';
import { similarity } from '@/lib/similarity';

export const CLUB_SIZE = 5;
const PREFIX = 'kulup-';

export type ClubMember = { user: User; score: number; reason: string };
export type Club = {
  roomId: string;
  day: string;
  round: number;
  /** Interests the club is built around (most shared first), without their emoji. */
  topics: string[];
  name: string;
  icebreaker: string;
  members: ClubMember[];
  /** Mean similarity of the members, for the "%NN uyum" headline. */
  average: number;
};

/** "🎧 Müzik" → "Müzik". */
export const plain = (interest: string) => interest.replace(/^\S+\s+/, '');

/** Local calendar day ("2026-10-30"); a new club every day. */
export const clubDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ICEBREAKERS: Record<string, string[]> = {
  Müzik: ['Şu an kulaklığında hangi şarkı var?', 'Bir şarkıyla kendini anlatsan hangisi olurdu?', 'En son hangi konsere gittin?'],
  Karaoke: ['Karaokede asla bırakmadığın şarkı hangisi?', 'Düet yapsak hangi şarkıyı seçerdin?'],
  Kahve: ['Kahveni nasıl içersin, şekerli mi sade mi?', 'Şehrinde gizli kalmış en iyi kahveci neresi?'],
  Sohbet: ['Bugün seni en çok ne güldürdü?', 'Bu hafta öğrendiğin en ilginç şey ne?', 'Gece mi daha iyi sohbet edilir, sabah mı?'],
  Oyun: ['Şu sıralar ne oynuyorsun?', 'Hayatının oyunu hangisi, neden?'],
  Film: ['En son izlediğin ve herkese önerdiğin film ne?', 'Bir filmin içinde yaşasan hangisi olurdu?'],
  Kitap: ['Elindeki kitap ne, ilk cümlesi neydi?', 'Herkesin okuması gereken bir kitap söyle.'],
  Seyahat: ['Bir sonraki tatilin nereye?', 'Gittiğin en güzel yer neresiydi?'],
  Spor: ['Hangi takımı tutuyorsun, bu hafta maç var mı?', 'Sabah sporu mu akşam sporu mu?'],
  Dans: ['Hangi şarkı çalınca dans etmeden duramazsın?', 'Hiç dans dersi aldın mı?'],
};
const GENERIC = ['Bugün seni en çok ne güldürdü?', 'Kendini üç kelimeyle anlatsan?', 'Bu akşamın planı ne?'];

/** A first answer to the icebreaker, so the room is already talking when you arrive. */
const ANSWERS: Record<string, string[]> = {
  Müzik: ['Bende şu sıralar lo-fi dönüyor, akşamları birebir 🎧', 'Ben eski Türkçe pop bağımlısıyım, utanmıyorum 😄'],
  Karaoke: ['Ben "Sen Ağlama"yı açınca mikrofonu kimseye vermem 🎤', 'Düet varsa ben varım!'],
  Kahve: ['Sade, bol köpüklü Türk kahvesi ☕ başka yolu yok', 'Ben filtre kahveciyim, günde üç bardak 😅'],
  Sohbet: ['Bugün otobüste biri telefonla yüksek sesle tarif verdi, kek yaptık sanki 😂', 'Gece sohbeti her zaman daha samimi bence 🌙'],
  Oyun: ['Akşamları biraz FPS, hafta sonu strateji 🎮', 'Ben yine okey masasındayım 😄'],
  Film: ['Dün gece bir bilim kurgu izledim, hâlâ aklımda 🎬', 'Ben her yıl aynı filmi tekrar izliyorum, sorma 😄'],
  Kitap: ['Şu an bir polisiye okuyorum, bırakamıyorum 📚', 'Ben de sesli kitaba geçtim, yolda dinliyorum'],
  Seyahat: ['Kapadokya listemde, balon şart 🎈', 'Ben deniz kenarı olsun da neresi olursa ✈️'],
  Spor: ['Bu hafta derbi var, şimdiden heyecanlıyım ⚽', 'Ben sabah koşucusuyum, 6’da kalkıyorum 😅'],
  Dans: ['Hangi şarkı olursa olsun ritim tutarım 💃', 'Ben salsa kursuna başladım geçen ay!'],
};
const GENERIC_ANSWERS = ['Ben başlayayım o zaman 😄', 'Güzel soru, düşünüyorum…'];

/** Small deterministic hash, so the same day and round always pick the same lines. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pickBy = <T>(list: T[], seed: string) => list[hash(seed) % list.length];

export const clubRoomId = (day: string, round: number) => `${PREFIX}${day}-${round}`;
export function parseClubRoomId(id: string): { day: string; round: number } | null {
  const m = /^kulup-(\d{4}-\d{2}-\d{2})-(\d+)$/.exec(id);
  return m ? { day: m[1], round: Number(m[2]) } : null;
}

/**
 * The club for `me` on `day`: the CLUB_SIZE online people most similar to them. Each round moves to the
 * next people in similarity order, so "Başka kişiler" never shows the same five again right away.
 */
export function buildClub(me: User, opts: { day?: string; round?: number; exclude?: ReadonlySet<string>; users?: User[] } = {}): Club {
  const day = opts.day ?? clubDay();
  const round = opts.round ?? 0;
  const ranked = (opts.users ?? USERS)
    .filter((u) => u.online && u.id !== me.id && !opts.exclude?.has(u.id))
    .map((u) => ({ user: u, sim: similarity(me, u) }))
    .sort((a, b) => b.sim.score - a.sim.score || a.user.distanceKm - b.user.distanceKm);
  const size = Math.min(CLUB_SIZE, ranked.length);
  const start = ranked.length ? (round * size) % ranked.length : 0;
  const window = Array.from({ length: size }, (_, i) => ranked[(start + i) % ranked.length]);
  const members: ClubMember[] = window.map(({ user, sim }) => ({ user, score: sim.score, reason: sim.reasons[0] ?? 'Farklı zevkler, yeni sohbetler' }));

  // The interests most members share with me name the club and choose the icebreaker.
  const mine = new Set(me.interests ?? []);
  const counts = new Map<string, number>();
  for (const m of members) for (const i of m.user.interests ?? []) if (mine.has(i)) counts.set(i, (counts.get(i) ?? 0) + 1);
  const topics = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => plain(i)).slice(0, 2);
  const name = topics.length === 2 ? `${topics[0]} & ${topics[1]} Kulübü` : topics.length ? `${topics[0]} Kulübü` : 'Gece Sohbet Kulübü';
  const icebreaker = pickBy(ICEBREAKERS[topics[0]] ?? GENERIC, `${day}:${round}:q`);
  const average = members.length ? Math.round(members.reduce((n, m) => n + m.score, 0) / members.length) : 0;
  return { roomId: clubRoomId(day, round), day, round, topics, name, icebreaker, members, average };
}

const CATEGORY: Record<string, Category> = { Müzik: 'Müzik', Karaoke: 'Müzik', Dans: 'Müzik', Oyun: 'Oyun', Spor: 'Arkadaşlık', Seyahat: 'Arkadaşlık' };

/** The welcome played in the room: the host greets you by name, then the room answers the icebreaker. */
export function clubScript(club: Club, myName: string) {
  const [a, b, c] = club.members;
  const topic = club.topics[0];
  const lines: { userId: string; text: string; delayMs: number }[] = [];
  if (a) lines.push({ userId: a.user.id, text: `Selam ${myName}! Kulübe hoş geldin 👋`, delayMs: 1200 });
  if (b) lines.push({ userId: b.user.id, text: pickBy(ANSWERS[topic] ?? GENERIC_ANSWERS, `${club.day}:${club.round}:${b.user.id}`), delayMs: 3600 });
  if (c) lines.push({ userId: c.user.id, text: `${myName}, sen ne dersin? 😊`, delayMs: 6400 });
  return lines;
}

/** The club as a room: you on a mic next to your matches, the icebreaker pinned as the announcement. */
export function clubRoom(club: Club): Room & { script: ReturnType<typeof clubScript> } {
  const ids = club.members.map((m) => m.user.id);
  return {
    id: club.roomId,
    title: club.name,
    category: CATEGORY[club.topics[0]] ?? 'Sohbet',
    cover: `https://picsum.photos/seed/${club.roomId}/600/400`,
    hostId: ids[0] ?? 'u1',
    listeners: ids.length + 3,
    seatUserIds: [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, 'me', ids[3] ?? null, ids[4] ?? null, null, null, null],
    tags: ['Anlık Kulüp', ...club.topics],
    level: 1,
    roomType: 'free',
    announcement: `💬 Kulübün sorusu: ${club.icebreaker}`,
    script: clubScript(club, ME.name),
  };
}

// Blocked people never join a club. The rooms screen passes the current list; a cold start before that
// (a deep link straight into a club) only misses people blocked on this device.
let hidden: ReadonlySet<string> = new Set();
export const setClubHidden = (ids: ReadonlySet<string>) => {
  hidden = ids;
};

/** Rebuilds a club room from its id (rooms are looked up by id everywhere: room screen, PK, banners). */
setRoomSource((id) => {
  const parsed = parseClubRoomId(id);
  return parsed ? clubRoom(buildClub(ME, { ...parsed, exclude: hidden })) : undefined;
});
