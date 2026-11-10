// Yönetim › Şikâyetler, a reported room's own pictures: the background its owner uploaded (Oda Süslemesi › Özel) and
// its uploaded cover (Oda Kapağı), read when the card asks for them. Each can be taken down for breaking the rules:
// the file is deleted and the action is logged with the report's reason. A background's paid term ends with it and
// nothing is refunded (the purchase text says so). Nothing checks a picture automatically: this is where it happens.
import { useState } from 'react';
import { Image, View } from 'react-native';

import { Button } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { fmtDate } from '@/lib/admin-format';
import { message } from '@/lib/live';
import * as admin from '@/lib/live/admin';

import { Line, confirmThen, useAdmin } from './parts';

export function RoomPictures({ roomId, reason }: { roomId: string; reason: string }) {
  const ctx = useAdmin();
  const [pics, setPics] = useState<admin.RoomPictures | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => {
    setBusy(true);
    admin
      .roomPictures(roomId)
      .then(setPics, (e: unknown) => showAlert('Oda görselleri okunamadı', message(e)))
      .finally(() => setBusy(false));
  };
  if (!pics) return <Button title="Oda görsellerini göster" icon="image-outline" variant="tonal" small disabled={busy} onPress={load} />;
  // The server keeps a reason of 3–300 characters with the action.
  const why = (reason.trim().length >= 3 ? reason.trim() : 'Kural ihlali').slice(0, 300);
  return (
    <View style={{ gap: 8, width: '100%' }}>
      <Line label="Oda sahibi" value={pics.owner.name} onPress={() => ctx.openAccount(pics.owner.id, pics.owner.name)} />
      {!pics.url && !pics.coverUrl && <Line label="Görseller" value="Bu odanın yüklenmiş süslemesi ya da kapağı yok" />}
      {pics.url && (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Image source={{ uri: pics.url }} style={{ width: 81, height: 144, borderRadius: 10 }} accessibilityLabel="Odanın özel süslemesi" />
          <View style={{ flex: 1, gap: 8 }}>
            <Line label="Özel süsleme" value={`${pics.shown ? 'Odada görünüyor' : 'Yüklü, odada görünmüyor'}${pics.until ? ` · ${fmtDate(pics.until)} tarihine kadar` : ''}`} />
            <Button
              title="Süslemeyi kaldır"
              icon="trash-outline"
              variant="danger"
              small
              disabled={busy}
              onPress={() =>
                confirmThen(
                  ctx,
                  { title: 'Süslemeyi kaldır', message: 'Görsel silinir, oda ücretsiz süslemesine döner ve oda sahibinin süresi biter. Jeton iadesi yapılmaz.', confirm: 'Kaldır', destructive: true },
                  () => admin.removeRoomBackground(roomId, why),
                  () => 'Özel süsleme kaldırıldı',
                  () => setPics({ ...pics, url: null, until: null, shown: false }),
                  setBusy,
                )
              }
            />
          </View>
        </View>
      )}
      {pics.coverUrl && (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Image source={{ uri: pics.coverUrl }} style={{ width: 81, height: 81, borderRadius: 10 }} accessibilityLabel="Odanın kapağı" />
          <View style={{ flex: 1, gap: 8 }}>
            <Line label="Oda kapağı" value="Listelerde görünüyor" />
            <Button
              title="Kapağı kaldır"
              icon="trash-outline"
              variant="danger"
              small
              disabled={busy}
              onPress={() =>
                confirmThen(
                  ctx,
                  { title: 'Kapağı kaldır', message: 'Kapak silinir; listelerde odanın önceki resmi görünür. Oda sahibi yeni bir kapak yükleyebilir.', confirm: 'Kaldır', destructive: true },
                  () => admin.removeRoomCover(roomId, why),
                  () => 'Oda kapağı kaldırıldı',
                  () => setPics({ ...pics, coverUrl: null }),
                  setBusy,
                )
              }
            />
          </View>
        </View>
      )}
    </View>
  );
}
