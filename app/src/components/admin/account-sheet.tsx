// Yönetim › one account (from a withdrawal, a report or a purchase): balances, recent purchases and money
// movements from the server's audit view (GET /api/admin/wallet/audit), so the owner can check where diamonds
// came from before paying them out. Suspending the account is one tap away.
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { BAN_OPTIONS, PLATFORM_LABEL, banPhrase, fmtDate, fmtNum, purchaseCoins } from '@/lib/admin-format';
import * as admin from '@/lib/live/admin';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { Overlay, confirmThen, useAdmin, useLoad } from './parts';

const UNIT: Record<string, string> = { coin: 'jeton', diamond: 'elmas', game: 'oyun jetonu' };

export function AccountSheet({ id, name, onClose }: { id: string; name: string; onClose: () => void }) {
  const ctx = useAdmin();
  const { colors, semantic } = useTheme();
  const s = useStyles();
  const load = useLoad(() => admin.walletAudit(id), [id]);
  const d = load.data;

  const suspend = () =>
    ctx.ask({
      kind: 'choice',
      title: `${name} askıya alınsın`,
      message: 'Ne kadar süre? Süre bitince hesap kendiliğinden açılır.',
      options: BAN_OPTIONS.map((o) => ({ value: o.days, label: o.label })),
      confirm: 'Devam',
      destructive: true,
      onSubmit: (days) =>
        confirmThen(
          ctx,
          { title: 'Askıya al', message: `${name} ${banPhrase(days, true)} ve süre bitene kadar uygulamayı kullanamaz.`, confirm: 'Askıya al', destructive: true },
          () => admin.ban(id, days),
          () => `${name} ${banPhrase(days)}`,
        ),
    });
  const lift = () =>
    confirmThen(
      ctx,
      { title: 'Askıyı kaldır', message: `${name} askıdaysa hemen yeniden giriş yapabilir.`, confirm: 'Kaldır' },
      () => admin.ban(id, null),
      () => `${name} için askı kaldırıldı`,
    );

  return (
    <Overlay onClose={onClose} label={`${name} hesabı`}>
      <ScrollView contentContainerStyle={{ gap: space.lg }}>
        <View style={{ gap: 2 }}>
          <Text style={s.title}>{name}</Text>
          <Text style={s.dim}>Hesap kimliği · {id}</Text>
        </View>
        {load.loading ? (
          <ActivityIndicator color={colors.primaryText} style={{ paddingVertical: space.xl }} />
        ) : !d ? (
          <View style={{ gap: space.sm, alignItems: 'flex-start' }}>
            <Text style={s.dim}>Hesap bilgisi yüklenemedi{load.error ? `: ${load.error}` : ''}</Text>
            <Button title="Tekrar dene" variant="tonal" small onPress={load.reload} />
          </View>
        ) : (
          <>
            <View style={s.grid}>
              <Stat label="Jeton" value={fmtNum(d.user.coins)} color={semantic.moneyText} />
              <Stat label="Elmas" value={fmtNum(d.user.diamonds)} color={semantic.diamondText} />
              <Stat label="Çekilebilir elmas" value={fmtNum(d.user.withdrawable)} />
              <Stat label="Kilitli elmas" value={fmtNum(d.user.locked)} />
            </View>
            <Text style={s.dim}>Hesap açılışı {fmtDate(d.user.createdAt)}</Text>

            <View style={{ gap: space.sm }}>
              <Text style={s.label}>SON SATIN ALMALAR</Text>
              {d.purchases.length === 0 ? (
                <Text style={s.dim}>Satın alma yok.</Text>
              ) : (
                d.purchases.slice(0, 5).map((p) => (
                  <Row key={p.id} left={purchaseCoins(p.coins, p.bonus)} sub={`${PLATFORM_LABEL[p.platform] ?? p.platform} · ${fmtDate(p.created_at)}`} right={p.status === 'refunded' ? 'İade edildi' : ''} />
                ))
              )}
            </View>

            <View style={{ gap: space.sm }}>
              <Text style={s.label}>SON HAREKETLER</Text>
              {d.ledger.length === 0 ? (
                <Text style={s.dim}>Hareket yok.</Text>
              ) : (
                d.ledger.slice(0, 12).map((l) => (
                  <Row
                    key={l.id}
                    left={l.reason}
                    sub={fmtDate(l.created_at)}
                    right={`${l.amount > 0 ? '+' : ''}${fmtNum(l.amount)} ${UNIT[l.currency] ?? l.currency}`}
                    tone={l.amount > 0 ? semantic.successText : colors.text}
                  />
                ))
              )}
            </View>
          </>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Button title="Askıya al" icon="ban-outline" variant="danger" small onPress={suspend} />
          <Button title="Askıyı kaldır" icon="lock-open-outline" variant="ghost" small onPress={lift} />
          <Button title="Kapat" variant="ghost" small onPress={onClose} style={{ marginLeft: 'auto' }} />
        </View>
      </ScrollView>
    </Overlay>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const s = useStyles();
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ left, sub, right, tone }: { left: string; sub: string; right: string; tone?: string }) {
  const s = useStyles();
  return (
    <View style={s.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle} numberOfLines={2}>
          {left}
        </Text>
        <Text style={s.rowSub}>{sub}</Text>
      </View>
      {!!right && <Text style={[s.rowRight, tone ? { color: tone } : null]}>{right}</Text>}
    </View>
  );
}

const useStyles = makeStyles(({ colors, surface }) => ({
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  label: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: space.md, gap: 2 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.textDim, fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surface.hairline },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  rowSub: { color: colors.textDim, fontSize: 12 },
  rowRight: { color: colors.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
}));
