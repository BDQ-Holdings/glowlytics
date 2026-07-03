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
import { LinearGradient } from 'expo-linear-gradient';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  size?: 'sm' | 'md' | 'lg';
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
}) => {
  const resolvedSize = small ? 'sm' : size || 'md';
  const sizeConfig = sizeMap[resolvedSize];
  const textColor = disabled
    ? Colors.textMuted
    : variant === 'primary'
      ? Colors.textOnDark
      : variant === 'ghost'
        ? Colors.primaryLight
        : Colors.text;

  const content = (
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
        <Text style={[styles.text, { color: textColor, fontSize: sizeConfig.fontSize }]}>
          {title}
        </Text>
      )}
    </View>
  );

  const isPrimary = variant === 'primary';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        style,
        isPrimary && !disabled && styles.primaryShadow,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {isPrimary ? (
        <LinearGradient
          testID="button-primary-gradient"
          colors={
            disabled
              ? [Colors.surfaceHighlight, Colors.surface]
              : ['#3A9E8F', '#2B8C7E', '#258070']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.shell}
        >
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.shell,
            variant === 'secondary' ? styles.secondaryShell : styles.ghostShell,
            disabled && styles.disabledShell,
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  shell: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  primaryShadow: {
    borderRadius: BorderRadius.full,
    ...Platform.select({
      ios: {
        shadowColor: '#3A9E8F',
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: {
        elevation: 8,
      },
      default: {
        shadowColor: '#3A9E8F',
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
  },
  secondaryShell: {
    backgroundColor: Colors.glass,
    borderWidth: 1,
    borderColor: 'rgba(58, 158, 143, 0.15)',
  },
  ghostShell: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.borderStrong,
  },
  disabledShell: {
    backgroundColor: Colors.surfaceHighlight,
    borderColor: Colors.border,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.98 }],
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: FontFamily.sansSemiBold,
    letterSpacing: 0.3,
  },
});
