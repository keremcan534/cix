import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

// Synced from Settings.haptics by the store; module-level so plain event handlers can call these.
let enabled = true;
export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

// Haptics are a nicety: an unsupported device or browser must never break the action itself.
const run = (fn: () => Promise<void>) => {
  if (enabled) fn().catch(() => {});
};

/** Tabs, chips, toggles. */
export const tapHaptic = () => run(() => Haptics.selectionAsync());
/** Primary buttons. */
export const pressHaptic = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** Taking a seat, mic on/off. */
export const micHaptic = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
/** Gift sent: the peak moment of the app. */
export const successHaptic = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
/** Not enough coins, action refused. */
export const errorHaptic = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
/** A blow in a win's show: the title stepping up, the amount landing. */
export const heavyHaptic = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
/**
 * The phone trembling with a big win: buzzes of these lengths (ms) with short gaps. Android plays them as one
 * pattern (expo-haptics brings the vibrate permission); elsewhere each buzz is a heavy knock.
 */
export function rumbleHaptic(buzz: readonly number[] = [70, 90, 130]) {
  if (!enabled) return;
  try {
    if (Platform.OS === 'android') Vibration.vibrate(buzz.flatMap((ms) => [45, ms]));
    else buzz.forEach((_, i) => setTimeout(heavyHaptic, i * 110));
  } catch {
    // A nicety, like the others.
  }
}
