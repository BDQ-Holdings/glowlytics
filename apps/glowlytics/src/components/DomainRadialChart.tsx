/**
 * DomainRadialChart — petal-style radial chart for the 6 bone-structure
 * domains. Replaces the linear-bar "By area" list with a single shape the
 * eye can read at a glance: a regular hexagon when balanced, a lopsided
 * petal when one domain is dragging.
 *
 * Renders three concentric reference rings (25 / 50 / 75) so the user has
 * a sense of scale without explicit axis labels eating into the SVG.
 */
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Polygon,
  Text as SvgText,
} from 'react-native-svg';
import { BONE_DOMAINS, HARMONY_ACCENT } from '../constants/boneStructure';
import { Colors, FontFamily, FontSize } from '../constants/theme';
import type { BoneDomain } from '../types';

interface Props {
  scores: Partial<Record<BoneDomain, number | null>>;
  /** Optional previous-scan scores — drawn as a ghost outline behind the
   *  live petal so the user can see per-domain movement at a glance. */
  previousScores?: Partial<Record<BoneDomain, number | null>>;
  size?: number;
}

export const DomainRadialChart: React.FC<Props> = ({ scores, previousScores, size = 240 }) => {
  const center = size / 2;
  const radius = size / 2 - 28; // padding for outside labels

  // Pre-compute each domain's anchor angle (start at top, clockwise)
  const axes = useMemo(() => {
    const n = BONE_DOMAINS.length;
    return BONE_DOMAINS.map((d, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const score = scores?.[d.key];
      const normalised = typeof score === 'number' && Number.isFinite(score)
        ? Math.max(0, Math.min(100, score)) / 100
        : 0;
      const r = normalised * radius;
      return {
        key: d.key,
        label: d.label,
        accent: d.accent,
        score,
        angle,
        // Filled petal anchor — where the user's score lands on this axis
        x: center + Math.cos(angle) * r,
        y: center + Math.sin(angle) * r,
        // Axis endpoint at radius (for the spoke)
        spokeX: center + Math.cos(angle) * radius,
        spokeY: center + Math.sin(angle) * radius,
        // Label position just past the spoke
        labelX: center + Math.cos(angle) * (radius + 16),
        labelY: center + Math.sin(angle) * (radius + 16),
        scoreLabelX: center + Math.cos(angle) * (radius + 16),
        scoreLabelY: center + Math.sin(angle) * (radius + 16) + 12,
      };
    });
  }, [scores, center, radius]);

  const petalPoints = useMemo(
    () => axes.map((a) => `${a.x.toFixed(1)},${a.y.toFixed(1)}`).join(' '),
    [axes],
  );

  // Previous-scan petal anchors (ghost outline). null when no comparison.
  const previousPoints = useMemo(() => {
    if (!previousScores) return null;
    const hasAny = BONE_DOMAINS.some((d) => {
      const v = previousScores[d.key];
      return typeof v === 'number' && Number.isFinite(v);
    });
    if (!hasAny) return null;
    return BONE_DOMAINS
      .map((d, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / BONE_DOMAINS.length;
        const score = previousScores[d.key];
        const r = typeof score === 'number' && Number.isFinite(score)
          ? Math.max(0, Math.min(100, score)) / 100 * radius
          : 0;
        const x = center + Math.cos(angle) * r;
        const y = center + Math.sin(angle) * r;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [previousScores, center, radius]);

  // Reference rings (25/50/75) — drawn as concentric polygons matching the
  // axis count so they stay visually consistent with the petal shape.
  const ringPoints = useMemo(() => {
    const make = (frac: number) =>
      axes
        .map((a) => {
          const x = center + Math.cos(a.angle) * radius * frac;
          const y = center + Math.sin(a.angle) * radius * frac;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    return { r25: make(0.25), r50: make(0.5), r75: make(0.75) };
  }, [axes, center, radius]);

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Reference rings */}
        <G>
          <Polygon points={ringPoints.r25} fill="none" stroke={Colors.borderStrong} strokeOpacity={0.25} strokeWidth={0.8} />
          <Polygon points={ringPoints.r50} fill="none" stroke={Colors.borderStrong} strokeOpacity={0.3} strokeWidth={0.8} />
          <Polygon points={ringPoints.r75} fill="none" stroke={Colors.borderStrong} strokeOpacity={0.35} strokeWidth={0.8} />
        </G>

        {/* Axis spokes */}
        <G>
          {axes.map((a) => (
            <Polygon
              key={`spoke-${a.key}`}
              points={`${center},${center} ${a.spokeX.toFixed(1)},${a.spokeY.toFixed(1)}`}
              stroke={Colors.borderStrong}
              strokeOpacity={0.22}
              strokeWidth={0.8}
            />
          ))}
        </G>

        {/* Previous-scan ghost outline — sits behind the live petal so the
            eye can compare without losing the new shape. */}
        {previousPoints && (
          <Polygon
            points={previousPoints}
            fill="none"
            stroke={Colors.textMuted}
            strokeOpacity={0.55}
            strokeWidth={1.2}
            strokeDasharray="3,3"
            strokeLinejoin="round"
          />
        )}

        {/* Filled petal — current scan's scores */}
        <Polygon
          points={petalPoints}
          fill={HARMONY_ACCENT}
          fillOpacity={0.30}
          stroke={HARMONY_ACCENT}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Score dot on each axis, in the domain's accent color */}
        <G>
          {axes.map((a) => (
            <Circle
              key={`dot-${a.key}`}
              cx={a.x} cy={a.y} r={3.2}
              fill={a.accent}
              stroke={Colors.background}
              strokeWidth={1}
            />
          ))}
        </G>

        {/* Domain labels */}
        <G>
          {axes.map((a) => {
            // Pick anchor based on horizontal placement so labels don't slide off
            const anchor =
              a.labelX < center - 4 ? 'end' :
              a.labelX > center + 4 ? 'start' :
              'middle';
            return (
              <G key={`label-${a.key}`}>
                <SvgText
                  x={a.labelX} y={a.labelY}
                  fontSize={FontSize.xxs}
                  fontFamily={FontFamily.sansSemiBold}
                  fill={Colors.text}
                  textAnchor={anchor}
                >
                  {a.label}
                </SvgText>
                {typeof a.score === 'number' && Number.isFinite(a.score) && (
                  <SvgText
                    x={a.scoreLabelX} y={a.scoreLabelY}
                    fontSize={FontSize.xxs}
                    fontFamily={FontFamily.sansMedium}
                    fill={a.accent}
                    textAnchor={anchor}
                  >
                    {a.score}
                  </SvgText>
                )}
              </G>
            );
          })}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
