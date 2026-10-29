// Casino games UI (Servet Seviyesi 2+). Every round goes through playCasino (lib/games), the same path for profile and
// room entry; this component only shows the result. It never touches the room or the microphone.
import { router } from 'expo-router';
import { useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { Art, type ArtName } from '@/components/Art';
import { Icon3D } from '@/components/Icon3D';
import type { CasinoGame } from '@/data/games';
import { WHEEL } from '@/lib/casino-odds';
import { casinoAccess, newRequestId, playCasino, useGames, type Entry, type Outcome, type PlayResult } from '@/lib/games';
import { useApp } from '@/store';
import { colors, semantic } from '@/theme';

const PICKS: Partial<Record<CasinoGame['id'], [key: string, label: string, art?: ArtName][]>> = {
  dice: [
    ['small', 'Küçük (2–4) · 2.4x'],
    ['big', 'Büyük (10–12) · 2.4x'],
  ],
  dragon: [
    ['dragon', 'Ejder · 1.5x', 'casino-kart-ejder'],
    ['tie', 'Beraberlik · 5.2x'],
    ['tiger', 'Kaplan · 1.5x', 'casino-kart-kaplan'],
  ],
};
const DIE_ART: ArtName[] = ['zar-zar-yuzu-1', 'zar-zar-yuzu-2', 'zar-zar-yuzu-3', 'zar-zar-yuzu-4', 'zar-zar-yuzu-5', 'zar-zar-yuzu-6'];
/** The picture for one face of the stage (a die), if there is one. */
const faceArt = (gameId: CasinoGame['id'], f: string): ArtName | undefined => (gameId === 'dice' ? DIE_ART[Number(f) - 1] : undefined);
const WHEEL_LABELS = WHEEL.map((s) => `${s.mult}x`);
/** Prize picture per wheel slice, by its multiplier: empty slice "tekrar dene", then growing coin prizes. */
const wheelArt = (mult: number): ArtName =>
  mult === 0 ? 'cark-tekrar-dene' : mult < 2 ? 'cark-kucuk-jeton' : mult < 5 ? 'cark-jeton-kesesi' : mult < 10 ? 'cark-elmas-odul' : mult < 20 ? 'cark-roket-odul' : 'cark-buyuk-odul';

export function CasinoPlayer({ gameId, entry }: { gameId: CasinoGame['id']; entry: Entry }) {
  const { wealthLevel, coins, gameCoins } = useApp();
  const { casino } = useGames();
  const game = casino.find((x) => x.id === gameId)!;
  const [bet, setBet] = useState(game.bets[0]);
  const [pick, setPick] = useState(PICKS[gameId]?.[0][0] ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [lastReq, setLastReq] = useState<string | null>(null);
  const [spin] = useState(() => new Animated.Value(0));
  const access = casinoAccess(game, entry, wealthLevel);

  const play = (requestId = newRequestId()) => {
    setBusy(true);
    setLastReq(requestId);
    const r = playCasino(game.id, bet, pick, entry, requestId);
    if (!r.ok) {
      setResult(r);
      setBusy(false);
      return;
    }
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: r.replay ? 1 : 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setResult(r);
      setBusy(false);
    });
  };

  if (!access.ok) return <CasinoLock reason={access.reason} needWealth={access.needWealth} />;

  const outcome = result?.ok ? result.outcome : null;
  return (
    <View style={{ gap: 12 }}>
      <Stage gameId={gameId} outcome={outcome} spin={spin} busy={busy} />
      {result && (
        <View style={[c.result, result.ok && result.row.payout > 0 && { borderColor: semantic.money }]} accessibilityLiveRegion="polite">
          {result.ok ? (
            <>
              <Text style={c.resultMain}>{result.row.payout > 0 ? `+${result.row.payout.toLocaleString('tr-TR')} jeton · oyun bakiyesine` : 'Bu tur kazanç yok'}</Text>
              <Text style={c.dim}>
                {result.outcome.detail} · İşlem {result.row.txId}
                {result.replay ? ' · aynı istek tekrar geldi, ikinci kez jeton düşülmedi' : ''}
              </Text>
            </>
          ) : (
            <Text style={c.err}>{result.reason}</Text>
          )}
        </View>
      )}
      {PICKS[gameId] && (
        <View style={c.row}>
          {PICKS[gameId]!.map(([k, l, art]) => (
            <Pressable key={k} onPress={() => setPick(k)} style={[c.chip, pick === k && c.chipOn]} accessibilityLabel={l}>
              {art && <Art name={art} size={17} />}
              <Text style={c.chipText}>{l}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={c.row}>
        {game.bets.map((b) => (
          <Pressable key={b} onPress={() => setBet(b)} style={[c.chip, bet === b && c.chipOn]} accessibilityLabel={`Bahis ${b}`}>
            <Icon3D name="coin" size={14} />
            <Text style={c.chipText}>{b}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={[c.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => play()} accessibilityLabel={`${game.name} oyna`}>
        <Text style={c.btnText}>
          {busy ? 'Sonuç bekleniyor…' : `Oyna · ${bet} jeton`} <Text style={{ fontWeight: '600' }}>(bakiye {coins.toLocaleString('tr-TR')})</Text>
        </Text>
      </Pressable>
      <Text style={c.dim} accessibilityLabel={`Oyun bakiyesi ${gameCoins} jeton`}>
        🎮 Oyun bakiyesi: {gameCoins.toLocaleString('tr-TR')} jeton · kazançlar buraya yazılır; bahisler önce buradan düşer. Yalnızca oyunlarda kullanılır, hediye edilemez ve paraya çevrilemez.
      </Text>
      <Text style={c.dim}>{game.rules}</Text>
      {lastReq && !busy && (
        <Pressable onPress={() => play(lastReq)} accessibilityLabel="Aynı isteği tekrar gönder">
          <Text style={c.test}>Test: aynı isteği tekrar gönder (bağlantı tekrarı)</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Shown instead of a casino game when access is refused (e.g. Servet Seviyesi too low). */
export function CasinoLock({ reason, needWealth }: { reason: string; needWealth?: number }) {
  return (
    <View style={c.lock}>
      <Text style={{ fontSize: 44 }}>🔒</Text>
      <Text style={c.lockText}>{reason}</Text>
      {needWealth && (
        <Pressable style={c.btn} onPress={() => router.push('/seviye')}>
          <Text style={c.btnText}>Servet Seviyemi gör</Text>
        </Pressable>
      )}
    </View>
  );
}

function Stage({ gameId, outcome, spin, busy }: { gameId: CasinoGame['id']; outcome: Outcome | null; spin: Animated.Value; busy: boolean }) {
  if (gameId === 'wheel') {
    const slice = outcome ? Number(outcome.display[0]) : 0;
    // Land the chosen slice under the pointer after three turns.
    const deg = 360 * 3 + (360 - slice * 45 - 22.5);
    return (
      <View style={{ alignItems: 'center' }}>
        <Text style={c.pointer}>▼</Text>
        <Animated.View style={[c.wheel, { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${busy ? 1080 : deg}deg`] }) }] }]}>
          {WHEEL_LABELS.map((l, i) => (
            <View key={l} style={[StyleSheet.absoluteFill, { alignItems: 'center', transform: [{ rotate: `${i * 45 + 22.5}deg` }] }]}>
              <Text style={[c.wheelLabel, { color: i % 2 ? colors.gold : semantic.action }]}>{l}</Text>
              <Art name={wheelArt(WHEEL[i].mult)} size={20} />
            </View>
          ))}
          <Icon3D name="wheel" size={70} style={{ position: 'absolute', top: 55, left: 55 }} />
        </Animated.View>
      </View>
    );
  }
  const faces = outcome?.display ?? ['?', '?'];
  return (
    <Animated.View style={[c.row, { transform: [{ scale: spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.9, 1] }) }] }]}>
      {faces.map((f, i) => {
        const art = busy ? undefined : faceArt(gameId, f);
        return (
          <View key={i} style={[c.face, gameId === 'dragon' && c.cardFace]}>
            {gameId === 'dragon' && (
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Art name={i === 0 ? 'casino-kart-ejder' : 'casino-kart-kaplan'} size={28} />
                <Text style={c.dim}>{i === 0 ? 'Ejder' : 'Kaplan'}</Text>
              </View>
            )}
            {art ? <Art name={art} size={44} /> : <Text style={c.faceText}>{busy ? '…' : f}</Text>}
          </View>
        );
      })}
    </Animated.View>
  );
}

const c = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5, borderColor: colors.border },
  chipOn: { borderColor: semantic.money, backgroundColor: 'rgba(246,189,96,0.15)' },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  btn: { backgroundColor: semantic.money, borderRadius: 999, paddingVertical: 13, alignItems: 'center', alignSelf: 'stretch' },
  btnText: { color: semantic.moneyInk, fontWeight: '900' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  test: { color: semantic.tonalText, fontSize: 12, textAlign: 'center', fontWeight: '700' },
  result: { backgroundColor: colors.cardAlt, borderRadius: 14, padding: 10, gap: 2, borderWidth: 1, borderColor: colors.border },
  resultMain: { color: colors.text, fontWeight: '900', fontSize: 18, textAlign: 'center' },
  err: { color: colors.gold, textAlign: 'center', fontWeight: '700' },
  lock: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  lockText: { color: colors.text, textAlign: 'center', lineHeight: 20 },
  pointer: { color: colors.gold, fontSize: 22, marginBottom: -6, zIndex: 2 },
  wheel: { width: 180, height: 180, borderRadius: 90, borderWidth: 4, borderColor: colors.gold, backgroundColor: colors.cardAlt },
  wheelLabel: { fontWeight: '900', fontSize: 13, marginTop: 6 },
  face: { width: 72, height: 72, borderRadius: 14, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  cardFace: { width: 96, height: 120 },
  faceText: { color: colors.text, fontSize: 34, fontWeight: '900' },
});
