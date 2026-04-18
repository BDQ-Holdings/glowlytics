import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  withSpring,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { G, Line, Rect, Text as SvgText, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '../constants/theme';
import { LESION_INFO } from '../constants/lesions';
import type { DetectedLesion, LesionClass } from '../types';

// ─── Theme ───────────────────────────────────────────────────────────
const PRIMARY = '#7DE7E1';
const PRIMARY_DIM = 'rgba(125, 231, 225, 0.25)';
const BG_DARK = 'rgba(6, 11, 18, 0.78)';
const GRID_COLOR = 'rgba(125, 231, 225, 0.04)';
const SWEEP_COLOR = PRIMARY;

const CORNER_FRAC = 0.22;
const STROKE_W = 1.8;
const LABEL_H = 20;
const GRID_SPACING = 55;

/** Get color for lesion type */
function lesionColor(cls: LesionClass): string {
  return LESION_INFO[cls]?.color || PRIMARY;
}

/** Determine opacity from confidence tier */
function getLesionOpacity(lesion: DetectedLesion): number {
  if (lesion.tier === 'possible' || lesion.confidence < 0.08) return 0.45;
  return 1.0;
}

// ─── Rotating Reticle ────────────────────────────────────────────────
interface ReticleProps {
  cx: number;
  cy: number;
  radius: number;
  color: string;
  rotation: SharedValue<number>;
}

function ReticleRing({ cx, cy, radius, color, rotation }: ReticleProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      style={[{
        position: 'absolute',
        left: cx - radius,
        top: cy - radius,
        width: radius * 2,
        height: radius * 2,
      }, style]}
    >
      <Svg width={radius * 2} height={radius * 2} viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
        <Circle
          cx={radius}
          cy={radius}
          r={radius - 1}
          fill="none"
          stroke={color}
          strokeWidth={0.7}
          strokeOpacity={0.5}
          strokeDasharray="3 7"
        />
        {/* Tick marks at cardinal points */}
        <Line x1={radius} y1={1} x2={radius} y2={4} stroke={color} strokeWidth={1} strokeOpacity={0.6} />
        <Line x1={radius * 2 - 1} y1={radius} x2={radius * 2 - 4} y2={radius} stroke={color} strokeWidth={1} strokeOpacity={0.6} />
        <Line x1={radius} y1={radius * 2 - 1} x2={radius} y2={radius * 2 - 4} stroke={color} strokeWidth={1} strokeOpacity={0.6} />
        <Line x1={1} y1={radius} x2={4} y2={radius} stroke={color} strokeWidth={1} strokeOpacity={0.6} />
      </Svg>
    </Animated.View>
  );
}

// ─── Ring Burst Effect ───────────────────────────────────────────────
function RingBurst({ cx, cy, color, trigger }: { cx: number; cy: number; color: string; trigger: number }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (trigger > 0) {
      scale.value = 0;
      opacity.value = 0.8;
      scale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
      opacity.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.cubic) });
    }
  }, [trigger]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[{
        position: 'absolute',
        left: cx - 40,
        top: cy - 40,
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 1.5,
        borderColor: color,
      }, style]}
    />
  );
}

// ─── Main Overlay ────────────────────────────────────────────────────
interface Props {
  lesions: DetectedLesion[];
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
  faceRect?: { x: number; y: number; width: number; height: number };
  mirrored?: boolean;
  detectionSource?: 'on_device' | 'server' | null;
  /** Show scan infrastructure (grid, sweep, telemetry) even when no lesions detected */
  scanActive?: boolean;
}

