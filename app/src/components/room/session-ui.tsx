// What the user sees of the live room session outside the room screen, and its state inside it:
// the leave choice ("Odayı küçült" / "Odadan çık"), the mini room card on every other screen, the edge tab
// that brings a hidden mini card back, switching rooms, a session that ended, short notices, the restart
// recovery card and the in-room connection banner. Everything reads lib/room-session; nothing here owns
// the connection.
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Keyboard, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { micHaptic, tapHaptic } from '@/lib/haptics';
import { setConnection, useOnline, useRoomLive } from '@/lib/room-presence';
import {
  MIC_BLOCK_LABEL,
  audioFocus,
  cancelSwitch,
  clearNotice,
  closeLeaveDialog,
  confirmSwitch,
  continueLeave,
  dismissEnded,
  endRoom,
  engineInfo,
  hasOpener,
  hearing,
  micBlock,
  micSending,
  onAppState,
  phoneCall,
  retryNow,
  setMicWant,
  setMiniHidden,
  setPermission,
  setRecovery,
  setRoute,
  useRoomSession,
  type RoomSession,
} from '@/lib/room-session';
import { saveRoom } from '@/lib/room-session-persist';
import { colors, radius, semantic, space, type } from '@/theme';

// --- Navigation helpers -----------------------------------------------------------------------------
/** Opens the full room again: back to its route if it is still in the stack, else a new one. Never reconnects. */
export function expandRoom(roomId: string) {
  tapHaptic();
  const href = { pathname: '/oda/[id]' as const, params: { id: roomId } };
  if (hasOpener(roomId)) router.dismissTo(href);
  else router.push(href);
}
/** Leaves the room screen the same way the system back does, so both meet the same leave choice. */
export function closeRoomScreen() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

// --- Status text --------------------------------------------------------------------------------------
type Tone = 'live' | 'calm' | 'warn' | 'bad';
const TONE: Record<Tone, string> = { live: semantic.live, calm: colors.textDim, warn: colors.gold, bad: semantic.danger };
const ENDED_TEXT = { kicked: 'Odadan çıkarıldın', server: 'Oda sona erdi' } as const;

/** One line for the session's real state; a dropped connection is never shown as connected. */
export function sessionStatus(s: RoomSession, invited = false): { text: string; tone: Tone; icon: keyof typeof Ionicons.glyphMap } {
  if (s.status === 'ended') return { text: s.endReason === 'server' ? ENDED_TEXT.server : ENDED_TEXT.kicked, tone: 'bad', icon: 'close-circle' };
  if (s.status === 'disconnected') return { text: 'Bağlantı kesildi', tone: 'bad', icon: 'cloud-offline' };
  if (s.status === 'reconnecting') return { text: 'Yeniden bağlanıyor…', tone: 'warn', icon: 'sync' };
  if (s.status === 'connecting') return { text: 'Bağlanıyor…', tone: 'warn', icon: 'sync' };
  if (s.interruption === 'phone_call') return { text: 'Telefon görüşmesi · ses duraklatıldı', tone: 'warn', icon: 'call' };
  if (s.interruption === 'focus_loss') return { text: 'Ses başka bir uygulamada', tone: 'warn', icon: 'volume-mute' };
  if (invited) return { text: 'Mikrofon daveti · aç', tone: 'warn', icon: 'mic' };
  if (s.micWant && micSending(s)) return { text: 'Mikrofonun açık', tone: 'live', icon: 'mic' };
  if (s.micWant) {
    const block = micBlock(s);
    return { text: block ? MIC_BLOCK_LABEL[block] : 'Mikrofonun açık', tone: 'warn', icon: 'mic-off' };
  }
  if (s.seated) return { text: 'Mikrofonun kapalı', tone: 'calm', icon: 'mic-off' };
  return { text: 'Dinliyorsun', tone: 'live', icon: 'headset' };
}

