// One photo over the whole screen (a chat's photo message, the private album): a tap anywhere, the close button or the
// phone's back button ends it.
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.viewer} onPress={onClose} accessibilityLabel="Fotoğrafı kapat">
        {uri && <Image source={{ uri }} style={s.full} resizeMode="contain" accessibilityLabel="Fotoğraf" />}
        <View style={[s.close, { top: insets.top + 10 }]}>
          <Ionicons name="close" size={26} color="#fff" />
        </View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  close: { position: 'absolute', right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
});
