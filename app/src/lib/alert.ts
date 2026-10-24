import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert is a no-op on react-native-web, so fall back to the browser dialogs there.
 * On web: one button -> window.alert, otherwise window.confirm picks the last non-cancel button.
 */
// Collapse alerts fired in the same instant (e.g. a store-level explanation followed by a caller's
// generic "insufficient coins") into the first one.
let lastShown = 0;

export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  const t = Date.now();
  if (t - lastShown < 400) return;
  lastShown = t;
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    lastShown = Date.now(); // browser dialogs block; measure from when it was closed
    if (buttons?.[0]?.onPress) {
      lastShown = 0; // a follow-up alert from the user's own button press must still show
      buttons[0].onPress();
    }
    return;
  }
  const ok = window.confirm(text);
  lastShown = 0; // the user answered; follow-up alerts from their choice must still show
  if (ok) actions[actions.length - 1].onPress?.();
  else buttons?.find((b) => b.style === 'cancel')?.onPress?.();
}
