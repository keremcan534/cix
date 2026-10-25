import * as Haptics from 'expo-haptics';

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
