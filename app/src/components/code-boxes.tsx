// The six boxes of a sign-in or check code (giris/kod and the Ayarlar verify sheet). One hidden input takes
// the digits, so the keyboard's and the system's code suggestion (SMS or mail) fill all six at once.
import { useCallback, useEffect, useRef, useState, type ComponentRef, type Ref } from 'react';
import { Pressable, View, type TextInputProps } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { CODE_LENGTH } from '@/lib/verify-code';
import { makeStyles } from '@/theme';

type Input = ComponentRef<typeof TextInput>;

/**
 * Seconds until a new code may be asked for, counted against a deadline so a phone that slept in between still
 * shows the right number. `restart(s)` starts a new wait.
 */
export function useResendWait(initialSeconds = 0) {
  const [deadline, setDeadline] = useState(() => (initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0));
  const [left, setLeft] = useState(Math.max(0, Math.ceil(initialSeconds)));
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setLeft(s);
      if (!s) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const restart = useCallback((seconds: number) => {
    setDeadline(Date.now() + seconds * 1000);
    setLeft(Math.max(0, Math.ceil(seconds)));
  }, []);
  return [left, restart] as const;
}

export function CodeBoxes({
  value,
  onChange,
  error = false,
  busy = false,
  autoComplete = 'one-time-code',
  onSheet = false,
  autoFocus = true,
  ref,
}: {
  value: string;
  /** Digits only, at most six. */
  onChange: (code: string) => void;
  /** The last code was refused: the boxes turn red until the next digit. */
  error?: boolean;
  /** Being checked: no box is active and typing is paused. */
  busy?: boolean;
  /** 'sms-otp' for a texted code (Android reads it), 'one-time-code' for one from a mail. */
  autoComplete?: TextInputProps['autoComplete'];
  /** On a sheet (card background) instead of a screen. */
  onSheet?: boolean;
  autoFocus?: boolean;
  ref?: Ref<Input>;
}) {
  const s = useStyles();
  const own = useRef<Input>(null);
  const setRef = (el: Input | null) => {
    own.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  return (
    <View>
      <Pressable style={s.boxes} onPress={() => own.current?.focus()} accessible={false}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const active = i === value.length && !busy;
          return (
            <View key={i} style={[s.box, onSheet ? s.boxOnSheet : s.boxLift, active && s.boxActive, !!value[i] && s.boxFilled, error && s.boxError]}>
              <Text style={s.digit}>{value[i] ?? ''}</Text>
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={setRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        editable={!busy}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={autoComplete}
        maxLength={CODE_LENGTH}
        autoFocus={autoFocus}
        style={s.hidden}
        accessibilityLabel="6 haneli kod"
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors, semantic, dark }) => ({
  boxes: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  // Light: white boxes need an outline and a soft shadow to stand off the paper (the active border replaces it).
  box: {
    flex: 1,
    maxWidth: 48,
    height: 58,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: dark ? 'transparent' : colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxLift: dark ? {} : { boxShadow: '0 1px 2px rgba(64,20,40,0.05), 0 6px 16px rgba(64,20,40,0.06)' },
  // A sheet is already the card: its boxes sit a step deeper, like the sheet's other fields.
  boxOnSheet: { height: 54, backgroundColor: colors.bg, borderColor: colors.border },
  boxActive: { borderColor: colors.primaryText },
  boxFilled: { borderColor: colors.primary },
  boxError: { borderColor: semantic.danger },
  digit: { color: colors.text, fontSize: 24, fontWeight: '800' },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
}));
