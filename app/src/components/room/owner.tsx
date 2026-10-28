// Room info card ("oda kartı"), full-screen "Oda Ayarları" and the boss seat.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GiftArt } from '@/components/GiftArt';
import { ArtText, ROOM_ICON_ART, ROOM_THEME_ART, ROOM_TYPE_ART, roomLevelArt } from '@/components/RoomArt';
import type { ModLog } from '@/components/room/community';
import { Avatar } from '@/components/ui';
import {
  BOSS_SEAT_MIN_COINS,
  BOSS_SEAT_MIN_LEVEL,
  LOCK_MIN_LEVEL,
  MIC_COUNT_OPTIONS,
  MIC_PERMISSION_MIN_LEVEL,
  ROOM_BACKGROUNDS,
  ROOM_LEVEL_REWARDS,
  ROOM_LIMITS,
  ROOM_THEMES,
  ROOM_TYPES,
  ROOM_XP_THRESHOLDS,
  adminCapacity,
  memberLimit,
  roomCode,
  roomThemeInfo,
  type RoomTheme,
} from '@/data/catalog';
import { userById } from '@/data/mock';
import { RULES, pct } from '@/data/rules';
import { showAlert } from '@/lib/alert';
import type { MyRoom } from '@/store';
import { colors, gradient, semantic } from '@/theme';

export type GiftLogRow = { id: string; from: string; to: string; emoji: string; name: string; count: number; coins: number; time: string; giftId?: string };
type Opt<T> = { value: T; label: string; sub?: string; disabled?: boolean; art?: number };

const fmtMinutes = (m: number) => (m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa ${m % 60} dk`);
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}m` : n >= 10_000 ? `${(n / 1_000).toFixed(1)}k` : n.toLocaleString('tr-TR'));
/** Mock "last entered the room" in days, for auto-removal previews. */
export const lastSeenDays = (id: string) => (Number(id.replace(/\D/g, '') || 0) * 5) % 40;

// --- Generic sheets -------------------------------------------------------------
function BottomSheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[styles.sheetTitle, { flex: 1 }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function ChoiceSheet<T extends string | number>({
  visible,
  title,
  desc,
  options,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  title?: string;
  desc?: string;
  options: Opt<T>[];
  value: T;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingHorizontal: 0 }]}>
        {title && <Text style={[styles.sheetTitle, { textAlign: 'center', paddingHorizontal: 16 }]}>{title}</Text>}
        {desc && <Text style={[styles.dim, { textAlign: 'center', paddingHorizontal: 20, marginBottom: 8 }]}>{desc}</Text>}
        <ScrollView>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <Pressable
                key={String(o.value)}
                accessibilityLabel={o.label}
                onPress={() => {
                  if (o.disabled) return showAlert('Kilitli', o.sub ?? 'Bu seçenek henüz açılmadı.');
                  onPick(o.value);
                  onClose();
                }}
                style={[styles.choice, on && { backgroundColor: 'rgba(52,211,153,0.12)' }, o.disabled && { opacity: 0.45 }]}>
                {o.art && <Image source={o.art} style={styles.choiceArt} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: o.sub || o.art ? 'left' : 'center' }}>{o.label}</Text>
                  {o.sub && <Text style={styles.dim}>{o.sub}</Text>}
                </View>
                {on && <Ionicons name="checkmark" size={24} color={colors.green} />}
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={{ color: '#fff', fontSize: 16 }}>İptal et</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function Row({
  label,
  hint,
  value,
  valueArt,
  onPress,
  toggle,
  locked,
}: {
  label: string;
  hint?: string;
  value?: string;
  valueArt?: number;
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (v: boolean) => void };
  locked?: string;
}) {
  const press = () => (locked ? showAlert('Kilitli', locked) : onPress?.());
  return (
    <Pressable style={styles.row} onPress={toggle ? undefined : press} accessibilityLabel={label}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      {toggle ? (
        <Switch
          value={toggle.value}
          onValueChange={(v) => (locked ? showAlert('Kilitli', locked) : toggle.onChange(v))}
          trackColor={{ true: colors.green, false: '#555' }}
          accessibilityLabel={`${label} anahtarı`}
        />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '48%' }}>
          {valueArt && <Image source={valueArt} style={{ width: 24, height: 24 }} />}
          {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
          <Ionicons name="chevron-forward" size={20} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

const Section = ({ title }: { title: string }) => <Text style={styles.section}>{title}</Text>;

export function LevelTable({ xp, level }: { xp: number; level: number }) {
  const next = ROOM_XP_THRESHOLDS[level];
  const prev = ROOM_XP_THRESHOLDS[level - 1];
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.track}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 8, width: next ? `${((xp - prev) / (next - prev)) * 100}%` : '100%' }} />
      </View>
      <Text style={styles.dim}>{next ? `${xp.toLocaleString('tr-TR')} / ${next.toLocaleString('tr-TR')} XP · sonraki ödül: ${ROOM_LEVEL_REWARDS[level]}` : `${xp} XP · maksimum seviye`}</Text>
      <Text style={styles.dim}>XP kaynakları: hediye, katılım, mikrofonda konuşma, etkinlik, sohbet. Spam ve sahte işlemler XP üretmez.</Text>
      <Text style={[styles.dim, { fontWeight: '800', marginTop: 4 }]}>Seviye · oda limiti · üye · yönetici</Text>
      {ROOM_LEVEL_REWARDS.map((r, i) => (
        <View key={r} style={[styles.levelRow, i + 1 === level && { borderColor: colors.primaryText }]}>
          <ArtText art={roomLevelArt(i + 1)} size={20} style={[styles.dim, i < level && { color: '#fff' }, { fontWeight: '800' }]}>
            {i < level ? '✅' : '🔒'} LV{i + 1} · {ROOM_LIMITS[i].rooms.toLocaleString('tr-TR')} · {ROOM_LIMITS[i].members.toLocaleString('tr-TR')} · {ROOM_LIMITS[i].admins}
          </ArtText>
          <Text style={[styles.dim, i < level && { color: '#fff' }]}>{r}</Text>
        </View>
      ))}
    </View>
  );
}

