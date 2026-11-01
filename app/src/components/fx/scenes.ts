// Each screen's backdrop, drawn by <Backdrop scene>: a sea photo of its own (Unsplash, free Unsplash License,
// cropped to 900x1600) under a navy veil, lit from the top by the screen's accent. Accents follow the color
// meanings in docs/TASARIM_YONU.md: turquoise for live/social spaces, gold for money and status, coral for
// people. `veil` darkens bright photos more so text on them stays readable.
import type { ImageSourcePropType } from 'react-native';

import { semantic } from '@/theme';

export type Scene = { photo: ImageSourcePropType; light: string; veil?: number };

export const SCENES = {
  home: { photo: require('../../../assets/bg/sahne-ana-sayfa.jpg'), light: semantic.action },
  games: { photo: require('../../../assets/bg/sahne-oyun-merkezi.jpg'), light: semantic.action },
  store: { photo: require('../../../assets/bg/sahne-magaza.jpg'), light: semantic.money, veil: 0.5 },
  discover: { photo: require('../../../assets/bg/sahne-kesfet.jpg'), light: semantic.social },
  messages: { photo: require('../../../assets/bg/sahne-mesajlar.jpg'), light: semantic.action },
  wallet: { photo: require('../../../assets/bg/sahne-cuzdan.jpg'), light: semantic.money, veil: 0.3 },
  vip: { photo: require('../../../assets/bg/sahne-vip.jpg'), light: semantic.money, veil: 0.3 },
  family: { photo: require('../../../assets/bg/sahne-aile.jpg'), light: semantic.social },
  level: { photo: require('../../../assets/bg/sahne-seviye.jpg'), light: semantic.money },
  login: { photo: require('../../../assets/bg/sahne-giris.jpg'), light: semantic.action, veil: 0.3 },
} as const satisfies Record<string, Scene>;
