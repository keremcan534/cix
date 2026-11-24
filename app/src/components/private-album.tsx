// Özel albüm on a profile (owners, 24 Nov 2026; server/api/private-album.mjs): an approved agency streamer's photos
// others open with coins. On my own profile: my photos to add and take out, and what opening it costs. On someone
// else's: how many photos it holds and its price, a button that opens it (coins become their diamonds, as a gift's),
// then the photos, for good. Live mode only; nothing shows when there is nothing to show (lib/private-album-core).
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CardHead, PCard } from '@/components/profile-design';
import { PhotoViewer } from '@/components/photo-viewer';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import * as api from '@/lib/api';
import { errorHaptic, successHaptic } from '@/lib/haptics';
import { liveUnlockPrivateAlbum, message } from '@/lib/live';
import { addPrivatePhoto, loadPrivateAlbum, removePrivatePhoto } from '@/lib/live/private-album';
import { albumShow, parseAlbum, unlockLabel, type PrivateAlbum } from '@/lib/private-album-core';
import { glass } from '@/theme';

const fmt = (n: number) => n.toLocaleString('tr-TR');
/** How many locked tiles stand for a locked album's photos. */
const LOCKED_TILES = 4;

export function PrivateAlbumCard({ serverId, ownerName }: { serverId: string; ownerName: string }) {
  const [album, setAlbum] = useState<PrivateAlbum | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const reload = useCallback(() => {
    loadPrivateAlbum(serverId).then(setAlbum, () => {});
  }, [serverId]);
  useEffect(() => {
    let on = true;
    loadPrivateAlbum(serverId).then(
      (a) => on && setAlbum(a),
      () => {},
    );
    return () => {
      on = false;
    };
  }, [serverId]);

  const show = albumShow(album);
  if (!album || show === 'none') return null;

  const unlock = async () => {
    setBusy(true);
    try {
      const r = await liveUnlockPrivateAlbum(serverId, album.price);
      const a = parseAlbum(r.album);
      if (a) setAlbum(a);
      successHaptic();
    } catch (e) {
      errorHaptic();
      const code = e instanceof api.ApiError ? e.data.code : undefined;
      if (code === 'insufficient')
        return showAlert('Jetonun yetmiyor', `Bu özel albümü açmak için ${fmt(album.price)} jeton gerekli.`, [
          { text: 'Vazgeç', style: 'cancel' },
          { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
        ]);
      // The album or its price changed meanwhile: read it again, so the button shows what is true now.
      if (code === 'price_changed' || code === 'already' || code === 'empty' || code === 'unavailable' || code === 'closed') reload();
      showAlert('Özel albüm açılamadı', message(e));
    } finally {
      setBusy(false);
    }
  };
  const askUnlock = () =>
    showAlert('Özel albümü aç', `${fmt(album.price)} jeton harcanır; ${ownerName} bunu hediye gibi elmas olarak alır. Albümü, sonradan eklenenler dahil, hep görürsün.`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: unlockLabel(album.price), onPress: () => void unlock() },
    ]);

  const add = async () => {
    if (busy) return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (res.canceled || !res.assets[0]) return;
    setBusy(true);
    try {
      setAlbum(await addPrivatePhoto(res.assets[0]));
      successHaptic();
    } catch (e) {
      errorHaptic();
      showAlert('Fotoğraf eklenemedi', message(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = (id: number) =>
    showAlert('Fotoğraf kaldırılsın mı?', 'Özel albümünden kalkar; açmış olanlar da artık görmez.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          removePrivatePhoto(id)
            .then(setAlbum, (e) => showAlert('Kaldırılamadı', message(e)))
            .finally(() => setBusy(false));
        },
      },
    ]);

  const sub =
    show === 'mine'
      ? album.on
        ? album.can
          ? `Profiline bakanlar ${fmt(album.price)} jetonla açar; jeton hediye gibi elmas olarak sana geçer.`
          : 'Özel albüm ajanstaki onaylı yayıncılar içindir; eklediklerin duruyor.'
        : 'Özel albüm şu an kapalı; açmış olanlar görmeye devam eder.'
      : show === 'locked'
        ? `${fmt(album.count)} fotoğraf · ${fmt(album.price)} jeton`
        : `${fmt(album.photos.length)} fotoğraf · açtın`;

  return (
    <PCard style={{ gap: 12 }}>
      <CardHead icon={show === 'locked' ? 'lock-closed' : 'sparkles'} tone="pink" small title={show === 'mine' ? `Özel albüm · ${album.count}/${album.max}` : 'Özel albüm'} sub={sub} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 14 }}>
        {show === 'mine' && album.can && album.count < album.max && (
          <Pressable style={[s.photo, s.add]} onPress={() => void add()} disabled={busy} accessibilityRole="button" accessibilityLabel="Özel albüme fotoğraf ekle" accessibilityState={{ busy }}>
            <Ionicons name={busy ? 'hourglass-outline' : 'add'} size={30} color={glass.deep} />
            <Text style={s.addText}>{busy ? 'Yükleniyor…' : 'Fotoğraf Ekle'}</Text>
          </Pressable>
        )}
        {show === 'locked'
          ? Array.from({ length: Math.min(album.count, LOCKED_TILES) }, (_, i) => (
              <LinearGradient key={i} colors={['#5A1446', '#2A0B24']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.photo, s.locked]}>
                <Ionicons name="lock-closed" size={26} color="#FFC1E3" />
                {i === LOCKED_TILES - 1 && album.count > LOCKED_TILES && <Text style={s.more}>+{album.count - LOCKED_TILES + 1}</Text>}
              </LinearGradient>
            ))
          : album.photos.map((p) => (
              <View key={p.id}>
                <Pressable onPress={() => setViewing(p.url)} accessibilityRole="imagebutton" accessibilityLabel="Fotoğrafı büyüt">
                  <Image source={{ uri: p.url }} style={s.photo} />
                </Pressable>
                {show === 'mine' && (
                  <Pressable style={s.remove} hitSlop={11} onPress={() => remove(p.id)} disabled={busy} accessibilityRole="button" accessibilityLabel="Fotoğrafı kaldır">
                    <Ionicons name="close" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
            ))}
      </ScrollView>
      {show === 'mine' && album.count === 0 && <Text style={s.meta}>Henüz fotoğraf eklenmedi.</Text>}
      {show === 'locked' && <Button title={busy ? 'Açılıyor…' : `🔒 ${unlockLabel(album.price)}`} disabled={busy} onPress={askUnlock} />}
      <PhotoViewer uri={viewing} onClose={() => setViewing(null)} />
    </PCard>
  );
}

const s = StyleSheet.create({
  photo: { width: 104, height: 104, borderRadius: 16 },
  add: { backgroundColor: glass.white, borderWidth: 1.5, borderStyle: 'dashed', borderColor: glass.line, alignItems: 'center', justifyContent: 'center', gap: 2 },
  addText: { color: glass.plum, fontSize: 13 },
  locked: { alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden' },
  more: { color: '#FFE3F2', fontSize: 14, fontWeight: '800' },
  remove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(22,14,18,0.75)', alignItems: 'center', justifyContent: 'center' },
  meta: { color: glass.plum, fontSize: 13 },
});
