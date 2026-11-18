// The portrait in the wide card beside a profile's avatar: as wide as the card and moved so the face is in the card's
// middle (lib/cover-focus). It fills the card it is put in.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Photo } from '@/components/photo';
import { coverTop } from '@/lib/cover-focus';

export function CoverPhoto({ uri }: { uri?: string }) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  const side = Math.max(box.width, box.height);
  return (
    <View style={StyleSheet.absoluteFill} onLayout={(e) => setBox(e.nativeEvent.layout)}>
      {side > 0 && <Photo uri={uri} kind="face" resizeMode="cover" style={{ position: 'absolute', left: 0, top: coverTop(box.width, box.height), width: box.width, height: side }} />}
    </View>
  );
}
