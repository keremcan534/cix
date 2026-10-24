import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { GradientButton, VerifiedBadge, VipBadge } from '@/components/ui';
import { FAN_LEVELS, fanLevel } from '@/data/catalog';
import { callPrice } from '@/data/economy';
import { GIFTS, MOMENTS, userById } from '@/data/mock';
import { showAlert } from '@/lib/alert';
import { useApp } from '@/store';
import { colors } from '@/theme';

const REPORT_REASONS = ['Sahte profil', 'Taciz / hakaret', 'Uygunsuz içerik', 'Dolandırıcılık', 'Reşit değil'];

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = userById(id);
  const { following, toggleFollow, blocked, toggleBlock, createTicket, fanClubs, addFanPoints } = useApp();
  const club = fanClubs[user.id];
  const fan = fanLevel(club?.points ?? 0);
  const [showHistory, setShowHistory] = useState(false);
  const follow = () => {
    if (!isFollowing && !club?.history.some((h) => h.text === 'Takip ettin')) addFanPoints(user.id, 10, 'Takip ettin');
    toggleFollow(user.id);
  };
  const isFollowing = following.has(user.id);
  const isBlocked = blocked.has(user.id);
  const photos = MOMENTS.filter((m) => m.userId === user.id && m.image).map((m) => m.image!);
  // Stable mock "gift wall" per user.
  const giftWall = GIFTS.map((g, i) => ({ ...g, count: ((user.age * (i + 3)) % 17) + 1 }));

  const [sheet, setSheet] = useState<'none' | 'more' | 'report'>('none');
  const more = () => setSheet('more');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View>
          <Image source={{ uri: user.avatar.replace('200', '800') }} style={styles.cover} />
          <LinearGradient colors={['rgba(18,11,36,0.4)', 'transparent', colors.bg]} style={StyleSheet.absoluteFill} />
          <SafeAreaView style={styles.topBar} edges={['top']}>
            <Pressable onPress={() => router.back()} style={styles.iconBtn}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={more} style={styles.iconBtn} accessibilityLabel="Diğer">
              <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={{ paddingHorizontal: 16, gap: 14, marginTop: -40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.name}>
              {user.name}, {user.age}
            </Text>
            {user.verified && <VerifiedBadge size={20} />}
            {user.vip && <VipBadge />}
          </View>
          <Text style={styles.meta}>
            {user.online ? '🟢 Çevrimiçi' : '⚪ Çevrimdışı'} · 📍 {user.city} · {user.distanceKm} km · ID {1000 + Number(user.id.slice(1)) * 7919}
          </Text>
          <Text style={styles.bio}>{user.bio}</Text>
          {isBlocked && <Text style={{ color: colors.red }}>Bu kullanıcıyı engelledin.</Text>}

          <View style={styles.stats}>
            <Stat n={(user.age * 37) % 900} label="Takipçi" />
            <Stat n={(user.age * 13) % 200} label="Takip" />
            <Stat n={giftWall.reduce((s, g) => s + g.count, 0)} label="Hediye" />
          </View>

          <View style={styles.fanCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }}>💜 {user.name} hayran kulübü</Text>
              <Text style={{ color: colors.gold, fontWeight: '800' }}>
                Lv.{fan.index + 1} · {club?.points ?? 0} puan
              </Text>
            </View>
            <Text style={styles.meta}>
              {fan.current.name} · Ödül: {fan.current.reward}
            </Text>
            <View style={styles.track}>
              <View style={{ height: 6, backgroundColor: colors.pink, width: fan.next ? `${(((club?.points ?? 0) - fan.current.min) / (fan.next.min - fan.current.min)) * 100}%` : '100%' }} />
            </View>
            <Text style={styles.meta}>{fan.next ? `Sonraki: ${fan.next.name} (${fan.next.min} puan) → ${fan.next.reward}` : 'En üst kulüp seviyesi'}</Text>
            <Text style={styles.meta}>Puan kazan: takip et (+10), odasına katıl (+5), odada kal (+2/dk), görevler; hediye zorunlu değil.</Text>
            <Pressable onPress={() => setShowHistory((v) => !v)}>
              <Text style={{ color: colors.pink, fontWeight: '700', fontSize: 12 }}>{showHistory ? 'Puan geçmişini gizle' : 'Puan geçmişi'}</Text>
            </Pressable>
            {showHistory &&
              (club?.history.length ? (
                club.history.map((h, i) => (
                  <Text key={i} style={styles.meta}>
                    {h.time} · {h.text} · +{h.pts}
                  </Text>
                ))
              ) : (
                <Text style={styles.meta}>Henüz puan yok.</Text>
              ))}
            <Text style={[styles.meta, { fontSize: 11 }]}>Seviyeler: {FAN_LEVELS.map((l) => l.name).join(' → ')}</Text>
          </View>

          <Text style={styles.section}>Hediye duvarı</Text>
          <View style={styles.giftWall}>
            {giftWall.map((g) => (
              <View key={g.id} style={styles.giftCell}>
                <Text style={{ fontSize: 26 }}>{g.emoji}</Text>
                <Text style={styles.meta}>x{g.count}</Text>
              </View>
            ))}
          </View>

          {photos.length > 0 && (
            <>
              <Text style={styles.section}>Anlar</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {photos.map((p) => (
                  <Image key={p} source={{ uri: p }} style={styles.photo} />
                ))}
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.bottom}>
        <Pressable style={[styles.roundBtn, isFollowing && { backgroundColor: colors.pink }]} onPress={follow} accessibilityLabel="Takip et">
          <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={22} color="#fff" />
        </Pressable>
        <Pressable style={styles.roundBtn} onPress={() => router.push(`/sohbet/${user.id}`)} accessibilityLabel="Mesaj">
          <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
        </Pressable>
        <Pressable style={styles.roundBtn} onPress={() => router.push({ pathname: '/arama/[id]', params: { id: user.id, mode: 'sesli' } })}>
          <Ionicons name="call" size={22} color="#fff" />
        </Pressable>
        <GradientButton
          title={`🪙 ${callPrice(user)}/dk`}
          icon="videocam"
          style={{ flex: 1 }}
          onPress={() => (isBlocked ? showAlert('Engelli kullanıcı') : router.push({ pathname: '/arama/[id]', params: { id: user.id, mode: 'goruntulu' } }))}
        />
      </SafeAreaView>

      <ActionSheet
        visible={sheet === 'more'}
        title={user.name}
        onClose={() => setSheet('none')}
        options={[
          { label: '🚩 Şikayet et', onPress: () => setTimeout(() => setSheet('report'), 300) },
          { label: isBlocked ? 'Engeli kaldır' : '⛔ Engelle', destructive: true, onPress: () => toggleBlock(user.id) },
        ]}
      />
      <ActionSheet
        visible={sheet === 'report'}
        title="Şikayet sebebi"
        onClose={() => setSheet('none')}
        options={REPORT_REASONS.map((r) => ({
          label: r,
          onPress: () => {
            const no = createTicket('Şikâyet', `${user.name} (${user.id}) · ${r}`);
            showAlert('Şikâyet alındı', `Talep #${no} · "${r}". İnceleme sonucu bildirim olarak gelir; durumu Destek ekranından izleyebilirsin.`);
          },
        }))}
      />
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{n}</Text>
      <Text style={styles.meta}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', height: 380, backgroundColor: colors.card },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12 },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, padding: 8, marginTop: 8 },
  name: { color: '#fff', fontSize: 28, fontWeight: '900' },
  meta: { color: colors.textDim, fontSize: 13 },
  bio: { color: '#fff', fontSize: 15 },
  stats: { flexDirection: 'row', backgroundColor: colors.card, borderRadius: 16, paddingVertical: 14 },
  fanCard: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: 'rgba(236,72,153,0.4)' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  section: { color: '#fff', fontWeight: '700', fontSize: 16 },
  giftWall: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.card, borderRadius: 16, padding: 8 },
  giftCell: { width: '25%', alignItems: 'center', paddingVertical: 8 },
  photo: { width: 110, height: 110, borderRadius: 12 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  roundBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
});