// --- Two-choice sheet -----------------------------------------------------------------------------------
type Choice = { label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void };
/** Primary (filled turquoise) and exit (outlined red) never look alike, so a wrong tap is unlikely. */
function ChoiceSheet({ visible, title, primary, exit, onCancel }: { visible: boolean; title: string; primary: Choice; exit: Choice; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={s.backdrop} onPress={onCancel} accessibilityLabel="Vazgeç" />
      <View style={[s.sheet, { paddingBottom: space.xl + insets.bottom }]} accessibilityViewIsModal>
        <View style={s.handle} />
        <Text style={s.sheetTitle} accessibilityRole="header">
          {title}
        </Text>
        <Pressable style={({ pressed }) => [s.choice, s.choicePrimary, pressed && { opacity: 0.85 }]} onPress={primary.onPress} accessibilityRole="button" accessibilityLabel={`${primary.label}. ${primary.desc}`}>
          <Ionicons name={primary.icon} size={24} color={semantic.actionInk} />
          <View style={{ flex: 1 }}>
            <Text style={[s.choiceLabel, { color: semantic.actionInk }]}>{primary.label}</Text>
            <Text style={[s.choiceDesc, { color: semantic.actionInk }]}>{primary.desc}</Text>
          </View>
        </Pressable>
        <Pressable style={({ pressed }) => [s.choice, s.choiceExit, pressed && { backgroundColor: 'rgba(255,122,130,0.12)' }]} onPress={exit.onPress} accessibilityRole="button" accessibilityLabel={`${exit.label}. ${exit.desc}`}>
          <Ionicons name={exit.icon} size={24} color={semantic.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[s.choiceLabel, { color: semantic.danger }]}>{exit.label}</Text>
            <Text style={s.choiceDesc}>{exit.desc}</Text>
          </View>
        </Pressable>
        <Pressable style={s.cancel} onPress={onCancel} accessibilityRole="button">
          <Text style={s.cancelText}>Vazgeç</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/** Back or close on the full room. Dismissing it changes nothing. */
export function LeaveSheet() {
  const { leaveDialog, session } = useRoomSession();
  return (
    <ChoiceSheet
      visible={leaveDialog && !!session}
      title="Odadan ayrılmak mı istiyorsun?"
      primary={{ label: 'Odayı küçült', desc: 'Oda bağlantın devam eder. Uygulamada diğer işlemlerini yapabilirsin.', icon: 'contract', onPress: () => continueLeave() }}
      exit={{
        label: 'Odadan çık',
        desc: 'Canlı odadan ayrılacaksın.',
        icon: 'exit-outline',
        onPress: () => {
          endRoom('left');
          continueLeave();
        },
      }}
      onCancel={closeLeaveDialog}
    />
  );
}

// --- Mini room ------------------------------------------------------------------------------------------
const TAB_PATHS = ['/', '/kesfet', '/anlar', '/mesajlar', '/profil'];
/** Tabs with a floating button in the bottom-right corner. */
const FAB_TABS = ['/', '/anlar'];
/** Chat screens: the newest messages and the input are at the bottom, so the card sits at the top there. */
const CHAT = [/^\/sohbet\//, /^\/kabile\/sohbet/, /^\/ajans\/sohbet/];
/** Call and match screens keep all their controls: only the small edge tab is shown there. */
const DENSE = [/^\/arama\//, /^\/tanis/, /^\/eslesme/];
const TAB_BAR = 64;

/** Keyboard height on the device (0 when closed). Web has no soft-keyboard events. */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setOpen(true));
    const b = Keyboard.addListener(hideEvt, () => setOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return open;
}

/**
 * The room while the user is elsewhere in the app. Tap: back to the full room (same session). Mic button:
 * the same mic as in the room. X: choose between hiding the card (the room keeps running, the edge tab
 * brings it back) and leaving. Swipe right hides it, swipe up/down moves it out of the way.
 */
export function MiniRoom({ session }: { session: RoomSession }) {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const keyboard = useKeyboardOpen();
  // The room may not be seeded yet right after a restart; read it defensively.
  const room = useRoomLive(session.roomId).room as ReturnType<typeof useRoomLive>['room'] | undefined;
  const [closeAsk, setCloseAsk] = useState(false);
  // null: placed by the screen (top on chat screens); a swipe up or down pins it there.
  const [pinTop, setPinTop] = useState<boolean | null>(null);
  const atTop = pinTop ?? CHAT.some((r) => r.test(path));
  const invited = !!room?.invites.some((i) => i.toId === 'me' && i.status === 'pending');
  const ended = session.status === 'ended';
  const st = sessionStatus(session, invited);
  const onMic = room ? room.seats.filter(Boolean).length + (room.boss ? 1 : 0) : 0;
  // Compact (edge tab only): hidden by the user, a call screen, or the keyboard is up.
  const forced = DENSE.some((r) => r.test(path)) || keyboard;
  const compact = !ended && (session.miniHidden || forced);

  const bottom = TAB_PATHS.includes(path) ? TAB_BAR + insets.bottom + (FAB_TABS.includes(path) ? 84 : 10) : insets.bottom + 84;
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10,
      onPanResponderRelease: (_, g) => {
        if (g.dx > 60 && Math.abs(g.dy) < 50) return setMiniHidden(true);
        if (g.dy < -40) setPinTop(true);
        else if (g.dy > 40) setPinTop(false);
      },
    }),
  );

  if (compact)
    return (
      <Pressable
        style={[s.edge, { top: Math.round(win.height * 0.42) }]}
        onPress={() => (forced ? expandRoom(session.roomId) : setMiniHidden(false))}
        accessibilityRole="button"
        accessibilityLabel={`Canlı oda: ${session.title}. ${st.text}. ${forced ? 'Odayı aç' : 'Mini odayı göster'}`}
        hitSlop={6}
      >
        <Image source={{ uri: session.cover }} style={s.edgeCover} />
        <View style={[s.edgeDot, { backgroundColor: TONE[st.tone] }]} />
      </Pressable>
    );

  const exitChoice: Choice = { label: 'Odadan çık', desc: 'Canlı odadan ayrılacaksın.', icon: 'exit-outline', onPress: () => (setCloseAsk(false), endRoom('left')) };
  return (
    <>
      <View {...pan.panHandlers} style={[s.mini, { width: Math.min(260, win.width - 32) }, atTop ? { top: insets.top + 64 } : { bottom }]} accessibilityLiveRegion="polite">
        <Pressable
          style={s.miniMain}
          onPress={() => (ended ? dismissEnded() : expandRoom(session.roomId))}
          accessibilityRole="button"
          accessibilityLabel={ended ? `${session.title}: ${st.text}. Kapat` : `Canlı oda: ${session.title}. ${st.text}${onMic ? `, ${onMic} kişi mikrofonda` : ''}. Odayı aç`}
        >
          {/* A room cover (rounded square with a live edge), so it never reads as a person's avatar. */}
          <View style={[s.coverWrap, { borderColor: TONE[st.tone] }]}>
            <Image source={{ uri: session.cover }} style={s.cover} />
            {!ended && hearing(session) && (
              <View style={s.coverBadge}>
                <Ionicons name="volume-high" size={10} color={semantic.liveInk} />
              </View>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.titleRow}>
              <Text style={[s.miniTitle, { flexShrink: 1 }]} numberOfLines={1}>
                {session.title}
              </Text>
              {/* Speakers on the room's mics right now. */}
              {!ended && onMic > 0 && (
                <View style={s.speakers}>
                  <Ionicons name="mic" size={10} color={colors.textDim} />
                  <Text style={s.speakersText}>{onMic}</Text>
                </View>
              )}
            </View>
            <View style={s.statusRow}>
              <Ionicons name={st.icon} size={12} color={TONE[st.tone]} />
              <Text style={[s.statusText, { color: TONE[st.tone] }]} numberOfLines={1}>
                {st.text}
              </Text>
            </View>
          </View>
        </Pressable>
        {session.status === 'disconnected' && (
          <Pressable style={s.miniBtn} onPress={retryNow} accessibilityRole="button" accessibilityLabel="Yeniden bağlanmayı dene" hitSlop={4}>
            <Ionicons name="refresh" size={18} color={colors.text} />
          </Pressable>
        )}
        {!ended && session.seated && session.status === 'connected' && (
          <Pressable
            style={[s.miniBtn, session.micWant && { backgroundColor: micSending(session) ? semantic.live : 'rgba(246,189,96,0.25)' }]}
            onPress={() => {
              micHaptic();
              setMicWant(!session.micWant);
            }}
            accessibilityRole="button"
            aria-checked={session.micWant}
            accessibilityLabel={session.micWant ? 'Mikrofonu kapat' : 'Mikrofonu aç'}
            hitSlop={4}
          >
            <Ionicons name={session.micWant ? 'mic' : 'mic-off'} size={18} color={session.micWant && micSending(session) ? semantic.liveInk : colors.text} />
          </Pressable>
        )}
        <Pressable
          style={s.miniClose}
          onPress={() => (ended ? dismissEnded() : setCloseAsk(true))}
          accessibilityRole="button"
          accessibilityLabel={ended ? 'Kapat' : 'Mini oda seçenekleri: gizle veya odadan çık'}
          hitSlop={8}
        >
          <Ionicons name="close" size={18} color={colors.textDim} />
        </Pressable>
      </View>
      <ChoiceSheet
        visible={closeAsk && !ended}
        title={session.title}
        primary={{
          label: 'Odayı küçültülmüş görünümden kaldır',
          desc: 'Oda bağlantın ve mikrofon durumun aynen sürer. Sağ kenardaki sekmeden odaya dönebilirsin.',
          icon: 'eye-off-outline',
          onPress: () => {
            setCloseAsk(false);
            setMiniHidden(true);
          },
        }}
        exit={exitChoice}
        onCancel={() => setCloseAsk(false)}
      />
    </>
  );
}

// --- Switching rooms, ended session, notices, recovery ----------------------------------------------
export function SwitchDialog() {
  const { switchTo, session } = useRoomSession();
  return (
    <Modal visible={!!switchTo && !!session} transparent animationType="fade" onRequestClose={cancelSwitch}>
      <View style={s.center}>
        <View style={s.dialog} accessibilityViewIsModal>
          <Ionicons name="swap-horizontal" size={28} color={colors.primaryText} />
          <Text style={s.dialogTitle}>Başka bir odaya geçilsin mi?</Text>
          <Text style={s.dialogText}>
            Şu an “{session?.title}” odasındasın. “{switchTo?.title}” odasına geçersen önceki odadan çıkarsın; aynı anda iki odada ses bağlantısı olmaz.
          </Text>
          <Pressable style={[s.dialogBtn, { backgroundColor: semantic.action }]} onPress={confirmSwitch} accessibilityRole="button">
            <Text style={[s.dialogBtnText, { color: semantic.actionInk }]}>Odaya geç</Text>
          </Pressable>
          <Pressable style={s.dialogBtn} onPress={cancelSwitch} accessibilityRole="button">
            <Text style={s.dialogBtnText}>Vazgeç, bu odada kal</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** The full room was ended by the room (kicked, closed). The room screen closes after it is read. */
export function EndedDialog({ session }: { session: RoomSession }) {
  const kicked = session.endReason === 'kicked';
  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissEnded}>
      <View style={s.center}>
        <View style={s.dialog} accessibilityViewIsModal>
          <Ionicons name={kicked ? 'remove-circle' : 'radio'} size={28} color={semantic.danger} />
          <Text style={s.dialogTitle}>{kicked ? ENDED_TEXT.kicked : ENDED_TEXT.server}</Text>
          <Text style={s.dialogText}>
            {kicked
              ? `Oda yönetimi seni “${session.title}” odasından çıkardı. Mikrofonun ve ses bağlantın kapatıldı.`
              : `“${session.title}” odası sunucu tarafından kapatıldı. Mikrofonun ve ses bağlantın kapatıldı.`}
          </Text>
          <Pressable style={[s.dialogBtn, { backgroundColor: semantic.action }]} onPress={dismissEnded} accessibilityRole="button">
            <Text style={[s.dialogBtnText, { color: semantic.actionInk }]}>Tamam</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function SessionToast() {
  const { notice } = useRoomSession();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => clearNotice(notice.id), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  if (!notice) return null;
  return (
    <Pressable style={[s.toast, { top: insets.top + 8 }]} onPress={() => clearNotice(notice.id)} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Ionicons name={notice.tone === 'warn' ? 'warning' : 'information-circle'} size={18} color={notice.tone === 'warn' ? colors.gold : colors.primaryText} />
      <Text style={s.toastText}>{notice.text}</Text>
    </Pressable>
  );
}

/** After a restart: the app was closed while in a room. Nothing reconnects until the user asks. */
export function RecoveryCard({ roomId, title }: { roomId: string; title: string }) {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  if (!TAB_PATHS.includes(path)) return null;
  const forget = () => {
    setRecovery(null);
    saveRoom(null);
  };
  return (
    <View style={[s.recovery, { bottom: TAB_BAR + insets.bottom + 10 }]} accessibilityLiveRegion="polite">
      <Ionicons name="refresh-circle" size={28} color={colors.primaryText} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.miniTitle} numberOfLines={1}>
          “{title}” odasındaydın
        </Text>
        <Text style={s.recoveryText}>Uygulama kapandığı için ses bağlantısı sona erdi. Yeniden bağlanırsan mikrofonun kapalı başlar.</Text>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <Pressable style={[s.smallBtn, { backgroundColor: semantic.action }]} onPress={() => router.push({ pathname: '/oda/[id]', params: { id: roomId } })} accessibilityRole="button">
            <Text style={[s.smallBtnText, { color: semantic.actionInk }]}>Yeniden bağlan</Text>
          </Pressable>
          <Pressable style={s.smallBtn} onPress={forget} accessibilityRole="button">
            <Text style={s.smallBtnText}>Kapat</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// --- Inside the full room -------------------------------------------------------------------------------
/** Connection and audio problems of the session, in the room. Shown only while something is wrong. */
export function SessionBanner({ session }: { session: RoomSession }) {
  const offline = !useOnline();
  const block = session.micWant ? micBlock(session) : null;
  let text: string | null = null;
  let tone: Tone = 'warn';
  if (session.status === 'disconnected') {
    text = 'Oda bağlantısı kesildi. Sayılar ve liste son alınan durumu gösteriyor.';
    tone = 'bad';
  } else if (session.status === 'reconnecting' || offline)
    text = `Bağlantı koptu · yeniden bağlanılıyor${session.reconnectAttempt ? ` (${session.reconnectAttempt}. deneme)` : ''}. Sayılar ve liste son alınan durumu gösteriyor.`;
  else if (session.interruption === 'phone_call') text = 'Telefon görüşmesi sürüyor: oda sesi ve mikrofonun duraklatıldı.';
  else if (session.interruption === 'focus_loss') text = 'Ses başka bir uygulamada; geri gelince oda sesi kaldığı yerden sürer.';
  else if (block === 'permission') text = 'Mikrofon izni yok: dinlemeye devam ediyorsun. Konuşmak için telefon ayarlarından mikrofon izni ver.';
  if (!text) return null;
  const canRetry = session.status === 'disconnected' || session.status === 'reconnecting';
  return (
    <View style={[s.banner, tone === 'bad' && { backgroundColor: 'rgba(255,122,130,0.9)' }]} accessibilityLiveRegion="polite">
      <Ionicons name={canRetry ? 'cloud-offline-outline' : 'information-circle-outline'} size={16} color={semantic.moneyInk} />
      <Text style={s.bannerText} numberOfLines={3}>
        {text}
      </Text>
      {canRetry && (
        <Pressable onPress={retryNow} hitSlop={8} accessibilityRole="button" accessibilityLabel="Şimdi yeniden bağlan">
          <Text style={s.bannerGo}>Yeniden dene</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Test panel for the prototype: plays the OS and server events a real device produces (background, network,
 * phone call, audio focus, Bluetooth, permission, kick, room closed) so the session's reactions can be seen.
 * The engine here has no real audio; the panel says so.
 */
export function SessionTestSheet({ visible, session, onClose, onKickMe }: { visible: boolean; session: RoomSession; onClose: () => void; onKickMe: () => void }) {
  const online = useOnline();
  const eng = engineInfo();
  const block = micBlock(session);
  const rows: [string, string][] = [
    ['Ses motoru', `${eng.name}${eng.capabilities.backgroundAudio ? '' : ' · arka plan sesi yok'}`],
    ['Bağlantı', sessionStatus(session).text],
    ['Mikrofon', `${session.micWant ? 'açık istendi' : 'kapalı'} · ses ${micSending(session) ? 'gidiyor' : `gitmiyor${session.micWant && block ? ` (${MIC_BLOCK_LABEL[block]})` : ''}`}`],
    ['Ses çıkışı', session.route === 'bluetooth' ? 'Bluetooth kulaklık' : 'Telefon hoparlörü'],
    ['Bağlantı sayacı', `kurulum ${eng.stats.connects} · yeniden ${eng.stats.reconnects} · en fazla eşzamanlı ${eng.stats.maxConcurrent}`],
  ];
  const act: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; danger?: boolean }[] = [
    { label: 'Arka plana al (5 sn) ve geri dön', icon: 'phone-portrait-outline', onPress: () => (onAppState('background'), setTimeout(() => onAppState('active'), 5000)) },
    { label: online ? 'Ağ bağlantısını kes' : 'Ağ bağlantısını geri getir', icon: online ? 'cloud-offline-outline' : 'cloud-done-outline', onPress: () => setConnection(online ? 'offline' : 'online') },
    { label: session.interruption === 'phone_call' ? 'Telefon görüşmesini bitir' : 'Telefon görüşmesi gelsin', icon: 'call-outline', onPress: () => phoneCall(session.interruption !== 'phone_call') },
    { label: session.interruption === 'focus_loss' ? 'Ses odağı geri gelsin' : 'Ses odağı kaybolsun (başka uygulama)', icon: 'musical-notes-outline', onPress: () => audioFocus(session.interruption !== 'focus_loss') },
    { label: session.route === 'bluetooth' ? 'Bluetooth kulaklığı ayır' : 'Bluetooth kulaklık bağla', icon: 'bluetooth-outline', onPress: () => setRoute(session.route === 'bluetooth' ? 'speaker' : 'bluetooth') },
    { label: session.permission === 'granted' ? 'Mikrofon iznini kaldır' : 'Mikrofon iznini geri ver', icon: 'mic-off-outline', onPress: () => setPermission(session.permission !== 'granted') },
    { label: 'Oda yönetimi beni odadan çıkarsın', icon: 'remove-circle-outline', danger: true, onPress: () => (onClose(), onKickMe()) },
    { label: 'Sunucu odayı kapatsın', icon: 'radio-outline', danger: true, onPress: () => (onClose(), endRoom('server')) },
    ...(Platform.OS === 'web' ? [{ label: 'Uygulamayı kapatıp yeniden aç', icon: 'reload-outline' as const, onPress: () => globalThis.location?.reload() }] : []),
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[s.sheet, { maxHeight: '82%' }]}>
        <View style={s.handle} />
        <Text style={s.sheetTitle} accessibilityRole="header">
          Ses ve bağlantı testi
        </Text>
        <Text style={s.dim}>Bu sürümde gerçek ses yok. Aşağıdaki olaylar telefonun ve sunucunun üreteceği olayları taklit eder; oturumun tepkisini buradan izleyebilirsin.</Text>
        <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }}>
          <View style={s.stats}>
            {rows.map(([k, v]) => (
              <View key={k} style={s.statRow}>
                <Text style={s.statKey}>{k}</Text>
                <Text style={s.statVal}>{v}</Text>
              </View>
            ))}
          </View>
          {act.map((a) => (
            <Pressable key={a.label} style={({ pressed }) => [s.testBtn, pressed && { backgroundColor: colors.cardAlt }]} onPress={a.onPress} accessibilityRole="button">
              <Ionicons name={a.icon} size={20} color={a.danger ? semantic.danger : colors.primaryText} />
              <Text style={[s.testText, a.danger && { color: semantic.danger }]}>{a.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const shadow = { shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 10 };
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.6)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xl, gap: space.md, borderTopWidth: 1, borderColor: colors.border },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  sheetTitle: { color: colors.text, fontWeight: '900', fontSize: type.title, textAlign: 'center', marginVertical: space.xs },
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  choicePrimary: { backgroundColor: semantic.action },
  choiceExit: { borderWidth: 1.5, borderColor: semantic.danger },
  choiceLabel: { fontWeight: '900', fontSize: type.bodyL },
  choiceDesc: { color: colors.textDim, fontSize: type.caption, lineHeight: 17, marginTop: 2 },
  cancel: { alignItems: 'center', paddingVertical: space.md },
  cancelText: { color: colors.textDim, fontWeight: '700', fontSize: type.body },
  mini: { position: 'absolute', right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingLeft: space.sm, paddingRight: space.xs, paddingVertical: space.sm, zIndex: 50, ...shadow },
  miniMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  coverWrap: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 2, padding: 1 },
  cover: { flex: 1, borderRadius: radius.sm },
  coverBadge: { position: 'absolute', right: -4, bottom: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: semantic.live, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.card },
  miniTitle: { color: colors.text, fontWeight: '800', fontSize: 13 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  speakers: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.cardAlt, borderRadius: radius.pill, paddingHorizontal: 5, paddingVertical: 1 },
  speakersText: { color: colors.textDim, fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusText: { fontSize: type.caption, fontWeight: '700', flexShrink: 1 },
  miniBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
  miniClose: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  edge: { position: 'absolute', right: 0, width: 40, paddingVertical: 6, paddingLeft: 6, borderTopLeftRadius: radius.md, borderBottomLeftRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderRightWidth: 0, borderColor: colors.border, zIndex: 50, ...shadow },
  edgeCover: { width: 28, height: 28, borderRadius: radius.sm },
  edgeDot: { position: 'absolute', right: 4, top: 4, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.card },
  center: { flex: 1, backgroundColor: 'rgba(8,15,30,0.7)', alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: colors.card, borderRadius: radius.xl, padding: space.xl, gap: space.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  dialogTitle: { color: colors.text, fontWeight: '900', fontSize: type.title, textAlign: 'center' },
  dialogText: { color: colors.textDim, fontSize: type.body, lineHeight: 20, textAlign: 'center' },
  dialogBtn: { alignSelf: 'stretch', alignItems: 'center', borderRadius: radius.pill, paddingVertical: space.md, backgroundColor: colors.cardAlt },
  dialogBtnText: { color: colors.text, fontWeight: '800', fontSize: type.body },
  toast: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, zIndex: 60, ...shadow },
  toastText: { color: colors.text, fontSize: 13, lineHeight: 18, flex: 1, fontWeight: '600' },
  recovery: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', gap: space.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md, zIndex: 50, ...shadow },
  recoveryText: { color: colors.textDim, fontSize: type.caption, lineHeight: 17, marginTop: 2 },
  smallBtn: { borderRadius: radius.pill, paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.cardAlt },
  smallBtnText: { color: colors.text, fontWeight: '800', fontSize: 13 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginHorizontal: space.md, marginTop: 6, backgroundColor: colors.gold, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  bannerText: { color: semantic.moneyInk, fontWeight: '700', fontSize: type.caption, flex: 1, lineHeight: 17 },
  bannerGo: { color: semantic.moneyInk, fontWeight: '900', fontSize: 13, textDecorationLine: 'underline' },
  dim: { color: colors.textDim, fontSize: type.caption, lineHeight: 17 },
  stats: { backgroundColor: colors.bg, borderRadius: radius.md, padding: space.md, gap: 6 },
  statRow: { flexDirection: 'row', gap: space.sm },
  statKey: { color: colors.textDim, fontSize: type.caption, width: 110 },
  statVal: { color: colors.text, fontSize: type.caption, flex: 1, fontWeight: '700' },
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, backgroundColor: 'rgba(255,255,255,0.04)' },
  testText: { color: colors.text, fontSize: type.body, fontWeight: '700', flex: 1 },
});
