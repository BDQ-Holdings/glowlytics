import React, { useId } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { Glow } from '../../constants/theme';

const P = Glow.palette;

export type ZoneKey =
  | 'forehead'
  | 'tzone'
  | 'cheekL'
  | 'cheekR'
  | 'undereyeL'
  | 'undereyeR'
  | 'jaw';

export const ZONE_PATHS: Record<ZoneKey, string> = {
  forehead:  'M 56 70 C 70 50, 130 50, 144 70 L 144 92 C 130 86, 70 86, 56 92 Z',
  tzone:     'M 92 95 C 92 95, 108 95, 108 95 L 110 155 C 110 170, 90 170, 90 155 Z',
  cheekL:    'M 50 120 C 38 120, 36 168, 60 175 C 78 175, 84 145, 80 130 Z',
  cheekR:    'M 150 120 C 162 120, 164 168, 140 175 C 122 175, 116 145, 120 130 Z',
  undereyeL: 'M 56 102 C 64 100, 84 100, 88 105 C 80 110, 64 110, 56 108 Z',
  undereyeR: 'M 144 102 C 136 100, 116 100, 112 105 C 120 110, 136 110, 144 108 Z',
  jaw:       'M 60 192 C 80 230, 120 230, 140 192 C 130 215, 110 225, 100 225 C 90 225, 70 215, 60 192 Z',
};

const FACE_PATH =
  'M 100 28 C 58 28, 28 60, 28 112 C 28 178, 56 228, 100 240 C 144 228, 172 178, 172 112 C 172 60, 142 28, 100 28 Z';

export type ZoneStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: string;
  opacity?: number;
};

export type FaceMapZonesProps = {
  size?: number;
  zones?: Partial<Record<ZoneKey, ZoneStyle>>;
  contour?: 'ink' | 'soft' | 'accent' | 'fill';
  annotated?: boolean;
  mood?: 'rest' | 'glow';
  /** Optional structured-light sweep line position (svg y, 0..268) */
  sweepY?: number;
};

/**
 * FaceMapZones — stylized face silhouette with toggleable zone overlays.
 * Mirrors the design's central FaceMap primitive (scan-flow.jsx).
 */
export function FaceMapZones({
  size = 200,
  zones = {},
  contour = 'ink',
  annotated = false,
  mood = 'rest',
  sweepY,
}: FaceMapZonesProps) {
  const uid = useId().replace(/:/g, '');
  const clipId = `face-clip-${uid}`;
  const haloId = `face-glow-${uid}`;
  const sweepId = `face-sweep-${uid}`;
  const height = size * (268 / 200);
  const contourStroke =
    contour === 'ink' ? P.ink : contour === 'soft' ? P.glow : P.accent2;
  const contourWidth = contour === 'soft' ? 1 : 1.2;
  const contourFill = contour === 'fill' ? P.surface : 'none';

  return (
    <Svg width={size} height={height} viewBox="0 0 200 268">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={FACE_PATH} />
        </ClipPath>
        <RadialGradient id={haloId} cx="50%" cy="40%" r="65%">
          <Stop offset="0%" stopColor={P.accent2} stopOpacity={0.5} />
          <Stop offset="100%" stopColor={P.accent2} stopOpacity={0} />
        </RadialGradient>
        {sweepY != null && (
          <LinearGradient id={sweepId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={P.accent2} stopOpacity={0} />
            <Stop offset="50%" stopColor={P.accent2} stopOpacity={0.9} />
            <Stop offset="100%" stopColor={P.accent2} stopOpacity={0} />
          </LinearGradient>
        )}
      </Defs>

      {mood === 'glow' && (
        <Ellipse cx={100} cy={120} rx={110} ry={135} fill={`url(#${haloId})`} />
      )}

      <Path
        d={FACE_PATH}
        fill={contourFill}
        stroke={contourStroke}
        strokeWidth={contourWidth}
      />

      <G clipPath={`url(#${clipId})`}>
        {(Object.entries(zones) as [ZoneKey, ZoneStyle][]).map(([key, props]) => (
          <Path
            key={key}
            d={ZONE_PATHS[key]}
            fill={props.fill ?? 'none'}
            stroke={props.stroke ?? 'none'}
            strokeWidth={props.strokeWidth ?? 1}
            strokeDasharray={props.dash}
            opacity={props.opacity ?? 1}
          />
        ))}
        {sweepY != null && (
          <G>
            <Rect
              x={20}
              y={sweepY - 24}
              width={160}
              height={48}
              fill={`url(#${sweepId})`}
              opacity={0.5}
            />
            <Path
              d={`M 20 ${sweepY} L 180 ${sweepY}`}
              stroke={P.accent2}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          </G>
        )}
      </G>

      {/* features — eyes, nose, lips, drawn light */}
      <G stroke={P.muted} strokeWidth={1} fill="none" strokeLinecap="round" opacity={0.5}>
        <Path d="M 60 100 Q 72 96, 84 100" />
        <Path d="M 116 100 Q 128 96, 140 100" />
        <Path d="M 100 110 L 100 145 Q 100 152, 95 154" />
        <Path d="M 84 175 Q 100 182, 116 175" />
      </G>

      {annotated && (
        <G>
          {[
            [100, 50],
            [42, 100],
            [158, 100],
            [100, 142],
            [100, 230],
          ].map(([x, y]) => (
            <G key={`${x}-${y}`}>
              <Circle cx={x} cy={y} r={3.5} fill={P.accent2} />
              <Circle
                cx={x}
                cy={y}
                r={7}
                fill="none"
                stroke={P.accent2}
                strokeWidth={0.6}
                opacity={0.5}
              />
            </G>
          ))}
        </G>
      )}
    </Svg>
  );
}

export default FaceMapZones;
