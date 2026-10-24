import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, GradientButton, Header } from '@/components/ui';
import { GAMES, GAME_CATALOG_VISIBLE_BEFORE_VIP, GAME_MIN_VIP, type Game } from '@/data/catalog';
import { useApp } from '@/store';
import { colors } from '@/theme';

type Session = { game: Game; phase: 'starting' | 'playing' | 'verifying' | 'done'; score: number };

export default function GamesScreen() {
  const { vipLevel } = useApp();
  const unlocked = vipLevel >= GAME_MIN_VIP;
  const [session, setSession] = useState<Session | null>(null);
  const kinds = [...new Set(GAMES.map((g) => g.provider))];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <Header title="Oyun merkezi" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {!unlocked && (
          <Card style={{ gap: 8, borderWidth: 1, borderColor: colors.gold }}>
            <Text style={styles.title}>🔒 Oyun başlatma VIP {GAME_MIN_VIP}&apos;de açılır</Text>
            <Text style={styles.dim}>Kataloğu inceleyebilirsin; oyun başlatmak için VIP {GAME_MIN_VIP} gerekir. (Kural yönetim panelinden değiştirilebilir.)</Text>
            <GradientButton small title={`VIP ${GAME_MIN_VIP} ol`} icon="diamond" onPress={() => router.push('/vip')} />
          </Card>
        )}
        {(unlocked || GAME_CATALOG_VISIBLE_BEFORE_VIP) &&
          kinds.map((provider) => (
            <View key={provider} style={{ gap: 8 }}>
              <Text style={styles.section}>{provider}</Text>
              {GAMES.filter((g) => g.provider === provider).map((g) => (
                <Card key={g.id} style={[styles.row, !unlocked && { opacity: 0.6 }]}>
                  <Text style={{ fontSize: 34 }}>{g.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{g.name}</Text>
                    <Text style={styles.dim}>
                      {g.kind} · {g.players} oyuncu · {g.free ? 'Ücretsiz' : 'Lisanslı'}
                    </Text>
                  </View>
                  <Pressable disabled={!unlocked} style={[styles.play, !unlocked && { backgroundColor: colors.cardAlt }]} onPress={() => setSession({ game: g, phase: 'starting', score: 0 })}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>{unlocked ? 'Oyna' : '🔒'}</Text>
                  </Pressable>
                </Card>
              ))}
            </View>
          ))}
        <Card style={{ gap: 6 }}>
          <Text style={styles.title}>🏆 Bu haftanın turnuvası</Text>
          <Text style={styles.dim}>Bilgi Yarışması · 1–7 Kasım · puan: doğrulanmış oyun sonuçları · eşitlikte daha kısa süre kazanır · itiraz: Destek &gt; İtiraz</Text>
          <Text style={styles.dim}>Nakit bahis veya para yatırarak tahmin sistemi yoktur.</Text>
        </Card>
        <Text style={styles.dim}>Oyunlar harici sağlayıcıların lisanslı entegrasyonlarıyla sunulur. Sonuçlar istemciden değil sağlayıcı/sunucu doğrulamasıyla kesinleşir; oyun ödülleri açık bir kural olmadan oda XP&apos;sine veya VIP seviyesine eklenmez.</Text>
      </ScrollView>
      {session && <GameSession session={session} setSession={setSession} />}
    </SafeAreaView>
  );
}

function GameSession({ session, setSession }: { session: Session; setSession: (s: Session | null) => void }) {
  const { phase, game } = session;
  useEffect(() => {
    const next: Partial<Record<Session['phase'], Session['phase']>> = { starting: 'playing', playing: 'verifying', verifying: 'done' };
    const to = next[phase];
    if (!to) return;
    const t = setTimeout(() => setSession({ ...session, phase: to, score: to === 'done' ? 120 + (game.id.charCodeAt(1) % 7) * 30 : session.score }), phase === 'playing' ? 2500 : 1200);
    return () => clearTimeout(t);
  }, [phase, game, session, setSession]);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setSession(null)}>
      <View style={styles.overlay}>
        <View style={styles.sessionCard}>
          <Text style={{ fontSize: 56 }}>{game.emoji}</Text>
          <Text style={styles.title}>{game.name}</Text>
          {phase !== 'done' ? (
            <>
              <ActivityIndicator color={colors.pink} />
              <Text style={styles.dim}>{phase === 'starting' ? `${game.provider} oturumu başlatılıyor…` : phase === 'playing' ? 'Oyun oynanıyor (demo)…' : 'Sonuç sağlayıcıdan doğrulanıyor…'}</Text>
            </>
          ) : (
            <>
              <Text style={{ color: colors.gold, fontSize: 28, fontWeight: '900' }}>{session.score} puan</Text>
              <Text style={styles.dim}>✅ Sağlayıcı tarafından doğrulandı</Text>
              <GradientButton small title="Odaya paylaş" icon="share-social" onPress={() => Share.share({ message: `${game.name} oyununda ${session.score} puan yaptım! 🎮` }).catch(() => {})} />
            </>
          )}
          <Pressable onPress={() => setSession(null)} style={{ padding: 8 }}>
            <Text style={{ color: colors.textDim }}>{phase === 'done' ? 'Kapat' : 'İptal et (coin ve ödül durumu korunur)'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  title: { color: '#fff', fontWeight: '700', fontSize: 16 },
  section: { color: colors.textDim, fontWeight: '800', fontSize: 13, textTransform: 'uppercase' },
  dim: { color: colors.textDim, fontSize: 12, lineHeight: 17, textAlign: 'left' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play: { backgroundColor: colors.pink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  sessionCard: { backgroundColor: colors.card, borderRadius: 24, padding: 24, alignItems: 'center', gap: 10, alignSelf: 'stretch' },
});
