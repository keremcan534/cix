import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { roomStyles } from '@/components/room/parts';
import { Avatar, GradientButton } from '@/components/ui';
import { MUSIC_CATALOG, ROOM_BACKGROUNDS, ROOM_LEVEL_REWARDS, ROOM_XP_THRESHOLDS, adminCapacity, roomLevel, type Track } from '@/data/catalog';
import { userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import type { MyRoom } from '@/store';
import { colors } from '@/theme';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Sheet({ visible, onClose, title, children, tall }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; tall?: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View style={[roomStyles.sheet, { maxHeight: tall ? '85%' : '70%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Text style={[roomStyles.sheetTitle, { flex: 1, marginBottom: 0 }]}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        {children}
      </View>
    </Modal>
  );
}

// --- Password gate for private rooms (spec ROOM-01) ----------------------------
export function PasswordGate({ title, password, onPass }: { title: string; password: string; onPass: () => void }) {
  const [value, setValue] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const locked = lockedUntil > now;

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);

  const submit = () => {
    const t = Date.now();
    if (lockedUntil > t) return;
    if (value === password) return onPass();
    const next = attempts + 1;
    setAttempts(next);
    setValue('');
    if (next >= 3) {
      setLockedUntil(t + 30_000);
      setNow(t);
      setAttempts(0);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
      <Text style={{ fontSize: 56 }}>🔒</Text>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      <Text style={{ color: colors.textDim, textAlign: 'center' }}>Bu oda şifreli. Girmek için oda şifresini yaz.</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Oda şifresi"
        placeholderTextColor={colors.textDim}
        secureTextEntry
        editable={!locked}
        onSubmitEditing={submit}
        style={styles.input}
      />
      {attempts > 0 && !locked && <Text style={{ color: colors.red }}>Şifre yanlış ({attempts}/3)</Text>}
      {locked && <Text style={{ color: colors.gold, textAlign: 'center' }}>Çok fazla deneme. {Math.ceil((lockedUntil - now) / 1000)} sn bekle. (Deneme denetim kaydına yazıldı)</Text>}
      <GradientButton title="Gir" icon="log-in" onPress={submit} style={{ alignSelf: 'stretch', opacity: locked ? 0.4 : 1 }} />
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: colors.textDim }}>Geri dön</Text>
      </Pressable>
    </SafeAreaView>
  );
}

// --- Owner settings ------------------------------------------------------------
export function SettingsModal({
  visible,
  onClose,
  room,
  update,
  agencyRoom,
  botOn,
  setBot,
}: {
  visible: boolean;
  onClose: () => void;
  room: MyRoom;
  update: (p: Partial<MyRoom>) => void;
  agencyRoom: boolean;
  botOn: boolean;
  setBot: (v: boolean) => void;
}) {
  const [title, setTitle] = useState(room.title);
  const [announcement, setAnnouncement] = useState(room.announcement);
  const [password, setPassword] = useState(room.password);
  const level = roomLevel(room.xp);
  const next = ROOM_XP_THRESHOLDS[level];
  const prev = ROOM_XP_THRESHOLDS[level - 1];

  const save = () => {
    if (title.trim().length < 3) return showAlert('Oda adı en az 3 karakter olmalı');
    update({ title: title.trim(), announcement: announcement.trim(), password: password.trim(), locked: !!password.trim() });
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Oda ayarları" tall>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
        <View style={styles.levelCard}>
          <Text style={styles.levelTitle}>
            Oda seviyesi Lv.{level} {agencyRoom ? '· Ajans odası' : ''}
          </Text>
          <View style={styles.track}>
            <LinearGradient
              colors={['#8B5CF6', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ height: 8, width: next ? `${((room.xp - prev) / (next - prev)) * 100}%` : '100%' }}
            />
          </View>
          <Text style={styles.dim}>{next ? `${room.xp} / ${next} XP · sonraki ödül: ${ROOM_LEVEL_REWARDS[level]}` : `${room.xp} XP · maksimum seviye`}</Text>
          <Text style={styles.dim}>XP kaynakları: hediye, katılım, mikrofonda konuşma, etkinlik, sohbet. Spam ve sahte işlemler XP üretmez.</Text>
        </View>

        <Text style={styles.label}>Oda adı</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.input} maxLength={30} />
        <Text style={styles.label}>Duyuru</Text>
        <TextInput value={announcement} onChangeText={setAnnouncement} style={[styles.input, { minHeight: 60 }]} multiline maxLength={120} />

        <Text style={styles.label}>Arka plan</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {ROOM_BACKGROUNDS.map((b) => {
            const open = level >= b.minLevel;
            const uri = `https://picsum.photos/seed/${b.seed}/600/400`;
            return (
              <Pressable key={b.id} disabled={!open} onPress={() => update({ cover: uri })} style={[styles.chip, room.cover === uri && { borderColor: colors.pink }, !open && { opacity: 0.4 }]}>
                <Text style={styles.chipText}>
                  {open ? '' : '🔒 '}
                  {b.name}
                  {open ? '' : ` Lv.${b.minLevel}`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Gizlilik</Text>
        <TextInput value={password} onChangeText={setPassword} placeholder="Şifre (boş = herkese açık)" placeholderTextColor={colors.textDim} style={styles.input} maxLength={8} />
        <Text style={styles.label}>Katılımcı limiti</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[50, 200, 500].map((n) => (
            <Pressable key={n} onPress={() => update({ limit: n })} style={[styles.chip, room.limit === n && { borderColor: colors.pink }]}>
              <Text style={styles.chipText}>{n} kişi</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Mikrofon kuralı</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {(
            [
              ['free', 'Herkes oturabilir', 1],
              ['request', 'İstekle', 1],
              ['members', 'Sadece takipçiler', 5],
            ] as const
          ).map(([mode, label, min]) => (
            <Pressable key={mode} disabled={level < min} onPress={() => update({ micMode: mode })} style={[styles.chip, room.micMode === mode && { borderColor: colors.pink }, level < min && { opacity: 0.4 }]}>
              <Text style={styles.chipText}>
                {level < min ? `🔒 ${label} Lv.${min}` : label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>
          Oda yöneticileri ({room.adminIds.length}/{adminCapacity(level)})
        </Text>
        {room.adminIds.length === 0 ? (
          <Text style={styles.dim}>Koltuktaki birine dokunup &quot;Yönetici yap&quot; diyebilirsin.</Text>
        ) : (
          room.adminIds.map((id) => (
            <View key={id} style={styles.row}>
              <Avatar uri={userById(id).avatar} size={32} />
              <Text style={{ color: '#fff', flex: 1 }}>🛡️ {userById(id).name}</Text>
              <Pressable onPress={() => update({ adminIds: room.adminIds.filter((x) => x !== id) })}>
                <Text style={{ color: colors.red, fontWeight: '600' }}>Kaldır</Text>
              </Pressable>
            </View>
          ))
        )}
        <Text style={styles.dim}>Yöneticiler susturabilir ve mikrofondan indirebilir; ama oda sahibine müdahale edemez, ajans gelirlerini göremez.</Text>

        <View style={styles.row}>
          <Text style={{ color: '#fff', flex: 1 }}>🤖 Oda botu (karşılama ve kurallar)</Text>
          <Switch value={botOn} onValueChange={setBot} />
        </View>

        <Text style={styles.label}>Seviye ödülleri</Text>
        {ROOM_LEVEL_REWARDS.map((r, i) => (
          <Text key={r} style={[styles.dim, i < level && { color: '#fff' }]}>
            {i < level ? '✅' : '🔒'} Lv.{i + 1} · {r}
          </Text>
        ))}
        <GradientButton title="Kaydet" icon="checkmark" onPress={save} />
      </ScrollView>
    </Sheet>
  );
}

// --- Music -------------------------------------------------------------------
export type MusicState = { queue: Track[]; playing: boolean; position: number };

export function MusicBar({ music, canControl, onOpen, onToggle, onNext }: { music: MusicState; canControl: boolean; onOpen: () => void; onToggle: () => void; onNext: () => void }) {
  const track = music.queue[0];
  if (!track) return null;
  return (
    <Pressable style={styles.musicBar} onPress={onOpen}>
      <Text style={{ fontSize: 16 }}>🎵</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
          {track.title} · {track.artist}
        </Text>
        <View style={styles.musicTrack}>
          <View style={{ height: 3, backgroundColor: colors.pink, width: `${(music.position / track.seconds) * 100}%` }} />
        </View>
      </View>
      <Text style={styles.dim}>
        {mmss(music.position)}/{mmss(track.seconds)}
      </Text>
      {canControl && (
        <>
          <Pressable onPress={onToggle} hitSlop={8} accessibilityLabel="Oynat/duraklat">
            <Ionicons name={music.playing ? 'pause' : 'play'} size={18} color="#fff" />
          </Pressable>
          <Pressable onPress={onNext} hitSlop={8} accessibilityLabel="Sonraki parça">
            <Ionicons name="play-skip-forward" size={18} color="#fff" />
          </Pressable>
        </>
      )}
    </Pressable>
  );
}

export function MusicSheet({
  visible,
  onClose,
  music,
  canControl,
  onAdd,
  onSuggest,
  onToggle,
  onNext,
  onRemove,
  enabled,
  setEnabled,
}: {
  visible: boolean;
  onClose: () => void;
  music: MusicState;
  canControl: boolean;
  onAdd: (t: Track) => void;
  onSuggest: (t: Track) => void;
  onToggle: () => void;
  onNext: () => void;
  onRemove: (id: string) => void;
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}) {
  const [link, setLink] = useState('');
  const openLink = () => {
    const url = link.trim();
    if (!/^https:\/\/(open\.spotify\.com|(www\.)?youtube\.com|youtu\.be)\//.test(url)) return showAlert('Geçersiz bağlantı', 'Sadece Spotify veya YouTube bağlantısı paylaşılabilir.');
    // Third-party audio is never re-streamed by us; it opens in the provider's own player.
    Linking.openURL(url);
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="🎵 Oda müziği" tall>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
        {canControl && (
          <View style={styles.row}>
            <Text style={{ color: '#fff', flex: 1 }}>Ortak müzik</Text>
            <Switch value={enabled} onValueChange={setEnabled} />
          </View>
        )}
        <Text style={styles.label}>Sıra ({music.queue.length})</Text>
        {music.queue.length === 0 && <Text style={styles.dim}>Sıra boş.</Text>}
        {music.queue.map((t, i) => (
          <View key={`${t.id}-${i}`} style={styles.row}>
            <Text style={{ color: i === 0 ? colors.pink : colors.textDim, width: 18 }}>{i === 0 ? '▶' : i + 1}</Text>
            <Text style={{ color: '#fff', flex: 1 }} numberOfLines={1}>
              {t.title}
            </Text>
            <Text style={styles.dim}>{mmss(t.seconds)}</Text>
            {canControl && i > 0 && (
              <Pressable onPress={() => onRemove(t.id)} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textDim} />
              </Pressable>
            )}
          </View>
        ))}
        {canControl && music.queue.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <GradientButton small title={music.playing ? 'Duraklat' : 'Oynat'} icon={music.playing ? 'pause' : 'play'} onPress={onToggle} />
            <GradientButton small title="Sonraki" icon="play-skip-forward" onPress={onNext} />
          </View>
        )}
        <Text style={styles.label}>Lisanslı kütüphane</Text>
        {MUSIC_CATALOG.map((t) => (
          <View key={t.id} style={styles.row}>
            <Text style={{ fontSize: 18 }}>🎶</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff' }}>{t.title}</Text>
              <Text style={styles.dim}>
                {t.artist} · {mmss(t.seconds)}
              </Text>
            </View>
            <Pressable style={styles.smallBtn} onPress={() => (canControl ? onAdd(t) : onSuggest(t))}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{canControl ? 'Sıraya ekle' : 'Öner'}</Text>
            </Pressable>
          </View>
        ))}
        <Text style={styles.label}>Spotify / YouTube bağlantısı</Text>
        <TextInput value={link} onChangeText={setLink} placeholder="https://open.spotify.com/..." placeholderTextColor={colors.textDim} style={styles.input} autoCapitalize="none" />
        <Pressable style={[styles.smallBtn, { alignSelf: 'flex-start' }]} onPress={openLink}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Kendi uygulamasında aç</Text>
        </Pressable>
        <Text style={styles.dim}>Spotify/YouTube sesi uygulama üzerinden yeniden yayınlanmaz; bağlantı ilgili platformun oynatıcısında açılır.</Text>
      </ScrollView>
    </Sheet>
  );
}

// --- Red envelope ----------------------------------------------------------------
export function EnvelopeSendModal({ visible, onClose, onSend, coins }: { visible: boolean; onClose: () => void; onSend: (amount: number, count: number) => void; coins: number }) {
  const [amount, setAmount] = useState(100);
  const [count, setCount] = useState(5);
  return (
    <Sheet visible={visible} onClose={onClose} title="🧧 Oda zarfı dağıt">
      <Text style={styles.dim}>Zarftaki jetonlar odadaki ilk {count} kişiye rastgele paylaştırılır. Tüm transferler cüzdan defterine yazılır.</Text>
      <Text style={styles.label}>Toplam</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[100, 500, 1000].map((n) => (
          <Pressable key={n} onPress={() => setAmount(n)} style={[styles.chip, amount === n && { borderColor: colors.pink }]}>
            <Text style={styles.chipText}>🪙 {n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Kişi sayısı</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {[5, 10, 20].map((n) => (
          <Pressable key={n} onPress={() => setCount(n)} style={[styles.chip, count === n && { borderColor: colors.pink }]}>
            <Text style={styles.chipText}>{n} kişi</Text>
          </Pressable>
        ))}
      </View>
      <GradientButton title={`Dağıt · 🪙 ${amount}`} icon="gift" onPress={() => onSend(amount, count)} style={{ opacity: coins < amount ? 0.5 : 1 }} />
    </Sheet>
  );
}

export function EnvelopeDrop({ from, seconds, onGrab }: { from: string; seconds: number; onGrab: () => void }) {
  return (
    <Pressable style={styles.envelope} onPress={onGrab} accessibilityLabel="Zarfı kap">
      <Text style={{ fontSize: 34 }}>🧧</Text>
      <Text style={styles.envelopeText}>{userById(from).name} zarf attı!</Text>
      <Text style={styles.envelopeTimer}>Kap · {seconds}s</Text>
    </Pressable>
  );
}

// --- Dice mini game ----------------------------------------------------------------
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export function DiceModal({ visible, onClose, onPlay, playsLeft }: { visible: boolean; onClose: () => void; onPlay: (bet: number) => { me: number; them: number; opponent: string } | null; playsLeft: number }) {
  const [bet, setBet] = useState(10);
  const [result, setResult] = useState<{ me: number; them: number; opponent: string } | null>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title="🎲 Zar Düellosu">
      <Text style={styles.dim}>Odadaki rastgele biriyle zar at; yüksek atan bahsi 2 katı alır, eşitlikte iade. 18+ · Günlük {playsLeft} hak kaldı. Sonuç sunucuda belirlenir (demo).</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
        {[10, 50, 100].map((n) => (
          <Pressable key={n} onPress={() => setBet(n)} style={[styles.chip, bet === n && { borderColor: colors.pink }]}>
            <Text style={styles.chipText}>🪙 {n}</Text>
          </Pressable>
        ))}
      </View>
      {result && (
        <View style={styles.diceRow}>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.die}>{DIE[result.me - 1]}</Text>
            <Text style={styles.dim}>Sen</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{result.me > result.them ? '🏆' : result.me < result.them ? '😢' : '🤝'}</Text>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.die}>{DIE[result.them - 1]}</Text>
            <Text style={styles.dim}>{userById(result.opponent).name}</Text>
          </View>
        </View>
      )}
      <GradientButton title={`At · 🪙 ${bet}`} icon="dice" onPress={() => setResult(onPlay(bet))} style={{ opacity: playsLeft ? 1 : 0.4 }} />
    </Sheet>
  );
}

// --- Contribution ranking ---------------------------------------------------------
export function ContributionModal({ visible, onClose, data, locked }: { visible: boolean; onClose: () => void; data: Record<string, number>; locked: boolean }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <Sheet visible={visible} onClose={onClose} title="🏆 Oda katkı sıralaması">
      {locked ? (
        <Text style={styles.dim}>Katkı sıralaması oda seviyesi 3&apos;te açılır.</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.dim}>Bu oturumda henüz hediye gönderilmedi.</Text>
      ) : (
        <ScrollView>
          {rows.map(([id, v], i) => (
            <View key={id} style={styles.row}>
              <Text style={{ color: i < 3 ? colors.gold : colors.textDim, width: 22, fontWeight: '800' }}>{i + 1}</Text>
              <Avatar uri={userById(id).avatar} size={34} />
              <Text style={{ color: '#fff', flex: 1 }}>{id === 'me' ? 'Sen' : userById(id).name}</Text>
              <Text style={{ color: colors.gold, fontWeight: '700' }}>🪙 {v.toLocaleString('tr-TR')}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}

// --- Speak requests -----------------------------------------------------------------
export function RequestsModal({ visible, onClose, requests, onAccept, onReject }: { visible: boolean; onClose: () => void; requests: string[]; onAccept: (id: string) => void; onReject: (id: string) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={`🙋 Konuşma istekleri (${requests.length})`}>
      {requests.length === 0 && <Text style={styles.dim}>Bekleyen istek yok.</Text>}
      {requests.map((id) => (
        <View key={id} style={styles.row}>
          <Avatar uri={userById(id).avatar} size={38} />
          <Text style={{ color: '#fff', flex: 1 }}>{userById(id).name}</Text>
          <Pressable style={[styles.smallBtn, { backgroundColor: colors.green }]} onPress={() => onAccept(id)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Kabul</Text>
          </Pressable>
          <Pressable style={[styles.smallBtn, { backgroundColor: colors.cardAlt }]} onPress={() => onReject(id)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Reddet</Text>
          </Pressable>
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: { alignSelf: 'stretch', backgroundColor: colors.cardAlt, borderRadius: 14, color: '#fff', fontSize: 15, paddingHorizontal: 14, paddingVertical: 11 },
  label: { color: colors.textDim, fontWeight: '700', fontSize: 13, marginTop: 4 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.cardAlt, borderWidth: 1.5, borderColor: 'transparent' },
  chipText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  levelCard: { backgroundColor: colors.cardAlt, borderRadius: 14, padding: 12, gap: 6 },
  levelTitle: { color: '#fff', fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.bg, overflow: 'hidden' },
  musicBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 4, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  musicTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  smallBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  envelope: { position: 'absolute', right: 12, top: 180, backgroundColor: '#B91C1C', borderRadius: 16, padding: 10, alignItems: 'center', borderWidth: 2, borderColor: colors.gold },
  envelopeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  envelopeTimer: { color: colors.gold, fontSize: 12, fontWeight: '900' },
  diceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 12 },
  die: { fontSize: 64, color: '#fff' },
});
