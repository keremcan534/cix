// Mesajlar: what a free conversation start in my name is, told once to a man before the first one goes
// (docs/OTOMATIK_MESAJ.md §6.2, the owners' choice: on from the start, closable). Until this app says it was shown
// (autoOpenerSeen), the server sends none in his name: an older APK, which can't show it, never sends any.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { showAlert } from '@/lib/alert';
import { message } from '@/lib/live';
import { setAutoChoice, useAutoMe } from '@/lib/live/auto-chat';
import { makeStyles, useTheme } from '@/theme';

export function OpenerNotice() {
  const a = useAutoMe();
  const { colors } = useTheme();
  const s = useStyles();
  const [busy, setBusy] = useState(false);
  const o = a?.opener;
  if (!o || o.seen || !o.on) return null;
  const answer = async (keep: boolean) => {
    setBusy(true);
    try {
      if (!keep) await setAutoChoice('autoOpener', false);
      await setAutoChoice('autoOpenerSeen', true);
    } catch (e) {
      showAlert('Kaydedilemedi', message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.card} accessibilityRole="summary">
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Ionicons name="sparkles" size={20} color={colors.gold} />
        <Text style={s.title}>Sohbet başlatmana yardım edelim</Text>
      </View>
      <Text style={s.text}>
        SimilarClub senin adına günde en çok {o.total} ücretsiz sohbet başlangıcı (“Merhaba, nasılsın?” gibi) gönderebilir. Mesaj karşı tarafta otomatik olarak işaretlenir ve senden jeton
        düşmez. Sonraki mesajların her zamanki gibidir. İstediğin zaman Mesaj tercihlerinden kapatabilirsin.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Anladım, açık kalsın" small disabled={busy} onPress={() => void answer(true)} style={{ flex: 1 }} />
        <Button title="İstemiyorum" small variant="ghost" disabled={busy} onPress={() => void answer(false)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { marginHorizontal: 16, marginTop: 8, padding: 14, gap: 10, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: 'rgba(246,189,96,0.4)' },
  title: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1 },
  text: { color: colors.textDim, fontSize: 13, lineHeight: 19 },
}));
