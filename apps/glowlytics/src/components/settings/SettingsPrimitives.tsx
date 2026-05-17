import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { FontFamily, Glow, Spacing } from '../../constants/theme';

const P = Glow.palette;

// ---------------------------------------------------------------------------
// Page chrome
// ---------------------------------------------------------------------------
export function SettingsPage({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.page}>
      <LinearGradient
        colors={[P.surface, P.bg]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + Spacing.xs,
          paddingBottom: insets.bottom + Spacing.xxl + 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {children}
        {footer}
      </ScrollView>
    </View>
  );
}

export function SettingsHeader({
  title,
  eyebrow,
  onBack,
}: {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const handleBack = onBack ?? (() => router.back());
  return (
    <View style={styles.header}>
      <Pressable
        onPress={handleBack}
        hitSlop={12}
        accessibilityLabel="Back"
        accessibilityRole="button"
        style={styles.backBtn}
      >
        <Feather name="chevron-left" size={22} color={P.ink} />
      </Pressable>
      <View style={{ flex: 1 }}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );
}

export function SectionLabel({
  children,
  hint,
  danger,
}: {
  children: React.ReactNode;
  hint?: string;
  danger?: boolean;
}) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={[styles.sectionLabel, danger && { color: P.accent }]}>
        {children}
      </Text>
      {!!hint && <Text style={styles.sectionHint}>{hint}</Text>}
    </View>
  );
}

export function Intro({ children }: { children: React.ReactNode }) {
  return <Text style={styles.intro}>{children}</Text>;
}

export function IntroAccent({ children }: { children: React.ReactNode }) {
  return <Text style={styles.introAccent}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// List components
// ---------------------------------------------------------------------------
export function ListGroup({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  // Inject `last` prop on the final Row so the divider drops.
  const items = React.Children.toArray(children);
  const total = items.length;
  return (
    <View style={[styles.listGroup, style]}>
      {items.map((child, i) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, {
              last: i === total - 1,
            })
          : child,
      )}
    </View>
  );
}

export type RowProps = {
  label: React.ReactNode;
  value?: React.ReactNode;
  sub?: string;
  control?: React.ReactNode;
  danger?: boolean;
  last?: boolean;
  onPress?: () => void;
  accessibilityHint?: string;
};

export function Row({
  label,
  value,
  sub,
  control,
  danger,
  last,
  onPress,
  accessibilityHint,
}: RowProps) {
  const inner = (
    <>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.rowLabel, danger && { color: P.accent }]}>{label}</Text>
        {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      {control ?? (
        <View style={styles.rowRight}>
          {!!value && (
            <Text style={styles.rowValue} numberOfLines={1}>
              {value}
            </Text>
          )}
          <Feather name="chevron-right" size={14} color={P.muted} />
        </View>
      )}
    </>
  );

  const rowStyle = [styles.row, !last && styles.rowDivider];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [rowStyle, pressed && { backgroundColor: P.bg }]}
      >
        {inner}
      </Pressable>
    );
  }

  return <View style={rowStyle}>{inner}</View>;
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export function Toggle({ on, onChange }: { on?: boolean; onChange?: (next: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange?.(!on)}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!on }}
      style={[styles.toggleTrack, { backgroundColor: on ? P.accent : P.glow }]}
    >
      <View style={[styles.toggleThumb, { left: on ? 16 : 2 }]} />
    </Pressable>
  );
}

export function Chip({
  active,
  soft,
  children,
  onPress,
}: {
  active?: boolean;
  soft?: boolean;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={[
        styles.chip,
        active
          ? { backgroundColor: P.ink, borderColor: P.ink }
          : { backgroundColor: soft ? P.bg : P.surface, borderColor: P.glow },
      ]}
    >
      <Text style={[styles.chipText, active && { color: P.surface }]}>{children}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button">
        {content}
      </Pressable>
    );
  }
  return content;
}

export function Pill({
  children,
  color = P.accent,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '1f' }]}>
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  );
}

export function Check({ size = 14, color = P.surface }: { size?: number; color?: string }) {
  return <Feather name="check" size={size} color={color} />;
}

// ---------------------------------------------------------------------------
// Buttons (per design conventions)
// ---------------------------------------------------------------------------
export function PrimaryButton({
  label,
  onPress,
  danger,
  style,
}: {
  label: string;
  onPress?: () => void;
  danger?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.primaryBtn,
        { backgroundColor: danger ? P.muted : P.ink },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.65 }, style]}
    >
      <Text style={styles.ghostBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: P.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    fontSize: 26,
    color: P.ink,
    lineHeight: 28,
    marginTop: 2,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 24,
    marginTop: 22,
    marginBottom: 8,
  },
  sectionLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  sectionHint: {
    fontFamily: FontFamily.sans,
    fontSize: 10,
    color: P.muted,
    letterSpacing: 0.4,
  },
  intro: {
    paddingHorizontal: 24,
    paddingTop: 4,
    fontFamily: FontFamily.sans,
    fontSize: 13,
    color: P.muted,
    lineHeight: 20,
  },
  introAccent: {
    fontFamily: FontFamily.sans,
    fontStyle: 'italic',
    color: P.ink,
  },
  listGroup: {
    marginHorizontal: 16,
    backgroundColor: P.surface,
    borderWidth: 1,
    borderColor: P.glow,
    borderRadius: 18,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.glow,
  },
  rowLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 14,
    color: P.ink,
  },
  rowSub: {
    fontFamily: FontFamily.sans,
    fontSize: 11,
    color: P.muted,
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 180,
  },
  rowValue: {
    fontFamily: FontFamily.sans,
    fontSize: 12,
    color: P.muted,
    textAlign: 'right',
  },
  toggleTrack: {
    width: 36,
    height: 22,
    borderRadius: 999,
    justifyContent: 'center',
    position: 'relative',
  },
  toggleThumb: {
    position: 'absolute',
    top: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: 12,
    color: P.ink,
  },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: FontFamily.sansBold,
    fontSize: 14,
    color: P.surface,
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostBtnText: {
    fontFamily: FontFamily.sans,
    fontSize: 13,
    color: P.muted,
  },
});

export { P as PalettePreview };