// --- Room info card -------------------------------------------------------------------
export function RoomInfoSheet({
  visible,
  onClose,
  roomId,
  title,
  cover,
  theme,
  level,
  xp,
  owner,
  clan,
  members,
  memberTotal,
  applications,
  canManageMembers,
  autoRemoveDays,
  membership,
  onJoin,
  onApprove,
  onReject,
  onRemoveMember,
  stats,
  giftLog,
  announcement,
  onSave,
  onSettings,
  onShare,
  onInvite,
}: {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  title: string;
  cover: string;
  theme: RoomTheme;
  level: number;
  xp: number | null;
  owner: boolean;
  clan: { label: string; href: '/aile' | '/ajans'; art?: number } | null;
  members: string[];
  memberTotal: number;
  applications: string[];
  canManageMembers: boolean;
  autoRemoveDays: number;
  membership: 'owner' | 'none' | 'pending' | 'member';
  onJoin: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRemoveMember: (id: string) => void;
  stats: { coins: number; peak: number; minutes: number };
  giftLog: GiftLogRow[];
  announcement: string;
  onSave: (p: Partial<Pick<MyRoom, 'title' | 'announcement' | 'cover'>>) => void;
  onSettings: () => void;
  onShare: () => void;
  onInvite: () => void;
}) {
  const [sub, setSub] = useState<null | 'level' | 'members' | 'traffic' | 'gifts' | 'decor' | 'title' | 'bulletin'>(null);
  const [draft, setDraft] = useState('');
  const th = roomThemeInfo(theme);
  const editText = (which: 'title' | 'bulletin') => {
    setDraft(which === 'title' ? title : announcement);
    setSub(which);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { maxHeight: '82%', paddingTop: 18 }]}>
        <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Pressable onPress={() => owner && setSub('decor')} accessibilityLabel="Kapak seç">
              <Image source={{ uri: cover }} style={styles.cover} />
              {owner && <Text style={styles.coverLabel}>Kapak Seç</Text>}
            </Pressable>
            <View style={{ flex: 1, gap: 6 }}>
              <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} onPress={() => owner && editText('title')} accessibilityLabel="Oda adını düzenle">
                <Text style={styles.bigTitle} numberOfLines={1}>
                  {title}
                </Text>
                {owner && <Ionicons name="create-outline" size={18} color={colors.textDim} />}
              </Pressable>
              <Text style={styles.dim}>
                🇹🇷 │ {th.emoji} {th.name} │ ID {roomCode(roomId)}
              </Text>
            </View>
            {owner && (
              <Pressable onPress={onSettings} hitSlop={8} accessibilityLabel="Oda ayarlarını aç">
                <Ionicons name="settings-outline" size={26} color="#fff" />
              </Pressable>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable style={{ flex: 1 }} onPress={() => setSub('level')} accessibilityLabel="Oda seviyesi">
              <LinearGradient colors={['#0E7490', '#155E75']} style={styles.card}>
                <Text style={styles.cardLabel}>Oda seviyesi</Text>
                <ArtText art={roomLevelArt(level)} size={26} style={styles.cardValue}>
                  Lv.{level}
                </ArtText>
              </LinearGradient>
            </Pressable>
            <Pressable style={{ flex: 1 }} onPress={() => (clan ? (onClose(), router.push(clan.href)) : owner && (onClose(), router.push('/aile')))} accessibilityLabel="Kabile">
              <LinearGradient colors={['#15803D', '#166534']} style={styles.card}>
                <Text style={styles.cardLabel}>Kabile</Text>
                {clan?.art ? (
                  <ArtText art={clan.art} size={26} style={styles.cardValue}>
                    {clan.label}
                  </ArtText>
                ) : (
                  <Text style={styles.cardValue} numberOfLines={1}>
                    {clan ? clan.label : owner ? '+ Aile kur / katıl' : 'Yok'}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>

          <Pressable onPress={() => setSub('members')} accessibilityLabel="Oda üyeleri">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.h2, { flex: 1 }]}>
                Oda üyesi ({memberTotal.toLocaleString('tr-TR')}/{memberLimit(level).toLocaleString('tr-TR')})
              </Text>
              {canManageMembers && applications.length > 0 && (
                <View style={styles.bell}>
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>🔔 {applications.length}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={20} color="#fff" />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {members.slice(0, 12).map((id) => (
                <View key={id} style={{ alignItems: 'center', width: 58 }}>
                  <Avatar uri={userById(id).avatar} size={52} />
                  <Text style={styles.tiny} numberOfLines={1}>
                    {id === 'me' ? '🏠 Sen' : userById(id).name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </Pressable>
          {membership === 'none' && (
            <Pressable style={styles.joinBtn} onPress={onJoin}>
              <ArtText art={ROOM_ICON_ART.join} size={24} style={{ color: '#fff', fontWeight: '800' }}>
                Oda üyesi ol
              </ArtText>
            </Pressable>
          )}
          {membership === 'pending' && <Text style={[styles.dim, { textAlign: 'center' }]}>⏳ Üyelik başvurun oda sahibi/yöneticilerin onayını bekliyor</Text>}
          {membership === 'member' && <Text style={[styles.dim, { textAlign: 'center', color: colors.green }]}>✓ Bu odanın üyesisin</Text>}

          {owner && (
            <View style={{ gap: 10 }}>
              <Text style={styles.h2}>Oda Sahibi Merkezi</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <LinearGradient colors={['#C2410C', '#9A3412']} style={[styles.card, { flex: 1, flexDirection: 'row', alignItems: 'center' }]}>
                  <Text style={[styles.cardLabel, { flex: 1 }]}>Oda Sahibi Payı</Text>
                  <Text style={[styles.cardValue, { fontSize: 22 }]}>{pct(RULES.roomOwnerBonus)}</Text>
                </LinearGradient>
                <Pressable style={{ flex: 1 }} onPress={() => setSub('traffic')} accessibilityLabel="Trafik paneli izleme">
                  <LinearGradient colors={['#0A8F95', '#076A70']} style={[styles.card, { flexDirection: 'row', alignItems: 'center' }]}>
                    <Text style={[styles.cardLabel, { flex: 1 }]}>Trafik paneli izleme</Text>
                    <Ionicons name="stats-chart" size={20} color="#fff" />
                  </LinearGradient>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Stat label="Hediye paraları (bu sefer)" value={compact(stats.coins)} />
                <Stat label="Çevrimiçi maksimum kişi (bu sefer)" value={stats.peak.toLocaleString('tr-TR')} />
                <Stat label="Süre (bu sefer)" value={fmtMinutes(stats.minutes)} />
              </View>
              <Text style={styles.dim}>
                Oda sahibi payı, odandaki uygun hediyelerden ayrıca hesaplanır; yayıncının kazancından kesilmez.
              </Text>
            </View>
          )}

          {owner && <Line label="Oda Süslemesi" onPress={() => setSub('decor')} right={<Image source={{ uri: cover }} style={{ width: 34, height: 44, borderRadius: 6 }} />} />}
          <Line label="Oda hediye kaydı" onPress={() => setSub('gifts')} />
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.h2, { flex: 1 }]}>Bülten</Text>
              {owner && (
                <Pressable onPress={() => editText('bulletin')} hitSlop={8} accessibilityLabel="Bülteni düzenle">
                  <Ionicons name="create-outline" size={20} color="#fff" />
                </Pressable>
              )}
            </View>
            <Text style={styles.dim}>{announcement || 'Henüz bülten yok.'}</Text>
          </View>
        </ScrollView>
        <View style={{ flexDirection: 'row', gap: 12, paddingTop: 10 }}>
          <Pressable style={[styles.bigBtn, { backgroundColor: '#fff' }]} onPress={onShare}>
            <Ionicons name="arrow-redo" size={18} color={colors.primaryText} />
            <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 16 }}>Paylaş</Text>
          </Pressable>
          <Pressable style={[styles.bigBtn, { backgroundColor: colors.primary }]} onPress={onInvite}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Davet et</Text>
          </Pressable>
        </View>
      </View>

      <BottomSheet visible={sub === 'level'} onClose={() => setSub(null)} title={`Oda seviyesi Lv.${level}`}>
        <LevelTable xp={xp ?? ROOM_XP_THRESHOLDS[level - 1]} level={level} />
      </BottomSheet>

      <BottomSheet visible={sub === 'members'} onClose={() => setSub(null)} title={`Oda üyeleri (${memberTotal.toLocaleString('tr-TR')})`}>
        {canManageMembers && applications.length > 0 && (
          <>
            <Text style={styles.h3}>Katılma başvuruları ({applications.length})</Text>
            {applications.map((id) => (
              <View key={id} style={styles.listRow}>
                <Avatar uri={userById(id).avatar} size={36} />
                <Text style={{ color: '#fff', flex: 1 }}>{userById(id).name}</Text>
                <Pressable style={[styles.pill, { backgroundColor: semantic.successFill }]} onPress={() => onApprove(id)}>
                  <Text style={styles.pillText}>Onayla</Text>
                </Pressable>
                <Pressable style={[styles.pill, { backgroundColor: colors.cardAlt }]} onPress={() => onReject(id)}>
                  <Text style={styles.pillText}>Reddet</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
        <Text style={styles.h3}>Üyeler</Text>
        {members.map((id) => {
          const days = lastSeenDays(id);
          const due = owner && autoRemoveDays > 0 && id !== 'me' && days >= autoRemoveDays;
          return (
            <View key={id} style={styles.listRow}>
              <Avatar uri={userById(id).avatar} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff' }}>{id === 'me' ? 'Sen (oda sahibi)' : userById(id).name}</Text>
                {owner && id !== 'me' && <Text style={[styles.dim, due && { color: colors.gold }]}>{due ? `${days} gündür girmedi · bu gece otomatik çıkarılacak` : `Son giriş: ${days === 0 ? 'bugün' : `${days} gün önce`}`}</Text>}
              </View>
              {canManageMembers && id !== 'me' && (
                <Pressable onPress={() => onRemoveMember(id)} hitSlop={6}>
                  <Text style={{ color: colors.red, fontWeight: '700' }}>Çıkar</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        {memberTotal > members.length && <Text style={styles.dim}>+{(memberTotal - members.length).toLocaleString('tr-TR')} üye daha</Text>}
      </BottomSheet>

      <BottomSheet visible={sub === 'traffic'} onClose={() => setSub(null)} title="Trafik paneli">
        <Traffic peak={stats.peak} minutes={stats.minutes} />
      </BottomSheet>

      <BottomSheet visible={sub === 'gifts'} onClose={() => setSub(null)} title="Oda hediye kaydı">
        {giftLog.length === 0 ? (
          <Text style={styles.dim}>Bu oturumda henüz hediye yok.</Text>
        ) : (
          giftLog.slice(0, 60).map((g) => (
            <View key={g.id} style={styles.listRow}>
              <GiftArt giftId={g.giftId} emoji={g.emoji} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff' }}>
                  {userById(g.from).name} → {userById(g.to).name}
                </Text>
                <Text style={styles.dim}>
                  {g.name} x{g.count} · {g.time}
                </Text>
              </View>
              <Text style={{ color: colors.gold, fontWeight: '700' }}>🪙 {g.coins.toLocaleString('tr-TR')}</Text>
            </View>
          ))
        )}
      </BottomSheet>

      <BottomSheet visible={sub === 'decor'} onClose={() => setSub(null)} title="Oda süslemesi">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {ROOM_BACKGROUNDS.map((b) => {
            const open = level >= b.minLevel;
            const uri = `https://picsum.photos/seed/${b.seed}/600/400`;
            return (
              <Pressable key={b.id} disabled={!open} onPress={() => onSave({ cover: uri })} style={[styles.decor, cover === uri && { borderColor: colors.primaryText }, !open && { opacity: 0.4 }]}>
                <Image source={{ uri }} style={{ width: '100%', height: 70, borderRadius: 8 }} />
                <Text style={styles.tiny}>
                  {open ? '' : '🔒 '}
                  {b.name}
                  {open ? '' : ` Lv.${b.minLevel}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      <BottomSheet visible={sub === 'title' || sub === 'bulletin'} onClose={() => setSub(null)} title={sub === 'title' ? 'Oda adı' : 'Bülten'}>
        <TextInput value={draft} onChangeText={setDraft} style={[styles.input, sub === 'bulletin' && { minHeight: 70 }]} multiline={sub === 'bulletin'} maxLength={sub === 'title' ? 30 : 120} />
        <Pressable
          style={[styles.bigBtn, { backgroundColor: colors.primary, flex: 0 }]}
          onPress={() => {
            if (sub === 'title' && draft.trim().length < 3) return showAlert('Oda adı en az 3 karakter olmalı');
            onSave(sub === 'title' ? { title: draft.trim() } : { announcement: draft.trim() });
            setSub(null);
          }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Kaydet</Text>
        </Pressable>
      </BottomSheet>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Line({ label, onPress, right }: { label: string; onPress: () => void; right?: React.ReactNode }) {
  return (
    <Pressable style={styles.line} onPress={onPress} accessibilityLabel={label}>
      <Text style={[styles.h2, { flex: 1 }]}>{label}</Text>
      {right}
      <Ionicons name="chevron-forward" size={20} color="#fff" />
    </Pressable>
  );
}

const SOURCES = [
  ['Ana sayfa önerisi', 0.38],
  ['Takip edilenler', 0.24],
  ['Keşfet / arama', 0.17],
  ['Davet ve paylaşım', 0.13],
  ['Diğer', 0.08],
] as const;
const HOURS = [12, 18, 9, 6, 14, 22, 31, 40, 36, 28];

function Traffic({ peak, minutes }: { peak: number; minutes: number }) {
  const visits = Math.max(peak, 1) * 3 + minutes * 4;
  const max = Math.max(...HOURS);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat label="Ziyaret (bu sefer)" value={visits.toLocaleString('tr-TR')} />
        <Stat label="Ort. kalış" value="8 dk" />
        <Stat label="Yeni üye" value={String(Math.ceil(peak / 20))} />
      </View>
      <Text style={styles.h3}>Giriş kaynakları</Text>
      {SOURCES.map(([name, share]) => (
        <View key={name} style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={[styles.dim, { flex: 1, color: '#fff' }]}>{name}</Text>
            <Text style={styles.dim}>%{Math.round(share * 100)}</Text>
          </View>
          <View style={styles.track}>
            <View style={{ height: 8, width: `${share * 100}%`, backgroundColor: colors.primary }} />
          </View>
        </View>
      ))}
      <Text style={styles.h3}>Saatlik dinleyici (son 10 saat)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 90 }}>
        {HOURS.map((h, i) => (
          <View key={`h${i}`} style={{ flex: 1, height: `${(h / max) * 100}%`, backgroundColor: i === HOURS.length - 1 ? colors.primaryText : colors.primary, borderRadius: 4 }} />
        ))}
      </View>
      <Text style={styles.dim}>Trafik verileri yalnızca oda sahibine görünür; kişisel veri içermez (toplu istatistik).</Text>
    </View>
  );
}

// --- Full-screen "Oda Ayarları" ---------------------------------------------------------
type Picker =
  | null
  | 'type'
  | 'theme'
  | 'mics'
  | 'micMode'
  | 'micPerm'
  | 'join'
  | 'manageMembers'
  | 'manageFunctions'
  | 'autoRemove'
  | 'limit'
  | 'blacklist'
  | 'admins'
  | 'log'
  | 'level';

export function RoomSettingsScreen({
  visible,
  onClose,
  room,
  update,
  level,
  vipLevel,
  maxMics,
  modLog,
  bans,
  botOn,
  setBot,
}: {
  visible: boolean;
  onClose: () => void;
  room: MyRoom;
  update: (p: Partial<MyRoom>) => void;
  level: number;
  vipLevel: number;
  maxMics: number;
  modLog: ModLog[];
  bans: { userId: string; until: string }[];
  botOn: boolean;
  setBot: (v: boolean) => void;
}) {
  const [picker, setPicker] = useState<Picker>(null);
  const close = () => setPicker(null);
  const lockOpen = level >= LOCK_MIN_LEVEL || vipLevel >= 1;
  const micPermOpen = level >= MIC_PERMISSION_MIN_LEVEL;
  const bossOpen = level >= BOSS_SEAT_MIN_LEVEL;
  const typeInfo = ROOM_TYPES.find((t) => t.id === room.roomType)!;
  const blacklist = [...new Set([...room.blacklist, ...bans.map((b) => b.userId)])];
  const who = { owner: 'Sadece oda sahibi', admins: 'Oda sahibi ve yöneticiler' } as const;
  const joinLabel = { open: 'Başvuru gerekmiyor', apply: 'Katılma başvurusu', closed: 'Başvuruya izin verilmiyor' } as const;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1C1B22' }}>
        <View style={styles.topBar}>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Ayarlardan geri">
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>Oda Ayarları</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <Section title="Standart" />
          <Row label="Oda tipi" value={typeInfo.name} valueArt={ROOM_TYPE_ART[typeInfo.id]} onPress={() => setPicker('type')} />
          <Row label="Oda teması" value={roomThemeInfo(room.theme).name} valueArt={ROOM_THEME_ART[roomThemeInfo(room.theme).id]} onPress={() => setPicker('theme')} />
          <Row
            label="Oda kilitli"
            hint={`Oda seviyesi >=${LOCK_MIN_LEVEL} veya soyluluk açılarak kilit açılır`}
            toggle={{ value: room.locked, onChange: (v) => update({ locked: v }) }}
            locked={lockOpen ? undefined : `Oda kilidi Lv.${LOCK_MIN_LEVEL} odada veya VIP (soyluluk) ile açılır. Şu an Lv.${level}.`}
          />
          {room.locked && (
            <View style={[styles.row, { paddingTop: 0 }]}>
              <TextInput
                value={room.password}
                onChangeText={(t) => update({ password: t.replace(/\s/g, '') })}
                placeholder="Oda şifresi (4–8 karakter)"
                placeholderTextColor={colors.textDim}
                maxLength={8}
                style={[styles.input, { flex: 1 }]}
              />
            </View>
          )}
          <Row label="Oda Günlüğü" onPress={() => setPicker('log')} />
          <Row label={`Oda seviyesi`} value={`Lv.${level}`} valueArt={roomLevelArt(level)} onPress={() => setPicker('level')} />

          <Section title="Mikrofon pozisyonu" />
          <Row
            label="Yayına Katılma Modu"
            hint={room.video ? 'Video odası: koltuğa çıkanın kamerası açılır' : undefined}
            value={`${room.video ? 'Video' : 'Sesli'} · ${Math.min(room.micCount, maxMics)} mikrofon`}
            onPress={() => setPicker('mics')}
          />
          <Row label="Mikrofon kontrolü" value={room.micMode === 'free' ? 'Serbest' : room.micMode === 'request' ? 'Mikrofon için başvur' : 'Sadece takipçiler'} onPress={() => setPicker('micMode')} />
          <Row
            label="Mikrofon izni"
            hint={`Oda seviyesi >= ${MIC_PERMISSION_MIN_LEVEL} açılır`}
            value={room.micPermission === 'members' ? 'Oda üyeleri' : 'Herkes'}
            onPress={() => setPicker('micPerm')}
            locked={micPermOpen ? undefined : `Mikrofon izni Lv.${MIC_PERMISSION_MIN_LEVEL} odada açılır.`}
          />
          <Row
            label="Patron Koltuğu"
            hint={`Oda seviyesi >= ${BOSS_SEAT_MIN_LEVEL} açılır · oturumun en çok hediye gönderen kişisi oturur`}
            toggle={{ value: room.bossSeat && bossOpen, onChange: (v) => update({ bossSeat: v }) }}
            locked={bossOpen ? undefined : `Patron koltuğu Lv.${BOSS_SEAT_MIN_LEVEL} odada açılır.`}
          />

          <Section title="Oda üyeleri" />
          <Row label="Oda üyesi başvurusu" value={joinLabel[room.joinMode]} onPress={() => setPicker('join')} />
          <Row label="Oda üyelerini yönet" value={who[room.manageMembers]} onPress={() => setPicker('manageMembers')} />
          <Row
            label="Otomatik eleme"
            hint="Oda üyeleri standartlara uymadığında otomatik olarak odadan çıkarılır (yöneticiler hariç)"
            value={room.autoRemoveDays ? 'Etkinleştirildi' : 'Açılmadı'}
            onPress={() => setPicker('autoRemove')}
          />
          <Row label="Oda işlevlerini yönet" value={who[room.manageFunctions]} onPress={() => setPicker('manageFunctions')} />
          <Row label={`Oda yöneticileri`} value={`${room.adminIds.length}/${adminCapacity(level)}`} onPress={() => setPicker('admins')} />
          <Row label="Katılımcı limiti" value={`${room.limit.toLocaleString('tr-TR')} kişi`} onPress={() => setPicker('limit')} />

          <Section title="Gizlilik & Güvenlik" />
          <Row label="Oda kara listesi" value={String(blacklist.length)} onPress={() => setPicker('blacklist')} />
          <Row label="Profil Sayfasında Oda Görünürlüğü" hint="Etkinleştirildiğinde odanız profil sayfanızda görüntülenecektir" toggle={{ value: room.profileVisible, onChange: (v) => update({ profileVisible: v }) }} />
          <Row
            label="Video Odası Gizlilik Koruması"
            hint="Etkinleştirildiğinde video odası ekran görüntüsü alma veya kaydetmeye karşı korunur"
            toggle={{ value: room.videoPrivacy, onChange: (v) => update({ videoPrivacy: v }) }}
          />
          <Row label="🤖 Oda botu (karşılama ve kurallar)" toggle={{ value: botOn, onChange: setBot }} />
          <Text style={[styles.dim, { paddingHorizontal: 16, paddingTop: 12 }]}>Ayarlar anında uygulanır. Kilit, mikrofon izni ve patron koltuğu gibi haklar canlıda sunucu tarafında kontrol edilir.</Text>
        </ScrollView>
      </SafeAreaView>

      <ChoiceSheet
        visible={picker === 'type'}
        title="Oda tipi"
        options={ROOM_TYPES.map((t) => ({ value: t.id, label: t.name, sub: t.desc, art: ROOM_TYPE_ART[t.id] }))}
        value={room.roomType}
        onPick={(v) => update({ roomType: v, micMode: v === 'free' ? 'free' : 'request' })}
        onClose={close}
      />
      <ChoiceSheet visible={picker === 'theme'} title="Oda teması" options={ROOM_THEMES.map((t) => ({ value: t.id, label: t.name, art: ROOM_THEME_ART[t.id] }))} value={room.theme} onPick={(v) => update({ theme: v })} onClose={close} />
      <ChoiceSheet
        visible={picker === 'mics'}
        title="Yayına Katılma Modu"
        desc={`Sesli odada koltuktakiler yalnızca konuşur; video odasında koltuğa çıkanın kamerası açılır (koltuktan inince kapanır). En fazla ${maxMics} mikrofon (ajans odası 15, Lv.8'de +2); azaltınca fazla koltuktakiler dinleyiciye geçer.`}
        options={(['audio', 'video'] as const).flatMap((mode) =>
          MIC_COUNT_OPTIONS.map((n) => ({
            value: `${mode}:${n}`,
            label: `${mode === 'video' ? '📹 Video' : '🎙️ Sesli'} · ${n} mikrofon`,
            disabled: n > maxMics,
            sub: n > maxMics ? 'Oda seviyesi veya ajans odası gerekir' : undefined,
          })),
        )}
        value={`${room.video ? 'video' : 'audio'}:${Math.min(room.micCount, maxMics)}`}
        onPick={(v) => {
          const [mode, n] = v.split(':');
          update({ video: mode === 'video', micCount: Number(n), lockedSeats: room.lockedSeats.filter((i) => i < Number(n)) });
        }}
        onClose={close}
      />
      <ChoiceSheet
        visible={picker === 'micMode'}
        title="Mikrofon kontrolü"
        options={[
          { value: 'free', label: 'Serbest', sub: 'Yetkili herkes boş mikrofona doğrudan oturur' },
          { value: 'request', label: 'Mikrofon için başvur', sub: 'Konuşmacı kuyruğu; sahip/yönetici onaylar' },
          { value: 'members', label: 'Sadece takipçiler', sub: level >= 5 ? 'Seni takip edenler oturabilir' : 'Lv.5 odada açılır', disabled: level < 5 },
        ]}
        value={room.micMode}
        onPick={(v) => update({ micMode: v })}
        onClose={close}
      />
      <ChoiceSheet
        visible={picker === 'micPerm'}
        title="Mikrofon izni"
        options={[
          { value: 'everyone', label: 'Herkes' },
          { value: 'members', label: 'Oda üyeleri', sub: 'Sadece oda üyeleri mikrofon isteyebilir veya oturabilir' },
        ]}
        value={room.micPermission}
        onPick={(v) => update({ micPermission: v })}
        onClose={close}
      />
      <ChoiceSheet
        visible={picker === 'join'}
        options={[
          { value: 'open', label: joinLabel.open },
          { value: 'apply', label: joinLabel.apply },
          { value: 'closed', label: joinLabel.closed },
        ]}
        value={room.joinMode}
        onPick={(v) => update({ joinMode: v })}
        onClose={close}
      />
      <ChoiceSheet
        visible={picker === 'manageMembers'}
        title="Oda üyelerini kim yönetir?"
        desc="Başvuru onayı ve üyelikten çıkarma"
        options={[
          { value: 'owner', label: who.owner },
          { value: 'admins', label: who.admins },
        ]}
        value={room.manageMembers}
        onPick={(v) => update({ manageMembers: v })}
        onClose={close}
      />
      <ChoiceSheet
        visible={picker === 'manageFunctions'}
        title="Oda işlevlerini kim yönetir?"
        desc="Müzik, anket, hedef, etkinlik ve oyun başlatma"
        options={[
          { value: 'owner', label: who.owner },
          { value: 'admins', label: who.admins },
        ]}
        value={room.manageFunctions}
        onPick={(v) => update({ manageFunctions: v })}
        onClose={close}
      />
      <ChoiceSheet
        visible={picker === 'autoRemove'}
        title="Oda üyelerinin otomatik elemesi"
        desc={'Aşağıdaki kriterleri karşılayan normal kullanıcılar otomatik olarak odadan çıkarılır, oda sahibi ve yöneticiler etkilenmez\nEleme zamanı: Her gün saat 0’da (UTC+3)'}
        options={[
          { value: 0, label: 'Açılmadı' },
          { value: 7, label: 'Odaya giriş yapılmamış (7 gün)', sub: 'Üyeler son 7 gündür bu odaya girmedi' },
          { value: 14, label: 'Odaya giriş yapılmamış (14 gün)', sub: 'Üyeler son 14 gündür bu odaya girmedi' },
          { value: 30, label: 'Odaya giriş yapılmamış (30 gün)', sub: 'Üyeler son 30 gündür bu odaya girmedi' },
        ]}
        value={room.autoRemoveDays}
        onPick={(v) => update({ autoRemoveDays: v })}
        onClose={close}
      />
      <ChoiceSheet
        visible={picker === 'limit'}
        title={`Katılımcı limiti (Lv.${level} sınırı: ${memberLimit(level).toLocaleString('tr-TR')})`}
        options={[50, 100, 200, 300, 500, 1_200, 2_000, 5_000].map((n) => ({ value: n, label: `${n.toLocaleString('tr-TR')} kişi`, disabled: n > memberLimit(level), sub: n > memberLimit(level) ? 'Daha yüksek oda seviyesi gerekir' : undefined }))}
        value={room.limit}
        onPick={(v) => update({ limit: v })}
        onClose={close}
      />

      <BottomSheet visible={picker === 'blacklist'} onClose={close} title={`Oda kara listesi (${blacklist.length})`}>
        {blacklist.length === 0 && <Text style={styles.dim}>Kara listede kimse yok.</Text>}
        {blacklist.map((id) => {
          const ban = bans.find((b) => b.userId === id);
          return (
            <View key={id} style={styles.listRow}>
              <Avatar uri={userById(id).avatar} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff' }}>{userById(id).name}</Text>
                <Text style={styles.dim}>{room.blacklist.includes(id) ? 'Kalıcı · odaya giremez' : `Geçici yasak · ${ban?.until}`}</Text>
              </View>
              {room.blacklist.includes(id) && (
                <Pressable onPress={() => update({ blacklist: room.blacklist.filter((x) => x !== id) })} hitSlop={6}>
                  <Text style={{ color: colors.green, fontWeight: '700' }}>Kaldır</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        <Text style={styles.dim}>Koltuktaki birine dokunup &quot;Kara listeye ekle&quot; diyerek kalıcı olarak engelleyebilirsin.</Text>
      </BottomSheet>

      <BottomSheet visible={picker === 'admins'} onClose={close} title={`Oda yöneticileri (${room.adminIds.length}/${adminCapacity(level)})`}>
        {room.adminIds.length === 0 && <Text style={styles.dim}>Koltuktaki birine dokunup &quot;Yönetici yap&quot; diyebilirsin.</Text>}
        {room.adminIds.map((id) => (
          <View key={id} style={styles.listRow}>
            <Avatar uri={userById(id).avatar} size={34} />
            <Text style={{ color: '#fff', flex: 1 }}>🛡️ {userById(id).name}</Text>
            <Pressable onPress={() => update({ adminIds: room.adminIds.filter((x) => x !== id) })}>
              <Text style={{ color: colors.red, fontWeight: '600' }}>Kaldır</Text>
            </Pressable>
          </View>
        ))}
        <Text style={styles.dim}>Yöneticiler susturabilir ve mikrofondan indirebilir; oda sahibine müdahale edemez, ajans gelirlerini göremez.</Text>
      </BottomSheet>

      <BottomSheet visible={picker === 'log'} onClose={close} title="Oda günlüğü">
        {modLog.length === 0 && <Text style={styles.dim}>Bu oturumda kayıt yok. Susturma, indirme, çıkarma, yönetici atama ve ayar değişiklikleri burada görünür.</Text>}
        {modLog.map((l) => (
          <Text key={l.id} style={styles.dim}>
            {l.time} · {l.actor} · {l.action} → {l.target}
            {l.reason ? ` (${l.reason})` : ''}
          </Text>
        ))}
      </BottomSheet>

      <BottomSheet visible={picker === 'level'} onClose={close} title={`Oda seviyesi Lv.${level}`}>
        <LevelTable xp={room.xp} level={level} />
      </BottomSheet>
    </Modal>
  );
}

// --- Boss seat ("Patron Koltuğu") ---------------------------------------------------------
export function BossSeat({ userId, speaking, onPress }: { userId: string | null; speaking: boolean; onPress: () => void }) {
  const u = userId ? userById(userId) : null;
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 4, width: 96 }} accessibilityLabel="Patron koltuğu">
      <LinearGradient colors={speaking ? ['#FDE68A', '#FF6576'] : ['#FDE68A', '#B45309']} style={styles.bossRing}>
        {u ? (
          <Image source={{ uri: u.avatar }} style={{ width: 62, height: 62, borderRadius: 31 }} />
        ) : (
          <View style={styles.bossEmpty}>
            <Image source={ROOM_ICON_ART.bossSeat} style={{ width: 46, height: 46 }} />
          </View>
        )}
      </LinearGradient>
      <Text style={styles.bossTag}>👑 PATRON</Text>
      <Text style={{ color: '#fff', fontSize: 12, maxWidth: 90 }} numberOfLines={1}>
        {u ? (userId === 'me' ? 'Sen' : u.name) : 'Patron Koltuğu'}
      </Text>
    </Pressable>
  );
}

export const bossSeatInfo = (current: string | null, myContribution: number, top: number) => {
  const need = Math.max(BOSS_SEAT_MIN_COINS, top + 1) - myContribution;
  return current === 'me'
    ? 'Patron koltuğundasın 👑 Ayrıcalıklar: mikrofon önceliği, altın çerçeve, giriş duyurusu. Biri seni geçerse koltuk ona geçer.'
    : `Patron koltuğuna bu oturumda en çok hediye gönderen kişi (en az 🪙 ${BOSS_SEAT_MIN_COINS.toLocaleString('tr-TR')}) oturur.\n\nSenin katkın: 🪙 ${myContribution.toLocaleString('tr-TR')}\nKoltuğa geçmek için: 🪙 ${Math.max(0, need).toLocaleString('tr-TR')} daha`;
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: '#24232B', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 30, maxHeight: '80%' },
  sheetTitle: { color: '#fff', fontWeight: '800', fontSize: 17, marginBottom: 4 },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  tiny: { color: '#fff', fontSize: 12, marginTop: 4, maxWidth: 70 },
  h2: { color: '#fff', fontWeight: '800', fontSize: 17 },
  h3: { color: '#fff', fontWeight: '700', fontSize: 14, marginTop: 4 },
  choice: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)' },
  cancel: { alignItems: 'center', paddingVertical: 16, marginTop: 8, borderTopWidth: 6, borderTopColor: 'rgba(0,0,0,0.3)' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 12 },
  topTitle: { color: '#fff', fontWeight: '800', fontSize: 20 },
  section: { color: '#fff', backgroundColor: '#34333B', paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  rowLabel: { color: '#fff', fontSize: 16 },
  rowValue: { color: '#fff', fontSize: 14, textAlign: 'right', flexShrink: 1 },
  hint: { color: '#FACC15', fontSize: 12, lineHeight: 17 },
  input: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, color: '#fff', fontSize: 15, paddingHorizontal: 14, paddingVertical: 10 },
  track: { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  levelRow: { borderWidth: 1, borderColor: 'transparent', borderRadius: 10, padding: 6, gap: 2 },
  cover: { width: 76, height: 76, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  coverLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 12, backgroundColor: 'rgba(0,0,0,0.5)', borderBottomLeftRadius: 10, borderBottomRightRadius: 10, paddingVertical: 2, overflow: 'hidden' },
  bigTitle: { color: '#fff', fontWeight: '900', fontSize: 20, flexShrink: 1 },
  card: { borderRadius: 12, padding: 12, gap: 6, minHeight: 64 },
  cardLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
  cardValue: { color: '#fff', fontSize: 16, fontWeight: '900' },
  bell: { backgroundColor: colors.red, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 },
  joinBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  choiceArt: { width: 40, height: 40, marginRight: 12 },
  stat: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 10, gap: 8, justifyContent: 'space-between' },
  statLabel: { color: colors.textDim, fontSize: 12 },
  statValue: { color: '#fff', fontWeight: '900', fontSize: 18 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  bigBtn: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingVertical: 13 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  pill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  decor: { width: '47%', borderWidth: 2, borderColor: 'transparent', borderRadius: 10, padding: 3 },
  bossRing: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center' },
  bossEmpty: { width: 62, height: 62, borderRadius: 31, backgroundColor: 'rgba(30,20,10,0.85)', alignItems: 'center', justifyContent: 'center' },
  bossTag: { color: '#1C1B22', backgroundColor: '#FBBF24', fontSize: 9, fontWeight: '900', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, marginTop: -10, overflow: 'hidden' },
});
