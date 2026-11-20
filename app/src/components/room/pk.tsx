// PK UI: setup sheet (Normal / Takım PK in this room, or a cross-room PK), the live boards (Normal PK timer
// pill in the header, Takım PK arena, cross-room score bar) and the detail card. Everything here renders server
// state from lib/pk; seats, microphones and membership stay with the room. The look is the PK Premium V3 concept
// (components/room/pk-premium): purple, gold, pink against blue; every score in its short form (lib/compact).
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Art, type ArtName } from '@/components/Art';
import { Icon3D } from '@/components/Icon3D';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { useSheetBottom } from '@/components/room/parts';
import { CloseBtn, Crest, GlowButton, GoldRim, NamePlate, PK, PkBackdrop, RankBadge, Ribbon, RingFace, TeamBanner, TimerPill, VsBadge } from '@/components/room/pk-premium';
import { roomIdText } from '@/data/catalog';
import { roomById, userById } from '@/data/mock';
import { IS_DEMO } from '@/lib/build';
import { compact } from '@/lib/compact';
import { useKeyboardOpen } from '@/lib/keyboard-open';
import { liveMode } from '@/lib/live';
import { cancelLivePk, endLiveCrossPk, inviteLiveCrossPk, startLivePk, useCrossPkRooms, type IncomingCrossPk } from '@/lib/live/pk';
import {
  PK_DURATIONS,
  cancelPk,
  drawTeams,
  drawTeamsFrom,
  inviteCrossPk,
  invitableRooms,
  liveRanking,
  modeLabel,
  roomTitle,
  setInviteScenario,
  startRoomPk,
  teamOf,
  topSupporters,
  usePk,
  type InviteScenario,
  type PkDuration,
  type PkMode,
  type PkSession,
  type PkTeam,
  type TeamDraft,
  type TeamId,
} from '@/lib/pk';
import { useSheetMax } from '@/lib/sheet-space';
import { PK_LINE } from '@/lib/seat-fit';
import { showAlert } from '@/lib/alert';
import { SCRIM, colors, semantic } from '@/theme';
import { Photo } from '@/components/photo';

export const nameOf = (uid: string) => (uid === 'me' ? 'Sen' : userById(uid).name);
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};
/** Display-only clock; the end time itself comes from the server. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
const STATUS_LABEL: Record<PkSession['status'], string> = { invite: 'Davet bekleniyor', prep: 'Hazırlanıyor', active: 'Aktif', done: 'Tamamlandı', cancelled: 'İptal edildi' };
/** Timer text; at 0:00 the client waits for the server's result instead of deciding anything itself. */
export function clockText(pk: PkSession, now: number) {
  if (pk.status === 'invite') return `📨 ${mmss((pk.inviteExpiresAt ?? now) - now)}`;
  if (pk.status === 'prep') return `⏳ ${mmss((pk.startAt ?? now) - now)}`;
  if (pk.status === 'active') return (pk.endAt ?? now) - now > 0 ? `⏱ ${mmss((pk.endAt ?? now) - now)}` : 'Sonuç bekleniyor…';
  return STATUS_LABEL[pk.status];
}
/** The clock without its emoji, for the stopwatch pills. */
function plainClock(pk: PkSession, now: number) {
  if (pk.status === 'invite') return mmss((pk.inviteExpiresAt ?? now) - now);
  if (pk.status === 'prep') return `Başlıyor ${mmss((pk.startAt ?? now) - now)}`;
  if (pk.status === 'active') return (pk.endAt ?? now) - now > 0 ? mmss((pk.endAt ?? now) - now) : 'Sonuç bekleniyor…';
  return STATUS_LABEL[pk.status];
}

// --- Setup ---------------------------------------------------------------------------------------
const rid = () => Math.random().toString(36).slice(2, 10);
type Method = 'random' | 'manual';

