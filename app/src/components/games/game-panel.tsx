// The game surface for both entry points. In a room it opens as a sheet over the lower part of the room,
// so the seats stay visible and voice chat keeps running; minimising keeps the game alive. The panel's
// mic button only mirrors and toggles the user's own mic (an explicit user action), and opening,
// switching, minimising, closing or a provider failure never change seats, mic or room membership.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, ScrollView, StyleSheet, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { gameArtOf } from '@/components/GameArt';
import { CasinoPlayer } from '@/components/games/casino';
import { FishPlayer } from '@/components/games/fish';
import { FortunePlayer } from '@/components/games/fortune';
import { GoldTreePlayer } from '@/components/games/gold-tree';
import { BoardPlayer } from '@/components/games/board';
import { LineSlotPlayer } from '@/components/games/line-slot';
import { OlympusPlayer } from '@/components/games/olympus';
import { RocketPlayer } from '@/components/games/rocket';
import { OkeyTable } from '@/components/games/okey';
import { ColorCards, Ludo, Xox, type Player } from '@/components/games/room-games';
import type { CasinoGame } from '@/data/games';
import { isBoard, isLineSlot } from '@/lib/casino-odds';
import { useGames, type Entry } from '@/lib/games';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

export type OpenGame = { kind: 'room'; id: string } | { kind: 'casino'; id: CasinoGame['id'] };
export type VoiceState = { seated: boolean; micOn: boolean; onToggleMic: () => void };

/** Casino games with their own screen; the old ones (wheel, dice, Dragon Tiger) use the shared CasinoPlayer. */
const CASINO_SCREENS: Partial<Record<CasinoGame['id'], (p: { entry: Entry }) => React.JSX.Element>> = {
  fortune: FortunePlayer,
  olympus: OlympusPlayer,
  fish: FishPlayer,
  rocket: RocketPlayer,
  goldtree: GoldTreePlayer,
};
function CasinoScreen({ id, entry }: { id: CasinoGame['id']; entry: Entry }) {
  if (isLineSlot(id)) return <LineSlotPlayer id={id} entry={entry} />;
  if (isBoard(id)) return <BoardPlayer id={id} entry={entry} />;
  const Screen = CASINO_SCREENS[id];
  return Screen ? <Screen entry={entry} /> : <CasinoPlayer gameId={id} entry={entry} />;
}
/** Games that need most of the screen in a room (Okey and every casino game with its own screen); the top row of seats stays visible. */
const isTall = (id: string) => id === 'okey' || isLineSlot(id) || isBoard(id) || id in CASINO_SCREENS;

const VOLUMES: [number, string][] = [
  [0, 'Kapalı'],
  [0.2, 'Düşük'],
  [0.4, 'Orta'],
  [0.8, 'Yüksek'],
];

