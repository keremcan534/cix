import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { Art, artSource, type ArtName } from '@/components/Art';
import { ROOM_ICON_ART } from '@/components/RoomArt';
import { roomStyles } from '@/components/room/parts';
import { Avatar, GradientButton, StateIcon } from '@/components/ui';
import { MUSIC_CATALOG, type Track } from '@/data/catalog';
import { userById } from '@/data/mock';
import { goBack } from '@/lib/nav';
import { showAlert } from '@/lib/alert';
import { colors, semantic } from '@/theme';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Sheet({ visible, onClose, title, art, children, tall }: { visible: boolean; onClose: () => void; title: string; art?: number; children: React.ReactNode; tall?: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={onClose} />
      <View style={[roomStyles.sheet, { maxHeight: tall ? '85%' : '70%' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          {art && <Image source={art} style={{ width: 30, height: 30, marginRight: 8 }} />}
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
      <StateIcon name="lock-closed" size={72} />
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
      <Pressable onPress={() => goBack()}>
        <Text style={{ color: colors.textDim }}>Geri dön</Text>
      </Pressable>
    </SafeAreaView>
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
          <View style={{ height: 3, backgroundColor: colors.primary, width: `${(music.position / track.seconds) * 100}%` }} />
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
  requests = [],
  onApprove,
  onReject,
}: {
  requests?: { track: Track; by: string }[];
  onApprove?: (i: number) => void;
  onReject?: (i: number) => void;
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
    <Sheet visible={visible} onClose={onClose} title="Oda müziği" art={ROOM_ICON_ART.music} tall>
      <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
        {canControl && (
          <View style={styles.row}>
            <Text style={{ color: '#fff', flex: 1 }}>Ortak müzik</Text>
            <Switch value={enabled} onValueChange={setEnabled} />
          </View>
        )}
        {canControl && requests.length > 0 && (
          <>
            <Text style={styles.label}>İstek kuyruğu ({requests.length}) · onay bekliyor</Text>
            {requests.map((r, i) => (
              <View key={`${r.track.id}-${i}`} style={styles.row}>
                <Text style={{ color: '#fff', flex: 1 }} numberOfLines={1}>
                  🙋 {userById(r.by).name}: {r.track.title}
                </Text>
                <Pressable style={[styles.smallBtn, { backgroundColor: semantic.successFill }]} onPress={() => onApprove?.(i)}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Onayla</Text>
                </Pressable>
                <Pressable style={[styles.smallBtn, { backgroundColor: colors.cardAlt }]} onPress={() => onReject?.(i)}>
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Reddet</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}
        <Text style={styles.label}>Sıra ({music.queue.length})</Text>
        {music.queue.length === 0 && <Text style={styles.dim}>Sıra boş.</Text>}
        {music.queue.map((t, i) => (
          <View key={`${t.id}-${i}`} style={styles.row}>
            <Text style={{ color: i === 0 ? colors.primaryText : colors.textDim, width: 18 }}>{i === 0 ? '▶' : i + 1}</Text>
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
    <Sheet visible={visible} onClose={onClose} title="Oda zarfı dağıt" art={ROOM_ICON_ART.envelope}>
      <Text style={styles.dim}>Zarftaki jetonlar odadaki ilk {count} kişiye rastgele paylaştırılır. Tüm transferler cüzdan defterine yazılır.</Text>
      <Text style={styles.label}>Toplam</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[100, 500, 1000].map((n) => (
          <Pressable key={n} onPress={() => setAmount(n)} style={[styles.chip, amount === n && { borderColor: colors.primaryText }]}>
            <Text style={styles.chipText}>🪙 {n}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Kişi sayısı</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {[5, 10, 20].map((n) => (
          <Pressable key={n} onPress={() => setCount(n)} style={[styles.chip, count === n && { borderColor: colors.primaryText }]}>
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
      <Image source={ROOM_ICON_ART.envelope} style={{ width: 44, height: 44 }} />
      <Text style={styles.envelopeText}>{userById(from).name} zarf attı!</Text>
      <Text style={styles.envelopeTimer}>Kap · {seconds}s</Text>
    </Pressable>
  );
}

// --- Dice mini game ----------------------------------------------------------------
const DIE: ArtName[] = ['zar-zar-yuzu-1', 'zar-zar-yuzu-2', 'zar-zar-yuzu-3', 'zar-zar-yuzu-4', 'zar-zar-yuzu-5', 'zar-zar-yuzu-6'];
export function DiceModal({ visible, onClose, onPlay, playsLeft }: { visible: boolean; onClose: () => void; onPlay: (bet: number) => { me: number; them: number; opponent: string } | null; playsLeft: number }) {
  const [bet, setBet] = useState(10);
  const [result, setResult] = useState<{ me: number; them: number; opponent: string } | null>(null);
  return (
    <Sheet visible={visible} onClose={onClose} title="Zar Düellosu" art={ROOM_ICON_ART.diceDuel}>
      <Text style={styles.dim}>Odadaki rastgele biriyle zar at; rakibinden en az 3 fazla atarsan bahsinin 2,4 katı oyun bakiyene yazılır (yalnızca oyunlarda kullanılır). Oyunlarda oynanan jetonun %60&apos;ı kasaya kalır, %40&apos;ı kazananlara dağılır. 18+ · Günlük {playsLeft} hak kaldı. Sonuç sunucuda belirlenir.</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
        {[10, 50, 100].map((n) => (
          <Pressable key={n} onPress={() => setBet(n)} style={[styles.chip, bet === n && { borderColor: colors.primaryText }]}>
            <Text style={styles.chipText}>🪙 {n}</Text>
          </Pressable>
        ))}
      </View>
      {result && (
        <View style={styles.diceRow}>
          <View style={{ alignItems: 'center' }}>
            <Art name={DIE[result.me - 1]} size={80} style={styles.die} />
            <Text style={styles.dim}>Sen</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>{result.me - result.them >= 3 ? '🏆' : '😢'}</Text>
          <View style={{ alignItems: 'center' }}>
            <Art name={DIE[result.them - 1]} size={80} style={styles.die} />
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
export function RequestsModal({ visible, onClose, requests, onAccept, onReject, freeSeats }: { visible: boolean; onClose: () => void; requests: string[]; onAccept: (id: string) => void; onReject: (id: string) => void; freeSeats: number }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={`Konuşmacı kuyruğu (${requests.length})`} art={artSource('oda-konusmaci-kuyrugu-el-kaldir')}>
      <Text style={styles.dim}>Sıra geliş sırasına göre. Boş mikrofon: {freeSeats}. Mikrofon doluysa kabul edilen kişi bekleme listesinde kalır.</Text>
      {requests.length === 0 && <Text style={styles.dim}>Bekleyen istek yok.</Text>}
      {requests.map((id, i) => (
        <View key={id} style={styles.row}>
          <Text style={{ color: colors.gold, fontWeight: '800', width: 18 }}>{i + 1}</Text>
          <Avatar uri={userById(id).avatar} size={38} />
          <Text style={{ color: '#fff', flex: 1 }}>{userById(id).name}</Text>
          <Pressable style={[styles.smallBtn, { backgroundColor: semantic.successFill }]} onPress={() => onAccept(id)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Kabul</Text>
          </Pressable>
          <Pressable style={[styles.smallBtn, { backgroundColor: colors.cardAlt }]} onPress={() => onReject(id)}>
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Sıradan çıkar</Text>
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
  musicBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, marginTop: 4, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  musicTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  smallBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  envelope: { position: 'absolute', right: 12, top: 180, backgroundColor: '#B91C1C', borderRadius: 16, padding: 10, alignItems: 'center', borderWidth: 2, borderColor: colors.gold },
  envelopeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  envelopeTimer: { color: colors.gold, fontSize: 12, fontWeight: '900' },
  diceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 12 },
  die: { marginBottom: 4 },
});
