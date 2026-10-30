import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type ColorValue } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, TextInput } from '@/components/text';
import { ActionSheet } from '@/components/ActionSheet';
import { GiftArt } from '@/components/GiftArt';
import { Avatar, FramedAvatar, GradientButton, LevelChips, VerifiedBadge, VipBadge, VipTitle } from '@/components/ui';
import { COSMETICS, FAN_LEVELS, fanLevel, roomLevel, ROOM_LEVEL_ICONS } from '@/data/catalog';
import { callPrice } from '@/data/economy';
import { FOLLOWS_ME, GIFTS, INTERESTS, MOMENTS, ROOMS, USERS, userById, type Gift, type Moment, type User } from '@/data/mock';
import { privacyOf } from '@/data/privacy';
import { staffBadgeOf } from '@/data/rbac';
import { COUNTRIES } from '@/data/social-ui';
import {
  GIFT_CATALOG_TOTAL,
  GIFT_COLLECTIONS,
  collectionProgress,
  displayId,
  giftWallOf,
  guardianOf,
  medalsOf,
  profileCompletion,
  profileExtras,
  relationsOf,
  titlesOf,
  vehiclesOf,
  wealthCharmOf,
  type Relation,
} from '@/data/profile';
import { followRoute, presenceOf } from '@/data/presence';
import { showAlert } from '@/lib/alert';
import { successHaptic } from '@/lib/haptics';
import { checkInteraction, type Action } from '@/lib/interaction';
import { shareLink } from '@/lib/links';
import { LIMITS, ageFrom, formatTrDate, parseTrDate, validateProfile, type ProfileErrors } from '@/lib/profile-rules';
import { similarity } from '@/lib/similarity';
import { SimilarityCard } from '@/components/similarity';
import { AffiliationPills, GenderChip, useAffiliations, type Affiliation } from '@/components/profile-badges';
import { Icon3D } from '@/components/Icon3D';
import { useApp, type FanClub } from '@/store';
import { colors, gradientDeep, semantic } from '@/theme';
import { Art } from '@/components/Art';

const REPORT_REASONS = ['Sahte profil', 'Taciz / hakaret', 'Uygunsuz içerik', 'Dolandırıcılık', 'Reşit değil'];

type Tab = 'profil' | 'dinamik' | 'onur' | 'iliski';
const TABS: { id: Tab; label: string }[] = [
  { id: 'profil', label: 'Profil' },
  { id: 'dinamik', label: 'Dinamik' },
  { id: 'onur', label: 'Onur' },
  { id: 'iliski', label: 'İlişki' },
];
type Sheet = 'none' | 'more' | 'report' | 'call' | 'gift';
type InviteKind = 'cp' | 'dost' | 'meet';
const BAR_H = 52;
const TAB_H = 48;

