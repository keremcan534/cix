// PK UI: setup sheet (Normal / Takım PK in this room, or a cross-room PK), the live boards (Normal PK
// ranking strip, Takım PK arena, cross-room score bar) and the detail card. Everything here renders server
// state from lib/pk; seats, microphones and membership stay with the room.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { roomById, userById } from '@/data/mock';
import {
  PK_DURATIONS,
  cancelPk,
  drawTeams,
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
import { showAlert } from '@/lib/alert';
import { colors, semantic } from '@/theme';

export const fmt = (n: number) => n.toLocaleString('tr-TR');
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

  const draftStale = !!draft && [...draft.red, ...draft.blue].some((u) => !micUsers.includes(u));
  const manual = { red: micUsers.filter((u) => assign[u] === 'red'), blue: micUsers.filter((u) => assign[u] === 'blue') };
  const unassigned = micUsers.filter((u) => !assign[u]);
  const imbalance = Math.abs(manual.red.length - manual.blue.length) > 1;

  const draw = () => {
    const r = drawTeams(roomId, starterId);
    if (!r.ok) return showAlert('Takımlar oluşturulamadı', r.reason);
    setDraft(r.draft);
  };
  const done = (r: ReturnType<typeof startRoomPk>) => {
    if (!r.ok) return showAlert('PK başlatılamadı', r.reason);
    onClose();
  };
  const startSolo = () => done(startRoomPk({ roomId, starterId, durationMin: duration, mode: 'solo', requestId }));
  const startTeam = () => {
    if (method === 'random') {
      if (!draft) return;
      return done(startRoomPk({ roomId, starterId, durationMin: duration, mode: 'team', draftId: draft.id, requestId }));
    }
    const go = () => done(startRoomPk({ roomId, starterId, durationMin: duration, mode: 'team', red: manual.red, blue: manual.blue, requestId }));
    if (!imbalance) return go();
    showAlert('Takımlar dengesiz', `${config.teamNames.red}: ${manual.red.length} kişi · ${config.teamNames.blue}: ${manual.blue.length} kişi. Yine de başlatılsın mı?`, [
      { text: 'Düzenle', style: 'cancel' },
      { text: 'Başlat', onPress: go },
    ]);
  };
  const invite = (opp: string) => {
    const r = inviteCrossPk(roomId, starterId, opp, duration);
    if (!r.ok) return showAlert('Davet gönderilemedi', r.reason);
    onClose();
  };
  const rooms = invitableRooms(roomId).filter((r) => !query.trim() || r.id.includes(query.trim()) || r.title.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR')));
  const soloOff = !config.soloPkEnabled;
  const teamOff = !config.roomPkEnabled;
  const modeOff = mode === 'solo' ? soloOff : teamOff;
  const canStart = !offline && !modeOff && (mode === 'solo' ? micUsers.length >= 2 : method === 'random' ? !!draft && !draftStale : manual.red.length >= config.teamMin && manual.blue.length >= config.teamMin);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={st.sheet}>
        <View style={st.head}>
          <Text style={st.title}>PK başlat</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="PK panelini kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <View style={st.seg} accessibilityRole="tablist">
          {(
            [
              ['room', 'Bu oda'],
              ['cross', 'Odalar arası'],
            ] as const
          ).map(([k, l]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[st.segBtn, tab === k && st.segOn]} accessibilityRole="tab" aria-selected={tab === k}>
              <Text style={[st.segText, tab === k && { color: semantic.actionInk }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
          {offline && <Notice icon="cloud-offline-outline" text="Bağlantı yok. PK başlatmak için bağlantının dönmesini bekle." warn />}
          {tab === 'room' && (
            <>
              <Text style={st.label}>PK modu</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <ModeCard on={mode === 'solo'} off={soloOff} emoji="🎤" title="Normal PK" sub="Herkes kendi adına · mikrofon düzeni değişmez" onPress={() => setMode('solo')} />
                <ModeCard on={mode === 'team'} off={teamOff} emoji="⚔️" title="Takım PK" sub="Kırmızı vs Mavi · alan ikiye ayrılır" onPress={() => setMode('team')} />
              </View>
            </>
          )}
          <Text style={st.label}>Süre · başladıktan sonra değişmez</Text>
          <View style={st.chips}>
            {PK_DURATIONS.map((d) => (
              <Pressable key={d} disabled={!config.durations[d]} onPress={() => setDuration(d)} style={[st.chip, duration === d && st.chipOn, !config.durations[d] && { opacity: 0.35 }]} accessibilityLabel={`${d} dakika`} aria-selected={duration === d} aria-disabled={!config.durations[d]}>
                <Text style={st.chipText}>{d} dk</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'room' && mode === 'solo' && (
            <>
              <Text style={st.label}>Katılımcılar · mikrofondaki {micUsers.length} kişi</Text>
              <View style={st.people}>
                {micUsers.map((u) => (
                  <Person key={u} uid={u} />
                ))}
              </View>
              {micUsers.length < 2 && <Notice icon="information-circle-outline" text="Normal PK için mikrofonda en az 2 kişi olmalı." warn />}
              <Text style={st.dim}>Her kişi aldığı hediyelerin PK puanıyla yarışır; en yüksek puan kazanır. PK sırasında mikrofona geçen kişi o andan itibaren katılır, mikrofondan inen kişinin puanı kalır ama yeni puan almaz.</Text>
              <Pressable style={[st.primary, !canStart && st.disabled]} disabled={!canStart} onPress={startSolo} accessibilityLabel="Normal PK başlat">
                <Text style={st.primaryText}>Normal PK’yı başlat · {duration} dk</Text>
              </Pressable>
            </>
          )}

          {tab === 'room' && mode === 'team' && (
            <>
              <Text style={st.label}>Takım dağılımı</Text>
              <View style={st.chips}>
                {(
                  [
                    ['random', '🔀 Rastgele'],
                    ['manual', '✋ Manuel'],
                  ] as const
                ).map(([k, l]) => (
                  <Pressable key={k} onPress={() => setMethod(k)} style={[st.chip, method === k && st.chipOn]} accessibilityRole="radio" aria-checked={method === k}>
                    <Text style={st.chipText}>{l}</Text>
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
                      <Text style={st.secondaryText}>🔀 Yeniden karıştır</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Text style={st.dim}>Mikrofondaki {micUsers.length} kişi sunucuda rastgele ve eşit sayıda iki takıma ayrılır (tek sayıda fark en fazla 1). Başlatmadan önce dağılımı görürsün.</Text>
                    <Pressable style={[st.secondary, micUsers.length < config.teamMin * 2 && st.disabled]} disabled={micUsers.length < config.teamMin * 2} onPress={draw} accessibilityLabel="Takımları oluştur">
                      <Text style={st.secondaryText}>Takımları oluştur</Text>
                    </Pressable>
                  </>
                )
              ) : (
                <>
                  {micUsers.map((u) => (
                    <View key={u} style={st.member}>
                      <Image source={{ uri: userById(u).avatar }} style={st.av} />
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
                  {imbalance && <Notice icon="alert-circle-outline" text={`Takımlar dengesiz (${manual.red.length}–${manual.blue.length}). Mümkünse farkı en fazla 1 kişiye indir.`} warn />}
                  {unassigned.length > 0 && <Text style={st.dim}>Takım seçilmeyenler PK’ya katılmaz: {unassigned.map(nameOf).join(', ')}</Text>}
                </>
              )}
              <Text style={st.dim}>
                Takım başına {config.teamMin}–{config.teamMax} kişi · PK başladıktan sonra takımlar sabittir · hediyeyi alan kişi ve takımı puan kazanır
              </Text>
              <Pressable style={[st.primary, !canStart && st.disabled]} disabled={!canStart} onPress={startTeam} accessibilityLabel="Takımları onayla ve başlat">
                <Text style={st.primaryText}>Takımları onayla ve başlat · {duration} dk</Text>
              </Pressable>
            </>
          )}

          {tab === 'cross' && (
            <>
              <TextInput value={query} onChangeText={setQuery} placeholder="Oda ID’si veya adı ara" placeholderTextColor={colors.textDim} style={st.input} />
              {rooms.map((r) => (
                <View key={r.id} style={st.member}>
                  <Image source={{ uri: r.cover }} style={[st.av, { borderRadius: 10 }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={st.memberName} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={st.dim}>
                      ID {r.id} · {r.listeners} kişi · Lv.{r.level ?? 1}
                    </Text>
                  </View>
                  <Pressable style={[st.invite, (offline || !config.crossPkEnabled) && st.disabled]} disabled={offline || !config.crossPkEnabled} onPress={() => invite(r.id)} accessibilityLabel={`${r.title} odasını PK’ya davet et`}>
                    <Text style={st.inviteText}>Davet et</Text>
                  </Pressable>
                </View>
              ))}
              <Text style={st.dim}>Odalar arası PK her zaman takım PK’sıdır: o odadaki geçerli hediyeler o odanın takımına sayılır. Rakip oda {config.inviteTimeoutSec} sn içinde kabul etmezse PK başlamaz.</Text>
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
                    <Text style={st.chipText}>{l}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function ModeCard({ on, off, emoji, title, sub, onPress }: { on: boolean; off: boolean; emoji: string; title: string; sub: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[st.modeCard, on && st.modeOn, off && { opacity: 0.45 }]} accessibilityRole="radio" aria-checked={on} aria-disabled={off} accessibilityLabel={`${title}. ${sub}${off ? '. Şu an kapalı' : ''}`}>
      <Text style={{ fontSize: 26 }}>{emoji}</Text>
      <Text style={st.modeTitle}>{title}</Text>
      <Text style={st.modeSub}>{off ? 'Şu an kapalı' : sub}</Text>
    </Pressable>
  );
}
function Notice({ icon, text, warn }: { icon: keyof typeof Ionicons.glyphMap; text: string; warn?: boolean }) {
  return (
    <View style={[st.notice, warn && st.noticeWarn]}>
      <Ionicons name={icon} size={16} color={warn ? colors.gold : colors.textDim} />
      <Text style={[st.dim, { flex: 1, color: warn ? '#FDE7C2' : colors.textDim }]}>{text}</Text>
    </View>
  );
}
function Person({ uid, size = 34 }: { uid: string; size?: number }) {
  return (
    <View style={st.person}>
      <Image source={{ uri: userById(uid).avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
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
        <View key={t} style={[st.previewCol, { borderColor: c[t], backgroundColor: `${c[t]}1F` }]}>
          <Text style={[st.previewHead, { color: c[t] }]} numberOfLines={1}>
            {names[t]} · {list.length}
          </Text>
          {list.length === 0 ? <Text style={st.dim}>Henüz kimse yok</Text> : list.map((u) => <Person key={u} uid={u} size={28} />)}
        </View>
      ))}
    </View>
  );
}

// --- Live boards ----------------------------------------------------------------------------------
const teamLabel = (pk: PkSession, t: PkTeam, viewerRoomId: string) => (pk.kind === 'cross' ? (t.roomId === viewerRoomId ? `${roomTitle(t.roomId)} (biz)` : roomTitle(t.roomId)) : t.name);

/** Normal PK: the live top 3 with points; the full ranking is in the detail card. */
export function SoloBoard({ pk, canManage }: { pk: PkSession; canManage: boolean }) {
  const now = useNow(pk.status !== 'done' && pk.status !== 'cancelled');
  const [open, setOpen] = useState(false);
  const ranking = liveRanking(pk);
  const top = ranking.filter((r) => r.points > 0).slice(0, 3);
  return (
    <>
      <Pressable style={st.board} onPress={() => setOpen(true)} accessibilityLabel={`Normal PK, ${clockText(pk, now)}. Sıralamayı aç`}>
        <View style={st.boardTop}>
          <Text style={[st.teamName, { color: colors.gold }]}>🎤 Normal PK</Text>
          <View style={st.timer}>
            <Text style={st.timerText}>{clockText(pk, now)}</Text>
          </View>
          <Text style={[st.dim, { flex: 1, textAlign: 'right' }]}>{pk.participants.length} kişi ›</Text>
        </View>
        <View style={st.soloRow}>
          {top.length === 0 ? (
            <Text style={st.dim}>{pk.status === 'active' ? 'Henüz puan yok · mikrofondakilere hediye gönder' : 'Hazırlanıyor · hediyeler PK başlayınca sayılır'}</Text>
          ) : (
            top.map((r, i) => (
              <View key={r.userId} style={st.soloChip}>
                <Text style={st.soloRank}>{['🥇', '🥈', '🥉'][i]}</Text>
                <Image source={{ uri: userById(r.userId).avatar }} style={st.mini} />
                <Text style={st.soloName} numberOfLines={1}>
                  {nameOf(r.userId)}
                </Text>
                <Text style={st.soloPts}>{fmt(r.points)}</Text>
              </View>
            ))
          )}
        </View>
      </Pressable>
      <PkDetail pk={pk} open={open} onClose={() => setOpen(false)} viewerRoomId={pk.roomId} canManage={canManage} />
    </>
  );
}

/** Cross-room PK: two rooms, one shared score bar and timer. */
export function PkBoard({ pk, viewerRoomId, canManage }: { pk: PkSession; viewerRoomId: string; canManage: boolean }) {
  const now = useNow(pk.status !== 'done' && pk.status !== 'cancelled');
  const [open, setOpen] = useState(false);
  const [red, blue] = pk.teams;
  return (
    <>
      <Pressable style={st.board} onPress={() => setOpen(true)} accessibilityLabel="PK ayrıntıları">
        <ScoreBar pk={pk} now={now} left={teamLabel(pk, red, viewerRoomId)} right={teamLabel(pk, blue, viewerRoomId)} teamColors />
        <View style={st.boardBottom}>
          <Supporters pk={pk} team="red" />
          <Text style={st.dim}>
            {STATUS_LABEL[pk.status]} · {pk.durationMin} dk · odalar arası
          </Text>
          <Supporters pk={pk} team="blue" />
        </View>
      </Pressable>
      <PkDetail pk={pk} open={open} onClose={() => setOpen(false)} viewerRoomId={viewerRoomId} canManage={canManage} />
    </>
  );
}

/** Shared score bar and timer; `teamColors` colours the side labels (room names in a cross-room PK). */
function ScoreBar({ pk, now, left, right, teamColors }: { pk: PkSession; now: number; left: string; right: string; teamColors?: boolean }) {
  const [red, blue] = pk.teams;
  const total = red.score + blue.score;
  const ratio = total === 0 ? 0.5 : red.score / total;
  return (
    <>
      <View style={st.boardTop}>
        <Text style={[st.teamName, { color: teamColors ? red.color : colors.text }]} numberOfLines={1}>
          {left}
        </Text>
        <View style={st.timer}>
          <Text style={st.timerText}>{clockText(pk, now)}</Text>
        </View>
        <Text style={[st.teamName, { color: teamColors ? blue.color : colors.textDim, textAlign: 'right' }]} numberOfLines={1}>
          {right}
        </Text>
      </View>
      <View style={st.track} accessibilityLabel={`${red.name} ${fmt(red.score)}, ${blue.name} ${fmt(blue.score)}`}>
        <View style={{ flex: Math.max(ratio, 0.04), backgroundColor: red.color, justifyContent: 'center', paddingLeft: 8 }}>
          <Text style={st.score}>{fmt(red.score)}</Text>
        </View>
        <View style={{ flex: Math.max(1 - ratio, 0.04), backgroundColor: blue.color, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 }}>
          <Text style={st.score}>{fmt(blue.score)}</Text>
        </View>
      </View>
    </>
  );
}

export type ArenaSlot = { width: number; size: number };
/**
 * Takım PK arena: the mic area splits in two, Red on the left and Blue on the right, each team's people on
 * mics in its own half with the team total; the shared score bar and timer sit on top. Seats keep their own
 * press handlers (room management still works); mics outside the PK are shown below the arena.
 */
export function TeamArena({ pk, seats, width, renderSeat, canManage }: { pk: PkSession; seats: (string | null)[]; width: number; renderSeat: (index: number, slot: ArenaSlot) => ReactNode; canManage: boolean }) {
  const now = useNow(pk.status !== 'done' && pk.status !== 'cancelled');
  const [open, setOpen] = useState(false);
  // Inner width of one half: screen − arena margins (24) − arena padding+border (18) − gap (8), halved, − half padding+border (10).
  const inner = Math.max(110, (width - 50) / 2 - 10);
  const cols = Math.max(1, Math.min(3, Math.floor(inner / 58)));
  const slotW = Math.floor(inner / cols);
  const size = Math.max(34, Math.min(52, slotW - 22));
  const others = seats.map((uid, i) => ({ uid, i })).filter(({ uid }) => !uid || !teamOf(pk, uid));
  return (
    <>
      <View style={st.arena}>
        <Pressable onPress={() => setOpen(true)} accessibilityLabel="Takım PK ayrıntıları" style={{ gap: 6 }}>
          <ScoreBar pk={pk} now={now} left="⚔️ Takım PK" right="Ayrıntılar ›" />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {pk.teams.map((t) => {
            const onMic = t.members.filter((m) => seats.includes(m));
            const away = t.members.filter((m) => !seats.includes(m));
            return (
              <View key={t.id} style={[st.half, { backgroundColor: `${t.color}22`, borderColor: `${t.color}88` }]} accessibilityLabel={`${t.name}: ${fmt(t.score)} puan, ${t.members.length} kişi`}>
                <View style={st.halfHead}>
                  <Text style={[st.halfName, { color: t.color }]} numberOfLines={1}>
                    {t.id === 'red' ? '🔴' : '🔵'} {t.name}
                  </Text>
                  <Text style={st.halfScore}>{fmt(t.score)}</Text>
                </View>
                <View style={st.halfSeats}>{onMic.map((m) => <View key={m}>{renderSeat(seats.indexOf(m), { width: slotW, size })}</View>)}</View>
                {onMic.length === 0 && <Text style={[st.dim, { textAlign: 'center' }]}>Bu takımdan mikrofonda kimse yok</Text>}
                {away.length > 0 && (
                  <View style={st.awayRow}>
                    {away.map((m) => (
                      <View key={m} style={st.away} accessibilityLabel={`${nameOf(m)} mikrofonda değil, ${fmt(pk.points[m] ?? 0)} puan`}>
                        <Image source={{ uri: userById(m).avatar }} style={[st.mini, { opacity: 0.45 }]} />
                        <Text style={st.awayText} numberOfLines={1}>
                          {fmt(pk.points[m] ?? 0)}
                        </Text>
                      </View>
                    ))}
                    <Text style={st.awayText}>mikrofonda değil</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
      {others.length > 0 && (
        <View style={st.others}>
          <Text style={st.othersTitle}>PK dışındaki mikrofonlar · {others.filter((o) => o.uid).length}/{others.length}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.othersRow}>
            {others.map(({ i }) => (
              <View key={i}>{renderSeat(i, { width: 56, size: 34 })}</View>
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
        <Image key={uid} source={{ uri: userById(uid).avatar }} style={st.mini} />
      ))}
    </View>
  );
}

function OpponentRow({ roomId }: { roomId: string }) {
  const r = roomById(roomId);
  return (
    <View style={st.member}>
      {r && <Image source={{ uri: r.cover }} style={[st.av, { borderRadius: 10 }]} />}
      <Text style={st.memberName}>Rakip: {roomTitle(roomId)}</Text>
    </View>
  );
}

/** Detail card: full ranking (Normal) or teams with members and supporters; managers can cancel. */
export function PkDetail({ pk, open, onClose, viewerRoomId, canManage }: { pk: PkSession; open: boolean; onClose: () => void; viewerRoomId: string; canManage: boolean }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.center} onPress={onClose}>
        <Pressable style={[st.card, { maxHeight: '80%' }]} onPress={() => {}}>
          <View style={st.head}>
            <Text style={st.title}>
              {modeLabel(pk)} · {STATUS_LABEL[pk.status]}
            </Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Kapat">
              <Ionicons name="close" size={22} color={colors.textDim} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {pk.kind === 'cross' && pk.opponentRoomId && <OpponentRow roomId={pk.teams.find((t) => t.roomId !== viewerRoomId)!.roomId} />}
            {pk.mode === 'solo'
              ? liveRanking(pk).map((r, i) => {
                  const fan = topSupporters(pk, { recipientId: r.userId }, 1)[0];
                  return (
                    <View key={r.userId} style={st.member}>
                      <Text style={st.rank}>{i + 1}</Text>
                      <Image source={{ uri: userById(r.userId).avatar }} style={st.av} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={st.memberName} numberOfLines={1}>
                          {nameOf(r.userId)}
                        </Text>
                        {fan && (
                          <Text style={st.dim} numberOfLines={1}>
                            En çok destek: {nameOf(fan[0])} · {fmt(fan[1])}
                          </Text>
                        )}
                      </View>
                      <Text style={st.pts}>{fmt(r.points)}</Text>
                    </View>
                  );
                })
              : pk.teams.map((t) => (
                  <View key={t.id} style={{ gap: 4 }}>
                    <Text style={[st.label, { color: t.color }]}>
                      {teamLabel(pk, t, viewerRoomId)} · {fmt(t.score)} puan
                    </Text>
                    {pk.kind === 'room' &&
                      t.members.map((m) => (
                        <Text key={m} style={st.dim}>
                          {nameOf(m)} · {fmt(pk.points[m] ?? 0)} puan
                        </Text>
                      ))}
                    {topSupporters(pk, { teamId: t.id }, 5).map(([uid, pts], i) => (
                      <Text key={uid} style={st.dim}>
                        Destekçi {i + 1}. {nameOf(uid)} · {fmt(pts)}
                      </Text>
                    ))}
                  </View>
                ))}
            <Text style={st.dim}>Puanlar sunucuda doğrulanan hediyelerden gelir; hediye bedeli, jeton bakiyesi ve yayıncı kazancı PK puanından ayrıdır. PK başlamadan önceki ve bittikten sonraki hediyeler sayılmaz.</Text>
          </ScrollView>
          {canManage && ['invite', 'prep', 'active'].includes(pk.status) && (
            <Pressable
              style={st.danger}
              onPress={() => {
                cancelPk(pk.id, 'Oda yönetimi PK’yı iptal etti');
                onClose();
              }}
              accessibilityLabel="PK'yı iptal et"
            >
              <Text style={st.dangerText}>PK’yı iptal et</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.55)' },
  sheet: { maxHeight: '86%', backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12, borderTopWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 18, flexShrink: 1 },
  seg: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: 999, padding: 4 },
  segBtn: { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  segOn: { backgroundColor: semantic.action },
  segText: { color: colors.text, fontWeight: '800' },
  label: { color: colors.text, fontWeight: '800', fontSize: 14 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  modeCard: { flex: 1, minWidth: 0, borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.cardAlt, padding: 12, gap: 4, alignItems: 'center' },
  modeOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.12)' },
  modeTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  modeSub: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 16 },
  notice: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: 12, padding: 10 },
  noticeWarn: { backgroundColor: 'rgba(246,189,96,0.14)' },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  person: { alignItems: 'center', gap: 3, width: 58 },
  personName: { color: colors.text, fontSize: 12, maxWidth: 58 },
  preview: { flexDirection: 'row', gap: 8 },
  previewCol: { flex: 1, minWidth: 0, borderWidth: 1.5, borderRadius: 14, padding: 10, gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  previewHead: { width: '100%', fontWeight: '900', fontSize: 13 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  av: { width: 36, height: 36, borderRadius: 18 },
  memberName: { color: colors.text, fontWeight: '700', flex: 1 },
  rank: { color: colors.textDim, fontWeight: '900', width: 20, textAlign: 'center' },
  pts: { color: colors.gold, fontWeight: '900', fontVariant: ['tabular-nums'] },
  teamBtn: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 7 },
  teamBtnText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  primary: { backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: semantic.actionInk, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  secondary: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '800' },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  invite: { backgroundColor: semantic.socialFill, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  inviteText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  board: { marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(8,15,30,0.78)', borderRadius: 14, padding: 8, gap: 6, borderWidth: 1, borderColor: colors.border },
  boardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamName: { flex: 1, fontWeight: '900', fontSize: 13 },
  timer: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  timerText: { color: colors.gold, fontWeight: '900', fontSize: 12, fontVariant: ['tabular-nums'] },
  track: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden' },
  score: { color: '#fff', fontWeight: '900', fontSize: 12, fontVariant: ['tabular-nums'] },
  boardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  soloRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  soloChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.cardAlt, borderRadius: 999, paddingRight: 8, paddingLeft: 4, paddingVertical: 2, maxWidth: '32%' },
  soloRank: { fontSize: 12 },
  soloName: { color: colors.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  soloPts: { color: colors.gold, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  mini: { width: 20, height: 20, borderRadius: 10, marginRight: -4, borderWidth: 1, borderColor: colors.bg },
  arena: { marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(8,15,30,0.78)', borderRadius: 16, padding: 8, gap: 8, borderWidth: 1, borderColor: colors.border },
  half: { flex: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 4, gap: 6 },
  halfHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, gap: 4 },
  halfName: { fontWeight: '900', fontSize: 12, flexShrink: 1 },
  halfScore: { color: '#fff', fontWeight: '900', fontSize: 14, fontVariant: ['tabular-nums'] },
  halfSeats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 6 },
  awayRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  away: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  awayText: { color: colors.textDim, fontSize: 12 },
  others: { marginHorizontal: 12, marginTop: 6, gap: 4 },
  othersTitle: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  othersRow: { flexDirection: 'row' },
  center: { flex: 1, backgroundColor: 'rgba(8,15,30,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: 22, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: 'rgba(217,58,69,0.18)', borderRadius: 999, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.red },
  dangerText: { color: '#FF7A82', fontWeight: '900' },
});
