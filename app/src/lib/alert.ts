import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert is a no-op on react-native-web, so fall back to the browser dialogs there.
 * On web: one button -> window.alert, otherwise window.confirm picks the last non-cancel button.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  if (window.confirm(text)) actions[actions.length - 1].onPress?.();
  else buttons?.find((b) => b.style === 'cancel')?.onPress?.();
}
