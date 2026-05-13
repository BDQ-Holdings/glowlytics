import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Shadows,
  Spacing,
} from '../constants/theme';
import type { DetectedCondition, DetectedLesion, SignalConfidence } from '../types';
import { LESION_INFO } from '../constants/lesions';
import { V, edges } from './meshData';

interface HotZone {
  label: string;
  severity: 'low' | 'moderate' | 'elevated';
  region: 'forehead' | 'left_cheek' | 'right_cheek' | 'nose' | 'chin' | 'jaw' | 'under_eye' | 'temple';
  conditionName?: string;
}

interface Props {
  acneScore: number;
  sunDamageScore: number;
  skinAgeScore: number;
  conditions?: DetectedCondition[];
  lesions?: DetectedLesion[];
  signalConfidence?: SignalConfidence;
}

const CONDITION_COLORS: Record<string, string> = {
  acne: '#FF4444',
  hyperpigmentation: '#F2B56A',
  fine_lines: '#B68AFF',
  rosacea: '#FF7A78',
  dehydration: '#4DA6FF',
  sun_spots: '#FFB347',
  texture_irregularity: '#7DE7E1',
  dark_circles: '#9B8EC4',
  enlarged_pores: '#E8A87C',
};

const LESION_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(LESION_INFO).map(([k, v]) => [k, v.color]),
);

const SVG_WIDTH = 310;
const SVG_HEIGHT = 320;

const severityColor = (severity: HotZone['severity'], conditionName?: string) => {
  if (conditionName && CONDITION_COLORS[conditionName]) {
    return CONDITION_COLORS[conditionName];
  }
  switch (severity) {
    case 'elevated': return Colors.error;
    case 'moderate': return Colors.warning;
    case 'low': return Colors.success;
  }
};

const CX = 150;

const regionCenter: Record<HotZone['region'], { cx: number; cy: number }> = {
  forehead: { cx: CX, cy: 68 },
  left_cheek: { cx: 80, cy: 180 },
  right_cheek: { cx: 220, cy: 180 },
  nose: { cx: CX, cy: 155 },
  chin: { cx: CX, cy: 285 },
  jaw: { cx: CX, cy: 250 },
  under_eye: { cx: 112, cy: 130 },
  temple: { cx: 55, cy: 100 },
};

function deriveHotZones(acne: number, sun: number, age: number, conditions?: DetectedCondition[]): HotZone[] {
  // Use real condition data from the backend analysis when available.
  // Each condition has specific zones with severity — this is the only
  // source of truth for WHERE on the face issues appear.
  if (conditions && conditions.length > 0) {
    const zones: HotZone[] = [];
    for (const condition of conditions) {
      for (const zone of condition.zones) {
        const severity: HotZone['severity'] =
          zone.severity === 'severe' ? 'elevated' :
          zone.severity === 'moderate' ? 'moderate' : 'low';
        zones.push({
          label: condition.name.replace(/_/g, ' '),
          severity,
          region: zone.region as HotZone['region'],
          conditionName: condition.name,
        });
      }
    }
    if (zones.length > 0) return zones;
  }

  // No condition data from backend — show only score-level summary
  // without fabricating zone positions. We don't know WHERE on the face
  // issues are, only that scores indicate concern.
  return [{ label: 'All clear', severity: 'low', region: 'nose' }];
}

