// Gelir's "Ajans komisyonu" (owners, 26 Nov 2026): an agency's owner (or a team member allowed to ask for payouts)
// sees the agency's withdrawable commission here, as a streamer sees her own diamonds, and asks for the payout here;
// the agency office no longer has a Kazanç tab. The server is the same (GET /api/agency/payouts, POST …/request).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/text';
import { Button, Card } from '@/components/ui';
import { agencyNet, fmtD, fmtDate, fmtUsd, runAction, usdOf, type Me } from '@/lib/agency-net';
import { liveMode } from '@/lib/live';
import { makeStyles, useTheme } from '@/theme';

type Payouts = Awaited<ReturnType<typeof agencyNet.payouts>>;

/** The agency whose payouts I may ask for: one I own, else one whose team gave me the right (approved or suspended). */
export function payoutAgencyOf(me: Me | null) {
  if (!me) return null;
  const ok = (a: Me['agencies'][number]) => (a.status === 'approved' || a.status === 'suspended') && (a.viewer === 'owner' || (a.viewer === 'staff' && a.perms.includes('payouts.request')));
  return me.agencies.find((a) => a.viewer === 'owner' && ok(a)) ?? me.agencies.find(ok) ?? null;
}

export function AgencyPayoutCard() {
  const s = useStyles();
  const { colors } = useTheme();
  const [agency, setAgency] = useState<{ id: string; name: string; status: string } | null>(null);
  const [d, setD] = useState<Payouts | null>(null);
  const [currency, setCurrency] = useState('');
  const load = (id: string) =>
    agencyNet
      .payouts(id)
      .then(setD)
      .catch(() => {});
  useEffect(() => {
    if (!liveMode()) return;
    let alive = true;
    agencyNet
      .me()
      .then((m) => {
        const a = payoutAgencyOf(m);
        if (!alive || !a) return;
        setAgency({ id: a.id, name: a.name, status: a.status });
        void load(a.id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!agency || !d) return null;
  const cur = currency || d.policy.currencies[0] || 'USD';
  const enough = d.balances.available >= d.policy.min_diamonds;
  const open = d.payouts.filter((p) => p.status === 'pending' || p.status === 'approved').slice(0, 3);
  return (
    <Card style={{ gap: 10 }}>
      <View style={s.head}>
        <Ionicons name="business" size={18} color={colors.primaryText} />
        <Text style={s.title} numberOfLines={1}>
          Ajans komisyonu · {agency.name}
        </Text>
      </View>
      <View>
        <Text style={s.big}>{fmtD(d.balances.available)} 💎</Text>
        <Text style={s.dim}>çekilebilir · {fmtUsd(usdOf(d.balances.available))}{d.balances.calculating > 0 ? ` · hesaplanıyor ${fmtD(d.balances.calculating)}` : ''}</Text>
      </View>
      {d.policy.currencies.length > 1 && (
        <View style={s.chips}>
          {d.policy.currencies.map((x) => (
            <Pressable key={x} onPress={() => setCurrency(x)} style={[s.chip, cur === x && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: cur === x }}>
              <Text style={[s.chipText, cur === x && s.chipTextOn]}>{x}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <Button
        title="Ödeme talep et"
        variant="money"
        icon="cash-outline"
        disabled={!enough || agency.status !== 'approved'}
        onPress={() => runAction(false, () => agencyNet.requestPayout(agency.id, cur), 'Ödeme talebin alındı. Merkez onayından sonra ödenir.', () => void load(agency.id))}
      />
      <Text style={s.dim}>En az {fmtD(d.policy.min_diamonds)} elmas ({fmtUsd(usdOf(d.policy.min_diamonds))}). Haftalık kazanılmış, henüz ödenmemiş komisyonun tamamı istenir.</Text>
      {open.map((p) => (
        <Text key={p.id} style={s.dim}>
          {fmtDate(p.requestedAt)} · {fmtD(p.amount)} elmas · {p.statusLabel}
        </Text>
      ))}
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontWeight: '800', fontSize: 15, flex: 1 },
  big: { color: colors.text, fontWeight: '900', fontSize: 24 },
  dim: { color: colors.textDim, fontSize: 12.5, lineHeight: 17 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.cardAlt },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  chipTextOn: { color: '#fff' },
}));
