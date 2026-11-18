// Benim Koruma (docs/KORUMA.md): who guards me and whom I guard, top 50 each by points, how many days each Koruma has
// lasted. Long press in Koruduklarım ends one (only the guardian can; its points are gone). The gear opens my
// settings: Koruma off (nobody new can become my guardian) and my threshold (the points a guardian needs to show on
// my profile; its highest value grows with my Yankı level, and it changes once a week). The server keeps all of it
// (lib/live/guard); the offline demo has none.
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Switch } from '@/components/luxe-switch';
import { Text, TextInput } from '@/components/text';
import { Photo } from '@/components/photo';
import { Button } from '@/components/ui';
import { guardPoints, type GuardMine, type GuardPerson } from '@/lib/guard-core';
import { showAlert } from '@/lib/alert';
import { liveMode, message, toServer } from '@/lib/live';
import { endGuard, loadMyGuard, saveGuardSettings } from '@/lib/live/guard';
import { goBack } from '@/lib/nav';
import { useApp } from '@/store';
import { makeStyles, useTheme } from '@/theme';

type Side = 'guardians' | 'wards';
const nowMs = () => Date.now();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' });

export default function MyGuard() {
  const { me } = useApp();
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ayar?: string }>();
  const [side, setSide] = useState<Side>('guardians');
  const [data, setData] = useState<GuardMine | 'failed' | null>(null);
  const [tick, setTick] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(params.ayar === '1');
  const signedIn = liveMode() && !!toServer('me');

  useEffect(() => {
    if (!signedIn) return;
    let on = true;
    loadMyGuard().then(
      (d) => on && setData(d),
      () => on && setData((d) => (d && d !== 'failed' ? d : 'failed')),
    );
    return () => {
      on = false;
    };
  }, [signedIn, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  const list = data && data !== 'failed' ? data[side] : [];
  const top = list[0] ?? null;

  const leave = (p: GuardPerson) =>
    showAlert('Korumadan çık', `${p.name} için korumayı bitirirsen ${guardPoints(p.points)} koruma puanın sıfırlanır. Yeniden kart gönderirsen sıfırdan başlar.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Korumayı bitir',
        style: 'destructive',
        onPress: () =>
          void endGuard(p.id).then(
            () => reload(),
            (e) => showAlert('Bitirilemedi', message(e)),
          ),
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={['#8B5CF6', '#C26BF0', '#F49AD8']} style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <View style={styles.bar}>
          <Pressable onPress={() => goBack('/(tabs)/profil')} hitSlop={8} style={styles.barBtn} accessibilityRole="button" accessibilityLabel="Geri">
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
          <Text style={styles.title}>Benim Koruma</Text>
          <View style={{ flexDirection: 'row' }}>
            {signedIn && (
              <Pressable onPress={() => setSettingsOpen(true)} hitSlop={6} style={styles.barBtn} accessibilityRole="button" accessibilityLabel="Koruma ayarları">
                <Ionicons name="settings-outline" size={22} color="#fff" />
              </Pressable>
            )}
            <Pressable onPress={() => router.push('/koruma/kurallar')} hitSlop={6} style={styles.barBtn} accessibilityRole="button" accessibilityLabel="Koruma kuralları">
              <Ionicons name="help-circle-outline" size={24} color="#fff" />
            </Pressable>
          </View>
        </View>
        <View style={styles.tabs}>
          {(
            [
              ['guardians', 'Beni koruyanlar'],
              ['wards', 'Koruduklarım'],
            ] as const
          ).map(([k, label]) => (
            <Pressable key={k} style={[styles.tab, side === k && styles.tabOn]} onPress={() => setSide(k)} accessibilityRole="tab" accessibilityState={{ selected: side === k }}>
              <Text style={[styles.tabText, side === k && styles.tabTextOn]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {top && (
          <View style={styles.hero}>
            <Face uri={me.avatar} size={92} />
            <View style={styles.heart}>
              <Ionicons name="heart" size={108} color="#FF4FA3" style={styles.heartIcon} />
              <Text style={styles.heartText} numberOfLines={1} adjustsFontSizeToFit>
                {guardPoints(top.points)}
              </Text>
            </View>
            <Face uri={top.avatarUrl} size={92} />
          </View>
        )}
      </LinearGradient>

      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <View style={styles.flourish} />
          <Ionicons name="heart" size={12} color="#F0468E" />
          <Text style={styles.sheetTitle}>Koruma Listesi</Text>
          <Ionicons name="heart" size={12} color="#F0468E" />
          <View style={styles.flourish} />
        </View>
        {!signedIn ? (
          <Text style={styles.note}>Koruma canlı sunucuda çalışır: giriş yapınca burada görünür.</Text>
        ) : data === null ? (
          <ActivityIndicator color={colors.primaryText} style={{ marginTop: 24 }} />
        ) : data === 'failed' ? (
          <View style={{ alignItems: 'center', gap: 10, marginTop: 16 }}>
            <Text style={styles.note}>Koruma listesi okunamadı.</Text>
            <Button title="Tekrar dene" small variant="tonal" onPress={reload} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
            {list.length === 0 ? (
              <Text style={styles.note}>
                {side === 'guardians'
                  ? data.settings.off
                    ? 'Korumayı kapattın: kimse yeni koruyucun olamaz.'
                    : 'Henüz seni koruyan yok. Biri sana Koruma Kartı gönderince burada görünür.'
                  : 'Henüz kimseyi korumuyorsun. Birinin profilinden Koruma Kartı göndererek koruyucusu olabilirsin.'}
              </Text>
            ) : (
              list.map((p, i) => (
                <Pressable
                  key={p.id}
                  style={styles.row}
                  onPress={() => router.push(`/kullanici/${p.id}`)}
                  onLongPress={side === 'wards' ? () => leave(p) : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={`${i + 1}. ${p.name}, ${p.days} gün, ${guardPoints(p.points)} puan`}
                  accessibilityHint={side === 'wards' ? 'Uzun basınca korumadan çıkabilirsin' : undefined}
                >
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Face uri={p.avatarUrl} size={48} ring="#F7B6D8" />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p.name}
                      </Text>
                      <Text style={styles.tag}>{side === 'guardians' ? 'Koruyor' : 'Koruma altında'}</Text>
                    </View>
                    <Text style={styles.days}>{p.days} gün koruma sağlandı</Text>
                  </View>
                  <Ionicons name="heart-circle" size={20} color="#F0468E" />
                  <Text style={styles.points}>{guardPoints(p.points)}</Text>
                </Pressable>
              ))
            )}
            {list.length > 0 && <Text style={styles.foot}>{side === 'wards' ? 'Uzun basarak korumadan çık' : 'Yalnız ilk 50 koruma gösterilir'}</Text>}
          </ScrollView>
        )}
      </View>

      {settingsOpen && data && data !== 'failed' && (
        <GuardSettingsSheet
          settings={data.settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(settings) => setData((d) => (d && d !== 'failed' ? { ...d, settings } : d))}
        />
      )}
    </View>
  );
}

function Face({ uri, size, ring = '#fff' }: { uri: string | null | undefined; size: number; ring?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: ring, overflow: 'hidden', backgroundColor: '#E9D5FF' }}>
      {uri ? <Photo uri={uri} kind="face" style={{ width: '100%', height: '100%' }} /> : <Ionicons name="person" size={size * 0.55} color="#fff" style={{ alignSelf: 'center', marginTop: size * 0.2 }} />}
    </View>
  );
}

/** Koruma off and the threshold; the threshold is saved only after a confirmation (it changes once a week). */
function GuardSettingsSheet({ settings, onClose, onSaved }: { settings: GuardMine['settings']; onClose: () => void; onSaved: (s: GuardMine['settings']) => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [off, setOff] = useState(settings.off);
  const [text, setText] = useState(String(settings.threshold));
  const [busy, setBusy] = useState(false);
  const wanted = Number(text.replace(/\D/g, '') || '0');
  const locked = !!settings.thresholdNextAt && Date.parse(settings.thresholdNextAt) > nowMs();
  const tooHigh = wanted > settings.thresholdMax;

  const save = async (body: { off?: boolean; threshold?: number }) => {
    setBusy(true);
    try {
      onSaved(await saveGuardSettings(body));
      return true;
    } catch (e) {
      showAlert('Kaydedilemedi', message(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toggleOff = async (v: boolean) => {
    setOff(v);
    if (!(await save({ off: v }))) setOff(!v);
  };
  const saveThreshold = () =>
    showAlert('Eşiği onayla', `Koruma eşiğin ${guardPoints(wanted)} puan olacak. Eşik haftada bir değişir: bir hafta boyunca yeniden değiştiremezsin.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Onayla', onPress: () => void save({ threshold: wanted }).then((ok) => ok && onClose()) },
    ]);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[styles.settings, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.settingsHead}>
          <Text style={styles.settingsTitle}>Koruma ayarları</Text>
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.textDim} />
          </Pressable>
        </View>
        <View style={styles.settingRow}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.settingLabel}>Korumayı kapat</Text>
            <Text style={styles.settingHint}>Kapalıyken kimse yeni koruyucun olamaz; olanlar kalır. Başkalarının korumalarını yine görürsün.</Text>
          </View>
          <Switch value={off} disabled={busy} onValueChange={(v) => void toggleOff(v)} accessibilityLabel="Korumayı kapat" />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.settingLabel}>Koruma alanı eşiği</Text>
          <Text style={styles.settingHint}>
            Profilinde görünmek için koruyucunun ulaşması gereken puan. En çok {guardPoints(settings.thresholdMax)}; Yankı seviyen yükseldikçe artar.
          </Text>
          <TextInput
            value={text}
            onChangeText={(t) => setText(t.replace(/\D/g, '').slice(0, 12))}
            keyboardType="number-pad"
            editable={!locked && !busy}
            style={[styles.input, tooHigh && { borderColor: colors.red }]}
            accessibilityLabel="Koruma alanı eşiği"
          />
          {locked ? (
            <Text style={styles.settingHint}>Eşik haftada bir değişir. Bir sonraki değişiklik: {fmtDate(settings.thresholdNextAt!)}</Text>
          ) : tooHigh ? (
            <Text style={[styles.settingHint, { color: colors.red }]}>En çok {guardPoints(settings.thresholdMax)} puan olabilir.</Text>
          ) : null}
          <Button title="Eşiği kaydet" disabled={locked || busy || tooHigh || wanted === settings.threshold} onPress={saveThreshold} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, dark }) => ({
  top: { paddingBottom: 18 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, minHeight: 48 },
  barBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginTop: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)', padding: 3 },
  tab: { flex: 1, minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabOn: { backgroundColor: '#fff' },
  tabText: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '700' },
  tabTextOn: { color: '#7C3AED', fontWeight: '800' },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 18 },
  heart: { width: 128, height: 112, alignItems: 'center', justifyContent: 'center' },
  heartIcon: { position: 'absolute', textShadowColor: 'rgba(122,11,69,0.45)', textShadowRadius: 8 },
  heartText: { color: '#fff', fontSize: 19, fontWeight: '900', maxWidth: 84, marginTop: -6, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3 },
  sheet: { flex: 1, marginTop: -14, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: dark ? colors.card : '#fff', paddingHorizontal: 16, paddingTop: 14 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10 },
  flourish: { width: 36, height: 2, borderRadius: 1, backgroundColor: '#F7A8CF' },
  sheetTitle: { color: '#F0468E', fontSize: 18, fontWeight: '900' },
  note: { color: colors.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 18, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 64 },
  rank: { width: 22, textAlign: 'center', color: colors.textDim, fontSize: 15, fontWeight: '700' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  tag: { color: '#E0307E', backgroundColor: dark ? 'rgba(240,70,142,0.18)' : '#FDE2EF', fontSize: 11, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  days: { color: colors.textDim, fontSize: 13 },
  points: { color: colors.text, fontSize: 15, fontWeight: '900', minWidth: 48, textAlign: 'right' },
  foot: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: 14 },
  settings: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 18 },
  settingsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingsTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  settingHint: { color: colors.textDim, fontSize: 13, lineHeight: 18 },
  input: { color: colors.text, fontSize: 17, fontWeight: '700', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, minHeight: 46, backgroundColor: colors.cardAlt },
}));
