// DJ modu (lib/live/dj-live, server/api/dj-live.mjs): the sheet where the room's owner or one of its DJs sends a
// mixer or DJ controller live from the mic, and the bar every phone in the room shows while someone does.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { ROOM_ICON_ART } from '@/components/RoomArt';
import { Sheet } from '@/components/room/community';
import { GradientButton } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { message, myServerId } from '@/lib/live';
import { DJ_STOP_TEXT, choicesOf, djLiveGet, djLiveSet, djState, useDjState, type DjChoice, type DjLiveInfo } from '@/lib/live/dj-live';
import { setDjMode } from '@/lib/room-session';
import { colors, semantic } from '@/theme';
import { djInputAvailable, djInputs } from '../../../modules/similar-dj-input';

const AUTO: DjChoice = { key: 'auto', label: 'Otomatik', sub: 'Telefon seçer (USB ses kartı takılıysa genelde onu kullanır).', external: false };

/** The browser's microphones (labels once the mic is allowed), for the web build. */
async function browserInputs(): Promise<DjChoice[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ key: `w${d.deviceId}`, label: d.label || `Ses girişi ${i + 1}`, sub: '', deviceId: d.deviceId, external: /usb|line|mix|interface|audio/i.test(d.label) }));
  } catch {
    return [];
  }
}

