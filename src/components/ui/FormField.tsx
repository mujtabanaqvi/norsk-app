import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, type TextInputProps } from 'react-native';
import { colors, radius, space, type } from '../../theme';
import { Icon } from './Icon';

interface FormFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  hint?: string;
  /** Renders a show/hide toggle and masks the value. */
  password?: boolean;
}

/** Labelled text input with focus styling, inline error and optional hint. */
export const FormField = React.forwardRef<TextInput, FormFieldProps>(
  ({ label, error, hint, password = false, onFocus, onBlur, ...inputProps }, ref) => {
    const [focused, setFocused] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const hasError = !!error;

    return (
      <View style={styles.group}>
        <Text style={styles.label}>{label}</Text>
        <View
          style={[
            styles.inputWrap,
            focused && styles.inputFocused,
            hasError && styles.inputError,
          ]}
        >
          <TextInput
            ref={ref}
            style={styles.input}
            placeholderTextColor={colors.textMuted}
            secureTextEntry={password && !revealed}
            autoCorrect={false}
            accessibilityLabel={label}
            accessibilityHint={hasError ? error! : hint}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...inputProps}
          />
          {password && (
            <Pressable
              onPress={() => setRevealed((v) => !v)}
              style={styles.reveal}
              accessibilityRole="button"
              accessibilityLabel={revealed ? 'Skjul passord' : 'Vis passord'}
              hitSlop={8}
            >
              <Icon name={revealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        {hasError ? (
          <View style={styles.messageRow} accessibilityLiveRegion="polite">
            <Icon name="alert-circle" size={14} color={colors.danger} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : hint ? (
          <Text style={styles.hintText}>{hint}</Text>
        ) : null}
      </View>
    );
  }
);

FormField.displayName = 'FormField';

const styles = StyleSheet.create({
  group: {
    marginBottom: space.md,
  },
  label: {
    ...type.caption,
    color: colors.text,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputFocused: {
    borderColor: colors.red,
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  reveal: {
    paddingHorizontal: space.md,
    paddingVertical: 10,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  errorText: {
    ...type.caption,
    color: colors.danger,
    fontWeight: '600',
    flex: 1,
  },
  hintText: {
    ...type.caption,
    color: colors.textSecondary,
    marginTop: 6,
  },
});