export const FacialMesh: React.FC<Props> = ({ acneScore, sunDamageScore, skinAgeScore, conditions, lesions, signalConfidence }) => {
  const hotZones = deriveHotZones(acneScore, sunDamageScore, skinAgeScore, conditions);
  const hasLesions = lesions && lesions.length > 0;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Facial Analysis</Text>
      <View style={styles.meshContainer}>
        <Svg width={280} height={290} viewBox="-5 0 310 320">
          <Defs>
            {hotZones.map((zone, i) => {
              const c = regionCenter[zone.region];
              const cx = 150 + (c.cx - 150) * 0.86;
              const color = severityColor(zone.severity, zone.conditionName);
              return (
                <RadialGradient key={`g${i}`} id={`hz${i}`} cx={cx} cy={c.cy} r="48" gradientUnits="userSpaceOnUse">
                  <Stop offset="0%" stopColor={color} stopOpacity="0.5" />
                  <Stop offset="45%" stopColor={color} stopOpacity="0.15" />
                  <Stop offset="100%" stopColor={color} stopOpacity="0" />
                </RadialGradient>
              );
            })}
          </Defs>

          {/* Face mesh — horizontally compressed for realistic proportions */}
          <G transform="translate(150, 0) scale(0.86, 1) translate(-150, 0)" opacity={0.35}>
            {edges.map(([a, b], i) => (
              <Line key={i} x1={V[a][0]} y1={V[a][1]} x2={V[b][0]} y2={V[b][1]}
                stroke={Colors.primary} strokeWidth={0.6} />
            ))}
          </G>

          {/* Hot zone overlays — compressed to match narrowed mesh */}
          {hotZones.map((zone, i) => {
            const c = regionCenter[zone.region];
            const cx = 150 + (c.cx - 150) * 0.86; // match mesh compression
            const color = severityColor(zone.severity, zone.conditionName);
            return (
              <G key={`hz-${i}`}>
                <Circle cx={cx} cy={c.cy} r={48} fill={`url(#hz${i})`} />
                <Circle cx={cx} cy={c.cy} r={5} fill={color} opacity={0.85} />
                <Circle cx={cx} cy={c.cy} r={12} fill="none" stroke={color} strokeWidth={1.2} opacity={0.5} />
                <Circle cx={cx} cy={c.cy} r={24} fill="none" stroke={color} strokeWidth={0.6} opacity={0.25} strokeDasharray="3 5" />
                {/* Crosshair lines */}
                <Line x1={cx - 16} y1={c.cy} x2={cx - 8} y2={c.cy} stroke={color} strokeWidth={0.6} opacity={0.4} />
                <Line x1={cx + 8} y1={c.cy} x2={cx + 16} y2={c.cy} stroke={color} strokeWidth={0.6} opacity={0.4} />
                <Line x1={cx} y1={c.cy - 16} x2={cx} y2={c.cy - 8} stroke={color} strokeWidth={0.6} opacity={0.4} />
                <Line x1={cx} y1={c.cy + 8} x2={cx} y2={c.cy + 16} stroke={color} strokeWidth={0.6} opacity={0.4} />
              </G>
            );
          })}

          {/* Lesion markers — positioned by zone center, compressed to match mesh */}
          {hasLesions && lesions.map((lesion, i) => {
            const zone = (lesion.zone || 'nose') as HotZone['region'];
            const center = regionCenter[zone] || regionCenter.nose;
            // Apply same 0.86 horizontal compression as mesh and hot zones
            const baseCx = 150 + (center.cx - 150) * 0.86;
            const baseCy = center.cy;
            // Spread multiple lesions in the same zone so they don't stack
            const zoneIndex = lesions.slice(0, i).filter((l) => (l.zone || 'nose') === zone).length;
            const spreadX = (zoneIndex % 3 - 1) * 14;
            const spreadY = Math.floor(zoneIndex / 3) * 12;
            const markerCx = baseCx + spreadX;
            const markerCy = baseCy + spreadY;
            const color = LESION_COLORS[lesion.class] || Colors.error;
            const opacity = Math.max(0.35, Math.min(0.95, lesion.confidence ?? 0.5));
            const r = 8;

            return (
              <G key={`lesion-${lesion.trackId || i}`} opacity={opacity}>
                {/* Outer pulse ring */}
                <Circle cx={markerCx} cy={markerCy} r={r + 4} fill="none"
                  stroke={color} strokeWidth={0.6} opacity={0.3} strokeDasharray="2 4" />
                {/* Solid marker */}
                <Circle cx={markerCx} cy={markerCy} r={r} fill={color} opacity={0.2} />
                <Circle cx={markerCx} cy={markerCy} r={r} fill="none"
                  stroke={color} strokeWidth={1.2} />
                {/* Center dot */}
                <Circle cx={markerCx} cy={markerCy} r={2} fill={color} />
              </G>
            );
          })}
        </Svg>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {hotZones.map((zone, i) => {
          const color = severityColor(zone.severity, zone.conditionName);
          const displayLabel = zone.label.charAt(0).toUpperCase() + zone.label.slice(1);
          return (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: color }]} />
              <Text style={styles.legendLabel}>{displayLabel}</Text>
              <Text style={[styles.legendSeverity, { color }]}>
                {zone.severity}
              </Text>
            </View>
          );
        })}
        {hasLesions && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.error }]} />
            <Text style={styles.legendLabel}>
              {lesions.length} lesion{lesions.length !== 1 ? 's' : ''} detected
            </Text>
            <Text style={[styles.legendSeverity, { color: Colors.error }]}>
              {lesions.filter(l => (l.tier || 'possible') === 'confirmed').length} confirmed
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.glassStrong,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: Colors.borderStrong,
    padding: Spacing.lg,
    gap: Spacing.md,
    marginTop: Spacing.lg,
    overflow: 'visible',
    ...Shadows.card,
  },
  eyebrow: {
    color: Colors.secondaryLight,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  meshContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    overflow: 'visible',
  },
  legend: {
    gap: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    color: Colors.textSecondary,
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
  },
  legendSeverity: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
