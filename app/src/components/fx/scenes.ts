// Each screen's backdrop, drawn by <Backdrop scene>: the app's own night sky (no stock photos), lit from the
// top by the screen's accent and, faintly, from the lower side by a second one. Accents follow the color
// meanings in docs/TASARIM_YONU.md: turquoise for live/social spaces, gold for money and status, coral for
// people.
import { semantic } from '@/theme';

export type Scene = { light: string; second: string };

export const SCENES = {
  home: { light: semantic.action, second: semantic.social },
  games: { light: semantic.action, second: semantic.money },
  store: { light: semantic.money, second: semantic.action },
  discover: { light: semantic.social, second: semantic.action },
  messages: { light: semantic.action, second: semantic.action },
  wallet: { light: semantic.money, second: semantic.money },
  vip: { light: semantic.money, second: semantic.social },
  family: { light: semantic.social, second: semantic.money },
  level: { light: semantic.money, second: semantic.action },
  login: { light: semantic.action, second: semantic.social },
} as const satisfies Record<string, Scene>;