function useInputs(on: boolean) {
  const [list, setList] = useState<DjChoice[]>([]);
  useEffect(() => {
    if (!on) return;
    let live = true;
    const read = async () => {
      const next = Platform.OS === 'web' ? await browserInputs() : djInputAvailable() ? choicesOf(djInputs()) : [];
      if (live) setList((prev) => (prev.map((c) => c.key).join() === next.map((c) => c.key).join() ? prev : next));
    };
    void read();
    // A sound card plugged in while the sheet is open shows up by itself.
    const id = setInterval(read, 2000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [on]);
  return list;
}

export function DjLiveSheet({ visible, onClose, room, onMic, onDone }: { visible: boolean; onClose: () => void; room: string; onMic: boolean; onDone?: (text: string) => void }) {
  const dj = useDjState();
  const [info, setInfo] = useState<DjLiveInfo | null>(null);
  const [busy, setBusy] = useState(false);
  // Nothing picked: a plugged-in sound card is the pick by itself (then the phone's choice).
  const [picked, setPick] = useState<string | null>(null);
  const inputs = useInputs(visible);
  const choices = useMemo(() => [AUTO, ...inputs], [inputs]);
  const external = inputs.find((c) => c.external);
  const pick = picked !== null && choices.some((c) => c.key === picked) ? picked : (external?.key ?? 'auto');
  const chosen = choices.find((c) => c.key === pick) ?? AUTO;

  useEffect(() => {
    if (!visible) return;
    let live = true;
    djLiveGet(room)
      .then((x) => live && setInfo(x))
      .catch(() => live && setInfo(null));
    return () => {
      live = false;
    };
  }, [visible, room, dj.on]);

  const modeOf = (c: DjChoice, kbps: number) => ({ kbps, ...(c.nativeInput !== undefined ? { nativeInput: c.nativeInput } : {}), ...(c.deviceId ? { deviceId: c.deviceId } : {}) });
  const start = async () => {
    if (busy) return;
    if (!onMic) return showAlert('Önce mikrofona çık', 'DJ modu mikrofondaki sesi müzik kalitesinde gönderir. Bir mikrofona otur, sonra aç.');
    setBusy(true);
    try {
      const r = await djLiveSet(room, true);
      setDjMode(modeOf(chosen, r.kbps));
      // The engine starts it only while I am on a mic in the room (I may have left it meanwhile): else off again.
      if (!djState().on) {
        djLiveSet(room, false).catch(() => {});
        return showAlert('DJ modu açılmadı', 'Mikrofondan inmişsin ya da ses bağlantısı kopmuş. Mikrofona çıkıp yeniden dene.');
      }
      onDone?.('🎧 DJ modu açık: mikserden canlı yayındasın');
    } catch (e) {
      showAlert('DJ modu açılmadı', message(e));
    } finally {
      setBusy(false);
    }
  };
  const stop = () => {
    setDjMode(null);
    // The engine already cleared my attribute; the server's answer changes nothing here.
    djLiveSet(room, false).catch(() => {});
    onDone?.('DJ modu kapandı');
  };
  const choose = (c: DjChoice) => {
    setPick(c.key);
    // While live the engine moves to it at once (a new mic track); otherwise it is used when DJ modu starts.
    if (dj.on) setDjMode(modeOf(c, dj.kbps));
  };

  const others = (info?.live ?? []).filter((p) => p.id !== myServerId());
  const full = !dj.on && !!info && others.length >= info.perRoom;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="DJ modu"
      art={ROOM_ICON_ART.music}
      foot={
        dj.on ? (
          <Pressable style={s.stop} onPress={stop} accessibilityRole="button">
            <Ionicons name="stop-circle" size={18} color="#fff" />
            <Text style={s.stopText}>Canlı yayını durdur</Text>
          </Pressable>
        ) : info?.may ? (
          <GradientButton title={busy ? 'Açılıyor…' : 'Mikserden canlı yayını başlat'} icon="radio" onPress={start} />
        ) : null
      }
    >
      <View style={[s.status, dj.on && s.statusOn]}>
        <Ionicons name={dj.on ? 'radio' : 'headset'} size={18} color={dj.on ? semantic.live : colors.textDim} />
        <Text style={s.statusText}>{dj.on ? `Canlı yayındasın · ${dj.kbps} kbps müzik kalitesi` : 'Kapalı'}</Text>
      </View>
      {!dj.on && dj.stopped && <Text style={[s.dim, { color: colors.gold }]}>{DJ_STOP_TEXT[dj.stopped]}</Text>}
      {info && !info.may && !dj.on && (
        <Text style={[s.dim, { color: colors.gold }]}>{info.kbps <= 0 ? 'DJ modu şu an yönetim tarafından kapalı.' : 'DJ modunu oda sahibi ve odanın DJ’leri açar.'}</Text>
      )}
      {!!others.length && !dj.on && (
        <Text style={s.dim}>
          Şu an canlı: {others.map((p) => p.name).join(', ')}
          {full ? ` · Odada aynı anda ${info?.perRoom} DJ yayın yapabilir; biri kapatınca açabilirsin.` : ''}
        </Text>
      )}
      <Text style={s.dim}>
        Mikser ya da DJ kontrolcüsünden çıkan miks mikrofonundan odaya canlı gider. Gürültü engelleme, yankı giderme ve otomatik ses ayarı kapanır; ses daha yüksek kalitede gönderilir.
      </Text>

      <Text style={s.label}>Ses girişi</Text>
      {Platform.OS === 'ios' ? (
        <Text style={s.dim}>iPhone girişi kendisi seçer: ses kartını taktığında onu kullanır.</Text>
      ) : (
        choices.map((c) => (
          <Pressable key={c.key} style={[s.choice, pick === c.key && s.choiceOn]} onPress={() => choose(c)} accessibilityRole="radio" accessibilityState={{ selected: pick === c.key }}>
            <Ionicons name={pick === c.key ? 'radio-button-on' : 'radio-button-off'} size={18} color={pick === c.key ? colors.primary : colors.textDim} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff' }}>{c.label}</Text>
              {!!c.sub && <Text style={[s.dim, c.warn && { color: colors.gold }]}>{c.sub}</Text>}
            </View>
            {c.external && <Text style={s.tag}>Harici</Text>}
          </Pressable>
        ))
      )}
      {Platform.OS === 'android' && !djInputAvailable() && <Text style={s.dim}>Bu sürümde giriş seçilemiyor; uygulamayı güncelle. Telefon takılı ses kartını kendisi seçer.</Text>}
      {Platform.OS !== 'ios' && !external && <Text style={s.dim}>Harici ses girişi bulunamadı. Ses kartını ya da mikserin USB kablosunu (OTG ile) tak; burada kendiliğinden görünür.</Text>}

      <Text style={s.label}>Bağlamadan önce</Text>
      <Text style={s.dim}>• Mikseri telefona USB-OTG ses kartıyla ya da USB ses çıkışı olan bir kontrolcüyle bağla. Kabloyla bağlıyorsan mikserin çıkışını telefonun mikrofon girişine ver.</Text>
      <Text style={s.dim}>• Odayı kulaklıkla dinle: telefonun hoparlöründen çıkan ses yayına karışır.</Text>
      <Text style={s.dim}>• Odanın çalma listesi çalıyorsa durdur; yoksa iki müzik üst üste çalar.</Text>
      <Text style={s.dim}>• Mikrofondan inersen ya da odadan çıkarsan DJ modu kendiliğinden kapanır.</Text>
      <Text style={s.dim}>• Yalnızca yayınlama hakkın olan müziği çal.</Text>
    </Sheet>
  );
}

/** Every phone in the room: who is live as DJ now (people the room lets), tap to open the sheet if I may. */
export function DjLiveBar({ names, me, onOpen }: { names: string[]; me: boolean; onOpen?: () => void }) {
  if (!names.length && !me) return null;
  const text = me ? (names.length ? `Canlı DJ: sen, ${names.join(', ')}` : 'Canlı DJ yayınındasın') : `Canlı DJ: ${names.join(', ')}`;
  return (
    <Pressable style={s.bar} onPress={onOpen} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : 'text'} accessibilityLabel={text}>
      <Text style={{ fontSize: 15 }}>🎧</Text>
      <View style={s.dot} />
      <Text style={s.barText} numberOfLines={1}>
        {text}
      </Text>
      {onOpen && <Ionicons name="chevron-forward" size={14} color="#fff" />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  label: { color: colors.textDim, fontWeight: '700', fontSize: 13, marginTop: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  statusOn: { backgroundColor: 'rgba(34,197,94,0.15)' },
  statusText: { color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 10, borderWidth: 1.5, borderColor: 'transparent' },
  choiceOn: { borderColor: colors.primary },
  tag: { color: '#fff', fontSize: 11, fontWeight: '700', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  stop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#DC2626', borderRadius: 999, paddingVertical: 13 },
  stopText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, marginTop: 4, backgroundColor: 'rgba(124,58,237,0.55)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E' },
  barText: { color: '#fff', fontSize: 12, fontWeight: '700', flex: 1 },
});
