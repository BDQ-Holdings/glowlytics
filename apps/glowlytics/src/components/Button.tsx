import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { BorderRadius, FontFamily, FontSize, Glow, Spacing } from '../constants/theme';
import { GlowIcon } from './glow/GlowIcons';

interface Props {
  title: string;
  onPress: () => void;
  /**
   * primary — solid ink pill (the canonical CTA).
   * glow — accent2 "shutter" CTA; reserved for the scan moment.
   * secondary — transparent pill with a glow hairline.
   * ghost — borderless quiet text button.
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'glow';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Trailing 18px arrow — use when the action advances a flow. */
  showArrow?: boolean;
}

const sizeMap = {
  sm: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    fontSize: FontSize.sm,
  },
  md: {
    minHeight: 54,
    paddingHorizontal: Spacing.lg,
    fontSize: FontSize.md,
  },
  lg: {
    minHeight: 58,
    paddingHorizontal: Spacing.xl,
    fontSize: FontSize.lg,
  },
};

export const Button: React.FC<Props> = ({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  small,
  size,
  showArrow = false,
}) => {
  const P = Glow.palette;
  const resolvedSize = small ? 'sm' : size || 'md';
  const sizeConfig = sizeMap[resolvedSize];
  const isDisabled = disabled || loading;

  const textColor = disabled
    ? P.muted
    : variant === 'primary'
      ? P.surface
      : variant === 'ghost'
        ? P.muted
        : P.ink;

  const shellColor: ViewStyle = disabled
    ? { backgroundColor: P.glow + '55' }
    : variant === 'primary'
      ? { backgroundColor: P.ink }
      : variant === 'glow'
        ? { backgroundColor: P.accent2 }
        : variant === 'secondary'
          ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: P.glow }
          : { backgroundColor: 'transparent' };

  const glowShadow: StyleProp<ViewStyle> =
    variant === 'glow' && !disabled
      ? Platform.select({
          ios: {
            shadowColor: P.accent2,
            shadowOpacity: 0.4,
            shadowRadius: 32,
            shadowOffset: { width: 0, height: 8 },
          },
          android: { elevation: 8 },
          default: {
            shadowColor: P.accent2,
            shadowOpacity: 0.4,
            shadowRadius: 32,
            shadowOffset: { width: 0, height: 8 },
          },
        })
      : undefined;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        style,
        glowShadow,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      <View testID={`button-shell-${variant}`} style={[styles.shell, shellColor]}>
        <View
          style={[
            styles.content,
            {
              minHeight: sizeConfig.minHeight,
              paddingHorizontal: sizeConfig.paddingHorizontal,
            },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={textColor} size="small" />
          ) : (
            <>
              <Text
                style={[
                  styles.text,
                  variant === 'ghost' && styles.ghostText,
                  { color: textColor, fontSize: sizeConfig.fontSize },
                ]}
              >
                {title}
              </Text>
              {showArrow && !disabled && (
                <GlowIcon name="arrow" size={18} color={textColor} stroke={1.7} />
              )}
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  shell: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  content: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: FontFamily.sansSemiBold,
    letterSpacing: 0.3,
  },
  ghostText: {
    fontFamily: FontFamily.sansMedium,
    letterSpacing: 0.2,
  },
});
