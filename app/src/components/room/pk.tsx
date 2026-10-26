// PK Battle UI: setup sheet (room PK / cross-room PK), live board over the room, and the result card.
// Everything here renders server state from lib/pk; nothing changes seats, microphones or membership.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { roomById, userById, type User } from '@/data/mock';
import {
  PK_DURATIONS,
  cancelPk,
  inviteCrossPk,
  invitableRooms,
  roomTitle,
  setInviteScenario,
  startRoomPk,
  topSupporters,
  usePk,
  type InviteScenario,
  type PkDuration,
  type PkSession,
  type TeamId,
} from '@/lib/pk';
import { showAlert } from '@/lib/alert';
import { colors, semantic } from '@/theme';

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};
/** Display-only clock; the end time itself comes from the server. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
const STATUS_LABEL: Record<PkSession['status'], string> = { invite: 'Davet bekleniyor', prep: 'Hazırlanıyor', active: 'Aktif', done: 'Tamamlandı', cancelled: 'İptal edildi' };

// --- Setup ---------------------------------------------------------------------------------------
export function PkSetupSheet({ visible, roomId, starterId, participants, onClose }: { visible: boolean; roomId: string; starterId: string; participants: User[]; onClose: () => void }) {
  const { config, scenario } = usePk();
  const [tab, setTab] = useState<'room' | 'cross'>('room');
  const enabled = PK_DURATIONS.filter((d) => config.durations[d]);
  const [duration, setDuration] = useState<PkDuration>(enabled[0] ?? 15);
  const [method, setMethod] = useState<'balanced' | 'manual'>('balanced');
  const [assign, setAssign] = useState<Record<string, TeamId | undefined>>({});
  const [query, setQuery] = useState('');

  const balanced = () => {
    const red: string[] = [];
    const blue: string[] = [];
    participants.slice(0, config.teamMax * 2).forEach((u, i) => (i % 2 ? blue : red).push(u.id));
    return { red, blue };
  };
  const teams = method === 'balanced' ? balanced() : { red: participants.filter((u) => assign[u.id] === 'red').map((u) => u.id), blue: participants.filter((u) => assign[u.id] === 'blue').map((u) => u.id) };
  const startRoom = () => {
    const r = startRoomPk(roomId, starterId, duration, teams.red, teams.blue);
    if (!r.ok) return showAlert('PK başlatılamadı', r.reason);
    onClose();
  };
  const invite = (opp: string) => {
    const r = inviteCrossPk(roomId, starterId, opp, duration);
    if (!r.ok) return showAlert('Davet gönderilemedi', r.reason);
    onClose();
  };
  const rooms = invitableRooms(roomId).filter((r) => !query.trim() || r.id.includes(query.trim()) || r.title.toLocaleLowerCase('tr-TR').includes(query.trim().toLocaleLowerCase('tr-TR')));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={st.sheet}>
        <View style={st.head}>
          <Text style={st.title}>Takım PK</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="PK panelini kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <View style={st.seg}>
          {(
            [
              ['room', 'Oda içi', config.roomPkEnabled],
              ['cross', 'Odalar arası', config.crossPkEnabled],
            ] as const
          ).map(([k, l, on]) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[st.segBtn, tab === k && st.segOn, !on && { opacity: 0.4 }]} accessibilityLabel={`${l} PK`}>
              <Text style={[st.segText, tab === k && { color: semantic.actionInk }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
          <Text style={st.label}>Süre · başladıktan sonra değişmez</Text>
          <View style={st.chips}>
            {PK_DURATIONS.map((d) => (
              <Pressable key={d} disabled={!config.durations[d]} onPress={() => setDuration(d)} style={[st.chip, duration === d && st.chipOn, !config.durations[d] && { opacity: 0.35 }]} accessibilityLabel={`${d} dakika`}>
                <Text style={st.chipText}>{d} dk</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'room' ? (
            <>
              <Text style={st.label}>Takımlar · {config.teamNames.red} vs {config.teamNames.blue}</Text>
              <View style={st.chips}>
                {(
                  [
                    ['balanced', 'Dengeli dağıt'],
                    ['manual', 'Ben seçeceğim'],
                  ] as const
                ).map(([k, l]) => (
                  <Pressable key={k} onPress={() => setMethod(k)} style={[st.chip, method === k && st.chipOn]}>
                    <Text style={st.chipText}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              {participants.map((u) => {
                const team: TeamId | undefined = method === 'balanced' ? (teams.red.includes(u.id) ? 'red' : teams.blue.includes(u.id) ? 'blue' : undefined) : assign[u.id];
                return (
                  <View key={u.id} style={st.member}>
                    <Image source={{ uri: u.avatar }} style={st.av} />
                    <Text style={st.memberName} numberOfLines={1}>
                      {u.id === 'me' ? 'Sen' : u.name}
                    </Text>
                    {(['red', 'blue'] as TeamId[]).map((t) => (
                      <Pressable
                        key={t}
                        disabled={method === 'balanced'}
                        onPress={() => setAssign((a) => ({ ...a, [u.id]: a[u.id] === t ? undefined : t }))}
                        style={[st.teamBtn, team === t && { backgroundColor: config.teamColors[t], borderColor: config.teamColors[t] }]}
                        accessibilityLabel={`${u.name} ${config.teamNames[t]}`}
                      >
                        <Text style={st.teamBtnText}>{t === 'red' ? 'Kırmızı' : 'Mavi'}</Text>
                      </Pressable>
                    ))}
                  </View>
                );
              })}
              <Text style={st.dim}>
                {teams.red.length} – {teams.blue.length} · takım başına {config.teamMin}–{config.teamMax} kişi · PK başladıktan sonra takım değiştirilemez · hediyeyi alan kişinin takımı puan kazanır
              </Text>
              <Pressable style={[st.primary, !config.roomPkEnabled && { opacity: 0.4 }]} disabled={!config.roomPkEnabled} onPress={startRoom} accessibilityLabel="Oda içi PK başlat">
                <Text style={st.primaryText}>PK’yı başlat · {duration} dk</Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput value={query} onChangeText={setQuery} placeholder="Oda ID’si veya adı ara" placeholderTextColor={colors.textDim} style={st.input} />
              {rooms.map((r) => (
                <View key={r.id} style={st.member}>
                  <Image source={{ uri: r.cover }} style={[st.av, { borderRadius: 10 }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={st.memberName} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={st.dim}>
                      ID {r.id} · {r.listeners} kişi · Lv.{r.level ?? 1}
                    </Text>
                  </View>
                  <Pressable style={st.invite} disabled={!config.crossPkEnabled} onPress={() => invite(r.id)} accessibilityLabel={`${r.title} odasını PK’ya davet et`}>
                    <Text style={st.inviteText}>Davet et</Text>
                  </Pressable>
                </View>
              ))}
              <Text style={st.dim}>Rakip oda {config.inviteTimeoutSec} sn içinde kabul etmezse PK başlamaz. Bir oda aynı anda tek PK’ya katılabilir.</Text>
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

// --- Live board ---------------------------------------------------------------------------------
export function PkBoard({ pk, viewerRoomId, canManage, onCancelled }: { pk: PkSession; viewerRoomId: string; canManage: boolean; onCancelled?: () => void }) {
  const now = useNow(pk.status !== 'done' && pk.status !== 'cancelled');
  const [open, setOpen] = useState(false);
  const [red, blue] = pk.teams;
  const total = red.score + blue.score;
  const ratio = total === 0 ? 0.5 : red.score / total;
  const left = pk.status === 'invite' ? (pk.inviteExpiresAt ?? now) - now : pk.status === 'prep' ? (pk.startAt ?? now) - now : (pk.endAt ?? now) - now;
  const label = (t: typeof red) => (pk.kind === 'cross' ? (t.roomId === viewerRoomId ? `${roomTitle(t.roomId)} (biz)` : roomTitle(t.roomId)) : t.name);

  return (
    <>
      <Pressable style={st.board} onPress={() => setOpen(true)} accessibilityLabel="PK ayrıntıları">
        <View style={st.boardTop}>
          <Text style={[st.teamName, { color: red.color }]} numberOfLines={1}>
            {label(red)}
          </Text>
          <View style={st.timer}>
            <Text style={st.timerText}>
              {pk.status === 'active' ? `⚔️ ${mmss(left)}` : pk.status === 'invite' ? `📨 ${mmss(left)}` : pk.status === 'prep' ? `⏳ ${mmss(left)}` : STATUS_LABEL[pk.status]}
            </Text>
          </View>
          <Text style={[st.teamName, { color: blue.color, textAlign: 'right' }]} numberOfLines={1}>
            {label(blue)}
          </Text>
        </View>
        <View style={st.track}>
          <View style={{ flex: Math.max(ratio, 0.04), backgroundColor: red.color, justifyContent: 'center', paddingLeft: 8 }}>
            <Text style={st.score}>{red.score.toLocaleString('tr-TR')}</Text>
          </View>
          <View style={{ flex: Math.max(1 - ratio, 0.04), backgroundColor: blue.color, justifyContent: 'center', alignItems: 'flex-end', paddingRight: 8 }}>
            <Text style={st.score}>{blue.score.toLocaleString('tr-TR')}</Text>
          </View>
        </View>
        <View style={st.boardBottom}>
          <Supporters pk={pk} team="red" />
          <Text style={st.dim}>
            {STATUS_LABEL[pk.status]} · {pk.durationMin} dk {pk.kind === 'cross' ? '· odalar arası' : '· oda içi'}
          </Text>
          <Supporters pk={pk} team="blue" />
        </View>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.center} onPress={() => setOpen(false)}>
          <Pressable style={st.card} onPress={() => {}}>
            <Text style={st.title}>PK · {STATUS_LABEL[pk.status]}</Text>
            {pk.kind === 'cross' && pk.opponentRoomId && <OpponentRow roomId={pk.teams.find((t) => t.roomId !== viewerRoomId)!.roomId} />}
            {pk.teams.map((t) => (
              <View key={t.id} style={{ gap: 4 }}>
                <Text style={[st.label, { color: t.color }]}>
                  {label(t)} · {t.score.toLocaleString('tr-TR')} puan
                </Text>
                {pk.kind === 'room' && <Text style={st.dim}>Takım: {t.members.map((m) => (m === 'me' ? 'Sen' : userById(m).name)).join(', ')}</Text>}
                {topSupporters(pk, t.id, 5).map(([uid, pts], i) => (
                  <Text key={uid} style={st.dim}>
                    {i + 1}. {uid === 'me' ? 'Sen' : userById(uid).name} · {pts.toLocaleString('tr-TR')}
                  </Text>
                ))}
              </View>
            ))}
            <Text style={st.dim}>Puanlar sunucuda doğrulanan hediyelerden gelir; hediye bedeli ile PK puanı ayrı değerlerdir. PK başlamadan önceki hediyeler sayılmaz.</Text>
            {canManage && ['invite', 'prep', 'active'].includes(pk.status) && (
              <Pressable
                style={st.danger}
                onPress={() => {
                  cancelPk(pk.id, 'Oda yönetimi PK’yı iptal etti');
                  setOpen(false);
                  onCancelled?.();
                }}
                accessibilityLabel="PK'yı iptal et"
              >
                <Text style={st.dangerText}>PK’yı iptal et</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function Supporters({ pk, team }: { pk: PkSession; team: TeamId }) {
  const top = topSupporters(pk, team, 3);
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

// --- Result ---------------------------------------------------------------------------------------
export function PkResult({ pk, viewerRoomId, onClose, onNew }: { pk: PkSession; viewerRoomId: string; onClose: () => void; onNew?: () => void }) {
  const r = pk.result;
  const name = (id: TeamId) => {
    const t = pk.teams.find((x) => x.id === id)!;
    return pk.kind === 'cross' ? roomTitle(t.roomId) : t.name;
  };
  const ours = pk.kind === 'cross' ? pk.teams.find((t) => t.roomId === viewerRoomId)?.id : undefined;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={st.center}>
        <View style={st.card}>
          {pk.status === 'cancelled' ? (
            <>
              <Text style={st.big}>PK iptal edildi</Text>
              <Text style={st.dim}>{pk.cancelReason}</Text>
              <Text style={st.dim}>Kazanan açıklanmaz; PK puanları geçersizdir. Gönderilen hediyeler alıcılarına ulaştığı için iade edilmez.</Text>
            </>
          ) : r ? (
            <>
              <Text style={st.big}>{r.winner === 'tie' ? 'Berabere!' : `🏆 ${name(r.winner)} kazandı${ours ? (r.winner === ours ? ' · tebrikler!' : '') : ''}`}</Text>
              <View style={st.resultRow}>
                <Text style={[st.resultScore, { color: pk.teams[0].color }]}>{r.red.toLocaleString('tr-TR')}</Text>
                <Text style={st.dim}>fark {r.diff.toLocaleString('tr-TR')}</Text>
                <Text style={[st.resultScore, { color: pk.teams[1].color }]}>{r.blue.toLocaleString('tr-TR')}</Text>
              </View>
              <Text style={st.dim}>
                {name('red')} vs {name('blue')} · {pk.durationMin} dk · {r.validGifts} geçerli hediye işlemi
              </Text>
              {pk.teams.map((t) => (
                <Text key={t.id} style={st.dim}>
                  {name(t.id)} destekçileri: {topSupporters(pk, t.id, 3).map(([u, p]) => `${u === 'me' ? 'Sen' : userById(u).name} (${p})`).join(', ') || '—'}
                </Text>
              ))}
              <Text style={st.dim}>Kaybeden takımdan ayrıca jeton kesilmez.</Text>
            </>
          ) : (
            <Text style={st.dim}>Sonuç sunucudan bekleniyor…</Text>
          )}
          {onNew && (
            <Pressable style={st.primary} onPress={onNew} accessibilityLabel="Yeni PK">
              <Text style={st.primaryText}>Yeni PK</Text>
            </Pressable>
          )}
          <Pressable style={st.secondary} onPress={onClose} accessibilityLabel="Odaya dön">
            <Text style={st.secondaryText}>Odaya dön</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.55)' },
  sheet: { maxHeight: '82%', backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12, borderTopWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.text, fontWeight: '900', fontSize: 18 },
  seg: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: 999, padding: 4 },
  segBtn: { flex: 1, borderRadius: 999, paddingVertical: 9, alignItems: 'center' },
  segOn: { backgroundColor: semantic.action },
  segText: { color: colors.text, fontWeight: '800' },
  label: { color: colors.text, fontWeight: '800', fontSize: 14 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.15)' },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  member: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  av: { width: 36, height: 36, borderRadius: 18 },
  memberName: { color: colors.text, fontWeight: '700', flex: 1 },
  teamBtn: { borderRadius: 999, borderWidth: 1.5, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 5 },
  teamBtnText: { color: colors.text, fontWeight: '800', fontSize: 12 },
  primary: { backgroundColor: semantic.action, borderRadius: 999, paddingVertical: 13, alignItems: 'center' },
  primaryText: { color: semantic.actionInk, fontWeight: '900' },
  secondary: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: colors.text, fontWeight: '800' },
  input: { backgroundColor: colors.cardAlt, color: colors.text, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  invite: { backgroundColor: semantic.socialFill, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  inviteText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  board: { marginHorizontal: 12, marginTop: 6, backgroundColor: 'rgba(8,15,30,0.75)', borderRadius: 14, padding: 8, gap: 6, borderWidth: 1, borderColor: colors.border },
  boardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamName: { flex: 1, fontWeight: '900', fontSize: 13 },
  timer: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  timerText: { color: colors.gold, fontWeight: '900', fontSize: 12 },
  track: { flexDirection: 'row', height: 22, borderRadius: 11, overflow: 'hidden' },
  score: { color: '#fff', fontWeight: '900', fontSize: 12 },
  boardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mini: { width: 20, height: 20, borderRadius: 10, marginRight: -4, borderWidth: 1, borderColor: colors.bg },
  center: { flex: 1, backgroundColor: 'rgba(8,15,30,0.8)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 400, backgroundColor: colors.card, borderRadius: 22, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.border },
  big: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  resultScore: { fontSize: 30, fontWeight: '900' },
  danger: { backgroundColor: 'rgba(217,58,69,0.18)', borderRadius: 999, paddingVertical: 11, alignItems: 'center', borderWidth: 1, borderColor: colors.red },
  dangerText: { color: '#FF7A82', fontWeight: '900' },
});
