import React from 'react';
import { Platform, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { FontFamily, Glow } from '../../constants/theme';

const P = Glow.palette;

export function Dot({ color }: { color: string }) {
  return <View style={[atoms.dot, { backgroundColor: color }]} />;
}

export type ChipProps = {
  children: React.ReactNode;
  dark?: boolean;
  accent?: boolean;
  style?: ViewStyle;
};

/**
 * Floating pill chip. `dark` is the camera-overlay glass variant
 * used during framing / scanning; the default is the warm cream variant
 * used on results.
 */
export function Chip({ children, dark, accent, style }: ChipProps) {
  return (
    <View
      style={[
        atoms.chipBase,
        dark
          ? atoms.chipDark
          : {
              backgroundColor: accent ? P.bg : P.surface,
              borderColor: P.glow,
            },
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text style={[atoms.chipText, dark && atoms.chipTextDark]}>{children}</Text>
      ) : (
        <View style={atoms.chipRow}>
          {React.Children.map(children, (child) =>
            typeof child === 'string' || typeof child === 'number' ? (
              <Text style={[atoms.chipText, dark && atoms.chipTextDark]}>{child}</Text>
            ) : (
              child
            ),
          )}
        </View>
      )}
    </View>
  );
}

export type StageItem = {
  label: string;
  /** true = done, 'live' = currently active, false = upcoming */
  done: boolean | 'live';
};

/**
 * Captured → Mapped → Compared → Composed stage strip.
 * Renders in dark mode by default (matches analyzing screen background).
 */
export function StagePills({ stages }: { stages: StageItem[] }) {
  return (
    <View style={pillStyles.row}>
      {stages.map((s) => {
        const isDone = s.done === true;
        const isLive = s.done === 'live';
        return (
          <View
            key={s.label}
            style={[
              pillStyles.pill,
              isDone && pillStyles.pillDone,
              isLive && pillStyles.pillLive,
            ]}
          >
            <Text
              style={[
                pillStyles.label,
                isDone && pillStyles.labelDone,
                isLive && pillStyles.labelLive,
              ]}
            >
              {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const atoms = StyleSheet.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  chipBase: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    gap: 5,
  },
  chipDark: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderColor: 'rgba(255,255,255,0.10)',
    ...Platform.select({ ios: { backdropFilter: 'blur(20px)' }, default: {} } as any),
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.ink,
    letterSpacing: 0.3,
  },
  chipTextDark: {
    color: 'rgba(255,255,255,0.85)',
  },
});

const pillStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pillDone: {
    backgroundColor: 'rgba(217,162,139,0.15)',
    borderColor: 'rgba(217,162,139,0.30)',
  },
  pillLive: {
    backgroundColor: P.accent2,
    borderColor: P.accent2,
  },
  label: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  labelDone: {
    color: P.accent2,
  },
  labelLive: {
    color: P.ink,
  },
});

export default Chip;
