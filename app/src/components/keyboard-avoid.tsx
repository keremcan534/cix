// Keeps its content above the on-screen keyboard, on both platforms.
// Android apps now draw edge to edge, so the window no longer shrinks when the keyboard opens: without
// "padding" there the keyboard covers the composer and the newest messages (docs.expo.dev/guides/keyboard-handling).
import { KeyboardAvoidingView, type KeyboardAvoidingViewProps } from 'react-native';

/** It measures itself against its parent, so place it where the parent starts at the top of the screen (or of
 *  a full-screen modal); anything else needs `offset`, the parent's distance from the top. */
export function KeyboardAvoid({ offset = 0, ...props }: Omit<KeyboardAvoidingViewProps, 'behavior' | 'keyboardVerticalOffset'> & { offset?: number }) {
  return <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={offset} {...props} />;
}