export default function UserProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    me, following, toggleFollow, blocked, toggleBlock, createTicket, fanClubs, addFanPoints, myRoom, notify, updateMe, spendCoins, bump, settings, vipLevel, svipLevel, equipped, inventory, giftWall: wallOf, recordGift,
    rbac, coins, diamonds, wealthXp, charmXp, wealthLevel, charmLevel, vipDays, stats, logSafety, pendingAvatar, submitAvatar,
  } = useApp();
  const isMe = id === 'me';
  const user = isMe ? me : userById(id);
  const insets = useSafeAreaInsets();

  const club = fanClubs[user.id];
  const isFollowing = following.has(user.id);
  const isBlocked = blocked.has(user.id);
  const extras = profileExtras(user);
  const moments = MOMENTS.filter((m) => m.userId === user.id);
  const photos = moments.filter((m) => m.image).map((m) => m.image!);
  const completion = profileCompletion(user, extras, photos.length);
  // Others: demo values; me: my real Servet and Cazibe levels.
  const levels = user.id === 'me' ? { wealth: wealthLevel, charm: charmLevel } : wealthCharmOf(user.id);
  const guardian = guardianOf(user.id);
  const relations = relationsOf(user.id);

  // What this viewer may see and do (profile spec §3, §5). Others' choices come with their profile; mine from Settings.
  const priv = isMe ? { ...privacyOf('me'), showOnline: settings.showOnline, showLastSeen: settings.showLastSeen, showCurrentRoom: settings.showCurrentRoom } : privacyOf(user.id);
  // Like most messengers: hiding your own last seen also hides everyone else's from you.
  const lastSeen = !isMe && !user.online && priv.showLastSeen && settings.showLastSeen ? user.lastSeen : undefined;
  const staff = staffBadgeOf(rbac, user.id);
  const country = COUNTRIES.find((c) => c.code === (user.country ?? 'TR'));
  const friends = isMe ? USERS.filter((u) => following.has(u.id) && FOLLOWS_ME.has(u.id)).length : (user.age * 7) % 60;
  const can = (a: Action) => checkInteraction(a, user, { blocked, following, myAge: me.age });
  const guard = (a: Action, run: () => void) => {
    const c = can(a);
    if (!c.ok) return showAlert('Şu an yapılamıyor', c.reason);
    run();
  };
  const album = [...(user.photos ?? []), ...MOMENTS.filter((m) => m.userId === user.id && m.image).map((m) => m.image!)];
  const [openedAt] = useState(() => Date.now());
  const vipUntil = vipDays > 0 ? new Date(openedAt + vipDays * 86_400_000).toLocaleDateString('tr-TR') : null;

  const pickPhoto = async (forAlbum: boolean) => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: !forAlbum, aspect: [1, 1], quality: 0.7 });
    if (res.canceled || !res.assets[0]) return;
    const uri = res.assets[0].uri;
    if (forAlbum) {
      updateMe({ photos: [uri, ...(me.photos ?? [])].slice(0, LIMITS.photos) });
      showAlert('Fotoğraf eklendi', 'Albüm fotoğrafları da topluluk kurallarına göre denetlenir.');
    } else {
      submitAvatar(uri);
      showAlert('Fotoğraf incelemede', 'Yeni profil fotoğrafın kısa bir kontrolden sonra herkese görünecek. Bu sırada eski fotoğrafın görünür.');
    }
  };

  const [tab, setTab] = useState<Tab>('profil');
  const [sheet, setSheet] = useState<Sheet>('none');
  const [editOpen, setEditOpen] = useState(false);
  const [pickerKind, setPickerKind] = useState<InviteKind | null>(null);
  const [sentInvites, setSentInvites] = useState<string[]>([]);
  const [tabY, setTabY] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  // Gift wall: my own wall is only what I really received; another user's wall is their simulated
  // history plus every gift I sent them (room, profile, call).
  const received = wallOf[user.id] ?? {};
  const giftWall = giftWallOf(user.id).map((g) => ({ ...g, count: (isMe ? 0 : g.count) + (received[g.id] ?? 0) }));
  const giftTotal = giftWall.reduce((s, g) => s + g.count, 0);

  const follow = () => {
    if (!isFollowing && !club?.history.some((h) => h.text === 'Takip ettin')) addFanPoints(user.id, 10, 'Takip ettin');
    toggleFollow(user.id);
  };

  const call = (mode: 'sesli' | 'goruntulu') => guard(mode === 'sesli' ? 'voice' : 'video', () => router.push({ pathname: '/arama/[id]', params: { id: user.id, mode } }));
  const inviteToRoom = () =>
    guard('invite', () => {
      if (sentInvites.includes(`room:${user.id}`)) return showAlert('Davet zaten gönderildi', `${user.name} henüz yanıt vermedi.`);
      setSentInvites((l) => [...l, `room:${user.id}`]);
      notify({ kind: 'social', icon: '🎙️', title: 'Oda daveti gönderildi', body: `${user.name} kişisini "${myRoom.title}" odana davet ettin.`, href: '/oda/yeni' });
      showAlert('Davet gönderildi', `${user.name} kabul ederse odana katılır.`);
    });

  const deliverGift = (g: Gift) => {
    // Same SVIP lock as the room's gift sheet.
    if ((g.minSvip ?? 0) > svipLevel) return showAlert('SVIP hediyesi', `${g.name}, SVIP ${g.minSvip} ve üzerine özel. Senin seviyen: SVIP ${svipLevel}.`);
    if (!spendCoins(g.price, `Hediye: ${g.name} → ${user.name}`)) {
      showAlert('Yetersiz jeton', 'Hediye göndermek için jeton yükle.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Jeton yükle', onPress: () => router.push('/cuzdan') },
      ]);
      return;
    }
    recordGift(user.id, g.id, 1);
    bump('giftsSent', 1);
    addFanPoints(user.id, Math.ceil(g.price / 10), `Hediye gönderdin (${g.price} jeton)`);
    successHaptic();
  };
  const sendGift = (g: Gift) => {
    const c = can('gift');
    if (!c.ok) return showAlert('Şu an yapılamıyor', c.reason);
    deliverGift(g);
  };

  const sendInvite = (kind: InviteKind, targetId: string) => {
    const target = userById(targetId);
    const key = `${kind}:${targetId}`;
    if (sentInvites.includes(key)) return showAlert('Davet zaten gönderildi', `${target.name} henüz yanıt vermedi.`);
    setSentInvites((l) => [...l, key]);
    const copy = {
      cp: { icon: '💞', title: 'CP daveti gönderildi', body: `${target.name} kişisine CP oluşturma daveti gönderdin. Kabul ederse ilişki sekmesinde görünecek.` },
      dost: { icon: '🤝', title: 'Dost daveti gönderildi', body: `${target.name} kişisine dostluk daveti gönderdin.` },
      meet: { icon: '🏠', title: 'Buluşma odası daveti', body: `${target.name} kişisini buluşma odana davet ettin.` },
    }[kind];
    notify({ kind: 'social', ...copy });
    showAlert(copy.title, copy.body);
  };
  const startInvite = (kind: InviteKind) => {
    if (isBlocked) return showAlert('Engelli kullanıcı');
    if (isMe) {
      if (kind === 'meet') return router.push('/oda/yeni');
      setPickerKind(kind);
      return;
    }
    const label = kind === 'cp' ? 'CP oluşturma daveti' : kind === 'dost' ? 'Dost daveti' : 'Buluşma odası daveti';
    showAlert(label, `${user.name} kişisine ${label.toLocaleLowerCase('tr-TR')} gönderilsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Gönder', onPress: () => sendInvite(kind, user.id) },
    ]);
  };

  const copyText = (value: string, what: string) => {
    const clip = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clip) {
      clip.writeText(value).then(
        () => showAlert(`${what} kopyalandı`, value),
        () => showAlert(`${what}: ${value}`),
      );
      return;
    }
    showAlert(`${what}: ${value}`, 'Kopyalamak için metnin üzerine uzun bas.');
  };
  const copyId = () => copyText(displayId(user.id), 'ID');
  const copyUsername = () => copyText(`@${user.username ?? ''}`, 'Kullanıcı adı');

  const barHeight = insets.top + BAR_H;
  const onScroll = (y: number) => {
    const next = tabY > 0 && y >= tabY - barHeight;
    if (next !== collapsed) setCollapsed(next);
  };

  // Room & family
  const otherRoom = ROOMS.find((r) => r.hostId === user.id);
  const room = isMe
    ? { title: myRoom.title, desc: myRoom.announcement, cover: myRoom.cover, level: roomLevel(myRoom.xp), go: () => router.push('/oda/yeni') }
    : otherRoom
      ? { title: otherRoom.title, desc: otherRoom.announcement ?? `${otherRoom.listeners} dinleyici`, cover: otherRoom.cover, level: otherRoom.level ?? 1, go: () => router.push(`/oda/${otherRoom.id}`) }
      : null;
  const { agency, kabile } = useAffiliations(user);

  const presence = priv.showCurrentRoom ? presenceOf(user.id) : null;
  const pickerUsers = USERS.filter((u) => following.has(u.id) && !blocked.has(u.id));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: isMe ? 40 : 110 }}
        onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
      >
        {/* Cover + header */}
        <View>
          <Image source={{ uri: user.avatar.replace('200', '800') }} style={styles.cover} />
          <LinearGradient colors={['rgba(8,15,30,0.55)', 'transparent', 'rgba(8,15,30,0.6)']} style={StyleSheet.absoluteFill} />
          {isMe && (
            <Pressable style={[styles.voicePill, { top: insets.top + 58 }]} onPress={() => showAlert('Ses tanıtımı', 'Profilin için 15 saniyelik bir ses tanıtımı kaydı yakında burada olacak.')}>
              <View style={styles.micDot}>
                <Ionicons name="mic" size={14} color="#fff" />
              </View>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Kayıt</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.sheet}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, gap: 8 }}>
              <View style={styles.avatarWrap}>
                {isMe ? (
                  <Pressable onPress={() => pickPhoto(false)} accessibilityLabel="Profil fotoğrafını değiştir">
                    <FramedAvatar uri={pendingAvatar ?? user.avatar} size={96} vipLevel={vipLevel} frameId={equipped.frame} artScale={2.2} />
                    <View style={styles.cameraBadge}>
                      <Ionicons name="camera" size={14} color="#fff" />
                    </View>
                  </Pressable>
                ) : (
                  <Avatar uri={user.avatar} size={96} ring={user.vip} />
                )}
              </View>
              {isMe && pendingAvatar && <Text style={styles.reviewNote}>⏳ Yeni fotoğraf incelemede · şimdilik yalnızca sen görüyorsun</Text>}
              <View style={styles.row}>
                <Text style={styles.name} numberOfLines={1}>
                  {user.name}
                </Text>
                {country && (
                  <View style={styles.flag} accessibilityLabel={country.name}>
                    <Text style={{ fontSize: 13 }}>{country.flag}</Text>
                    <Text style={styles.flagText}>{country.code}</Text>
                  </View>
                )}
              </View>
              {!!user.username && (
                <Pressable style={styles.row} onPress={copyUsername} hitSlop={6} accessibilityLabel="Kullanıcı adını kopyala">
                  <Text style={styles.handle}>@{user.username}</Text>
                  <Ionicons name="copy-outline" size={13} color={colors.textDim} />
                </Pressable>
              )}
              <View style={[styles.row, { flexWrap: 'wrap' }]}>
                <GenderChip user={user} owner={isMe} />
                <LevelChips wealth={levels.wealth} charm={levels.charm} hideWealth={isMe && vipDays > 0 && settings.hideWealth} hideCharm={isMe && vipDays > 0 && settings.hideCharm} />
                {isMe ? <VipTitle level={vipLevel} /> : user.vip && <VipBadge />}
                {staff && (
                  <View style={[styles.staffChip, staff === 'Moderatör' && { backgroundColor: '#1D4ED8' }]} accessibilityLabel={`Resmi ${staff}`}>
                    <Ionicons name="shield-checkmark" size={12} color="#fff" />
                    <Text style={styles.genderText}>{staff}</Text>
                  </View>
                )}
                {user.verified && <VerifiedBadge size={18} />}
              </View>
              <AffiliationPills user={user} />
              <View style={styles.row}>
                {priv.showOnline ? (
                  <>
                    <View style={[styles.dot, { backgroundColor: user.online ? semantic.live : colors.textDim }]} />
                    <Text style={{ color: user.online ? semantic.live : colors.textDim, fontSize: 13 }}>
                      {user.online ? 'Çevrimiçi' : lastSeen ? `Son görülme ${lastSeen}` : 'Çevrimdışı'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.meta}>{isMe ? 'Durumun gizli' : 'Durum gizli'}</Text>
                )}
                {!!user.city && (
                  <>
                    <View style={styles.vSep} />
                    <Ionicons name="location-outline" size={14} color={colors.textDim} />
                    <Text style={styles.meta}>
                      {user.city}
                      {!isMe && settings.cityDiscovery && ` · ${user.distanceKm} km`}
                    </Text>
                  </>
                )}
              </View>
            </View>
            <Guardian guardian={guardian} />
          </View>

          <Pressable style={[styles.row, { marginTop: 12 }]} disabled={!isMe} onPress={() => setEditOpen(true)}>
            <Text style={styles.bio}>{user.bio || (isMe ? 'Kendini birkaç kelimeyle anlat…' : '')}</Text>
            {isMe && (
              <View style={styles.bioEdit}>
                <Ionicons name="pencil" size={13} color="#fff" />
              </View>
            )}
          </Pressable>

          <View style={styles.stats}>
            <Stat n={(user.age * 37) % 900} label="Takipçi" />
            <View style={styles.vSep} />
            <Stat n={isMe ? following.size : (user.age * 13) % 200} label="Takip" />
            <View style={styles.vSep} />
            <Stat n={friends} label="Arkadaş" />
            <View style={styles.vSep} />
            <Stat n={giftTotal} label="Hediye" onPress={() => setTab('onur')} />
          </View>
          {isBlocked && <Text style={{ color: colors.red, marginTop: 8 }}>Bu kullanıcıyı engelledin.</Text>}
          {!isMe && priv.status !== 'active' && (
            <Text style={styles.statusNote}>{priv.status === 'restricted' ? '⚠️ Bu hesap geçici olarak kısıtlı: arama, hediye ve oda daveti alamıyor.' : '⛔ Bu hesap askıya alındı.'}</Text>
          )}
          {!isMe && !isBlocked && presence && (
            <Pressable
              style={[styles.presence, presence.kind === 'call' && { borderColor: colors.gold }]}
              disabled={presence.kind !== 'room'}
              onPress={() => presence.kind === 'room' && router.push(followRoute(presence.roomId, user.id))}
              accessibilityLabel="Bulunduğu yere git">
              <Text style={{ fontSize: 20 }}>{presence.kind === 'room' ? '🎙️' : '📞'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontWeight: '800' }} numberOfLines={1}>
                  {presence.kind === 'room' ? `Şu an odada: ${presence.locked ? '🔒 ' : ''}${presence.title}` : `Şu an ${presence.mode} görüşmede`}
                </Text>
                <Text style={styles.meta}>{presence.kind === 'room' ? (presence.locked ? 'Şifreli oda · girişte şifre sorulur' : 'Dokun, yanına git') : 'Özel görüşmeye katılınamaz'}</Text>
              </View>
              {presence.kind === 'room' && <Text style={styles.presenceGo}>Git</Text>}
            </Pressable>
          )}
        </View>

        <View onLayout={(e) => setTabY(e.nativeEvent.layout.y)}>
          <TabBar tab={tab} onChange={setTab} />
        </View>

        {tab === 'profil' && (
          <View>
            {isMe ? (
              <View style={styles.section}>
                <Pressable onPress={() => setEditOpen(true)}>
                  <LinearGradient colors={[colors.primary, '#38BDF8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rewardCard}>
                    <View style={styles.row}>
                      <Text style={styles.rewardTitle}>Ödül Kazan</Text>
                      <View style={{ flex: 1 }} />
                      <View style={styles.editPill}>
                        <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 13 }}>Profili Düzenle</Text>
                        <Ionicons name="chevron-forward" size={14} color={colors.primaryText} />
                      </View>
                    </View>
                    <View style={[styles.row, { marginTop: 10 }]}>
                      <Text style={styles.rewardSub}>Tamamlanma Oranı</Text>
                      <View style={styles.rewardTrack}>
                        <View style={[styles.rewardFill, { width: `${completion}%` }]} />
                      </View>
                      <Text style={styles.rewardPct}>{completion}%</Text>
                    </View>
                  </LinearGradient>
                </Pressable>
                <PrivateStats
                  coins={coins}
                  diamonds={diamonds}
                  vipUntil={vipUntil}
                  wealthXp={wealthXp}
                  charmXp={charmXp}
                  giftsSent={stats.giftsSent}
                  giftsReceived={giftTotal}
                />
              </View>
            ) : (
              <View style={styles.section}>
                <FanClubCard name={user.name} club={club} />
              </View>
            )}
            <Band />

            <View style={styles.section}>
              <SectionTitle title={`Albüm${isMe ? ` · ${me.photos?.length ?? 0}/${LIMITS.photos}` : ''}`} onPress={() => setTab('dinamik')} />
              {album.length > 0 || isMe ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {isMe && (me.photos?.length ?? 0) < LIMITS.photos && (
                    <Pressable style={[styles.photo, styles.addPhoto]} onPress={() => pickPhoto(true)} accessibilityLabel="Albüme fotoğraf ekle">
                      <Ionicons name="add" size={30} color={colors.textDim} />
                      <Text style={styles.meta}>Fotoğraf ekle</Text>
                    </Pressable>
                  )}
                  {album.map((p) => (
                    <View key={p}>
                      <Image source={{ uri: p }} style={styles.photo} />
                      {isMe && me.photos?.includes(p) && (
                        <Pressable
                          style={styles.removePhoto}
                          hitSlop={6}
                          onPress={() => updateMe({ photos: (me.photos ?? []).filter((x) => x !== p) })}
                          accessibilityLabel="Fotoğrafı kaldır"
                        >
                          <Ionicons name="close" size={14} color="#fff" />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <InfoBox icon="image" text={isMe ? 'Serbest paylaş, ama kendi kurallarına göre' : 'Henüz albüm fotoğrafı yok.'} />
              )}
            </View>
            <Band />

            {!isMe && (
              <>
                <View style={styles.section}>
                  <SimilarityCard sim={similarity(me, user)} name={user.name} />
                </View>
                <Band />
              </>
            )}

            <View style={styles.section}>
              <SectionTitle title="Kişisel profil" />
              <View style={styles.chips}>
                <Chip icon="resize-outline" label={`${extras.height}cm`} />
                <Chip icon="barbell-outline" label={`${extras.weight}kg`} />
                <Chip icon="briefcase-outline" label={extras.job} />
                <Chip icon="language-outline" label={extras.languages.join('、')} />
                <Chip icon="star-outline" label={extras.zodiac} />
                {user.interests?.map((i) => (
                  <Chip key={i} label={i} />
                ))}
              </View>
            </View>
            <Band />

            {(isMe || extras.slogan) && (
              <>
                <View style={styles.section}>
                  <SectionTitle title="Arkadaşlık Sloganı" onPress={isMe ? () => setEditOpen(true) : undefined} />
                  <InfoBox icon="heart" text={extras.slogan ?? 'Bir soruyu yanıtla, seninle aynı frekansta olan biriyle tanış.'} />
                </View>
                <Band />
              </>
            )}

            <View style={styles.section}>
              <SectionTitle
                title="Doğrulama"
                onPress={
                  isMe && !user.verified ? () => showAlert('Doğrulama gerekli', 'Selfie ile gerçek kişi doğrulaması yap; profilinde mavi rozet görünür.') : undefined
                }
              />
              <InfoBox
                icon="shield-checkmark"
                text={user.verified ? 'Gerçek kişi doğrulandı · mavi rozet aktif' : isMe ? 'Bir kere doğrula, kalıcı bağlantı' : 'Bu kullanıcı henüz doğrulanmadı.'}
              />
            </View>
            <Band />

            <View style={styles.section}>
              <SectionTitle title="Kişilik Etiketleri" />
              <View style={styles.chips}>
                {extras.tags.map((t) => (
                  <Chip key={t.label} emoji={t.emoji} label={t.label} />
                ))}
              </View>
            </View>
            <Band />

            <View style={styles.section}>
              <SectionTitle title="Temel Bilgiler" />
              <View style={styles.infoCard}>
                <InfoRow icon="person-outline" label="ID">
                  <Pressable style={styles.row} onPress={copyId} hitSlop={6} accessibilityLabel="ID kopyala">
                    <Text selectable style={styles.infoValue}>
                      {displayId(user.id)}
                    </Text>
                    <Ionicons name="copy-outline" size={16} color={colors.textDim} />
                  </Pressable>
                </InfoRow>
                {!!user.username && (
                  <InfoRow icon="at-outline" label="Kullanıcı adı">
                    <Pressable style={styles.row} onPress={copyUsername} hitSlop={6} accessibilityLabel="Kullanıcı adını kopyala">
                      <Text selectable style={styles.infoValue}>
                        @{user.username}
                      </Text>
                      <Ionicons name="copy-outline" size={16} color={colors.textDim} />
                    </Pressable>
                  </InfoRow>
                )}
                {!!user.gender && (isMe || user.showGender !== false) && (
                  <InfoRow icon={user.gender === 'Kadın' ? 'female-outline' : 'male-outline'} label="Cinsiyet" hint={user.showGender === false ? 'Gizli · yalnızca sen görüyorsun, diğerleri sadece yaşını görür' : undefined}>
                    <Text style={styles.infoValue}>{user.gender}</Text>
                  </InfoRow>
                )}
                {country && (
                  <InfoRow icon="flag-outline" label="Ülke">
                    <Text style={styles.infoValue}>
                      {country.flag} {country.name}
                    </Text>
                  </InfoRow>
                )}
                {isMe && (
                  <InfoRow icon="gift-outline" label="Doğum Günü" hint="Yalnızca Sen Görebilirsin · diğerleri sadece yaşını görür">
                    <Text style={styles.infoValue}>{user.birthDate ? formatTrDate(user.birthDate) : extras.birthday}</Text>
                  </InfoRow>
                )}
                {!!user.joinedAt && (
                  <InfoRow icon="calendar-outline" label="Üyelik">
                    <Text style={styles.infoValue}>{new Date(user.joinedAt).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}</Text>
                  </InfoRow>
                )}
                <InfoRow icon="heart-outline" label="İlişki Durumu">
                  <Text style={styles.infoValue}>{extras.relationship}</Text>
                </InfoRow>
                <InfoRow icon="school-outline" label="Eğitim">
                  <Text style={styles.infoValue}>{extras.education}</Text>
                </InfoRow>
              </View>
            </View>
            <Band />

            <View style={styles.section}>
              <SectionTitle title="Oda" />
              {room ? (
                <Pressable style={styles.roomCard} onPress={room.go}>
                  <Image source={{ uri: room.cover }} style={styles.roomCover} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={styles.roomTitle} numberOfLines={1}>
                      {room.title}
                    </Text>
                    <Text style={styles.meta} numberOfLines={2}>
                      {room.desc}
                    </Text>
                    <View style={styles.lvChip}>
                      <Text style={{ fontSize: 12 }}>{ROOM_LEVEL_ICONS[Math.min(room.level, ROOM_LEVEL_ICONS.length) - 1]}</Text>
                      <Text style={styles.lvText}>Lv.{room.level}</Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
                </Pressable>
              ) : (
                <InfoBox icon="mic" text="Henüz bir odası yok." />
              )}
            </View>
            <Band />

            <AffiliationSection title="Ajans" item={agency} empty={isMe ? 'Katıl' : 'Ajansı yok'} emptyHref={isMe ? '/ajans' : undefined} />
            <Band />

            <AffiliationSection title="Kabile" item={kabile} empty={isMe ? 'Katıl' : 'Kabilesi yok'} emptyHref={isMe ? '/aile' : undefined} />
          </View>
        )}

        {tab === 'dinamik' && (
          <View style={{ padding: 16, gap: 12 }}>
            {moments.length > 0 ? (
              moments.map((m) => <MomentItem key={m.id} moment={m} user={user} />)
            ) : (
              <View style={styles.empty}>
                <Art name="maskot-bos-durum-maskotu" size={88} />
                <Text style={styles.meta}>{isMe ? 'Henüz bir an paylaşmadın.' : 'Henüz paylaşım yok.'}</Text>
              </View>
            )}
            {isMe && <GradientButton title="bir an yayınla" icon="add-circle-outline" style={{ marginTop: 12, marginHorizontal: 24 }} onPress={() => router.push('/(tabs)/anlar')} />}
          </View>
        )}

        {tab === 'onur' && (
          <OnurTab
            userId={user.id}
            isMe={isMe}
            giftWall={giftWall}
            myRides={isMe ? COSMETICS.filter((c) => c.kind === 'ride' && inventory.has(c.id)).map((c) => ({ id: c.id, emoji: c.emoji, name: c.name })) : null}
          />
        )}

        {tab === 'iliski' && (
          <RelationsTab
            user={user}
            isMe={isMe}
            relations={relations}
            pending={sentInvites}
            onInvite={startInvite}
          />
        )}
      </ScrollView>

      {/* Fixed top bar; collapses into a solid bar with the tabs once scrolled past the header. */}
      <View pointerEvents="box-none" style={[styles.topBar, collapsed && { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <View style={[styles.topRow, { marginTop: insets.top }]}>
          <Pressable onPress={() => router.back()} style={[styles.iconBtn, collapsed && { backgroundColor: 'transparent' }]} accessibilityLabel="Geri">
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.topTitle} numberOfLines={1}>
            {collapsed ? user.name : ''}
          </Text>
          {isMe ? (
            <Pressable onPress={() => setEditOpen(true)} style={styles.iconBtn} accessibilityLabel="Profili düzenle">
              <Ionicons name="pencil" size={20} color="#fff" />
            </Pressable>
          ) : (
            <Pressable onPress={() => setSheet('more')} style={styles.iconBtn} accessibilityLabel="Diğer">
              <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
            </Pressable>
          )}
        </View>
        {collapsed && <TabBar tab={tab} onChange={setTab} />}
      </View>

      {!isMe && (
        <SafeAreaView edges={['bottom']} style={styles.bottom}>
          <Pressable style={[styles.followBtn, isFollowing && styles.followingBtn]} onPress={follow} accessibilityLabel="Takip et">
            <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={20} color="#fff" />
            <Text style={styles.followText}>{isFollowing ? 'Takipte' : 'Takip et'}</Text>
          </Pressable>
          <BarButton icon="chatbubble-ellipses" label="Mesaj" off={!can('message').ok} onPress={() => guard('message', () => router.push(`/sohbet/${user.id}`))} />
          <BarButton icon="call" label="Ara" off={!can('voice').ok && !can('video').ok} onPress={() => (can('voice').ok || can('video').ok ? setSheet('call') : call('sesli'))} />
          <BarButton icon="gift" label="Hediye" highlight off={!can('gift').ok} onPress={() => guard('gift', () => setSheet('gift'))} />
        </SafeAreaView>
      )}

      <ActionSheet
        visible={sheet === 'more'}
        title={user.name}
        onClose={() => setSheet('none')}
        options={[
          { label: '🎙️ Odama davet et', onPress: inviteToRoom },
          { label: '🔗 Profili paylaş', onPress: () => shareLink(`${user.name} Similar Club'da, profiline göz at!`, `kullanici/${user.id}`) },
          { label: '📋 Kullanıcı adını kopyala', onPress: copyUsername },
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
            logSafety('Şikâyet etti', user.id, `${r} · #${no}`);
            showAlert('Şikâyet alındı', `Talep #${no} · "${r}". İnceleme sonucu bildirim olarak gelir; durumu Destek ekranından izleyebilirsin.`);
          },
        }))}
      />
      <ActionSheet
        visible={sheet === 'call'}
        title={`${user.name} ile arama`}
        onClose={() => setSheet('none')}
        options={[
          { label: `📞 Sesli arama · 🪙 ${Math.round(callPrice(user) / 2)}/dk${can('voice').ok ? '' : ' · kapalı'}`, onPress: () => call('sesli') },
          { label: `🎥 Görüntülü arama · 🪙 ${callPrice(user)}/dk${can('video').ok ? '' : ' · kapalı'}`, onPress: () => call('goruntulu') },
        ]}
      />
      <ActionSheet
        visible={sheet === 'gift'}
        title={`${user.name} kişisine hediye gönder`}
        onClose={() => setSheet('none')}
        options={GIFTS.map((g) => ({ label: `${g.emoji} ${g.name} · 🪙 ${g.price}${(g.minSvip ?? 0) > svipLevel ? ` · 🔒 SVIP ${g.minSvip}` : ''}`, onPress: () => sendGift(g) }))}
      />

      {editOpen && (
        <EditSheet
          user={me}
          onPhoto={() => pickPhoto(false)}
          onClose={() => setEditOpen(false)}
          onSave={(patch) => {
            updateMe(patch);
            setEditOpen(false);
          }}
        />
      )}

      <UserPicker
        visible={pickerKind !== null}
        title={pickerKind === 'dost' ? 'Dost daveti gönder' : 'CP oluşturma daveti'}
        users={pickerUsers}
        pending={pickerKind ? sentInvites.filter((k) => k.startsWith(`${pickerKind}:`)).map((k) => k.split(':')[1]) : []}
        onClose={() => setPickerKind(null)}
        onPick={(uid) => {
          const kind = pickerKind;
          setPickerKind(null);
          if (kind) sendInvite(kind, uid);
        }}
      />
    </View>
  );
}

