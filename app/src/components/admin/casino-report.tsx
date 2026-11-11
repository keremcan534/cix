// Yönetim › Oyun Salonu: the coin games' report from the server (GET /api/admin/casino/report, admin role). The
// house book since the start (coins played, the house's 60 %, the payout pool the winnings come from), and for a
// period the rounds, players, coins played, winnings paid and the house's part, game by game. Read only: the games
// are switched and limited in Canlı ayarlar › Oyun Salonu.
import { useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/text';
import * as api from '@/lib/api';
import { makeStyles, space } from '@/theme';

import { Filters, ItemCard, Line, LoadState, Notice, SectionScroll, useLoad } from './parts';

type Period = keyof api.CasinoReport['periods'];
const PERIODS: [Period, string][] = [
  ['today', 'Bugün'],
  ['week', '7 gün'],
  ['month', '30 gün'],
  ['kept', '180 gün'],
];
const fmt = (n: number) => `${Math.round(n).toLocaleString('tr-TR')} jeton`;
const share = (part: number, whole: number) => (whole ? `%${((100 * part) / whole).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—');

export function CasinoReportSection() {
  const load = useLoad(api.casinoReport);
  const [period, setPeriod] = useState<Period>('today');
  const s = useStyles();
  return (
    <SectionScroll load={load}>
      <LoadState load={load}>
        {(r) => {
          const p = r.periods[period];
          const played = p.games.filter((g) => g.rounds > 0).sort((a, b) => b.wagered - a.wagered);
          return (
            <View style={{ gap: space.md }}>
              <Notice text="Her oyunda oynanan jetonun %60'ı kasaya kalır, %40'ı ödül havuzuna girer; kazançlar yalnızca havuzdan ödenir. Oyunları açıp kapatmak ve sınırlar: Canlı ayarlar › Oyun Salonu." />
              <ItemCard title="Kasa defteri" sub="Başlangıçtan bu yana">
                <Line label="Oynanan" value={fmt(r.book.wagered)} />
                <Line label="Kasa payı (%60)" value={fmt(r.book.house)} />
                <Line label="Ödenen kazanç" value={`${fmt(r.book.paid)} · oynananın ${share(r.book.paid, r.book.wagered)}`} />
                <Line label="Ödül havuzu (şu an)" value={fmt(r.book.pool)} />
                <Line label="Açılış avansı" value={fmt(r.book.seed)} />
                {Object.entries(r.jackpots).map(([id, fund]) => (
                  <Line key={id} label={`JACKPOT · ${r.periods.kept.games.find((g) => g.id === id)?.name ?? id}`} value={fmt(fund)} />
                ))}
              </ItemCard>
              <Filters value={period} options={PERIODS} onChange={setPeriod} />
              <ItemCard title={PERIODS.find(([k]) => k === period)![1]} sub={`${p.rounds.toLocaleString('tr-TR')} tur`}>
                <Line label="Oynanan" value={fmt(p.wagered)} />
                <Line label="Ödenen kazanç" value={`${fmt(p.paid)} · ${share(p.paid, p.wagered)}`} />
                <Line label="Kasa payı (%60)" value={fmt(p.house)} />
              </ItemCard>
              {played.length === 0 ? (
                <Text style={s.empty}>Bu dönemde oynanan tur yok.</Text>
              ) : (
                played.map((g) => (
                  <ItemCard key={g.id} title={g.name} sub={`${g.rounds.toLocaleString('tr-TR')} tur · ${g.players.toLocaleString('tr-TR')} oyuncu`}>
                    <Line label="Oynanan" value={fmt(g.wagered)} />
                    <Line label="Ödenen" value={`${fmt(g.paid)} · ${share(g.paid, g.wagered)}`} />
                    <Line label="Kasa payı" value={fmt(g.house)} />
                  </ItemCard>
                ))
              )}
              <Text style={s.empty}>Turlar 180 gün saklanır; kasa defteri başlangıçtan bu yanadır. Rüzgâr Gülü bu rapora dahil değildir.</Text>
            </View>
          );
        }}
      </LoadState>
    </SectionScroll>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  empty: { color: colors.textDim, fontSize: 13, lineHeight: 18, textAlign: 'center' },
}));
