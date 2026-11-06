// The chat composers are multi-line (long messages wrap). On phones the keyboard's send key sends
// (submitBehavior="submit"); react-native-web ignores that prop and only sends a multi-line input on Enter together
// with blurOnSubmit, which would also take the focus away. On web the composer handles the key in onKeyPress instead:
// Enter sends and the cursor stays, Shift+Enter starts a new line, and Enter that ends an IME composition doesn't send.
import type { TextInputKeyPressEvent } from 'react-native';

/** The parts of the browser's keyboard event this reads (react-native-web passes the DOM event as nativeEvent). */
type WebKey = { key?: string; shiftKey?: boolean; isComposing?: boolean; keyCode?: number };

/** Enter without Shift, outside an IME composition. */
export const sendsOnEnter = (k: WebKey) => k.key === 'Enter' && !k.shiftKey && !k.isComposing && k.keyCode !== 229;

/** Call from a web composer's onKeyPress: Enter calls `send` instead of adding a new line. */
export function onWebEnter(e: TextInputKeyPressEvent, send: () => void) {
  if (!sendsOnEnter(e.nativeEvent as unknown as WebKey)) return;
  e.preventDefault();
  send();
}