// --- Header pieces -------------------------------------------------------------

function Guardian({ guardian }: { guardian: { userId: string; points: number } | null }) {
  const g = guardian ? userById(guardian.userId) : null;
  return (
    <Pressable
      style={styles.guardian}
      onPress={() =>
        g
          ? router.push(`/kullanici/${g.id}`)
          : showAlert('KORUMA', 'Bu profilin henüz bir koruması yok. Hayran kulübünde en çok destek veren kişi KORUMA olur.')
      }
      accessibilityLabel="Koruma"
    >
      {g ? (
        <View style={styles.guardianRing}>
          <Image source={{ uri: g.avatar }} style={styles.guardianImg} />
        </View>
      ) : (
        <View style={[styles.guardianRing, { backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="person" size={34} color={colors.textDim} />
        </View>
      )}
      <LinearGradient colors={['#FDE68A', '#F59E0B', '#B45309']} style={styles.guardianLabel}>
        <Text style={styles.guardianText}>👑 KORUMA</Text>
      </LinearGradient>
      {g && guardian && (
        <Text style={[styles.meta, { fontSize: 12, marginTop: 4 }]} numberOfLines={1}>
          {g.name} · {(guardian.points / 1000).toFixed(1)}K
        </Text>
      )}
    </Pressable>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <Pressable key={t.id} onPress={() => onChange(t.id)} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            <View style={[styles.tabIndicator, !active && { backgroundColor: 'transparent' }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

function Stat({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  return (
    <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={onPress} disabled={!onPress}>
      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>{n.toLocaleString('tr-TR')}</Text>
      <Text style={[styles.meta, { fontSize: 12 }]}>{label}</Text>
    </Pressable>
  );
}

function BarButton({ icon, label, onPress, highlight, off }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; highlight?: boolean; off?: boolean }) {
  // "off" stays tappable so the reason can be shown, but looks disabled.
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 2, opacity: off ? 0.4 : 1 }} accessibilityLabel={label} accessibilityState={{ disabled: off }}>
      {highlight ? (
        <LinearGradient colors={gradientDeep} style={styles.roundBtn}>
          <Ionicons name={icon} size={21} color="#fff" />
        </LinearGradient>
      ) : (
        <View style={styles.roundBtn}>
          <Ionicons name={icon} size={21} color="#fff" />
        </View>
      )}
      <Text style={{ color: colors.textDim, fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}

// --- Profil tab pieces -----------------------------------------------------------

function Band() {
  return <View style={styles.band} />;
}

function AffiliationSection({ title, item, empty, emptyHref }: { title: string; item: Affiliation | null; empty: string; emptyHref?: Href }) {
  if (!item) return (
    <View style={styles.section}>
      <SectionTitle title={title} right={empty} onPress={emptyHref ? () => router.push(emptyHref) : undefined} />
    </View>
  );
  const go = item.href ? () => router.push(item.href!) : undefined;
  return (
    <View style={styles.section}>
      <SectionTitle title={title} onPress={go} />
      <Pressable style={styles.familyCard} onPress={go} disabled={!go} accessibilityLabel={`${title}: ${item.name}, ${item.sub}`}>
        <View style={styles.familyEmoji}>
          <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.roomTitle}>{item.name}</Text>
          <Text style={styles.meta}>{item.sub}</Text>
        </View>
        {go && <Ionicons name="chevron-forward" size={18} color={colors.textDim} />}
      </Pressable>
    </View>
  );
}

function SectionTitle({ title, onPress, right }: { title: string; onPress?: () => void; right?: string }) {
  return (
    <Pressable style={styles.sectionHead} onPress={onPress} disabled={!onPress}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right && <Text style={[styles.meta, { marginRight: 2 }]}>{right}</Text>}
      {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textDim} />}
    </Pressable>
  );
}

function InfoBox({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoBox}>
      <LinearGradient colors={['#13D9DF', colors.primary]} style={styles.infoIcon}>
        <Ionicons name={icon} size={20} color="#fff" />
      </LinearGradient>
      <Text style={{ color: '#E9E4FF', flex: 1, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

function Chip({ icon, emoji, label }: { icon?: keyof typeof Ionicons.glyphMap; emoji?: string; label: string }) {
  return (
    <View style={styles.chip}>
      {icon && <Ionicons name={icon} size={15} color="#fff" />}
      {emoji && <Text style={{ fontSize: 15 }}>{emoji}</Text>}
      <Text style={{ color: '#fff', fontSize: 14 }}>{label}</Text>
    </View>
  );
}

function InfoRow({ icon, label, hint, children }: { icon: keyof typeof Ionicons.glyphMap; label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={19} color="#fff" />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: '#fff', fontSize: 15 }}>{label}</Text>
        {hint && (
          <View style={styles.row}>
            <Ionicons name="alert-circle-outline" size={12} color={colors.textDim} />
            <Text style={[styles.meta, { fontSize: 12 }]}>{hint}</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

function FanClubCard({ name, club }: { name: string; club: FanClub | undefined }) {
  const [showHistory, setShowHistory] = useState(false);
  const points = club?.points ?? 0;
  const fan = fanLevel(points);
  return (
    <View style={styles.fanCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '800', flex: 1 }}>💜 {name} hayran kulübü</Text>
        <Text style={{ color: colors.gold, fontWeight: '800' }}>
          Lv.{fan.index + 1} · {points} puan
        </Text>
      </View>
      <Text style={styles.meta}>
        {fan.current.name} · Ödül: {fan.current.reward}
      </Text>
      <View style={styles.track}>
        <View style={{ height: 6, backgroundColor: colors.pink, width: fan.next ? `${((points - fan.current.min) / (fan.next.min - fan.current.min)) * 100}%` : '100%' }} />
      </View>
      <Text style={styles.meta}>{fan.next ? `Sonraki: ${fan.next.name} (${fan.next.min} puan) → ${fan.next.reward}` : 'En üst kulüp seviyesi'}</Text>
      <Text style={styles.meta}>Puan kazan: takip et (+10), odasına katıl (+5), odada kal (+2/dk), görevler; hediye zorunlu değil.</Text>
      <Pressable onPress={() => setShowHistory((v) => !v)}>
        <Text style={{ color: colors.pink, fontWeight: '700', fontSize: 12 }}>{showHistory ? 'Puan geçmişini gizle' : 'Puan geçmişi'}</Text>
      </Pressable>
      {showHistory &&
        (club?.history.length ? (
          club.history.map((h, i) => (
            <Text key={`${h.time}-${i}`} style={styles.meta}>
              {h.time} · {h.text} · +{h.pts}
            </Text>
          ))
        ) : (
          <Text style={styles.meta}>Henüz puan yok.</Text>
        ))}
      <Text style={[styles.meta, { fontSize: 12 }]}>Seviyeler: {FAN_LEVELS.map((l) => l.name).join(' → ')}</Text>
    </View>
  );
}

function MomentItem({ moment, user }: { moment: Moment; user: User }) {
  return (
    <View style={styles.moment}>
      <View style={styles.row}>
        <Avatar uri={user.avatar} size={36} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{user.name}</Text>
          <Text style={[styles.meta, { fontSize: 12 }]}>{moment.time}</Text>
        </View>
      </View>
      <Text style={{ color: '#fff', fontSize: 15 }}>{moment.text}</Text>
      {moment.image && <Image source={{ uri: moment.image }} style={styles.momentImg} />}
      <View style={[styles.row, { gap: 16 }]}>
        <View style={styles.row}>
          <Ionicons name="heart-outline" size={16} color={colors.textDim} />
          <Text style={styles.meta}>{moment.likes}</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="chatbubble-outline" size={15} color={colors.textDim} />
          <Text style={styles.meta}>{moment.comments}</Text>
        </View>
      </View>
    </View>
  );
}

// --- Onur tab ----------------------------------------------------------------------

function WallBanner({ title, colors: bg, right, onPress, subtitle, children }: { title: string; colors: readonly [ColorValue, ColorValue, ...ColorValue[]]; right: ReactNode; onPress?: () => void; subtitle?: string; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <LinearGradient colors={bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wall}>
        <View style={styles.wallHead}>
          <View style={{ flex: 1 }} />
          <LinearGradient colors={['#FEF3C7', '#FBBF24']} style={styles.wallRibbon}>
            <Text style={styles.wallTitle}>{title}</Text>
          </LinearGradient>
          <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>{right}</View>
        </View>
        {subtitle && <Text style={styles.wallSub}>{subtitle}</Text>}
        {children}
      </LinearGradient>
    </Pressable>
  );
}

function Pedestals({ items, tint }: { items: { id: string; emoji: string; name: string }[]; tint: string }) {
  const slots = [0, 1, 2, 3].map((i) => items[i] ?? null);
  return (
    <View style={styles.pedestals}>
      {slots.map((it, i) => (
        <View key={it?.id ?? `empty-${i}`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontSize: 30, opacity: it ? 1 : 0 }}>{it?.emoji ?? '·'}</Text>
          <View style={[styles.pedestal, { backgroundColor: tint }]} />
          <Text style={styles.pedestalName} numberOfLines={1}>
            {it?.name ?? ' '}
          </Text>
        </View>
      ))}
    </View>
  );
}

function OnurTab({ userId, isMe, giftWall, myRides }: { userId: string; isMe: boolean; giftWall: (Gift & { count: number })[]; myRides: { id: string; emoji: string; name: string }[] | null }) {
  const medals = medalsOf(userId);
  const titles = titlesOf(userId);
  const rides = myRides ?? vehiclesOf(userId).map((c) => ({ id: c.id, emoji: c.emoji, name: c.name }));
  const lit = giftWall.filter((g) => g.count > 0).length;
  const gold = medals.filter((m) => m.tier === 'gold').length;
  const collections = GIFT_COLLECTIONS.map((c) => ({ ...c, done: collectionProgress(userId, c) }));
  const doneCollections = collections.filter((c) => c.done >= c.total).length;
  const explain = (title: string, body: string) => () => showAlert(title, body);

  return (
    <View style={{ padding: 16, gap: 16 }}>
      <WallBanner
        title="Madalya Duvarı"
        colors={['#B45309', '#F59E0B', '#92400E']}
        onPress={explain('Madalya Duvarı', isMe ? 'Etkinliklere katılarak ve görevleri tamamlayarak madalya kazan.' : `${medals.length} madalya kazanılmış.`)}
        right={
          <>
            <Text style={styles.wallCount}>🏅 {gold}</Text>
            <Text style={styles.wallCount}> 🥈 {medals.length - gold}</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </>
        }
      >
        <Pedestals items={medals} tint="rgba(254,243,199,0.45)" />
      </WallBanner>

      <WallBanner
        title="Unvan Duvarı"
        colors={['#0B3B4A', '#087A80', '#0B3B4A']}
        subtitle="Yalnızca dinamik unvanları göster"
        onPress={explain('Unvan Duvarı', 'Sıralamalarda ve etkinliklerde derece yaparak unvan kazan.')}
        right={
          <>
            <Text style={styles.wallCount}>{titles.length}</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </>
        }
      >
        <View style={styles.titleGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const t = titles[i];
            return t ? (
              <LinearGradient key={t.id} colors={t.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.titleSlot}>
                <Text style={styles.titleText} numberOfLines={1}>
                  {t.name}
                </Text>
              </LinearGradient>
            ) : (
              <View key={`slot-${i}`} style={[styles.titleSlot, { backgroundColor: 'rgba(255,255,255,0.12)' }]} />
            );
          })}
        </View>
      </WallBanner>

      <WallBanner
        title="Araç Duvarı"
        colors={['#7F1D1D', '#DC2626', '#7F1D1D']}
        onPress={() => router.push('/magaza')}
        right={
          <>
            <Text style={styles.wallCount}>Satın al</Text>
            <Ionicons name="chevron-forward" size={14} color="#fff" />
          </>
        }
      >
        <Pedestals items={rides} tint="rgba(254,202,202,0.4)" />
      </WallBanner>

      <View style={[styles.sectionHead, { marginTop: 6 }]}>
        <Text style={[styles.sectionTitle, { color: '#fff', fontSize: 18 }]}>Hediyeler Duvarı</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.meta}>
          Aydınlatılmış <Text style={{ color: '#fff', fontWeight: '800' }}>{lit}</Text>/{GIFT_CATALOG_TOTAL}
        </Text>
      </View>
      <View style={styles.giftWall}>
        {giftWall.map((g) => (
          <View key={g.id} style={styles.giftCell}>
            <GiftArt giftId={g.id} emoji={g.emoji} size={34} style={{ opacity: g.count > 0 ? 1 : 0.25 }} textStyle={{ fontSize: 26, opacity: g.count > 0 ? 1 : 0.25 }} />
            <Text style={[styles.meta, { fontSize: 12 }]} numberOfLines={1}>
              {g.name}
            </Text>
            <Text style={{ color: g.count > 0 ? colors.gold : colors.textDim, fontSize: 12, fontWeight: '700' }}>x{g.count}</Text>
          </View>
        ))}
      </View>

      <View style={styles.catalog}>
        <View style={styles.sectionHead}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Hediye Kataloğu</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.meta}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>{doneCollections}</Text>/{collections.length}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {collections.map((c) => (
            <LinearGradient key={c.id} colors={c.done > 0 ? c.colors : ['#3F3A52', '#1F1B2E']} style={styles.collection}>
              <Text style={{ fontSize: 44, opacity: c.done > 0 ? 1 : 0.4 }}>{c.emoji}</Text>
              <Text style={styles.collectionName} numberOfLines={2}>
                {c.name}
              </Text>
              <View style={styles.collectionBar}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                  {c.done}/{c.total}
                </Text>
              </View>
            </LinearGradient>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

// --- İlişki tab ----------------------------------------------------------------------

function RelationsTab({ user, isMe, relations, pending, onInvite }: { user: User; isMe: boolean; relations: { cp: Relation[]; dost: Relation[] }; pending: string[]; onInvite: (k: InviteKind) => void }) {
  const [kind, setKind] = useState<'cp' | 'dost'>('cp');
  const [top1Only, setTop1Only] = useState(false);
  const [hidden, setHidden] = useState(false);
  const all = relations[kind];
  const list = top1Only ? all.slice(0, 1) : all;
  const waiting = pending.filter((k) => k.startsWith(`${kind}:`)).map((k) => userById(k.split(':')[1]));
  const showList = isMe || !hidden;

  return (
    <View style={{ padding: 16 }}>
      <LinearGradient colors={['#5A2232', '#2A1A24', colors.card]} style={styles.relCard}>
        <View style={styles.row}>
          <Pressable style={styles.relIcon} onPress={() => router.push('/magaza')} accessibilityLabel="Mağaza">
            <Ionicons name="storefront" size={18} color="#fff" />
          </Pressable>
          <View style={styles.segment}>
            {(['cp', 'dost'] as const).map((k) => (
              <Pressable key={k} style={[styles.segmentItem, kind === k && styles.segmentActive]} onPress={() => setKind(k)}>
                <Text style={[styles.segmentText, kind === k && { color: '#fff' }]}>{k === 'cp' ? 'CP' : 'Dost'}</Text>
              </Pressable>
            ))}
          </View>
          {isMe ? (
            <Pressable style={styles.relIcon} onPress={() => setHidden((v) => !v)} accessibilityLabel="Görünürlük">
              <Ionicons name={hidden ? 'eye-off' : 'eye'} size={18} color={colors.primaryText} />
            </Pressable>
          ) : (
            <View style={{ width: 34 }} />
          )}
          <Pressable
            style={styles.relIcon}
            onPress={() =>
              showAlert(
                kind === 'cp' ? 'CP nedir?' : 'Dost nedir?',
                kind === 'cp'
                  ? 'CP, iki kullanıcının karşılıklı kabul ettiği özel ilişkidir. Birlikte geçirilen gün ve hediyelerle seviye atlar; Lv.5 ile düğün ayırtılabilir.'
                  : 'Dost ilişkisi en yakın arkadaşların için. Kanka, Kardeş, Sırdaş gibi etiketler seçebilirsin.',
              )
            }
            accessibilityLabel="Yardım"
          >
            <Ionicons name="help" size={18} color={colors.primaryText} />
          </Pressable>
        </View>
        {isMe && (
          <Pressable style={[styles.row, { alignSelf: 'flex-end', marginTop: 10 }]} onPress={() => setTop1Only((v) => !v)}>
            <Ionicons name={top1Only ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={colors.primaryText} />
            <Text style={{ color: '#A5F3F5', fontSize: 13 }}>Yalnızca TOP1 gösterilsin</Text>
          </Pressable>
        )}
        {isMe && hidden && <Text style={[styles.meta, { marginTop: 6, textAlign: 'right', fontSize: 12 }]}>İlişkilerin diğer kullanıcılardan gizli.</Text>}

        <View style={{ gap: 12, marginTop: 14 }}>
          {showList &&
            list.map((r) => (
              <RelationRow key={r.partnerId} user={user} relation={r} kind={kind} canWed={isMe && kind === 'cp'} />
            ))}
          {showList && list.length === 0 && (
            <Text style={[styles.meta, { textAlign: 'center', paddingVertical: 12 }]}>{kind === 'cp' ? 'Henüz CP yok.' : 'Henüz dost yok.'}</Text>
          )}
          {waiting.map((w) => (
            <View key={w.id} style={[styles.row, styles.pendingRow]}>
              <Avatar uri={w.avatar} size={30} />
              <Text style={{ color: '#fff', flex: 1 }}>{w.name}</Text>
              <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '700' }}>Davet bekleniyor</Text>
            </View>
          ))}
          <View style={styles.slot}>
            <Text style={styles.slotNo}>{list.length + 1}</Text>
            <InviteButton icon="add-circle" title={kind === 'cp' ? 'CP oluşturma daveti' : 'Dost daveti gönder'} onPress={() => onInvite(kind)} />
          </View>
          <View style={styles.slot}>
            <Text style={styles.slotNo}>{list.length + 2}</Text>
            <InviteButton icon="home" title="Buluşma Odasına Davet Et" onPress={() => onInvite('meet')} />
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

function RelationRow({ user, relation, kind, canWed }: { user: User; relation: Relation; kind: 'cp' | 'dost'; canWed: boolean }) {
  const partner = userById(relation.partnerId);
  return (
    <View style={styles.relRow}>
      <View style={styles.relLv}>
        <Text style={styles.relLvText}>Lv.{relation.level}</Text>
      </View>
      <View style={styles.relPair}>
        <View style={{ alignItems: 'center', gap: 4, flex: 1 }}>
          <Avatar uri={user.avatar} size={58} />
          <Text style={styles.relName} numberOfLines={1}>
            {user.name}
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>{kind === 'cp' ? '💖' : '🤝'}</Text>
          <LinearGradient colors={['#FF8A97', '#0FB8BE']} style={styles.daysPill}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{relation.days} gün</Text>
          </LinearGradient>
          {relation.label && <Text style={[styles.meta, { fontSize: 12, marginTop: 2 }]}>{relation.label}</Text>}
        </View>
        <Pressable style={{ alignItems: 'center', gap: 4, flex: 1 }} onPress={() => router.push(`/kullanici/${partner.id}`)}>
          <Avatar uri={partner.avatar} size={58} />
          <Text style={styles.relName} numberOfLines={1}>
            {partner.name}
          </Text>
        </Pressable>
      </View>
      {canWed && (
        <Pressable
          style={styles.wedPill}
          onPress={() =>
            relation.level >= 5
              ? showAlert('Düğün ayırt', `${partner.name} ile düğün salonu ayırtıldı 💒`)
              : showAlert('Düğün ayırt', `Düğün salonu CP Lv.5 ile açılır. ${partner.name} ile şu an Lv.${relation.level}. Birlikte odada vakit geçirip hediyeleşerek seviye atlayın.`)
          }
        >
          <Text style={{ fontSize: 12 }}>💒</Text>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Düğün ayırt</Text>
        </Pressable>
      )}
    </View>
  );
}

function InviteButton({ icon, title, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1, opacity: pressed ? 0.85 : 1 }]}>
      <LinearGradient colors={[semantic.socialFill, '#A82F42']} style={styles.inviteBtn}>
        <Ionicons name={icon} size={18} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

// --- Sheets ----------------------------------------------------------------------------

const GENDERS: [User['gender'] | 'hidden', string][] = [
  ['Kadın', 'Kadın'],
  ['Erkek', 'Erkek'],
  ['hidden', 'Belirtmek istemiyorum'],
];

function EditSheet({ user, onSave, onClose, onPhoto }: { user: User; onSave: (patch: Partial<User>) => void; onClose: () => void; onPhoto: () => void }) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username ?? '');
  const [bio, setBio] = useState(user.bio);
  const [city, setCity] = useState(user.city);
  const [birth, setBirth] = useState(formatTrDate(user.birthDate));
  const [gender, setGender] = useState<User['gender'] | 'hidden'>(user.showGender === false ? 'hidden' : user.gender);
  const [country, setCountry] = useState(user.country ?? 'TR');
  const [interests, setInterests] = useState<string[]>(user.interests ?? []);
  const [errors, setErrors] = useState<ProfileErrors>({});

  const save = () => {
    // Same rules the server applies; nothing is saved while any field is invalid.
    const e = validateProfile({ name, username, bio, city, birth });
    setErrors(e);
    if (Object.keys(e).length) return showAlert('Profil kaydedilemedi', Object.values(e).join('\n'));
    const birthDate = parseTrDate(birth)!;
    onSave({
      name: name.trim(),
      username: username.trim().toLowerCase(),
      bio: bio.trim(),
      city: city.trim(),
      birthDate,
      age: ageFrom(birthDate),
      country,
      interests,
      showGender: gender !== 'hidden',
      ...(gender !== 'hidden' ? { gender } : {}),
    });
    showAlert('Profil güncellendi', 'Değişikliklerin kaydedildi.');
  };
  const toggleInterest = (i: string) =>
    setInterests((l) => (l.includes(i) ? l.filter((x) => x !== i) : l.length >= LIMITS.interests ? l : [...l, i]));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.modalSheet, { maxHeight: '88%' }]}>
        <Text style={styles.modalTitle}>Profili düzenle</Text>
        <ScrollView contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          <Pressable style={[styles.row, { gap: 12, marginTop: 4 }]} onPress={onPhoto} accessibilityLabel="Profil fotoğrafını değiştir">
            <Avatar uri={user.avatar} size={56} />
            <Text style={{ color: semantic.tonalText, fontWeight: '800' }}>Fotoğrafı değiştir</Text>
          </Pressable>
          <Field label="Görünen ad" error={errors.name}>
            <TextInput value={name} onChangeText={setName} maxLength={LIMITS.name} style={styles.input} placeholder="Adın veya takma adın" placeholderTextColor={colors.textDim} />
          </Field>
          <Field label="Kullanıcı adı" error={errors.username} hint="Benzersiz olmalı. ID numaran değişmez.">
            <View style={[styles.row, styles.input, { paddingVertical: 0 }]}>
              <Text style={{ color: colors.textDim, fontSize: 15 }}>@</Text>
              <TextInput value={username} onChangeText={(t) => setUsername(t.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={20} style={{ flex: 1, color: '#fff', fontSize: 15, paddingVertical: 10 }} placeholder="kullanici.adi" placeholderTextColor={colors.textDim} />
            </View>
          </Field>
          <Field label={`Hakkımda · ${bio.length}/${LIMITS.bio}`} error={errors.bio}>
            <TextInput value={bio} onChangeText={setBio} maxLength={LIMITS.bio} multiline style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} placeholder="Kendini anlat" placeholderTextColor={colors.textDim} />
          </Field>
          <Field label="Doğum tarihi" error={errors.birth} hint="Yalnızca sen görürsün; diğerleri sadece yaşını görür.">
            <TextInput value={birth} onChangeText={setBirth} keyboardType="numbers-and-punctuation" maxLength={10} style={styles.input} placeholder="GG.AA.YYYY" placeholderTextColor={colors.textDim} />
          </Field>
          <Field label="Cinsiyet (isteğe bağlı)">
            <ChipRow value={gender} options={GENDERS} onChange={setGender} />
          </Field>
          <Field label="Ülke">
            <ChipRow value={country} options={COUNTRIES.filter((c) => c.code !== 'ALL').map((c) => [c.code, `${c.flag} ${c.name}`] as [string, string])} onChange={setCountry} />
          </Field>
          <Field label="Şehir (isteğe bağlı)" error={errors.city} hint="Boş bırakırsan profilinde şehir görünmez.">
            <TextInput value={city} onChangeText={setCity} maxLength={LIMITS.city} style={styles.input} placeholder="Şehir" placeholderTextColor={colors.textDim} />
          </Field>
          <Field label={`İlgi alanları · ${interests.length}/${LIMITS.interests}`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {INTERESTS.map((i) => (
                <Pressable key={i} onPress={() => toggleInterest(i)} style={[styles.editChip, interests.includes(i) && styles.editChipOn]}>
                  <Text style={{ color: '#fff', fontSize: 13 }}>{i}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
        </ScrollView>
        <View style={[styles.row, { gap: 10, marginTop: 12 }]}>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={{ color: colors.textDim, fontWeight: '700' }}>Vazgeç</Text>
          </Pressable>
          <GradientButton title="Kaydet" style={{ flex: 1 }} onPress={save} />
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <View>
      <Text style={styles.inputLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={[styles.meta, { fontSize: 12, marginTop: 4 }]}>{hint}</Text> : null}
    </View>
  );
}

function ChipRow<T extends string | undefined>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map(([v, l]) => (
        <Pressable key={String(v)} onPress={() => onChange(v)} style={[styles.editChip, value === v && styles.editChipOn]}>
          <Text style={{ color: '#fff', fontSize: 13 }}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Owner-only numbers: balances, VIP end date and XP never appear on profiles others open. */
function PrivateStats(p: { coins: number; diamonds: number; vipUntil: string | null; wealthXp: number; charmXp: number; giftsSent: number; giftsReceived: number }) {
  const n = (x: number) => x.toLocaleString('tr-TR');
  return (
    <View style={styles.privateCard}>
      <View style={styles.row}>
        <Ionicons name="lock-closed" size={14} color={colors.textDim} />
        <Text style={[styles.meta, { fontSize: 12 }]}>Yalnızca sen görürsün</Text>
      </View>
      <View style={styles.privateRow}>
        <Pressable style={styles.privateCell} onPress={() => router.push('/cuzdan')} accessibilityLabel="Jeton bakiyesi">
          <Icon3D name="coin" size={26} />
          <Text style={styles.privateValue}>{n(p.coins)}</Text>
          <Text style={styles.meta}>Jeton</Text>
        </Pressable>
        <Pressable style={styles.privateCell} onPress={() => router.push('/gelir')} accessibilityLabel="Elmas bakiyesi">
          <Icon3D name="diamond" size={26} />
          <Text style={styles.privateValue}>{n(p.diamonds)}</Text>
          <Text style={styles.meta}>Elmas</Text>
        </Pressable>
        <Pressable style={styles.privateCell} onPress={() => router.push('/vip')} accessibilityLabel="VIP durumu">
          <Icon3D name="crown" size={26} />
          <Text style={styles.privateValue} numberOfLines={1}>
            {p.vipUntil ?? 'Yok'}
          </Text>
          <Text style={styles.meta}>{p.vipUntil ? 'VIP bitişi' : 'VIP'}</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => router.push('/seviye')} accessibilityLabel="Seviye ve deneyim puanı">
        <Text style={styles.meta}>
          Servet puanı {n(p.wealthXp)} · Cazibe puanı {n(p.charmXp)} · Hediye: {n(p.giftsSent)} gönderdin, {n(p.giftsReceived)} aldın ›
        </Text>
      </Pressable>
    </View>
  );
}

function UserPicker({ visible, title, users, pending, onPick, onClose }: { visible: boolean; title: string; users: User[]; pending: string[]; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.modalSheet, { maxHeight: '70%' }]}>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={[styles.meta, { textAlign: 'center', marginBottom: 8 }]}>Takip ettiğin kişilerden birini seç</Text>
        {users.length === 0 ? (
          <Text style={[styles.meta, { textAlign: 'center', paddingVertical: 24 }]}>Henüz kimseyi takip etmiyorsun. Önce birini takip et.</Text>
        ) : (
          <ScrollView contentContainerStyle={{ gap: 4 }}>
            {users.map((u) => {
              const sent = pending.includes(u.id);
              return (
                <Pressable key={u.id} style={({ pressed }) => [styles.pickRow, pressed && { backgroundColor: colors.cardAlt }]} onPress={() => onPick(u.id)}>
                  <Avatar uri={u.avatar} size={40} online={u.online} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{u.name}</Text>
                    <Text style={[styles.meta, { fontSize: 12 }]}>
                      {u.age} · {u.city}
                    </Text>
                  </View>
                  <Text style={{ color: sent ? colors.gold : colors.pink, fontWeight: '700', fontSize: 13 }}>{sent ? 'Gönderildi' : 'Davet et'}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <Pressable style={[styles.cancelBtn, { marginTop: 10 }]} onPress={onClose}>
          <Text style={{ color: colors.textDim, fontWeight: '700' }}>Kapat</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cover: { width: '100%', height: 240, backgroundColor: colors.card },
  voicePill: { position: 'absolute', right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingLeft: 4, paddingRight: 12, paddingVertical: 4 },
  micDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, marginTop: -26, paddingHorizontal: 16, paddingBottom: 6 },
  avatarWrap: { marginTop: -48, alignSelf: 'flex-start', borderRadius: 60, borderWidth: 3, borderColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: '#fff', fontSize: 26, fontWeight: '900', flexShrink: 1 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 4 },
  flagText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  genderText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  vSep: { width: 1, height: 14, backgroundColor: colors.border, marginHorizontal: 4 },
  meta: { color: colors.textDim, fontSize: 13 },
  bio: { color: '#E9E4FF', fontSize: 16, flexShrink: 1 },
  bioEdit: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: 14, paddingVertical: 10, marginTop: 14 },
  guardian: { width: 96, alignItems: 'center', paddingTop: 14 },
  guardianRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: colors.gold, overflow: 'hidden' },
  guardianImg: { width: '100%', height: '100%' },
  guardianLabel: { marginTop: -12, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#FEF3C7' },
  guardianText: { color: '#5B2A00', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  tabBar: { flexDirection: 'row', justifyContent: 'center', gap: 26, height: TAB_H, backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabItem: { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 4, gap: 5 },
  tabText: { color: colors.textDim, fontSize: 17, fontWeight: '600' },
  tabTextActive: { color: '#fff', fontSize: 19, fontWeight: '900' },
  tabIndicator: { width: 18, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  topRow: { height: BAR_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  topTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  iconBtn: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  band: { height: 8, backgroundColor: 'rgba(0,0,0,0.28)' },
  section: { padding: 16, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: colors.textDim, fontSize: 16, fontWeight: '800' },
  rewardCard: { borderRadius: 18, padding: 14 },
  rewardTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  rewardSub: { color: '#fff', fontWeight: '700', fontSize: 13 },
  rewardTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  rewardFill: { height: 6, backgroundColor: '#fff', borderRadius: 3 },
  rewardPct: { color: '#fff', fontWeight: '900', fontSize: 13, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
  editPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14 },
  infoIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  infoCard: { backgroundColor: colors.card, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 6 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  infoValue: { color: '#fff', fontSize: 15, fontWeight: '800' },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 10 },
  roomCover: { width: 84, height: 84, borderRadius: 12, backgroundColor: colors.cardAlt },
  roomTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  lvChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(34,197,94,0.18)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  lvText: { color: colors.green, fontWeight: '800', fontSize: 12 },
  familyCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card, borderRadius: 16, padding: 12 },
  familyEmoji: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  fanCard: { backgroundColor: colors.card, borderRadius: 16, padding: 14, gap: 6, borderWidth: 1, borderColor: 'rgba(255,101,118,0.4)' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.cardAlt, overflow: 'hidden' },
  photo: { width: 110, height: 110, borderRadius: 12 },
  addPhoto: { backgroundColor: colors.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 2 },
  removePhoto: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(8,15,30,0.75)', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  reviewNote: { color: colors.gold, fontSize: 12, fontWeight: '700' },
  handle: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  staffChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#B91C1C', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  statusNote: { color: colors.gold, fontSize: 13, marginTop: 8 },
  privateCard: { backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 10, borderWidth: 1, borderColor: colors.border },
  privateRow: { flexDirection: 'row', gap: 8 },
  privateCell: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: colors.cardAlt, borderRadius: 12, paddingVertical: 10 },
  privateValue: { color: colors.text, fontWeight: '900', fontSize: 15 },
  fieldError: { color: '#FF7A82', fontSize: 12, marginTop: 4, fontWeight: '600' },
  editChip: { backgroundColor: colors.cardAlt, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'transparent' },
  editChipOn: { borderColor: semantic.action, backgroundColor: 'rgba(19,217,223,0.18)' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 4 },
  moment: { backgroundColor: colors.card, borderRadius: 16, padding: 12, gap: 10 },
  momentImg: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.cardAlt },
  wall: { borderRadius: 14, padding: 12, paddingTop: 0, borderWidth: 1, borderColor: 'rgba(254,243,199,0.5)', overflow: 'hidden' },
  wallHead: { flexDirection: 'row', alignItems: 'center' },
  wallRibbon: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14, paddingHorizontal: 18, paddingVertical: 6 },
  wallTitle: { color: '#78350F', fontWeight: '900', fontSize: 16 },
  wallSub: { color: '#fff', textAlign: 'center', marginTop: 8, fontSize: 13 },
  wallCount: { color: '#fff', fontWeight: '700', fontSize: 13 },
  pedestals: { flexDirection: 'row', gap: 8, marginTop: 14 },
  pedestal: { width: '90%', height: 14, borderRadius: 4 },
  pedestalName: { color: '#fff', fontSize: 11, fontWeight: '600' },
  titleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'space-between' },
  titleSlot: { width: '31%', height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  titleText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  giftWall: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.card, borderRadius: 16, padding: 8 },
  giftCell: { width: '25%', alignItems: 'center', paddingVertical: 8, gap: 1 },
  catalog: { backgroundColor: colors.card, borderRadius: 18, padding: 14, gap: 12 },
  collection: { width: 120, height: 160, borderRadius: 14, alignItems: 'center', justifyContent: 'flex-end', padding: 8, gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  collectionName: { color: colors.gold, fontWeight: '900', fontSize: 14, textAlign: 'center' },
  collectionBar: { backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  relCard: { borderRadius: 22, padding: 14, borderWidth: 1, borderColor: colors.border },
  relIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  segment: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 999, padding: 3 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textDim, fontWeight: '800', fontSize: 15 },
  relRow: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 12, paddingTop: 22 },
  relLv: { position: 'absolute', top: 6, left: 8, backgroundColor: semantic.socialFill, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  relLvText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  relPair: { flexDirection: 'row', alignItems: 'center' },
  relName: { color: '#fff', fontSize: 13, fontWeight: '600', maxWidth: 90 },
  daysPill: { marginTop: -8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  wedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginTop: 8 },
  pendingRow: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 8, gap: 10 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 14 },
  slotNo: { color: colors.pink, fontSize: 15, fontWeight: '700', width: 16, textAlign: 'center' },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 13 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  followBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, borderRadius: 23, backgroundColor: semantic.socialFill },
  followingBtn: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  followText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 34 },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  inputLabel: { color: colors.textDim, fontSize: 13, fontWeight: '700', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: colors.cardAlt, color: '#fff', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  cancelBtn: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, backgroundColor: colors.cardAlt, alignItems: 'center' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 14 },
  presence: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: 'rgba(19,217,223,0.15)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#0FB8BE' },
  presenceGo: { color: '#fff', fontWeight: '800', backgroundColor: '#0FB8BE', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6, overflow: 'hidden' },
});
