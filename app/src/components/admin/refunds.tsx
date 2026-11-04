// Yönetim › İadeler: after the store refunded a purchase (or a chargeback), its coins still unspent and the
// diamonds they became that are still locked are taken back, and the agency commission is reversed. Google Play
// refunds are also found on their own (refunds.mjs); "Şimdi kontrol et" runs that round at once.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Button } from '@/components/ui';
import { PLATFORM_LABEL, ago, fmtDate, fmtTl, purchaseCoins, refundResult, voidedResult } from '@/lib/admin-format';
import { copyText } from '@/lib/clipboard';
import * as admin from '@/lib/live/admin';
import { makeStyles, radius, space, useTheme } from '@/theme';

import { ItemCard, Line, LoadState, SectionScroll, StatusPill, confirmThen, useAdmin, useLoad } from './parts';

export function RefundsSection() {
  const ctx = useAdmin();
  const { colors } = useTheme();
  const s = useStyles();
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const load = useLoad(() => admin.purchases(search), [search]);
  const google = load.data?.googleSync;

  const syncNow = () =>
    confirmThen(
      ctx,
      {
        title: 'Google iadelerini kontrol et',
        message: 'Google Play’de son 30 günde iade edilen alımlar okunur. Bulunanların jetonları ve kilitli elmasları hemen geri alınır.',
        confirm: 'Kontrol et',
      },
      admin.syncGoogleRefunds,
      voidedResult,
      load.reload,
      setSyncing,
    );

  return (
    <SectionScroll load={load}>
      <View style={s.searchCard}>
        <Text style={s.searchTitle}>Satın alma bul</Text>
        <View style={s.searchRow}>
          <View style={s.inputWrap}>
            <Ionicons name="search" size={16} color={colors.textDim} />
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={() => setSearch(draft)}
              placeholder="Sipariş no (GPA…), alım no veya hesap kimliği"
              placeholderTextColor={colors.textDim}
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Satın alma ara"
            />
            {!!draft && (
              <Pressable
                onPress={() => {
                  setDraft('');
                  setSearch('');
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Aramayı temizle"
              >
                <Ionicons name="close-circle" size={18} color={colors.textDim} />
              </Pressable>
            )}
          </View>
          <Button title="Bul" variant="tonal" small onPress={() => setSearch(draft)} />
        </View>
        <Text style={s.hint}>Mağaza iadeyi yaptıktan sonra kullan. Sipariş numarası Play Console’daki sipariş ayrıntısında yazar.</Text>
      </View>

      {google && (
        <View style={s.googleCard}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.googleTitle}>Google Play iadeleri</Text>
            <Text style={s.hint}>
              {!google.enabled
                ? 'Google Play bağlantısı ayarlanmamış; iadeleri burada elle yapabilirsin.'
                : google.lastError
                  ? `Son kontrolde sorun oldu: ${google.lastError}`
                  : google.lastOkAt
                    ? `Kendiliğinden kontrol ediliyor · son kontrol ${ago(google.lastOkAt)}`
                    : 'Kendiliğinden kontrol ediliyor · henüz kontrol edilmedi'}
            </Text>
          </View>
          <Button title={syncing ? 'Kontrol ediliyor…' : 'Şimdi kontrol et'} icon="refresh-outline" variant="ghost" small onPress={syncNow} disabled={syncing || !google.enabled} />
        </View>
      )}

      <LoadState
        load={load}
        empty={(d) => (d.purchases.length ? null : search ? { icon: 'search-outline', title: 'Bu aramayla alım bulunamadı', text: 'Numarayı kontrol edip yeniden dene.' } : { icon: 'receipt-outline', title: 'Henüz satın alma yok' })}
      >
        {(d) => (
          <>
            {!search && <Text style={s.listLabel}>SON SATIN ALMALAR</Text>}
            {d.purchases.map((p) => (
              <PurchaseCard key={p.id} p={p} onDone={load.reload} />
            ))}
          </>
        )}
      </LoadState>
    </SectionScroll>
  );
}

function PurchaseCard({ p, onDone }: { p: admin.AdminPurchase; onDone: () => void }) {
  const ctx = useAdmin();
  const [busy, setBusy] = useState(false);
  const refunded = p.status === 'refunded';
  const refund = () =>
    confirmThen(
      ctx,
      {
        title: 'İade et',
        message: `${p.user.name} · ${purchaseCoins(p.coins, p.bonus)}${p.priceTl ? ` · ${fmtTl(p.priceTl)}` : ''}\n\nHarcanmamış jetonlar ve bunlardan gelen, kilidi açılmamış elmaslar geri alınır; ajans komisyonu geri çekilir. Bu işlem geri alınamaz.`,
        confirm: 'İade et',
        destructive: true,
      },
      () => admin.refund(p.id),
      refundResult,
      onDone,
      setBusy,
    );
  return (
    <ItemCard
      title={purchaseCoins(p.coins, p.bonus)}
      sub={[p.priceTl && fmtTl(p.priceTl), PLATFORM_LABEL[p.platform] ?? p.platform, p.sandbox && 'deneme alımı'].filter(Boolean).join(' · ')}
      pill={<StatusPill text={refunded ? 'İade edildi' : 'Yüklendi'} tone={refunded ? 'neutral' : 'success'} />}
    >
      <Line label="Kişi" value={p.user.name} onPress={() => ctx.openAccount(p.user.id, p.user.name)} />
      <Line label="Tarih" value={`${fmtDate(p.createdAt)} · ${ago(p.createdAt)}`} />
      <Line label="Sipariş no" value={p.transactionId.startsWith('token-') ? 'Mağaza numarası yok' : p.transactionId} mono onCopy={p.transactionId.startsWith('token-') ? undefined : () => copyText(p.transactionId, 'Sipariş numarası')} />
      <Line label="Alım no" value={String(p.id)} mono />
      {!refunded && (
        <View style={{ flexDirection: 'row', paddingTop: 4 }}>
          <Button title="İade et" icon="return-down-back-outline" variant="danger" small onPress={refund} disabled={busy} />
        </View>
      )}
    </ItemCard>
  );
}

const useStyles = makeStyles(({ colors, surface, lift }) => ({
  searchCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: 1, borderColor: surface.rim, ...lift },
  searchTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardAlt, borderRadius: radius.md, paddingHorizontal: 12, minHeight: 44, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 10, minWidth: 0 },
  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  googleCard: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, borderWidth: 1, borderColor: surface.rim, ...lift },
  googleTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  listLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, paddingHorizontal: space.xs, marginTop: space.xs },
}));
