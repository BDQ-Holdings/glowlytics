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
import { Glow, Spacing } from '../constants/theme';

const P = Glow.palette;

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
      {/* Single-hue Glow-palette wash: surface -> bg with one quiet top halo.
          Replaces the legacy multi-hue drifting-gradient stack (teal + purple
          + amber off-screen blobs), which read as generic generated ambiance
          and clashed with the dusk palette on redesigned surfaces. */}
      <LinearGradient
        colors={[P.surface, P.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[P.glow, 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.topHalo, variant === 'focused' && { opacity: 0.18 }]}
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
    backgroundColor: P.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
  },
  topHalo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    opacity: 0.28,
  },
});