export const LesionOverlay: React.FC<Props> = ({
  lesions, width, height, sourceWidth, sourceHeight, faceRect, mirrored,
  detectionSource, scanActive = false,
}) => {
  // ─── Global Animations ──────────────────────────────────────────
  const fadeIn = useSharedValue(0);
  const sweepLine1 = useSharedValue(0);
  const sweepLine2 = useSharedValue(0.5); // offset by 50%
  const gridPulse = useSharedValue(0.5);
  const crosshairPulse = useSharedValue(2);
  const glowBreath = useSharedValue(0.05);
  const reticleRotation = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const telemetryDotPulse = useSharedValue(0.4);

  const prevCount = useRef(0);
  const [burstCenter, setBurstCenter] = useState<{ x: number; y: number; color: string } | null>(null);
  const [burstTrigger, setBurstTrigger] = useState(0);

  // Start global loops
  useEffect(() => {
    // Dual sweep lines
    sweepLine1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
      ), -1,
    );
    sweepLine2.value = withDelay(2000, withRepeat(
      withSequence(
        withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.sin) }),
      ), -1,
    ));

    // Grid opacity pulse
    gridPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      ), -1,
    );

    // Crosshair size pulse
    crosshairPulse.value = withRepeat(
      withSequence(
        withTiming(4, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
        withTiming(2, { duration: 1000, easing: Easing.inOut(Easing.sin) }),
      ), -1,
    );

    // Glow breathing
    glowBreath.value = withRepeat(
      withSequence(
        withTiming(0.14, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.05, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      ), -1,
    );

    // Reticle rotation
    reticleRotation.value = withRepeat(
      withTiming(360, { duration: 30000, easing: Easing.linear }),
      -1, false,
    );

    // Telemetry dot
    telemetryDotPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ), -1,
    );
  }, []);

  // Fade in/out & detection flash
  useEffect(() => {
    fadeIn.value = withTiming((lesions.length > 0 || scanActive) ? 1 : 0, {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });

    if (lesions.length > 0 && lesions.length > prevCount.current) {
      // Flash on new detection
      flashOpacity.value = 0;
      flashOpacity.value = withSequence(
        withTiming(0.22, { duration: 150 }),
        withTiming(0, { duration: 650, easing: Easing.out(Easing.cubic) }),
      );

      // Ring burst at first new lesion's center
      const newLesion = lesions[lesions.length - 1];
      if (newLesion) {
        const [bx, by, bw, bh] = newLesion.bbox;
        const srcW = sourceWidth || width;
        const srcH = sourceHeight || height;
        const coverScale = Math.max(width / srcW, height / srcH);
        const displayedW = srcW * coverScale;
        const displayedH = srcH * coverScale;
        const cropOffsetX = (width - displayedW) / 2;
        const cropOffsetY = (height - displayedH) / 2;
        let cx = (bx + bw / 2) * displayedW + cropOffsetX;
        const cy = (by + bh / 2) * displayedH + cropOffsetY;
        if (mirrored) cx = width - cx;

        setBurstCenter({ x: cx, y: cy, color: lesionColor(newLesion.class) });
        setBurstTrigger((t) => t + 1);
      }
    }
    prevCount.current = lesions.length;
  }, [lesions.length]);

  // ─── Animated Styles ────────────────────────────────────────────
  const containerStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  const sweep1Style = useAnimatedStyle(() => ({
    top: `${sweepLine1.value * 100}%` as any,
    opacity: 0.6,
  }));

  const sweep2Style = useAnimatedStyle(() => ({
    top: `${sweepLine2.value * 100}%` as any,
    opacity: 0.35,
  }));

  const gridStyle = useAnimatedStyle(() => ({
    opacity: gridPulse.value * 0.08,
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));

  const telemetryDotStyle = useAnimatedStyle(() => ({
    opacity: telemetryDotPulse.value,
  }));

  if (lesions.length === 0 && !scanActive) return null;
  const hasLesions = lesions.length > 0;

  // ─── Coordinate Mapping ─────────────────────────────────────────
  // Guard against 0 source dimensions (before first frame arrives)
  const srcW = (sourceWidth && sourceWidth > 0) ? sourceWidth : width;
  const srcH = (sourceHeight && sourceHeight > 0) ? sourceHeight : height;
  const coverScale = srcW > 0 && srcH > 0 ? Math.max(width / srcW, height / srcH) : 1;
  const displayedW = srcW * coverScale;
  const displayedH = srcH * coverScale;
  const cropOffsetX = (width - displayedW) / 2;
  const cropOffsetY = (height - displayedH) / 2;

  // ─── Build Grid Lines ───────────────────────────────────────────
  const gridLines: React.ReactNode[] = [];
  for (let gx = GRID_SPACING; gx < width; gx += GRID_SPACING) {
    gridLines.push(
      <Line key={`gv-${gx}`} x1={gx} y1={0} x2={gx} y2={height}
        stroke={PRIMARY} strokeWidth={0.5} strokeOpacity={1} strokeDasharray="2 12" />
    );
  }
  for (let gy = GRID_SPACING; gy < height; gy += GRID_SPACING) {
    gridLines.push(
      <Line key={`gh-${gy}`} x1={0} y1={gy} x2={width} y2={gy}
        stroke={PRIMARY} strokeWidth={0.5} strokeOpacity={1} strokeDasharray="2 12" />
    );
  }

  // ─── Map Lesions to Screen Coords ───────────────────────────────
  const mappedLesions = lesions.map((lesion, i) => {
    if (!lesion.bbox || lesion.bbox.length < 4) return null;
    const [bx, by, bw, bh] = lesion.bbox;

    // Face rect filter
    if (faceRect && faceRect.width > 0.05 && faceRect.height > 0.05) {
      const cx = bx + bw / 2;
      const cy = by + bh / 2;
      const padW = faceRect.width * 0.15;
      const padH = faceRect.height * 0.15;
      if (cx < faceRect.x - padW || cx > faceRect.x + faceRect.width + padW ||
          cy < faceRect.y - padH || cy > faceRect.y + faceRect.height + padH) return null;
    }

    const w = bw * displayedW;
    const h = bh * displayedH;
    let x = bx * displayedW + cropOffsetX;
    const y = by * displayedH + cropOffsetY;
    if (mirrored) x = width - x - w;
    if (x + w < 0 || x > width || y + h < 0 || y > height) return null;

    return { lesion, x, y, w, h, i };
  }).filter(Boolean) as Array<{ lesion: DetectedLesion; x: number; y: number; w: number; h: number; i: number }>;

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {/* ── Detection Flash ──────────────────────────────────── */}
      <Animated.View style={[styles.flash, flashStyle]} />

      <Animated.View style={[StyleSheet.absoluteFill, containerStyle]}>
        {/* ── Scanning Grid ────────────────────────────────────── */}
        <Animated.View style={[StyleSheet.absoluteFill, gridStyle]}>
          <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            {gridLines}
          </Svg>
        </Animated.View>

        {/* ── Dual Sweep Lines ─────────────────────────────────── */}
        <Animated.View style={[styles.sweepLine, styles.sweepLinePrimary, sweep1Style]} />
        <Animated.View style={[styles.sweepLine, styles.sweepLineSecondary, sweep2Style]} />

        {/* ── SVG: Bounding Boxes & Labels (only when lesions detected) ── */}
        {hasLesions && <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id="boxGlowGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={PRIMARY} stopOpacity={0.1} />
              <Stop offset="0.5" stopColor={PRIMARY} stopOpacity={0.03} />
              <Stop offset="1" stopColor={PRIMARY} stopOpacity={0.1} />
            </LinearGradient>
          </Defs>

          {mappedLesions.map(({ lesion, x, y, w, h, i }) => {
            const stableKey = lesion.trackId || `l-${i}`;
            const conf = Math.round(lesion.confidence * 100);
            const tierOpacity = getLesionOpacity(lesion);
            const isConfirmed = tierOpacity >= 1.0;
            const typeColor = lesionColor(lesion.class);
            const typeColorBright = typeColor + (isConfirmed ? '' : '77');
            const typeColorDim = typeColor + '40';
            const lesionInfo = LESION_INFO[lesion.class as LesionClass] ?? { label: lesion.class, subtitle: 'detected lesion' };
            const primaryLabel = lesionInfo.label.toUpperCase();
            const subtitle = lesionInfo.subtitle;

            const cornerLen = Math.min(w * CORNER_FRAC, 18);
            const cornerLenY = Math.min(h * CORNER_FRAC, 18);
            const x1 = x, y1 = y, x2 = x + w, y2 = y + h;
            const centerX = x + w / 2;
            const centerY = y + h / 2;

            return (
              <G key={stableKey} opacity={tierOpacity}>
                {/* Edge glow fill */}
                <Rect x={x} y={y} width={w} height={h} fill="url(#boxGlowGrad)" rx={3} />

                {/* ── Corner Brackets ── */}
                {/* Top-left */}
                <Line x1={x1} y1={y1 + 3} x2={x1} y2={y1 + cornerLenY} stroke={typeColorBright} strokeWidth={STROKE_W} strokeLinecap="round" />
                <Line x1={x1 + 3} y1={y1} x2={x1 + cornerLen} y2={y1} stroke={typeColorBright} strokeWidth={STROKE_W} strokeLinecap="round" />
                {/* Top-right */}
                <Line x1={x2 - cornerLen} y1={y1} x2={x2 - 3} y2={y1} stroke={typeColorBright} strokeWidth={STROKE_W} strokeLinecap="round" />
                <Line x1={x2} y1={y1 + 3} x2={x2} y2={y1 + cornerLenY} stroke={typeColorBright} strokeWidth={STROKE_W} strokeLinecap="round" />
                {/* Bottom-left */}
                <Line x1={x1} y1={y2 - cornerLenY} x2={x1} y2={y2 - 3} stroke={typeColorBright} strokeWidth={STROKE_W} strokeLinecap="round" />
                <Line x1={x1 + 3} y1={y2} x2={x1 + cornerLen} y2={y2} stroke={typeColorBright} strokeWidth={STROKE_W} strokeLinecap="round" />
                {/* Bottom-right */}
                <Line x1={x2 - cornerLen} y1={y2} x2={x2 - 3} y2={y2} stroke={typeColorBright} strokeWidth={STROKE_W} strokeLinecap="round" />
                <Line x1={x2} y1={y2 - cornerLenY} x2={x2} y2={y2 - 3} stroke={typeColorBright} strokeWidth={STROKE_W} strokeLinecap="round" />

                {/* ── Dashed Edge Connectors ── */}
                <Line x1={x1 + cornerLen} y1={y1} x2={x2 - cornerLen} y2={y1} stroke={typeColorDim} strokeWidth={0.5} strokeDasharray="2 8" />
                <Line x1={x1 + cornerLen} y1={y2} x2={x2 - cornerLen} y2={y2} stroke={typeColorDim} strokeWidth={0.5} strokeDasharray="2 8" />
                <Line x1={x1} y1={y1 + cornerLenY} x2={x1} y2={y2 - cornerLenY} stroke={typeColorDim} strokeWidth={0.5} strokeDasharray="2 8" />
                <Line x1={x2} y1={y1 + cornerLenY} x2={x2} y2={y2 - cornerLenY} stroke={typeColorDim} strokeWidth={0.5} strokeDasharray="2 8" />

                {/* ── Center Crosshair ── */}
                {/* Static outer ring */}
                <Circle cx={centerX} cy={centerY} r={7} fill="none" stroke={typeColorDim} strokeWidth={0.6} />
                {/* Crosshair lines */}
                <Line x1={centerX - 10} y1={centerY} x2={centerX - 4} y2={centerY} stroke={typeColor} strokeWidth={0.6} strokeOpacity={0.5} />
                <Line x1={centerX + 4} y1={centerY} x2={centerX + 10} y2={centerY} stroke={typeColor} strokeWidth={0.6} strokeOpacity={0.5} />
                <Line x1={centerX} y1={centerY - 10} x2={centerX} y2={centerY - 4} stroke={typeColor} strokeWidth={0.6} strokeOpacity={0.5} />
                <Line x1={centerX} y1={centerY + 4} x2={centerX} y2={centerY + 10} stroke={typeColor} strokeWidth={0.6} strokeOpacity={0.5} />
                {/* Center dot (size animated via parent pulse — visual only, static in SVG) */}
                <Circle cx={centerX} cy={centerY} r={2.5} fill={typeColor} fillOpacity={0.7} />

                {/* ── Label Pill: clinical name + subtitle ── */}
                {isConfirmed && (() => {
                  // Flip label below bounding box when too close to top of screen
                  const labelAbove = y > 34;
                  const pillY = labelAbove ? y - 30 : y2 + 4;
                  const textY1 = labelAbove ? y - 19 : y2 + 15;
                  const textY2 = labelAbove ? y - 8 : y2 + 24;
                  return (
                    <>
                      <Rect
                        x={x}
                        y={pillY}
                        width={Math.max(w, 90)}
                        height={26}
                        fill={BG_DARK}
                        rx={10}
                      />
                      <Rect
                        x={x}
                        y={pillY}
                        width={3}
                        height={26}
                        fill={typeColor}
                        rx={1.5}
                      />
                      <SvgText
                        x={x + 10}
                        y={textY1}
                        fill={typeColor}
                        fontSize={11}
                        fontWeight="700"
                        letterSpacing={0.8}
                      >
                        {primaryLabel}
                      </SvgText>
                      <SvgText
                        x={x + 10}
                        y={textY2}
                        fill="rgba(255,255,255,0.5)"
                        fontSize={8}
                        fontWeight="400"
                      >
                        {subtitle}
                      </SvgText>
                    </>
                  );
                })()}
              </G>
            );
          })}
        </Svg>}

        {/* ── Rotating Reticles (View layer above SVG) ───────── */}
        {hasLesions && mappedLesions.map(({ lesion, x, y, w, h, i }) => {
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          const reticleR = Math.max(Math.min(w, h) * 0.35, 14);
          const typeColor = lesionColor(lesion.class);
          return (
            <ReticleRing
              key={`ret-${lesion.trackId || i}`}
              cx={centerX}
              cy={centerY}
              radius={reticleR}
              color={typeColor}
              rotation={reticleRotation}
            />
          );
        })}

        {/* ── Ring Burst on New Detection ─────────────────────── */}
        {burstCenter && (
          <RingBurst
            cx={burstCenter.x}
            cy={burstCenter.y}
            color={burstCenter.color}
            trigger={burstTrigger}
          />
        )}
      </Animated.View>

      {/* ── Telemetry Bar ──────────────────────────────────────── */}
      <Animated.View style={[styles.telemetryBar, containerStyle]}>
        <View style={styles.telemetryLeft}>
          <Animated.View style={[styles.telemetryDot, telemetryDotStyle]} />
          <Text style={styles.telemetryLabel}>{hasLesions ? 'SCANNING' : 'ANALYZING'}</Text>
        </View>
        <View style={styles.telemetryCenter}>
          <Text style={styles.telemetryCount}>{hasLesions ? lesions.length : '—'}</Text>
          <Text style={styles.telemetryCountLabel}>{hasLesions ? 'DETECTED' : 'CLEAR'}</Text>
        </View>
        {detectionSource ? (
          <View style={styles.telemetryRight}>
            <Text style={styles.telemetrySource}>
              {detectionSource === 'on_device' ? 'ON-DEVICE' : 'SERVER'}
            </Text>
          </View>
        ) : (
          <View style={styles.telemetryRight}>
            <Text style={styles.telemetrySource}>AI VISION</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PRIMARY,
  },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
  },
  sweepLinePrimary: {
    backgroundColor: SWEEP_COLOR,
    shadowColor: SWEEP_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 5,
  },
  sweepLineSecondary: {
    backgroundColor: 'rgba(125, 231, 225, 0.5)',
    shadowColor: SWEEP_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },

  // Telemetry bar
  telemetryBar: {
    position: 'absolute',
    bottom: 140,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(6, 11, 18, 0.65)',
    borderRadius: BorderRadius.full,
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderWidth: 0.5,
    borderColor: 'rgba(125, 231, 225, 0.12)',
  },
  telemetryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  telemetryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PRIMARY,
  },
  telemetryLabel: {
    color: PRIMARY,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  telemetryCenter: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  telemetryCount: {
    color: '#FFFFFF',
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.lg,
  },
  telemetryCountLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 9,
    letterSpacing: 1,
  },
  telemetryRight: {
    backgroundColor: 'rgba(125, 231, 225, 0.1)',
    borderRadius: BorderRadius.full,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  telemetrySource: {
    color: PRIMARY,
    fontFamily: FontFamily.sansSemiBold,
    fontSize: 8,
    letterSpacing: 1.2,
  },
});
