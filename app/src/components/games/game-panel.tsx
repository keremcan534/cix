// The game surface for both entry points. In a room it opens as a sheet over the lower part of the room,
// so the seats stay visible and voice chat keeps running; minimising keeps the game alive. The panel's
// mic button only mirrors and toggles the user's own mic (an explicit user action), and opening,
// switching, minimising, closing or a provider failure never change seats, mic or room membership.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { gameArtOf } from '@/components/GameArt';
import { CasinoPlayer } from '@/components/games/casino';
import { FishPlayer } from '@/components/games/fish';
import { FortunePlayer } from '@/components/games/fortune';
import { GoldTreePlayer } from '@/components/games/gold-tree';
import { BoardPlayer } from '@/components/games/board';
import { LineSlotPlayer } from '@/components/games/line-slot';
import { SkinBackdrop, SkinOverlay, slotSkinOf } from '@/components/games/fx/slot-skin';
import { FenerPlayer } from '@/components/games/fener';
import { RocketPlayer } from '@/components/games/rocket';
import { BilyePlayer } from '@/components/games/bilye';
import { OkeyTable } from '@/components/games/okey';
import { WheelPlayer } from '@/components/games/wheel';
import { GameNav } from '@/components/games/slot-kit';
import type { Player } from '@/components/games/room-games';
import { CardsPractice } from '@/components/games/room/cards';
import { FourPractice } from '@/components/games/room/four';
import { LudoPractice } from '@/components/games/room/ludo';
import { XoxPractice } from '@/components/games/room/xox';
import { LiveTable, isTableGame } from '@/components/games/room-tables';
import type { CasinoGame } from '@/data/games';
import { isBoard, isLineSlot } from '@/lib/casino-odds';
import { casinoVisible, isPracticeBot, useGames, type Entry } from '@/lib/games';
import { playSfx, setGameVolume } from '@/lib/game-sound';
import { isLiveRoom } from '@/lib/live';
import { refreshCasino } from '@/lib/live/casino';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

/** `wheel`: Rüzgâr Gülü, the Oyun Salonu game the server plays (components/games/wheel). */
export type OpenGame = { kind: 'room'; id: string } | { kind: 'casino'; id: CasinoGame['id'] } | { kind: 'wheel' };
const WHEEL_NAME = 'Rüzgâr Gülü';
const keyOf = (g: OpenGame) => (g.kind === 'room' ? `r:${g.id}` : g.kind === 'casino' ? `c:${g.id}` : 'w');
export type VoiceState = { seated: boolean; micOn: boolean; onToggleMic: () => void };