/** Mount with a fresh `key` per opening: a new request id and a fresh draw each time. */
export function PkSetupSheet({ visible, roomId, starterId, micUsers, offline, onClose }: { visible: boolean; roomId: string; starterId: string; micUsers: string[]; offline: boolean; onClose: () => void }) {
  const { config, scenario } = usePk();
  const [tab, setTab] = useState<'room' | 'cross'>('room');
  const [mode, setMode] = useState<PkMode>('solo');
  const enabled = PK_DURATIONS.filter((d) => config.durations[d]);
  const [duration, setDuration] = useState<PkDuration>(enabled[0] ?? 15);
  const [method, setMethod] = useState<Method>('random');
  const [draft, setDraft] = useState<TeamDraft | null>(null);
  const [assign, setAssign] = useState<Record<string, TeamId | undefined>>({});
  const [query, setQuery] = useState('');
  const [requestId] = useState(rid);
  // Live mode: the server starts it (lib/live/pk); the button waits for its answer.
  const live = liveMode();
  const [busy, setBusy] = useState(false);

  const draftStale = !!draft && [...draft.red, ...draft.blue].some((u) => !micUsers.includes(u));
  const manual = { red: micUsers.filter((u) => assign[u] === 'red'), blue: micUsers.filter((u) => assign[u] === 'blue') };
  const unassigned = micUsers.filter((u) => !assign[u]);
  const imbalance = Math.abs(manual.red.length - manual.blue.length) > 1;

  const draw = () => {
    const r = live ? drawTeamsFrom(roomId, micUsers) : drawTeams(roomId, starterId);
    if (!r.ok) return showAlert('Takımlar oluşturulamadı', r.reason);
    setDraft(r.draft);
  };
  const done = (r: ReturnType<typeof startRoomPk>) => {
    if (!r.ok) return showAlert('PK başlatılamadı', r.reason);
    onClose();
  };
  const startLive = async (o: Parameters<typeof startLivePk>[0]) => {
    if (busy) return;
    setBusy(true);
    const r = await startLivePk(o);
    setBusy(false);
    done(r);
  };
  const startSolo = () => (live ? void startLive({ roomId, durationMin: duration, mode: 'solo', participants: micUsers }) : done(startRoomPk({ roomId, starterId, durationMin: duration, mode: 'solo', requestId })));
  const startTeam = () => {
    // The people this sheet showed and left out of both teams stay out; anyone who takes a mic later joins a team.
    if (method === 'random') {
      if (!draft) return;
      if (live) return void startLive({ roomId, durationMin: duration, mode: 'team', red: draft.red, blue: draft.blue, out: draft.out });
      return done(startRoomPk({ roomId, starterId, durationMin: duration, mode: 'team', draftId: draft.id, requestId }));
    }
    const go = () =>
      live
        ? void startLive({ roomId, durationMin: duration, mode: 'team', red: manual.red, blue: manual.blue, out: unassigned })
        : done(startRoomPk({ roomId, starterId, durationMin: duration, mode: 'team', red: manual.red, blue: manual.blue, requestId }));
    if (!imbalance) return go();
    showAlert('Takımlar dengesiz', `${config.teamNames.red}: ${manual.red.length} kişi · ${config.teamNames.blue}: ${manual.blue.length} kişi. Yine de başlatılsın mı?`, [
      { text: 'Düzenle', style: 'cancel' },
      { text: 'Başlat', onPress: go },
    ]);
  };
  const invite = async (opp: string) => {
    if (busy) return;
    // Live mode: the server sends the invite and the other room's staff answer it (lib/live/pk).
    if (live) setBusy(true);
    const r = live ? await inviteLiveCrossPk(roomId, opp, duration) : inviteCrossPk(roomId, starterId, opp, duration);
    setBusy(false);
    if (!r.ok) return showAlert('Davet gönderilemedi', r.reason);
    onClose();
  };
  // Live mode: open rooms from the server (it searches by the room's ID or name), else the demo's rooms.
  const serverRooms = useCrossPkRooms(roomId, live && visible && tab === 'cross', query);
  const rooms = live ? (serverRooms.rooms ?? []) : invitableRooms(roomId).filter((r) => !query.trim() || r.id.includes(query.trim()) || r.title.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR')));
  const soloOff = !config.soloPkEnabled;
  const teamOff = !config.roomPkEnabled;
  const modeOff = mode === 'solo' ? soloOff : teamOff;
  // However many are on the mics (none too): people who take a mic during the PK join it.
  const canStart = !offline && !busy && !modeOff && (mode === 'solo' || method === 'manual' || (!!draft && !draftStale));
  const sheetBottom = useSheetBottom(16);
  // Over a room it stops at the Balkon line (lib/sheet-space): the choices scroll, the start button stays under them.
  const maxHeight = useSheetMax(0.86);
  const { top } = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The modal does not shrink for the keyboard (edge to edge): the sheet rises above it as a whole, stops under the
          status bar and shrinks there (its body scrolls). */}
      <KeyboardAvoid style={{ flex: 1, paddingTop: top }}>
        <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        <GoldRim sheet radius={26} width={2} style={{ maxHeight, flexShrink: 1 }} inner={{ flexShrink: 1 }}>
          <PkBackdrop style={[st.sheet, { paddingBottom: keyboardOpen ? 16 : sheetBottom }]}>
            <View style={st.closeAt}>
              <CloseBtn onPress={onClose} label="PK panelini kapat" />
            </View>
            <View style={st.sheetHead}>
              <Crest width={96} />
              <View style={{ marginTop: -12 }}>
                <Ribbon title="PK Başlat" size={20} />
              </View>
              <View style={st.tagline}>
                <LinearGradient colors={['transparent', PK.goldEdge]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.taglineLine} />
                <Text style={st.taglineText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  Mikrofon puanlarıyla heyecanlı bir mücadele başlat!
                </Text>
                <LinearGradient colors={[PK.goldEdge, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.taglineLine} />
              </View>
            </View>
            {/* Odalar arası: live mode runs it on the server (server/api/pk-cross.mjs); the demo simulates the rival room. */}
            <View style={st.seg} accessibilityRole="tablist">
              {(
                [
                  ['room', 'Bu oda'],
                  ['cross', 'Odalar arası'],
                ] as const
              ).map(([k, l]) => (
                <Pressable key={k} onPress={() => setTab(k)} style={[st.segBtn, tab === k && st.segOn]} accessibilityRole="tab" aria-selected={tab === k}>
                  <Text style={[st.segText, tab === k && { color: '#3B1A00' }]}>{l}</Text>
                </Pressable>
              ))}
            </View>
            <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 7, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
              {offline && <Notice icon="cloud-offline-outline" text="Bağlantı yok." warn />}
              {tab === 'room' && (
                <View style={st.modes}>
                  <ModeCard tone="pink" on={mode === 'solo'} off={soloOff} art="pk-normal-pk" title="Normal PK" sub="Herkes kendi adına" onPress={() => setMode('solo')} />
                  <ModeCard tone="blue" on={mode === 'team'} off={teamOff} art="pk-takim-pk" title="Takım PK" sub="Kırmızı ve Mavi takım" onPress={() => setMode('team')} />
                  <View pointerEvents="none" style={st.vsAt}>
                    <VsBadge size={46} />
                  </View>
                </View>
              )}
              <Text style={st.label}>Süre · başladıktan sonra değişmez</Text>
              <View style={st.chips}>
                {PK_DURATIONS.map((d) => (
                  <Pressable key={d} disabled={!config.durations[d]} onPress={() => setDuration(d)} style={[st.chip, duration === d && st.chipOn, !config.durations[d] && { opacity: 0.35 }]} accessibilityLabel={`${d} dakika`} aria-selected={duration === d} aria-disabled={!config.durations[d]}>
                    <Text style={[st.chipText, duration === d && { color: '#3B1A00' }]}>{d} dk</Text>
                  </Pressable>
                ))}
              </View>

              {tab === 'room' && mode === 'solo' && (
                <>
                  <Text style={st.label}>Katılımcılar · mikrofondaki {micUsers.length} kişi</Text>
                  {micUsers.length > 0 ? (
                    <View style={st.people}>
                      {micUsers.map((u) => (
                        <Person key={u} uid={u} />
                      ))}
                    </View>
                  ) : (
                    <Notice icon="information-circle-outline" text="Mikrofonda kimse yok; geçen herkes katılır." />
                  )}
                  <Text style={st.dim}>
                    En yüksek {live ? 'hediye değeri' : 'PK puanı'} kazanır.
                  </Text>
                </>
              )}

              {tab === 'room' && mode === 'team' && (
                <>
                  <Text style={st.label}>Takım dağılımı</Text>
                  <View style={st.chips}>
                    {(
                      [
                        ['random', 'Rastgele', 'pk-rastgele-dagit'],
                        ['manual', 'Manuel', 'pk-manuel-dagit'],
                      ] as const
                    ).map(([k, l, art]) => (
                      <Pressable key={k} onPress={() => setMethod(k)} style={[st.chip, st.artRow, method === k && st.chipOn]} accessibilityRole="radio" aria-checked={method === k}>
                        <Art name={art} size={17} />
                        <Text style={[st.chipText, method === k && { color: '#3B1A00' }]}>{l}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {method === 'random' ? (
                    draft ? (
                      <>
                        <TeamPreview red={draft.red} blue={draft.blue} names={config.teamNames} colors={config.teamColors} />
                        {draft.out.length > 0 && <Text style={st.dim}>Takımlar doldu, bu PK’ya katılmayacak: {draft.out.map(nameOf).join(', ')}</Text>}
                        {draftStale && <Notice icon="alert-circle-outline" text="Mikrofondaki kişiler değişti. Takımları yeniden karıştır." warn />}
                        <Pressable style={st.secondary} onPress={draw} accessibilityLabel="Takımları yeniden karıştır">
                          <View style={st.artRow}>
                            <Art name="pk-rastgele-dagit" size={18} />
                            <Text style={st.secondaryText}>Yeniden karıştır</Text>
                          </View>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Text style={st.dim}>
                          {micUsers.length
                            ? `Mikrofondaki ${micUsers.length} kişi rastgele iki takıma ayrılır.`
                            : 'Mikrofonda kimse yok; geçen herkes bir takıma girer.'}
                        </Text>
                        <Pressable style={st.secondary} onPress={draw} accessibilityLabel="Takımları oluştur">
                          <Text style={st.secondaryText}>Takımları oluştur</Text>
                        </Pressable>
                      </>
                    )
                  ) : (
                    <>
                      {micUsers.map((u) => (
                        <View key={u} style={st.member}>
                          <Photo uri={userById(u).avatar} kind="face" style={st.av} />
                          <Text style={st.memberName} numberOfLines={1}>
                            {nameOf(u)}
                          </Text>
                          {(['red', 'blue'] as TeamId[]).map((t) => (
                            <Pressable
                              key={t}
                              onPress={() => setAssign((a) => ({ ...a, [u]: a[u] === t ? undefined : t }))}
                              style={[st.teamBtn, assign[u] === t && { backgroundColor: config.teamColors[t], borderColor: config.teamColors[t] }]}
                              accessibilityLabel={`${nameOf(u)} ${config.teamNames[t]}`}
                              aria-selected={assign[u] === t}
                            >
                              <Text style={st.teamBtnText}>{t === 'red' ? 'Kırmızı' : 'Mavi'}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ))}
                      <TeamPreview red={manual.red} blue={manual.blue} names={config.teamNames} colors={config.teamColors} />
                      {imbalance && <Notice icon="alert-circle-outline" text={`Takımlar dengesiz (${manual.red.length}–${manual.blue.length}).`} warn />}
                      {unassigned.length > 0 && <Text style={st.dim}>Takım seçilmeyenler PK’ya katılmaz: {unassigned.map(nameOf).join(', ')}</Text>}
                    </>
                  )}
                  <Text style={st.dim}>
                    Takım başına en fazla {config.teamMax} kişi
                  </Text>
                </>
              )}

              {tab === 'cross' && (
                <>
                  <TextInput value={query} onChangeText={setQuery} placeholder="Oda ID’si veya adı ara" placeholderTextColor={PK.dim} style={st.input} />
                  {live && serverRooms.rooms === null && <Text style={st.dim}>{serverRooms.failed ? 'Odalar okunamadı. Bağlantını kontrol edip sekmeyi yeniden aç.' : 'Odalar yükleniyor…'}</Text>}
                  {live && serverRooms.rooms?.length === 0 && <Text style={st.dim}>{query.trim() ? 'Bu ID veya adla davet edilebilecek açık oda yok.' : 'Şu an davet edilebilecek açık oda yok.'}</Text>}
                  {rooms.map((r) => (
                    <View key={r.id} style={st.member}>
                      <Photo uri={r.cover} kind="cover" seed={r.id} style={[st.av, { borderRadius: 10 }]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.memberName} numberOfLines={1}>
                          {r.title}
                        </Text>
                        <Text style={st.dim}>
                          ID {live ? roomIdText(r) : r.id} · {r.listeners} kişi · Lv.{r.level ?? 1}
                        </Text>
                      </View>
                      <Pressable style={[st.invite, (offline || busy || !config.crossPkEnabled) && st.disabled]} disabled={offline || busy || !config.crossPkEnabled} onPress={() => void invite(r.id)} accessibilityLabel={`${r.title} odasını PK’ya davet et`}>
                        <Text style={st.inviteText}>Davet et</Text>
                      </Pressable>
                    </View>
                  ))}
                  <Text style={st.dim}>Odalar arası PK her zaman takım PK’sıdır: o odadaki geçerli hediyeler o odanın takımına sayılır. Rakip oda {config.inviteTimeoutSec} sn içinde kabul etmezse PK başlamaz.</Text>
                  {IS_DEMO && !liveMode() && (
                    <>
                      <Text style={st.label}>Test: rakip odanın yanıtı</Text>
                      <View style={st.chips}>
                        {(
                          [
                            ['accept', 'Kabul etsin'],
                            ['decline', 'Reddetsin'],
                            ['timeout', 'Yanıt vermesin'],
                          ] as [InviteScenario, string][]
                        ).map(([k, l]) => (
                          <Pressable key={k} onPress={() => setInviteScenario(k)} style={[st.chip, scenario === k && st.chipOn]}>
                            <Text style={[st.chipText, scenario === k && { color: '#3B1A00' }]}>{l}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
            {tab === 'room' && (
              <GlowButton
                title={busy ? 'Başlatılıyor…' : 'PK’yı Başlat'}
                disabled={!canStart}
                onPress={mode === 'solo' ? startSolo : startTeam}
                label={mode === 'solo' ? `Normal PK başlat, ${duration} dakika` : `Takımları onayla ve başlat, ${duration} dakika`}
              />
            )}
          </PkBackdrop>
        </GoldRim>
      </KeyboardAvoid>
    </Modal>
  );
}

/** A mode to pick: a pink (Normal) or blue (Takım) card, its picture on a little stand; gold rimmed when chosen. */
function ModeCard({ tone, on, off, art, title, sub, onPress }: { tone: 'pink' | 'blue'; on: boolean; off: boolean; art: ArtName; title: string; sub: string; onPress: () => void }) {
  const fill = tone === 'pink' ? (['#FF4FA3', '#A3126C', '#4A0634'] as const) : (['#2FA2FF', '#1C47B8', '#0B1E55'] as const);
  const glow = tone === 'pink' ? PK.pinkGlow : PK.blueGlow;
  return (
    <Pressable onPress={onPress} style={[st.modeCard, off && { opacity: 0.45 }]} accessibilityRole="radio" aria-checked={on} aria-disabled={off} accessibilityLabel={`${title}. ${sub}${off ? '. Şu an kapalı' : ''}`}>
      <LinearGradient colors={fill} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[st.modeFill, on ? { borderColor: '#FFD86B', borderWidth: 2, boxShadow: `0 0 18px ${glow}` } : null]}>
        {on && <Ionicons name="checkmark-circle" size={20} color="#FFD86B" style={st.modeTick} />}
        <View style={st.modeArt}>
          <Art name={art} size={44} />
          <LinearGradient colors={PK.gold} style={st.modeStand} />
        </View>
        <Text style={st.modeTitle}>{title}</Text>
        <Text style={st.modeSub}>{off ? 'Şu an kapalı' : sub}</Text>
      </LinearGradient>
    </Pressable>
  );
}
function Notice({ icon, text, warn }: { icon: keyof typeof Ionicons.glyphMap; text: string; warn?: boolean }) {
  return (
    <View style={[st.notice, warn && st.noticeWarn]}>
      <Ionicons name={icon} size={16} color={warn ? colors.gold : PK.dim} />
      <Text style={[st.dim, { flex: 1, color: warn ? '#FDE7C2' : PK.dim }]}>{text}</Text>
    </View>
  );
}
function Person({ uid, size = 34 }: { uid: string; size?: number }) {
  return (
    <View style={st.person}>
      <RingFace uri={userById(uid).avatar} size={size} />
      <Text style={st.personName} numberOfLines={1}>
        {nameOf(uid)}
      </Text>
    </View>
  );
}
function TeamPreview({ red, blue, names, colors: c }: { red: string[]; blue: string[]; names: Record<TeamId, string>; colors: Record<TeamId, string> }) {
  return (
    <View style={st.preview}>
      {(
        [
          ['red', red],
          ['blue', blue],
        ] as const
      ).map(([t, list]) => (
        <View key={t} style={[st.previewCol, { borderColor: c[t], backgroundColor: `${c[t]}26` }]}>
          <View style={st.previewHead}>
            <TeamBanner team={t} height={26} />
            <Text style={[st.previewName, { color: '#fff' }]} numberOfLines={1}>
              {names[t]} · {list.length}
            </Text>
          </View>
          {list.length === 0 ? <Text style={st.dim}>Henüz kimse yok</Text> : list.map((u) => <Person key={u} uid={u} size={28} />)}
        </View>
      ))}
    </View>
  );
}

// --- Live boards ----------------------------------------------------------------------------------
const teamLabel = (pk: PkSession, t: PkTeam, viewerRoomId: string) => (pk.kind === 'cross' ? (t.roomId === viewerRoomId ? `${roomTitle(t.roomId)} (biz)` : roomTitle(t.roomId)) : t.name);

/** The pill's clock: the countdown before it starts, the time left, then a short "result coming". */
function pillClock(pk: Pick<PkSession, 'status' | 'startAt' | 'endAt'>, now: number) {
  if (pk.status === 'prep') return `⏳ ${mmss((pk.startAt ?? now) - now)}`;
  if (pk.status === 'active') return (pk.endAt ?? now) - now > 0 ? mmss((pk.endAt ?? now) - now) : 'Sonuç…';
  return STATUS_LABEL[pk.status];
}

/**
 * Normal PK: a small "PK 47:16" pill in the room's header instead of a row over the mics, so the stage keeps its
 * height (the points are under the names). A tap opens the ranking; the staff can cancel there.
 */
export function SoloPkPill({ pk, canManage }: { pk: PkSession; canManage: boolean }) {
  const now = useNow(pk.status !== 'done' && pk.status !== 'cancelled');
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Little reach upwards: the room's title (its card) is right above. */}
      <Pressable onPress={() => setOpen(true)} hitSlop={{ top: 3, bottom: 8, left: 8, right: 8 }} style={st.pillAt} accessibilityRole="button" accessibilityLabel={`Normal PK, ${clockText(pk, now)}. Sıralamayı aç`}>
        <LinearGradient colors={['#FF5FA2', '#B81F66']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.pill}>
          <View style={st.pillMark}>
            <Text style={st.pillMarkText}>PK</Text>
          </View>
          <Text style={st.pillClock} numberOfLines={1}>
            {pillClock(pk, now)}
          </Text>
        </LinearGradient>
      </Pressable>
      <PkDetail pk={pk} open={open} onClose={() => setOpen(false)} viewerRoomId={pk.roomId} canManage={canManage} />
    </>
  );
}

/** A side's score: its colour's capsule with a gold rim, the gift icon and the short form. */
function ScoreCapsule({ tone, value, label, flip }: { tone: 'pink' | 'blue'; value: number; label: string; flip?: boolean }) {
  const fill = tone === 'pink' ? (['#FF4F7B', '#B3123F'] as const) : (['#3B8BFF', '#163FA8'] as const);
  return (
    <GoldRim radius={12} width={1.5} style={{ flex: 1, minWidth: 0 }}>
      <LinearGradient colors={fill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={[st.capsule, flip && { flexDirection: 'row-reverse' }]} accessibilityLabel={`${label} ${compact(value)} puan`}>
        <Icon3D name="gift" size={15} />
        <Text style={st.capsuleText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {compact(value)}
        </Text>
      </LinearGradient>
    </GoldRim>
  );
}

/** The two sides on one line: lion banner, red score, VS, blue score, wolf banner (or the rooms' names). */
function Versus({ pk, left, right, banners }: { pk: PkSession; left: string; right: string; banners: boolean }) {
  const [red, blue] = pk.teams;
  return (
    <View style={st.versus}>
      {banners && <TeamBanner team="red" height={38} />}
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <View style={st.versusNames}>
          <Text style={[st.versusName, { color: '#FF9DB5' }]} numberOfLines={1}>
            {left}
          </Text>
          <Text style={[st.versusName, { color: '#9CD3FF', textAlign: 'right' }]} numberOfLines={1}>
            {right}
          </Text>
        </View>
        <View style={st.versusRow}>
          <ScoreCapsule tone="pink" value={red.score} label={left} />
          <VsBadge size={28} />
          <ScoreCapsule tone="blue" value={blue.score} label={right} flip />
        </View>
      </View>
      {banners && <TeamBanner team="blue" height={38} />}
    </View>
  );
}

/** Cross-room PK: two rooms, one shared score and timer. */
export function PkBoard({ pk, viewerRoomId, canManage }: { pk: PkSession; viewerRoomId: string; canManage: boolean }) {
  const now = useNow(pk.status !== 'done' && pk.status !== 'cancelled');
  const [open, setOpen] = useState(false);
  const [red, blue] = pk.teams;
  return (
    <>
      <Pressable style={st.board} onPress={() => setOpen(true)} accessibilityLabel="PK ayrıntıları">
        <View style={st.boardTop}>
          <Text style={st.boardKind} numberOfLines={1}>
            Odalar arası PK
          </Text>
          <TimerPill text={plainClock(pk, now)} />
        </View>
        <Versus pk={pk} left={teamLabel(pk, red, viewerRoomId)} right={teamLabel(pk, blue, viewerRoomId)} banners={false} />
        <View style={st.boardBottom}>
          <Supporters pk={pk} team="red" />
          <Text style={st.dim}>{pk.durationMin} dk · ayrıntılar ›</Text>
          <Supporters pk={pk} team="blue" />
        </View>
      </Pressable>
      <PkDetail pk={pk} open={open} onClose={() => setOpen(false)} viewerRoomId={viewerRoomId} canManage={canManage} />
    </>
  );
}

/**
 * Where a seat is drawn: its slot's width, its face and, where a container has less room above the face than a row of
 * seats (lib/seat-cell SEAT_TOP), the px free there (`top`, Seat roomTop): a frame's crown keeps within it.
 */
export type ArenaSlot = { width: number; size: number; top?: number };
/** The gaps inside a team's half (under its name, between its rows of seats). */
const HALF_GAP = 3;
/**
 * The line of a half's name and head count. It is drawn over the seats under it, like a row's points pill: a frame's
 * crown in the first row may rise behind it (3 px of gap alone would cut nearly every frame there), so it has a dark,
 * nearly opaque backing (st.halfHead) and its text a shadow: the crown's tip is covered and the name reads.
 */
const HEAD_LINE = 16;
/** The PK's other mics: room above their faces, inside the row's scroller (which cuts what passes its edge). */
const OTHERS_TOP = 10;
/**
 * Takım PK arena: the mic area splits in two, Red (the lion) on the left and Blue (the wolf) on the right, each team's
 * people on mics in its own half; the two scores, VS and the timer on top. Seats keep their own press handlers (room
 * management still works); mics outside the PK are shown below the arena.
 */
export function TeamArena({
  pk,
  seats,
  boss,
  width,
  renderSeat,
  canManage,
}: {
  pk: PkSession;
  seats: (string | null)[];
  /** Boss seat holder: on stage but not on a numbered mic. */
  boss: string | null;
  width: number;
  renderSeat: (index: number, slot: ArenaSlot) => ReactNode;
  canManage: boolean;
}) {
  const now = useNow(pk.status !== 'done' && pk.status !== 'cancelled');
  const [open, setOpen] = useState(false);
  // Inner width of one half: screen − arena margins (16) − arena padding+rim (13) − gap (8), halved, − half padding+border (6).
  const inner = Math.max(110, (width - 37) / 2 - 6);
  const cols = Math.max(1, Math.min(3, Math.floor(inner / 58)));
  const slotW = Math.floor(inner / cols);
  const size = Math.max(34, Math.min(52, slotW - 22));
  const others = seats.map((uid, i) => ({ uid, i })).filter(({ uid }) => !uid || !teamOf(pk, uid));
  return (
    <>
      <GoldRim radius={18} width={1.5} style={st.arenaRim} inner={{ overflow: 'visible' }}>
        <View style={st.arena}>
          <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Takım PK ayrıntıları" style={{ gap: 6 }}>
            <View style={st.boardTop}>
              <View style={st.artRow}>
                <Text style={st.boardKind} numberOfLines={1}>
                  Takım PK
                </Text>
                <Text style={st.live} numberOfLines={1}>
                  · {STATUS_LABEL[pk.status]}
                </Text>
              </View>
              <TimerPill text={plainClock(pk, now)} />
            </View>
            <Versus pk={pk} left={pk.teams[0].name} right={pk.teams[1].name} banners />
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {pk.teams.map((t) => {
              const onMic = t.members.filter((m) => seats.includes(m));
              const onBoss = boss && t.members.includes(boss) && !seats.includes(boss) ? boss : null;
              const away = t.members.filter((m) => !seats.includes(m) && m !== onBoss);
              const tint = t.id === 'red' ? (['rgba(226,38,63,0.34)', 'rgba(120,10,40,0.12)'] as const) : (['rgba(47,123,255,0.34)', 'rgba(16,40,120,0.12)'] as const);
              return (
                <LinearGradient key={t.id} colors={tint} style={[st.half, { borderColor: `${t.color}AA` }]} accessibilityLabel={`${t.name}: ${compact(t.score)} puan, ${t.members.length} kişi`}>
                  <View style={[st.halfHead, { zIndex: 1 }]}>
                    <Text style={[st.halfName, { color: t.id === 'red' ? '#FF9DB5' : '#9CD3FF' }]} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={st.halfCount}>{t.members.length} kişi</Text>
                  </View>
                  <View style={st.halfSeats}>
                    {/* Over a face: the gap and the half's name line (first row) or the row above's points line, both
                        drawn over a crown's tip that rises into them; a higher row is drawn over the rows under it. */}
                    {onMic.map((m, k) => (
                      <View key={m} style={{ zIndex: Math.ceil(onMic.length / cols) - Math.floor(k / cols) }}>
                        {renderSeat(seats.indexOf(m), { width: slotW, size, top: HALF_GAP + (k < cols ? HEAD_LINE : PK_LINE) })}
                      </View>
                    ))}
                  </View>
                  {onBoss && (
                    <View style={st.awayRow} accessibilityLabel={`${nameOf(onBoss)} patron koltuğunda, ${compact(pk.points[onBoss] ?? 0)} puan`}>
                      <Photo uri={userById(onBoss).avatar} kind="face" style={st.mini} />
                      <Text style={[st.awayText, { color: colors.gold }]} numberOfLines={1}>
                        Patron · {nameOf(onBoss)} · {compact(pk.points[onBoss] ?? 0)}
                      </Text>
                    </View>
                  )}
                  {onMic.length === 0 && !onBoss && <Text style={[st.dim, { textAlign: 'center' }]}>Bu takımdan mikrofonda kimse yok</Text>}
                  {away.length > 0 && (
                    <View style={st.awayRow}>
                      {away.map((m) => (
                        <View key={m} style={st.away} accessibilityLabel={`${nameOf(m)} mikrofonda değil, ${compact(pk.points[m] ?? 0)} puan`}>
                          <Photo uri={userById(m).avatar} kind="face" style={[st.mini, { opacity: 0.45 }]} />
                          <Text style={st.awayText} numberOfLines={1}>
                            {compact(pk.points[m] ?? 0)}
                          </Text>
                        </View>
                      ))}
                      <Text style={st.awayText}>mikrofonda değil</Text>
                    </View>
                  )}
                </LinearGradient>
              );
            })}
          </View>
        </View>
      </GoldRim>
      {others.length > 0 && (
        <View style={st.others}>
          <Text style={st.othersTitle}>PK dışındaki mikrofonlar · {others.filter((o) => o.uid).length}/{others.length}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.othersRow}>
            {others.map(({ i }) => (
              <View key={i}>{renderSeat(i, { width: 56, size: 34, top: OTHERS_TOP })}</View>
            ))}
          </ScrollView>
        </View>
      )}
      <PkDetail pk={pk} open={open} onClose={() => setOpen(false)} viewerRoomId={pk.roomId} canManage={canManage} />
    </>
  );
}

function Supporters({ pk, team }: { pk: PkSession; team: TeamId }) {
  const top = topSupporters(pk, { teamId: team }, 3);
  return (
    <View style={{ flexDirection: 'row' }}>
      {top.map(([uid]) => (
        <Photo key={uid} uri={userById(uid).avatar} kind="face" style={st.mini} />
      ))}
    </View>
  );
}

function OpponentRow({ roomId }: { roomId: string }) {
  const r = roomById(roomId);
  return (
    <View style={st.member}>
      {r && <Photo uri={r.cover} kind="cover" seed={r.id} style={[st.av, { borderRadius: 10 }]} />}
      <Text style={st.memberName}>Rakip: {roomTitle(roomId)}</Text>
    </View>
  );
}

/** One of the first three on the live podium: the place's metal ring, its badge, the name plate and the points. */
function PodiumPlace({ uid, points, rank, face }: { uid: string; points: number; rank: number; face: number }) {
  return (
    <View style={[st.podiumPlace, { paddingTop: rank === 1 ? 0 : 18 }]} accessibilityLabel={`${rank}. ${nameOf(uid)}, ${compact(points)} puan`}>
      <View style={{ alignItems: 'center' }}>
        <RingFace uri={userById(uid).avatar} size={face} rank={rank} />
        <View style={{ marginTop: -12 }}>
          <RankBadge rank={rank} size={24} />
        </View>
      </View>
      <NamePlate text={nameOf(uid)} width={Math.round(face * 1.35)} tone={rank === 1 ? 'pink' : undefined} />
      <View style={st.podiumPts}>
        <Icon3D name="gift" size={14} />
        <Text style={st.podiumPtsText}>{compact(points)}</Text>
      </View>
    </View>
  );
}

/**
 * Detail card (PK Premium 02A/02B): Normal PK's live podium (2-1-3) and everyone else under it; Takım PK's lion and wolf
 * with their scores, members and supporters; managers can cancel.
 */
export function PkDetail({ pk, open, onClose, viewerRoomId, canManage }: { pk: PkSession; open: boolean; onClose: () => void; viewerRoomId: string; canManage: boolean }) {
  const now = useNow(open && pk.status !== 'done' && pk.status !== 'cancelled');
  const ranking = pk.mode === 'solo' ? liveRanking(pk) : [];
  const ranks = ranking.map((x) => ranking.findIndex((y) => y.points === x.points) + 1);
  const podium = [1, 0, 2].filter((i) => ranking[i]);
  const rest = ranking.slice(3);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.center} onPress={onClose}>
        <Pressable style={st.detailWrap} onPress={() => {}}>
          <GoldRim radius={24} width={2} style={{ flexShrink: 1 }} inner={{ flexShrink: 1 }}>
            <PkBackdrop style={{ flexShrink: 1 }}>
              <View style={st.closeAt}>
                <CloseBtn onPress={onClose} label="Kapat" />
              </View>
              <ScrollView contentContainerStyle={st.detailBody} showsVerticalScrollIndicator={false}>
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Crest width={128} />
                  <View style={{ marginTop: -14 }}>
                    <Ribbon title="PK" sub={`${modeLabel(pk)} · ${STATUS_LABEL[pk.status]}`} size={26} />
                  </View>
                  <TimerPill text={plainClock(pk, now)} />
                </View>
                {pk.kind === 'cross' && pk.opponentRoomId && <OpponentRow roomId={pk.teams.find((t) => t.roomId !== viewerRoomId)!.roomId} />}
                {pk.mode === 'solo' ? (
                  ranking.length === 0 ? (
                    <Text style={[st.dim, { textAlign: 'center' }]}>Henüz katılımcı yok. Mikrofona geçen herkes PK’ya katılır.</Text>
                  ) : (
                    <>
                      <View style={st.podium}>
                        {podium.map((i) => (
                          <PodiumPlace key={ranking[i].userId} uid={ranking[i].userId} points={ranking[i].points} rank={ranks[i]} face={ranks[i] === 1 ? 70 : 54} />
                        ))}
                      </View>
                      {rest.length > 0 && (
                        <View style={st.restGrid}>
                          {rest.map((r, i) => (
                            <View key={r.userId} style={st.restCell} accessibilityLabel={`${ranks[i + 3]}. ${nameOf(r.userId)}, ${compact(r.points)} puan`}>
                              <View>
                                <RingFace uri={userById(r.userId).avatar} size={40} />
                                <Icon3D name="crown" size={13} style={st.restCrown} />
                              </View>
                              <Text style={st.restName} numberOfLines={1}>
                                {nameOf(r.userId)}
                              </Text>
                              <Text style={st.restPts}>{compact(r.points)}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                      {ranking.slice(0, 3).map((r) => {
                        const fan = topSupporters(pk, { recipientId: r.userId }, 1)[0];
                        return fan ? (
                          <Text key={r.userId} style={st.dim} numberOfLines={1}>
                            {nameOf(r.userId)} · en çok destek: {nameOf(fan[0])} ({compact(fan[1])})
                          </Text>
                        ) : null;
                      })}
                    </>
                  )
                ) : (
                  <>
                    <View style={st.teamsRow}>
                      {pk.teams.map((t, i) => (
                        <View key={t.id} style={st.teamCol}>
                          {pk.kind === 'room' ? <TeamBanner team={t.id} height={78} /> : <Photo uri={roomById(t.roomId)?.cover} kind="cover" seed={t.roomId} style={st.roomCover} />}
                          <Text style={[st.teamColName, { color: t.id === 'red' ? '#FF9DB5' : '#9CD3FF' }]} numberOfLines={1}>
                            {teamLabel(pk, t, viewerRoomId)}
                          </Text>
                          <Text style={st.teamColScore}>{compact(t.score)}</Text>
                          {i === 0 && (
                            <View style={st.teamVs} pointerEvents="none">
                              <VsBadge size={40} />
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                    {pk.teams.map((t) => (
                      <View key={t.id} style={{ gap: 4 }}>
                        <Text style={[st.label, { color: t.id === 'red' ? '#FF9DB5' : '#9CD3FF' }]}>
                          {teamLabel(pk, t, viewerRoomId)} · {compact(t.score)} puan
                        </Text>
                        {pk.kind === 'room' && t.members.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                            {[...t.members]
                              .sort((a, b) => (pk.points[b] ?? 0) - (pk.points[a] ?? 0))
                              .map((m) => (
                                <View key={m} style={st.restCell}>
                                  <RingFace uri={userById(m).avatar} size={40} />
                                  <Text style={st.restName} numberOfLines={1}>
                                    {nameOf(m)}
                                  </Text>
                                  <Text style={st.restPts}>{compact(pk.points[m] ?? 0)}</Text>
                                </View>
                              ))}
                          </ScrollView>
                        )}
                        {topSupporters(pk, { teamId: t.id }, 5).map(([uid, pts], i) => (
                          <Text key={uid} style={st.dim}>
                            Destekçi {i + 1}. {nameOf(uid)} · {compact(pts)}
                          </Text>
                        ))}
                      </View>
                    ))}
                  </>
                )}
                <Text style={st.dim}>Puanlar sunucuda doğrulanan hediyelerden gelir; hediye bedeli, jeton bakiyesi ve yayıncı kazancı PK puanından ayrıdır. PK başlamadan önceki ve bittikten sonraki hediyeler sayılmaz.</Text>
                {canManage && ['invite', 'prep', 'active'].includes(pk.status) && (
                  <Pressable
                    style={st.danger}
                    onPress={() => {
                      if (pk.id.startsWith('SPK-'))
                        void cancelLivePk(pk.roomId).then((r) => {
                          if (!r.ok) showAlert('PK iptal edilemedi', r.reason);
                        });
                      // A server cross-room PK: either room's staff end it, for both rooms.
                      else if (pk.id.startsWith('XPK-'))
                        void endLiveCrossPk(viewerRoomId).then((r) => {
                          if (!r.ok) showAlert('PK iptal edilemedi', r.reason);
                        });
                      else cancelPk(pk.id, 'Oda yönetimi PK’yı iptal etti');
                      onClose();
                    }}
                    accessibilityLabel="PK'yı iptal et"
                  >
                    <Text style={st.dangerText}>PK’yı iptal et</Text>
                  </Pressable>
                )}
              </ScrollView>
            </PkBackdrop>
          </GoldRim>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * Odalar arası PK invite to this room, for its owner and admins (live mode): who invites, how long, the time left to
 * answer. Gone when the time is up (the server then refuses an answer anyway).
 */
export function CrossPkInvitePrompt({ invite, busy, top, onAnswer }: { invite: IncomingCrossPk; busy: boolean; /** Under the mics: the room's place for a question (live-room `promptTop`). */ top: number; onAnswer: (accept: boolean) => void }) {
  const now = useNow(true);
  const left = Math.max(0, Math.ceil((invite.expiresAt - now) / 1000));
  const from = roomById(invite.fromRoomId);
  if (left <= 0) return null;
  return (
    <View style={[st.prompt, { top }]} accessibilityLiveRegion="polite" accessibilityLabel={`${roomTitle(invite.fromRoomId)} odası seni ${invite.durationMin} dakikalık PK’ya davet ediyor`}>
      {from.cover ? <Photo uri={from.cover} kind="cover" seed={from.id} style={[st.av, { borderRadius: 10 }]} /> : <Art name="pk-takim-pk" size={34} />}
      <View style={st.promptText}>
        <Text style={st.memberName} numberOfLines={2}>
          {roomTitle(invite.fromRoomId)} odanı PK’ya davet ediyor
        </Text>
        <Text style={st.dim}>
          Odalar arası PK · {invite.durationMin} dk · {left} sn
        </Text>
      </View>
      {/* On a line of their own, so the invite's sentence is never cut beside them. */}
      <View style={st.promptBtns}>
        <Pressable style={[st.decline, busy && st.disabled]} disabled={busy} onPress={() => onAnswer(false)} accessibilityLabel="PK davetini reddet">
          <Text style={st.declineText}>Reddet</Text>
        </Pressable>
        <Pressable style={[st.accept, busy && st.disabled]} disabled={busy} onPress={() => onAnswer(true)} accessibilityLabel="PK davetini kabul et">
          <Text style={st.acceptText}>Kabul</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: SCRIM },
  sheet: { paddingHorizontal: 12, paddingTop: 8, gap: 8, flexShrink: 1 },
  closeAt: { position: 'absolute', right: 10, top: 10, zIndex: 3 },
  sheetHead: { alignItems: 'center', gap: 3 },
  tagline: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  taglineLine: { flex: 1, height: 1 },
  taglineText: { color: '#F3E3FF', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: 3, borderWidth: 1, borderColor: 'rgba(231,169,58,0.45)' },
  segBtn: { flex: 1, borderRadius: 999, paddingVertical: 6, alignItems: 'center' },
  segOn: { backgroundColor: '#F7C85A' },
  segText: { color: '#fff', fontWeight: '800' },
  label: { color: '#fff', fontWeight: '800', fontSize: 14 },
  dim: { color: PK.dim, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(231,169,58,0.55)', paddingHorizontal: 12, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.05)' },
  chipOn: { borderColor: '#FFE7A0', backgroundColor: '#F7C85A' },
  chipText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  modes: { flexDirection: 'row', gap: 8 },
  vsAt: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  modeCard: { flex: 1, minWidth: 0 },
  modeFill: { flexGrow: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 6, gap: 1, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  modeTick: { position: 'absolute', top: 5, right: 5 },
  modeArt: { alignItems: 'center' },
  modeStand: { width: 64, height: 10, borderRadius: 32, marginTop: -6, opacity: 0.9 },
  modeTitle: { color: PK.goldText, fontWeight: '800', fontSize: 17, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  modeSub: { color: '#fff', fontSize: 12, textAlign: 'center', lineHeight: 16 },
  notice: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  noticeWarn: { backgroundColor: 'rgba(246,189,96,0.16)' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  person: { alignItems: 'center', gap: 3, width: 58 },
  personName: { color: '#fff', fontSize: 12, maxWidth: 58 },
  preview: { flexDirection: 'row', gap: 6 },
  previewCol: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 12, padding: 6, gap: 4, flexDirection: 'row', flexWrap: 'wrap' },
  previewHead: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6 },
  previewName: { flexShrink: 1, fontWeight: '800', fontSize: 13 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  av: { width: 36, height: 36, borderRadius: 18 },
  memberName: { color: '#fff', fontWeight: '700', flex: 1 },
  teamBtn: { borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 10, paddingVertical: 7 },
  teamBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  disabled: { opacity: 0.45 },
  secondary: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 999, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(231,169,58,0.55)' },
  secondaryText: { color: PK.goldText, fontWeight: '800' },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(231,169,58,0.45)' },
  invite: { backgroundColor: semantic.socialFill, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  inviteText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  board: { marginHorizontal: 8, marginTop: 4, backgroundColor: 'rgba(30,8,48,0.84)', borderRadius: 14, paddingHorizontal: 6, paddingVertical: 4, gap: 3, borderWidth: 1.5, borderColor: 'rgba(231,169,58,0.7)' },
  boardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  boardKind: { color: PK.goldText, fontWeight: '800', fontSize: 14, flexShrink: 1 },
  live: { color: PK.dim, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  artRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1, minWidth: 0 },
  boardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  versus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  versusNames: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  versusName: { flex: 1, fontWeight: '800', fontSize: 12 },
  versusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  capsule: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, height: 26 },
  capsuleText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'], textAlign: 'center' },
  // The header's PK pill sits in the room's info line and overhangs it a little, so the header doesn't grow.
  pillAt: { marginVertical: -3 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 18, borderRadius: 9, paddingLeft: 2, paddingRight: 7, borderWidth: 1, borderColor: 'rgba(255,216,107,0.8)' },
  pillMark: { height: 14, borderRadius: 7, paddingHorizontal: 4, justifyContent: 'center', backgroundColor: '#FDE68A' },
  pillMarkText: { color: '#5B0F33', fontSize: 9, lineHeight: 12, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.3 },
  pillClock: { color: '#fff', fontSize: 11, lineHeight: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  mini: { width: 20, height: 20, borderRadius: 10, marginRight: -4, borderWidth: 1, borderColor: colors.bg },
  arenaRim: { marginHorizontal: 8, marginTop: 4 },
  arena: { backgroundColor: 'rgba(30,8,48,0.86)', borderRadius: 16.5, padding: 5, gap: 4 },
  half: { flex: 1, minWidth: 0, borderRadius: 12, borderWidth: 1, paddingVertical: 3, paddingHorizontal: 2, gap: HALF_GAP },
  halfHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, gap: 4, borderRadius: 8, backgroundColor: 'rgba(20,10,32,0.9)' },
  halfName: { fontWeight: '800', fontSize: 12, lineHeight: HEAD_LINE, flexShrink: 1, textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3 },
  halfCount: { color: PK.dim, fontSize: 11, lineHeight: HEAD_LINE, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.75)', textShadowRadius: 3 },
  halfSeats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: HALF_GAP },
  awayRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  away: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  awayText: { color: PK.dim, fontSize: 12 },
  others: { marginHorizontal: 8, marginTop: 4, gap: 2 },
  othersTitle: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  othersRow: { flexDirection: 'row', paddingTop: OTHERS_TOP },
  center: { flex: 1, backgroundColor: SCRIM, alignItems: 'center', justifyContent: 'center', padding: 16 },
  detailWrap: { width: '100%', maxWidth: 420, maxHeight: '88%' },
  detailBody: { paddingHorizontal: 10, paddingVertical: 8, gap: 7 },
  podium: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 4 },
  podiumPlace: { alignItems: 'center', gap: 2, flex: 1, minWidth: 0 },
  podiumPts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  podiumPtsText: { color: PK.goldText, fontWeight: '800', fontSize: 14, fontVariant: ['tabular-nums'] },
  restGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  restCell: { width: 62, alignItems: 'center', gap: 2 },
  restCrown: { position: 'absolute', top: -8, alignSelf: 'center' },
  restName: { color: '#fff', fontSize: 11, fontWeight: '700', maxWidth: 62 },
  restPts: { color: PK.goldText, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  teamsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  teamCol: { flex: 1, alignItems: 'center', gap: 2 },
  teamColName: { fontWeight: '800', fontSize: 13 },
  teamColScore: { color: '#fff', fontWeight: '800', fontSize: 20, fontVariant: ['tabular-nums'] },
  teamVs: { position: 'absolute', right: -20, top: 22, zIndex: 2 },
  roomCover: { width: 64, height: 64, borderRadius: 14 },
  danger: { backgroundColor: 'rgba(217,58,69,0.18)', borderRadius: 999, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.red },
  dangerText: { color: '#FF7A82', fontWeight: '900' },
  prompt: { position: 'absolute', left: 12, right: 12, zIndex: 40, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, backgroundColor: '#2A0B45', borderRadius: 16, padding: 10, borderWidth: 1.5, borderColor: '#E7A93A' },
  promptText: { flexBasis: '78%', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  promptBtns: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  decline: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 12, paddingVertical: 9 },
  declineText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  accept: { backgroundColor: semantic.action, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  acceptText: { color: semantic.actionInk, fontWeight: '900', fontSize: 13 },
});
