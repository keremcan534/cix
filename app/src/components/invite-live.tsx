// Arkadaşını Getir in a live build (app/davet.tsx): what my invites brought, and the friend's code I can still enter
// (or the one I entered and where its reward stands). The server decides and pays (server/api/referrals.mjs).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { View } from 'react-native';

import { Icon3D } from '@/components/Icon3D';
import { Text, TextInput } from '@/components/text';
import { Button, Card } from '@/components/ui';
import type { InviteStats, MyInvite } from '@/lib/api';
import { cleanInviteCode, myInviteText } from '@/lib/invite-view';
import { message } from '@/lib/live';
import { fmtIstanbul } from '@/lib/live-settings-format';
import { enterInviteCode } from '@/lib/live/rewards';
import { makeStyles, useTheme } from '@/theme';

const n = (x: number) => x.toLocaleString('tr-TR');

/** How many entered my code, how many were rewarded or still wait, and the coins invites brought me. */
export function InviteStatsCard({ stats }: { stats: InviteStats }) {
  const { colors } = useTheme();
  const s = useStyles();
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="people-outline" size={20} color={colors.primaryText} />
        <Text style={s.title}>Davetlerin</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Stat value={stats.invited} label="Katılan" />
        <Stat value={stats.rewarded} label="Ödül alan" />
        <Stat value={stats.waiting} label="Bekleyen" />
      </View>
      <View style={s.earned} accessible accessibilityLabel={`Davetlerden kazandığın: ${n(stats.earned)} jeton`}>
        <Icon3D name="coin" size={26} />
        <Text style={s.earnedText}>Davetlerden kazandığın</Text>
        <Text style={s.earnedN}>{n(stats.earned)}</Text>
      </View>
      {stats.waiting > 0 && <Text style={s.dim}>Bekleyen arkadaşların ilk odasına girdiğinde ödül ikinize de gelir.</Text>}
    </Card>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  const s = useStyles();
  return (
    <View style={s.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={s.statN}>{n(value)}</Text>
      <Text style={s.dim}>{label}</Text>
    </View>
  );
}

/**
 * A friend's code: the field while I may still enter one (the first days after sign-up), else who invited me and
 * where the reward stands. Nothing when neither applies.
 */
export function InviteCodeCard({ mine, coins }: { mine: MyInvite; coins: number }) {
  const { colors } = useTheme();
  const s = useStyles();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mine.status) {
    return (
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name={mine.status === 'paid' ? 'checkmark-circle' : 'mail-open-outline'} size={20} color={colors.primaryText} />
          <Text style={s.title}>{mine.by ? `Seni ${mine.by.name} davet etti` : 'Davet kodu girdin'}</Text>
        </View>
        <Text style={s.body}>{myInviteText(mine, coins)}</Text>
      </Card>
    );
  }
  if (!mine.canEnter) return null;

  const code = cleanInviteCode(text);
  const submit = async () => {
    if (busy) return;
    if (!code) return setError('Davet kodu SIMI-AB23CD gibi 6 harf ve rakamdan oluşur.');
    setBusy(true);
    setError(null);
    try {
      await enterInviteCode(code);
      setText('');
    } catch (e) {
      // The server's own words: unknown code, too late, another account on this phone…
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="ticket-outline" size={20} color={colors.primaryText} />
        <Text style={s.title}>Davet kodun var mı?</Text>
      </View>
      <Text style={s.dim}>Seni davet eden arkadaşının kodunu gir; ilk odana girdiğinde ikinize de {n(coins)} jeton gelir. Son gün: {fmtIstanbul(mine.enterUntil)}.</Text>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t.toUpperCase());
            setError(null);
          }}
          placeholder="SIMI-AB23CD"
          placeholderTextColor={colors.textDim}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={14}
          style={s.input}
          accessibilityLabel="Davet kodu"
          onSubmitEditing={submit}
        />
        <Button title={busy ? 'Bekle…' : 'Gir'} variant="tonal" small disabled={busy || !text.trim()} onPress={submit} />
      </View>
      {error && (
        <Text style={s.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
    </Card>
  );
}

const useStyles = makeStyles(({ colors, semantic, lift }) => ({
  title: { color: colors.text, fontWeight: '800', fontSize: 17 },
  body: { color: colors.text, fontSize: 14, lineHeight: 20 },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.cardAlt },
  statN: { color: colors.text, fontWeight: '800', fontSize: 20 },
  earned: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: colors.cardAlt },
  earnedText: { color: colors.text, fontSize: 14, flex: 1 },
  earnedN: { color: semantic.moneyText, fontWeight: '800', fontSize: 18 },
  input: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: 12, color: colors.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.5, paddingHorizontal: 14, paddingVertical: 10, ...lift },
  error: { color: colors.red, fontSize: 13 },
}));
