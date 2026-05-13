import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle as SvgCircle, G, Line } from 'react-native-svg';
import {
  BorderRadius,
  Colors,
  FontFamily,
  FontSize,
  Spacing,
} from '../constants/theme';
import { V, edges } from './meshData';
import type { FaceZoneInsight, SeverityLevel } from '../services/skinInsights';
import type { DetectedLesion } from '../types';
import { LESION_INFO } from '../constants/lesions';

const LESION_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(LESION_INFO).map(([k, v]) => [k, v.color]),
);

interface Props {
  zones: FaceZoneInsight[];
  selectedZoneKey: string;
  onSelectZone: (zoneKey: string) => void;
  lesions?: DetectedLesion[];
  accentColor?: string;
}

const severityColors: Record<SeverityLevel, string> = {
  low: Colors.success,
  moderate: Colors.warning,
  high: Colors.error,
};

const FACE_W = 260;
const FACE_H = 320;
const MARKER_SIZE = 34;

// Mesh viewBox dimensions
const MESH_VB_W = 300;
const MESH_VB_H = 320;

export const FaceAssessmentMap = React.memo<Props>(({
  zones,
  selectedZoneKey,
  onSelectZone,
  lesions,
  accentColor = Colors.primary,
}) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    pulse.setValue(0.9);
    const anim = Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1.1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [selectedZoneKey, pulse]);

  // Scale the mesh to fit within the face model area
  const meshScale = Math.min((FACE_W - 20) / MESH_VB_W, (FACE_H - 20) / MESH_VB_H);
  const meshOx = (FACE_W - MESH_VB_W * meshScale) / 2;
  const meshOy = (FACE_H - MESH_VB_H * meshScale) / 2;

  // Memoize edge rendering — 428 SVG Lines that never change geometry
  const meshEdges = useMemo(() => edges.map(([a, b], i) => (
    <Line
      key={i}
      x1={V[a][0] * meshScale + meshOx}
      y1={V[a][1] * meshScale + meshOy}
      x2={V[b][0] * meshScale + meshOx}
      y2={V[b][1] * meshScale + meshOy}
      stroke={accentColor}
      strokeWidth={0.5}
    />
  )), [meshScale, meshOx, meshOy, accentColor]);

  return (
    <View style={styles.container}>
      {/* Ambient glow */}
      <View style={[styles.ambientGlow, { backgroundColor: accentColor + '10' }]} />

      <View style={styles.faceModel}>
        {/* Dense triangulated wireframe mesh */}
        <Svg
          width={FACE_W}
          height={FACE_H}
          viewBox={`0 0 ${FACE_W} ${FACE_H}`}
          style={styles.meshSvg}
        >
          {/* Mesh edges — horizontally compressed for realistic proportions */}
          <G
            transform={`translate(${FACE_W / 2}, 0) scale(0.86, 1) translate(${-FACE_W / 2}, 0)`}
            opacity={0.25}
          >
            {meshEdges}
          </G>
        </Svg>

        {/* Lesion dots */}
        {lesions && lesions.length > 0 && lesions.map((lesion, i) => {
          const [bx, by] = lesion.bbox;
          const cx = bx + lesion.bbox[2] / 2;
          const cy = by + lesion.bbox[3] / 2;
          // Apply same horizontal compression as mesh
          const screenX = ((cx - 0.5) * 0.86 + 0.5) * 100;
          return (
            <View
              key={`lesion-${i}`}
              style={[
                styles.lesionDot,
                {
                  top: `${cy * 100}%`,
                  left: `${screenX}%`,
                  backgroundColor: LESION_COLORS[lesion.class] || Colors.error,
                },
              ]}
            />
          );
        })}

        {/* Interactive zone markers */}
        {zones.map((zone) => {
          const selected = zone.key === selectedZoneKey;
          const color = severityColors[zone.severity];
          const half = MARKER_SIZE / 2;
          const markerTransform = selected
            ? [{ translateX: -half }, { translateY: -half }, { scale: pulse }]
            : [{ translateX: -half }, { translateY: -half }];

          return (
            <Animated.View
              key={zone.key}
              style={[
                styles.markerContainer,
                {
                  top: `${zone.top}%`,
                  left: `${zone.left}%`,
                  transform: markerTransform,
                },
              ]}
            >
              <TouchableOpacity
                onPress={() => onSelectZone(zone.key)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${zone.label}, ${zone.severity} severity`}
                style={[
                  styles.marker,
                  {
                    borderColor: color,
                    backgroundColor: selected ? color : color + '18',
                  },
                ]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {selected && (
                  <View style={[styles.markerRing, { borderColor: color + '40' }]} />
                )}
              </TouchableOpacity>
              <Text
                style={[
                  styles.markerLabel,
                  selected && { color: Colors.text, fontFamily: FontFamily.sansSemiBold },
                ]}
                numberOfLines={1}
              >
                {zone.label}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    paddingVertical: Spacing.md,
  },
  ambientGlow: {
    position: 'absolute',
    top: '15%',
    alignSelf: 'center',
    width: 180,
    height: 180,
    borderRadius: BorderRadius.full,
  },
  faceModel: {
    width: FACE_W,
    height: FACE_H,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  meshSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  markerContainer: {
    position: 'absolute',
    width: MARKER_SIZE,
    alignItems: 'center',
    gap: 3,
  },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: BorderRadius.full,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerRing: {
    position: 'absolute',
    width: MARKER_SIZE + 8,
    height: MARKER_SIZE + 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
  },
  markerLabel: {
    color: Colors.textMuted,
    fontFamily: FontFamily.sansMedium,
    fontSize: 9,
    textAlign: 'center',
  },
  lesionDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    transform: [{ translateX: -4 }, { translateY: -4 }],
  },
});