/** Casino games with their own screen; the old ones (wheel, dice, Ejder ile Kaplan) use the shared CasinoPlayer. */
const CASINO_SCREENS: Partial<Record<CasinoGame['id'], (p: { entry: Entry }) => React.JSX.Element>> = {
  fortune: FortunePlayer,
  olympus: FenerPlayer,
  fish: FishPlayer,
  rocket: RocketPlayer,
  goldtree: GoldTreePlayer,
  bilye: BilyePlayer,
};
function CasinoScreen({ id, entry }: { id: CasinoGame['id']; entry: Entry }) {
  if (isLineSlot(id)) return <LineSlotPlayer id={id} entry={entry} />;
  if (isBoard(id)) return <BoardPlayer id={id} entry={entry} />;
  const Screen = CASINO_SCREENS[id];
  return Screen ? <Screen entry={entry} /> : <CasinoPlayer gameId={id} entry={entry} />;
}
/** Games that need most of the screen in a room (Okey, the room games with a table or a board of their own and every casino game with its own screen); the top row of seats stays visible. */
const isTall = (id: string) => id === 'wheel' || id === 'okey' || id === 'ludo' || id === 'cards' || id === 'xox' || id === 'four' || isLineSlot(id) || isBoard(id) || id in CASINO_SCREENS;

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
  onLeave,
  canOpenTable,
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
  /** Before a game opens another screen: Oyun Merkezi closes its modal, which would otherwise cover that screen. */
  onLeave?: () => void;
  /** A live room: I may open the room's game table (the room's staff; the server checks it again). */
  canOpenTable?: boolean;
}) {
  const { settings, setSetting, wealthLevel, paidGames } = useApp();
  const { roomGames, casino } = useGames();
  // The other games and the sound level stay behind two buttons in the header: the game has the screen to itself.
  const [tools, setTools] = useState<'games' | 'sound' | null>(null);
  const inRoom = entry.from === 'room';
  // A server room plays its free games at the server's table (Ludo, Renk Kartları, XOX); Okey stays out of it there.
  const tables = entry.from === 'room' && isLiveRoom(entry.roomId);
  const roomGame = open.kind === 'room' ? roomGames.find((g) => g.id === open.id) : undefined;
  const casinoGame = open.kind === 'casino' ? casino.find((g) => g.id === open.id) : undefined;
  const wheel = open.kind === 'wheel';
  // A machine dressed in its own pictures (fx/slot-skin) has its picture behind the whole panel.
  const skin = casinoGame && casinoVisible(wealthLevel, paidGames) ? slotSkinOf(casinoGame.id) : undefined;
  // Its JACKPOT show, drawn over the whole panel (fx/jackpot-show).
  const [overlay, setOverlay] = useState<ReactNode>(null);
  const title = wheel ? WHEEL_NAME : (roomGame?.name ?? casinoGame?.name ?? '');
  const switchable = [
    ...roomGames.filter((g) => g.active && g.playable && (!tables || isTableGame(g.id))).map((g) => ({ key: `r:${g.id}`, name: g.name, emoji: g.emoji, art: gameArtOf(g.id), go: { kind: 'room', id: g.id } as OpenGame })),
    // Rüzgâr Gülü and, in a live build, every other casino game are played on the server; the level gates them all.
    ...(casinoVisible(wealthLevel, paidGames) ? [{ key: 'w', name: WHEEL_NAME, emoji: '', art: undefined, go: { kind: 'wheel' } as OpenGame }] : []),
    ...casino.filter((g) => casinoVisible(wealthLevel, paidGames) && g.active && (inRoom ? g.fromRoom : g.fromProfile)).map((g) => ({ key: `c:${g.id}`, name: g.name, emoji: g.emoji, art: gameArtOf(g.id), go: { kind: 'casino', id: g.id } as OpenGame })),
  ];
  const current = keyOf(open);
  const openId = open.kind === 'wheel' ? 'wheel' : open.id;
  // Live: the server's switches, stakes and JACKPOT funds again when a game opens (nothing to read in the demo).
  useEffect(() => void refreshCasino(), [openId]);
  const titleEmoji = roomGame?.emoji ?? casinoGame?.emoji;
  const titleArt = wheel ? undefined : gameArtOf(open.id);

  const body = (
    <View style={[p.panel, inRoom ? p.sheet : p.full, inRoom && isTall(openId) && p.tall, skin && p.skinned, hidden && { display: 'none' }]}>
      {skin && <SkinBackdrop skin={skin} />}
      <View style={p.head}>
        {titleArt && <Image source={titleArt} style={{ width: 28, height: 28, marginRight: -6 }} />}
        {wheel && <Ionicons name="compass" size={24} color={colors.gold} style={{ marginRight: -6 }} />}
        <Text style={p.title} numberOfLines={1}>
          {titleArt || wheel ? '' : `${titleEmoji} `}
          {title}
        </Text>
        <Pressable onPress={() => setTools((t) => (t === 'games' ? null : 'games'))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Başka oyuna geç" accessibilityState={{ expanded: tools === 'games' }}>
          <Ionicons name="grid-outline" size={21} color={tools === 'games' ? semantic.action : colors.textDim} />
        </Pressable>
        <Pressable onPress={() => setTools((t) => (t === 'sound' ? null : 'sound'))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Oyun sesi" accessibilityState={{ expanded: tools === 'sound' }}>
          <Ionicons name={settings.gameVolume === 0 ? 'volume-mute-outline' : 'volume-medium-outline'} size={23} color={tools === 'sound' ? semantic.action : colors.textDim} />
        </Pressable>
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

      {tools === 'games' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
          {switchable.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => {
                setTools(null);
                onSwitch(s.go);
              }}
              style={[p.chip, { flexDirection: 'row', alignItems: 'center', gap: 4 }, s.key === current && p.chipOn]}
              accessibilityLabel={`${s.name} oyununa geç`}
            >
              {s.art && <Image source={s.art} style={{ width: 16, height: 16 }} />}
              {s.key === 'w' && <Ionicons name="compass" size={15} color={colors.gold} />}
              <Text style={p.chipText}>{s.art || !s.emoji ? s.name : `${s.emoji} ${s.name}`}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {tools === 'sound' && (
        <View style={p.volume}>
          <Text style={p.dim}>Oyun sesi</Text>
          {VOLUMES.map(([v, l]) => (
            <Pressable
              key={l}
              onPress={() => {
                setSetting('gameVolume', v);
                // Heard at the level just picked.
                setGameVolume(v);
                playSfx('coin');
              }}
              style={[p.vol, settings.gameVolume === v && p.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: settings.gameVolume === v }}
            >
              <Text style={p.volText}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* At least as tall as the panel: an Oyun Salonu game's stage takes the free height (games/fx/salon), its
          controls stay at the bottom; a phone too short for it scrolls. */}
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingVertical: 8, gap: 10 }} keyboardShouldPersistTaps="handled">
        {roomGame &&
          (roomGame.playable ? (
            <>
              {tables && entry.from === 'room' && isTableGame(openId) && <LiveTable key={openId} roomId={entry.roomId} game={openId} canOpen={!!canOpenTable} />}
              {!tables && openId === 'ludo' && <LudoPractice players={players.slice(0, roomGame.maxPlayers)} fit={inRoom} />}
              {!tables && openId === 'cards' && <CardsPractice players={players.slice(0, roomGame.maxPlayers)} />}
              {!tables && openId === 'xox' && <XoxPractice players={players.slice(0, 2)} />}
              {!tables && openId === 'four' && <FourPractice players={players.slice(0, 2)} />}
              {/* Okey seats its own bots; practice bots (a live Oyun Merkezi) don't come to watch. */}
              {!tables && openId === 'okey' && <OkeyTable roomId={inRoom ? entry.roomId : 'profil'} me={players[0]} crowd={players.slice(1).filter((x) => !isPracticeBot(x.id))} />}
              <Text style={p.dim}>
                {roomGame.minPlayers === roomGame.maxPlayers ? roomGame.minPlayers : `${roomGame.minPlayers}–${roomGame.maxPlayers}`} oyuncu · ücretsiz, VIP gerekmez · oyundan çıkmak seni odadan çıkarmaz
                {roomGame.note ? ` · ${roomGame.note}` : ''}
              </Text>
              {onInvite && !tables && (
                <Pressable style={p.invite} onPress={() => onInvite(roomGame.name)} accessibilityLabel="Odayı oyuna davet et">
                  <Ionicons name="megaphone" size={16} color={colors.text} />
                  <Text style={p.chipText}>Odadakileri masaya davet et</Text>
                </Pressable>
              )}
            </>
          ) : (
            <Text style={p.dim}>Bu oyun yakında geliyor.</Text>
          ))}
        {casinoGame && casinoVisible(wealthLevel, paidGames) && (
          <SkinOverlay.Provider value={skin ? setOverlay : null}>
            <CasinoScreen key={casinoGame.id} id={casinoGame.id} entry={entry} />
          </SkinOverlay.Provider>
        )}
        {wheel && casinoVisible(wealthLevel, paidGames) && <WheelPlayer entry={entry} />}
      </ScrollView>
      {skin && overlay}
    </View>
  );
  const go = (href: Parameters<typeof router.push>[0]) => {
    onLeave?.();
    router.push(href);
  };
  return <GameNav.Provider value={go}>{inRoom ? body : <SafeAreaView style={{ flex: 1 }}>{body}</SafeAreaView>}</GameNav.Provider>;
}

const p = StyleSheet.create({
  panel: { backgroundColor: colors.card, padding: 14, gap: 8 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, top: '34%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border, zIndex: 40 },
  // Okey and the launch casino games need most of the screen; the top row of seats stays visible.
  tall: { top: '22%' },
  full: { flex: 1, backgroundColor: colors.bg },
  skinned: { overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: colors.text, fontWeight: '900', fontSize: 17, flex: 1 },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(19,217,223,0.10)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  voiceText: { color: colors.text, fontSize: 12, fontWeight: '700', flex: 1 },
  mic: { width: 30, height: 30, borderRadius: 15, backgroundColor: semantic.live, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  invite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 10 },
  volume: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  vol: { borderRadius: 999, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4 },
  volText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
});
