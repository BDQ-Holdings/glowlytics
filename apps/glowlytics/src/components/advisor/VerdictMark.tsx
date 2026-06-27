import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { fitMeta } from './fitMeta';
import { BreathingGlow } from '../glow/GlowPrimitives';
import { FontFamily } from '../../constants/theme';
import type { GlowPalette } from '../../constants/theme';
import type { ShoppingVerdict } from '../../types';

/**
 * Verdict mark — three visual languages ported from the design's `VerdictMark`:
 *   bloom (default) — kicker + breathing-glow italic headline
 *   chip            — pill with a dot + label (used in tables / recap rows)
 *   meter           — gradient track with a knob positioned by fit
 * Pure presentational; drives off the backend verdict via `fitMeta`.
 */
export interface VerdictMarkProps {
  verdict: ShoppingVerdict;
  variant?: 'bloom' | 'chip' | 'meter';
  size?: 'lg' | 'sm';
  palette: GlowPalette;
}

export const VerdictMark: React.FC<VerdictMarkProps> = ({
  verdict,
  variant = 'bloom',
  size = 'lg',
  palette,
}) => {
  const m = fitMeta(verdict, palette);
  const lg = size === 'lg';

  if (variant === 'chip') {
    return (
      <View
        style={[
          styles.chip,
          {
            backgroundColor: m.color + '1f',
            borderColor: m.color + '55',
            paddingVertical: lg ? 7 : 4,
            paddingHorizontal: lg ? 14 : 10,
          },
        ]}
      >
        <View style={[styles.chipDot, { backgroundColor: m.dot }]} />
        <Text
          style={{
            fontSize: lg ? 14 : 11.5,
            color: m.textColor,
            fontFamily: FontFamily.sansMedium,
          }}
        >
          {m.label}
        </Text>
      </View>
    );
  }

  if (variant === 'meter') {
    return (
      <View style={styles.meterWrap}>
        <View style={styles.meterTrack}>
          <LinearGradient
            colors={[palette.muted + '40', palette.accent2 + '55', palette.accent + '66']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View
            style={[
              styles.meterKnob,
              {
                left: `${m.pos * 100}%`,
                borderColor: m.color,
                backgroundColor: palette.surface,
                shadowColor: m.color,
              },
            ]}
          />
        </View>
        <View style={styles.meterLabels}>
          <Text
            style={{
              fontSize: lg ? 18 : 14,
              color: m.textColor,
              fontStyle: 'italic',
              fontFamily: FontFamily.sansMedium,
            }}
          >
            {m.label}
          </Text>
          <Text style={[styles.meterBlurb, { color: palette.muted }]}>{m.blurb}</Text>
        </View>
      </View>
    );
  }

  // bloom (default)
  return (
    <View style={styles.bloomWrap}>
      <BreathingGlow color={m.color + '40'} size={120} style={styles.bloomGlow} />
      <View>
        <Text style={[styles.bloomKicker, { color: palette.muted }]}>OUR READ FOR YOU</Text>
        <Text
          style={{
            fontSize: lg ? 30 : 22,
            lineHeight: lg ? 33 : 24,
            marginTop: 4,
            color: m.textColor,
            fontStyle: 'italic',
            fontFamily: FontFamily.sans,
          }}
        >
          {m.label}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  meterWrap: {
    width: '100%',
  },
  meterTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  meterKnob: {
    position: 'absolute',
    top: '50%',
    width: 16,
    height: 16,
    marginLeft: -8,
    marginTop: -8,
    borderRadius: 8,
    borderWidth: 3,
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  meterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  meterBlurb: {
    fontSize: 11,
  },
  bloomWrap: {
    alignSelf: 'flex-start',
    position: 'relative',
  },
  bloomGlow: {
    top: -18,
    left: -24,
  },
  bloomKicker: {
    fontSize: 10.5,
    letterSpacing: 1.4,
  },
});
