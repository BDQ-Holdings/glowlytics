/**
 * Shared chrome for share-card templates: cream gradient bg (or dark variant
 * for the hero card) + a watermark line. Each template renders its content
 * inside this shell so the brand signature stays consistent across cards.
 */

import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FontFamily, Glow } from '../../../constants/theme';

const P = Glow.palette;

export interface CardShellProps {
  dark?: boolean;
  padding?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}

export function CardShell({ dark = false, padding = 32, children, style }: CardShellProps) {
  const colors: [string, string, ...string[]] = dark
    ? [P.ink, '#1a1418', '#0e0a10']
    : [P.glow, P.bg, P.surface];
  return (
    <LinearGradient
      colors={colors}
      locations={dark ? [0, 0.6, 1] : [0, 0.5, 1]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.shell, { padding }, style]}
    >
      {children}
    </LinearGradient>
  );
}

export interface WatermarkProps {
  dark?: boolean;
  align?: 'left' | 'center' | 'right';
}

export function Watermark({ dark = false, align = 'left' }: WatermarkProps) {
  const color = dark ? P.surface : P.ink;
  return (
    <View
      style={[
        styles.watermarkRow,
        { justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start' },
      ]}
    >
      <View style={[styles.markDot, { backgroundColor: color, opacity: 0.85 }]} />
      <Text style={[styles.markText, { color, opacity: 0.7 }]}>Glowlytics</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    height: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  watermarkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  markDot: { width: 14, height: 14, borderRadius: 7 },
  markText: { fontFamily: FontFamily.sansMedium, fontSize: 14, letterSpacing: 0.2 },
});