export function GamePanel({
  open,
  entry,
  players,
  voice,
  hidden,
  onSwitch,
  onMinimize,
  onClose,
  onInvite,
}: {
  open: OpenGame;
  entry: Entry;
  players: Player[];
  voice?: VoiceState;
  /** Minimised: stays mounted (game state kept) but out of the way. */
  hidden?: boolean;
  onSwitch: (g: OpenGame) => void;
  onMinimize?: () => void;
  onClose: () => void;
  onInvite?: (gameName: string) => void;
}) {
  const { settings, setSetting } = useApp();
  const { roomGames, casino } = useGames();
  const inRoom = entry.from === 'room';
  const roomGame = open.kind === 'room' ? roomGames.find((g) => g.id === open.id) : undefined;
  const casinoGame = open.kind === 'casino' ? casino.find((g) => g.id === open.id) : undefined;
  const title = roomGame?.name ?? casinoGame?.name ?? '';
  const switchable = [
    ...roomGames.filter((g) => g.active && g.playable).map((g) => ({ key: `r:${g.id}`, name: g.name, emoji: g.emoji, art: gameArtOf(g.id), go: { kind: 'room', id: g.id } as OpenGame })),
    ...casino.filter((g) => g.active && (inRoom ? g.fromRoom : g.fromProfile)).map((g) => ({ key: `c:${g.id}`, name: g.name, emoji: g.emoji, art: gameArtOf(g.id), go: { kind: 'casino', id: g.id } as OpenGame })),
  ];
  const current = open.kind === 'room' ? `r:${open.id}` : `c:${open.id}`;
  const titleEmoji = roomGame?.emoji ?? casinoGame?.emoji;
  const titleArt = gameArtOf(open.id);

  const body = (
    <View style={[p.panel, inRoom ? p.sheet : p.full, inRoom && isTall(open.id) && p.tall, hidden && { display: 'none' }]}>
      <View style={p.head}>
        {titleArt && <Image source={titleArt} style={{ width: 28, height: 28, marginRight: -6 }} />}
        <Text style={p.title} numberOfLines={1}>
          {titleArt ? '' : `${titleEmoji} `}
          {title}
          {casinoGame ? <Text style={p.badge}> Servet Lv.{casinoGame.minWealth}</Text> : <Text style={p.free}> Ücretsiz</Text>}
        </Text>
        {onMinimize && (
          <Pressable onPress={onMinimize} hitSlop={8} accessibilityLabel="Oyunu küçült">
            <Ionicons name="chevron-down" size={24} color={colors.textDim} />
          </Pressable>
        )}
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Oyunu kapat">
          <Ionicons name="close" size={24} color={colors.textDim} />
        </Pressable>
      </View>

      {voice && (
        <View style={p.voice} accessibilityLiveRegion="polite">
          <Ionicons name="radio" size={14} color={semantic.live} />
          <Text style={p.voiceText} numberOfLines={1}>
            {voice.seated ? (voice.micOn ? 'Mikrofonun açık · sesli sohbet sürüyor' : 'Mikrofonun kapalı · koltuktasın') : 'Dinleyicisin · odayı duymaya devam ediyorsun'}
          </Text>
          {voice.seated && (
            <Pressable onPress={voice.onToggleMic} style={[p.mic, !voice.micOn && { backgroundColor: colors.cardAlt }]} accessibilityLabel={voice.micOn ? 'Mikrofonu kapat' : 'Mikrofonu aç'}>
              <Ionicons name={voice.micOn ? 'mic' : 'mic-off'} size={16} color={voice.micOn ? semantic.liveInk : colors.text} />
            </Pressable>
          )}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
        {switchable.map((s) => (
          <Pressable key={s.key} onPress={() => onSwitch(s.go)} style={[p.chip, { flexDirection: 'row', alignItems: 'center', gap: 4 }, s.key === current && p.chipOn]} accessibilityLabel={`${s.name} oyununa geç`}>
            {s.art && <Image source={s.art} style={{ width: 16, height: 16 }} />}
            <Text style={p.chipText}>{s.art ? s.name : `${s.emoji} ${s.name}`}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingVertical: 8, gap: 10 }} keyboardShouldPersistTaps="handled">
        {roomGame &&
          (roomGame.playable ? (
            <>
              {open.id === 'ludo' && <Ludo key={players.map((x) => x.id).join()} players={players.slice(0, roomGame.maxPlayers)} />}
              {open.id === 'cards' && <ColorCards players={players.slice(0, roomGame.maxPlayers)} />}
              {open.id === 'xox' && <Xox players={players.slice(0, 2)} />}
              {open.id === 'okey' && <OkeyTable roomId={inRoom ? entry.roomId : 'profil'} me={players[0]} crowd={players.slice(1)} />}
              <Text style={p.dim}>
                {roomGame.minPlayers}–{roomGame.maxPlayers} oyuncu · ücretsiz, VIP gerekmez · oyundan çıkmak seni odadan çıkarmaz
                {roomGame.note ? ` · ${roomGame.note}` : ''}
              </Text>
              {onInvite && (
                <Pressable style={p.invite} onPress={() => onInvite(roomGame.name)} accessibilityLabel="Odayı oyuna davet et">
                  <Ionicons name="megaphone" size={16} color={colors.text} />
                  <Text style={p.chipText}>Odadakileri masaya davet et</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={p.dim}>{roomGame.name} için sağlayıcı entegrasyonu bekleniyor. Katalogda görünür, sağlayıcı bağlanınca bu alanda açılır.</Text>
          ))}
        {casinoGame && <CasinoScreen key={casinoGame.id} id={casinoGame.id} entry={entry} />}
        <View style={p.volume}>
          <Text style={p.dim}>Oyun sesi</Text>
          {VOLUMES.map(([v, l]) => (
            <Pressable key={l} onPress={() => setSetting('gameVolume', v)} style={[p.vol, settings.gameVolume === v && p.chipOn]}>
              <Text style={p.volText}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={p.dim}>Oyun sesleri sohbet sesini kısmaz; ses seviyeleri ayrı ayarlanır.</Text>
      </ScrollView>
    </View>
  );
  return inRoom ? body : <SafeAreaView style={{ flex: 1 }}>{body}</SafeAreaView>;
}

const p = StyleSheet.create({
  panel: { backgroundColor: colors.card, padding: 14, gap: 8 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '34%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border, zIndex: 40 },
  // Okey and the launch casino games need most of the screen; the top row of seats stays visible.
  tall: { top: '22%' },
  full: { flex: 1, backgroundColor: colors.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontWeight: '900', fontSize: 17, flex: 1 },
  badge: { color: colors.gold, fontSize: 12, fontWeight: '900' },
  free: { color: semantic.live, fontSize: 12, fontWeight: '800' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(19,217,223,0.10)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  voiceText: { color: colors.text, fontSize: 12, fontWeight: '700', flex: 1 },
  mic: { width: 30, height: 30, borderRadius: 15, backgroundColor: semantic.live, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  invite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 10 },
  volume: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  vol: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4 },
  volText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
});
