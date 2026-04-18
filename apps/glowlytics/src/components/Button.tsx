import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Shadows,
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
    minHeight: 60,
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

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={style}
      activeOpacity={0.86}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={
            disabled
              ? [Colors.surfaceHighlight, Colors.surface]
              : [Colors.primaryDark, Colors.primary]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.shell, styles.primaryShell]}
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
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  shell: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  primaryShell: {
    borderWidth: 1,
    borderColor: 'rgba(58, 158, 143, 0.20)',
    ...Shadows.glow,
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
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: FontFamily.sansSemiBold,
    letterSpacing: 0.3,
  },
});
