import React from 'react';
import {
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BorderRadius, Colors, Spacing } from '../constants/theme';

interface Props {
  children: React.ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  showsVerticalScrollIndicator?: boolean;
  variant?: 'default' | 'warm' | 'focused';
}

export const AtmosphereScreen: React.FC<Props> = ({
  children,
  scroll = true,
  style,
  contentContainerStyle,
  showsVerticalScrollIndicator = false,
  variant = 'default',
}) => {
  const insets = useSafeAreaInsets();
  const contentStyle = [
    styles.content,
    {
      paddingTop: insets.top + Spacing.lg,
      paddingBottom: insets.bottom + Spacing.xl,
    },
    contentContainerStyle,
  ];

  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={[Colors.background, Colors.backgroundDeep, Colors.backgroundWarm]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[Colors.glowSecondary, 'transparent']}
        start={{ x: 0.05, y: 0.05 }}
        end={{ x: 0.8, y: 0.8 }}
        style={[styles.topGlow, variant === 'focused' && { opacity: 0.35 }]}
      />
      <LinearGradient
        colors={[Colors.glowPrimary, 'transparent']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.midGlow, variant === 'focused' && { opacity: 0.25 }]}
      />
      {variant === 'warm' && (
        <LinearGradient
          colors={[Colors.glowAmber, 'transparent']}
          start={{ x: 0.85, y: 0.9 }}
          end={{ x: 0.2, y: 0.3 }}
          style={styles.warmGlow}
        />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(250, 250, 247, 0.7)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.bottomVignette}
      />

      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={contentStyle}
          showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle}>{children}</View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  topGlow: {
    position: 'absolute',
    top: -120,
    left: -100,
    width: 320,
    height: 280,
    borderRadius: BorderRadius.full,
    opacity: 0.35,
  },
  midGlow: {
    position: 'absolute',
    top: 180,
    right: -120,
    width: 300,
    height: 260,
    borderRadius: BorderRadius.full,
    opacity: 0.25,
  },
  bottomVignette: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 240,
  },
  warmGlow: {
    position: 'absolute',
    bottom: -60,
    right: -80,
    width: 320,
    height: 280,
    borderRadius: BorderRadius.full,
    opacity: 0.30,
  },
});
