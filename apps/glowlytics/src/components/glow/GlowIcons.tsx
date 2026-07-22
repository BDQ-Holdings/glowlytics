import React from 'react';
import Svg, { Circle, Path, Rect, Defs, LinearGradient, Stop, G } from 'react-native-svg';

/**
 * Monoline icon set ported from the Glowlytics redesign hand-off.
 * Replaces emoji + Feather/MaterialCommunityIcons with a unified SF-Symbols-style set.
 *
 * All glyphs sit in a 24×24 viewBox; pass `size` for render dimensions, `stroke` for
 * the line weight (1.5 default), and `color`/`filled` for fill/stroke control.
 */
export type GlowIconName =
  | 'today'
  | 'story'
  | 'shelf'
  | 'me'
  | 'camera'
  | 'back'
  | 'chevron'
  | 'arrow'
  | 'check'
  | 'plus'
  | 'drop'
  | 'leaf'
  | 'sun'
  | 'sparkle'
  | 'flame'
  | 'mood_meh'
  | 'mood_smile'
  | 'mood_grin'
  | 'mood_sad'
  | 'mood_sleep'
  | 'mood_woozy'
  | 'heart'
  | 'share'
  | 'x'
  | 'calendar'
  | 'lock'
  | 'bell'
  | 'search'
  | 'apple'
  | 'mail'
  | 'health'
  | 'shield'
  | 'close';

export interface GlowIconProps {
  name: GlowIconName;
  size?: number;
  color?: string;
  stroke?: number;
  filled?: boolean;
}

export const GlowIcon: React.FC<GlowIconProps> = ({
  name,
  size = 18,
  color = '#000',
  stroke = 1.6,
  filled = false,
}) => {
  const fill = filled ? color : 'none';
  const common = {
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {renderGlyph(name, common, color)}
    </Svg>
  );
};

function renderGlyph(name: GlowIconName, c: any, color: string) {
  switch (name) {
    case 'today':
      return (
        <G {...c}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 3 v9 l6 3" />
        </G>
      );
    case 'story':
      return <Path {...c} d="M12 4 l3 5 5 1 -4 4 1 5 -5 -3 -5 3 1 -5 -4 -4 5 -1 z" />;
    case 'shelf':
      return (
        <G {...c}>
          <Rect x="3" y="5" width="18" height="3" rx="0.5" />
          <Rect x="3" y="11" width="18" height="3" rx="0.5" />
          <Rect x="3" y="17" width="18" height="3" rx="0.5" />
        </G>
      );
    case 'me':
      return (
        <G {...c}>
          <Circle cx="12" cy="9" r="3.5" />
          <Path d="M5 20 c1-4 5-6 7-6 s6 2 7 6" />
        </G>
      );
    case 'camera':
      return (
        <G {...c}>
          <Path d="M4 8 h3 l1.5-2 h7 l1.5 2 h3 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 h-16 a1 1 0 0 1 -1-1 v-9 a1 1 0 0 1 1-1 z" />
          <Circle cx="12" cy="13.5" r="3.5" />
        </G>
      );
    case 'back':
      return <Path {...c} d="M15 5 L8 12 L15 19" />;
    case 'chevron':
      return <Path {...c} d="M9 5 L16 12 L9 19" />;
    case 'arrow':
      return (
        <G {...c}>
          <Path d="M5 12 h14" />
          <Path d="M14 6 l6 6 -6 6" />
        </G>
      );
    case 'check':
      return <Path {...c} d="M5 12.5 L10 17 L19 7" />;
    case 'plus':
      return (
        <G {...c}>
          <Path d="M12 5 v14" />
          <Path d="M5 12 h14" />
        </G>
      );
    case 'drop':
      return <Path {...c} d="M12 3 c-4 5 -6 8 -6 11 a6 6 0 0 0 12 0 c0-3 -2-6 -6-11 z" />;
    case 'leaf':
      return (
        <G {...c}>
          <Path d="M5 19 c0-9 7-14 14-14 0 8 -5 14 -14 14 z" />
          <Path d="M5 19 c3-3 6-5 10-7" />
        </G>
      );
    case 'sun':
      return (
        <G {...c}>
          <Circle cx="12" cy="12" r="4" />
          <Path d="M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3 M5 5 l2 2 M17 17 l2 2 M5 19 l2-2 M17 7 l2-2" />
        </G>
      );
    case 'sparkle':
      return (
        <Path
          {...c}
          d="M12 4 v6 M12 14 v6 M4 12 h6 M14 12 h6 M7 7 l3 3 M14 14 l3 3 M7 17 l3-3 M14 10 l3-3"
        />
      );
    case 'flame':
      return <Path {...c} d="M12 3 c0 4 -5 5 -5 10 a5 5 0 0 0 10 0 c0-3 -3-4 -3-7 -1 1 -2 1 -2-3 z" />;
    case 'mood_meh':
      return (
        <G {...c}>
          <Circle cx="12" cy="12" r="9" />
          <Circle cx="9" cy="10" r="0.6" fill={color} />
          <Circle cx="15" cy="10" r="0.6" fill={color} />
          <Path d="M9 15 h6" />
        </G>
      );
    case 'mood_smile':
      return (
        <G {...c}>
          <Circle cx="12" cy="12" r="9" />
          <Circle cx="9" cy="10" r="0.6" fill={color} />
          <Circle cx="15" cy="10" r="0.6" fill={color} />
          <Path d="M9 14 q3 3 6 0" />
        </G>
      );
    case 'mood_grin':
      return (
        <G {...c}>
          <Circle cx="12" cy="12" r="9" />
          <Circle cx="9" cy="10" r="0.6" fill={color} />
          <Circle cx="15" cy="10" r="0.6" fill={color} />
          <Path d="M8 13 q4 5 8 0" />
        </G>
      );
    case 'mood_sad':
      return (
        <G {...c}>
          <Circle cx="12" cy="12" r="9" />
          <Circle cx="9" cy="10" r="0.6" fill={color} />
          <Circle cx="15" cy="10" r="0.6" fill={color} />
          <Path d="M9 16 q3 -3 6 0" />
        </G>
      );
    case 'mood_sleep':
      return (
        <G {...c}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M7.5 10.5 h3 M13.5 10.5 h3" />
          <Path d="M9 15 h6" />
        </G>
      );
    case 'mood_woozy':
      return (
        <G {...c}>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M7.5 10.5 q1.5 -1.5 3 0" />
          <Path d="M13.5 10.5 q1.5 -1.5 3 0" />
          <Path d="M9 15 q3 -2 6 1" />
        </G>
      );
    case 'heart':
      return <Path {...c} d="M12 20 c-7-5 -9-9 -7-12 a4 4 0 0 1 7-1 a4 4 0 0 1 7 1 c2 3 0 7 -7 12 z" />;
    case 'share':
      return (
        <G {...c}>
          <Path d="M12 4 v12" />
          <Path d="M8 8 l4-4 4 4" />
          <Path d="M4 14 v5 a1 1 0 0 0 1 1 h14 a1 1 0 0 0 1-1 v-5" />
        </G>
      );
    case 'x':
    case 'close':
      return (
        <G {...c}>
          <Path d="M5 5 L19 19" />
          <Path d="M19 5 L5 19" />
        </G>
      );
    case 'calendar':
      return (
        <G {...c}>
          <Rect x="4" y="6" width="16" height="14" rx="2" />
          <Path d="M4 10 h16 M8 3 v4 M16 3 v4" />
        </G>
      );
    case 'lock':
      return (
        <G {...c}>
          <Rect x="5" y="11" width="14" height="9" rx="2" />
          <Path d="M8 11 V8 a4 4 0 0 1 8 0 v3" />
        </G>
      );
    case 'bell':
      return (
        <G {...c}>
          <Path d="M6 17 v-5 a6 6 0 0 1 12 0 v5 h1 l-1 2 h-12 l-1-2 h1 z" />
          <Path d="M10 20 a2 2 0 0 0 4 0" />
        </G>
      );
    case 'search':
      return (
        <G {...c}>
          <Circle cx="11" cy="11" r="6" />
          <Path d="M16 16 l4 4" />
        </G>
      );
    case 'apple':
      return (
        <G {...c}>
          <Path d="M14.5 3 c-.5 1.5 -2 2.5 -3.5 2.3 -.2 -1.5 .8 -3 2 -3.7 1 -.4 1.5 -.1 1.5 1.4 z" />
          <Path d="M17.5 16 c-.7 1.5 -1.5 3 -2.7 3 -1.2 0 -1.6 -.8 -3 -.8 s-1.8 .8 -3 .8 c-1.2 0 -2.1 -1.6 -2.7 -3 -1.3 -2.7 -1.2 -7 1.5 -8 1.4 -.5 2.5 .4 3.2 .4 .7 0 1.6 -.5 2.8 -.4 1.2 .1 2.2 .6 2.8 1.5 -2.5 1.4 -2.1 4.6 .1 5.5 z" />
        </G>
      );
    case 'mail':
      return (
        <G {...c}>
          <Rect x="3" y="5" width="18" height="14" rx="2" />
          <Path d="M3 7 L12 14 L21 7" />
        </G>
      );
    case 'health':
      return (
        <G {...c}>
          <Path d="M12 7 v-2 M7 12 h-2 M19 12 h-2 M12 19 v-2" />
          <Path d="M12 19 c4 -3 6 -6 6 -10 a3 3 0 0 0 -6 0 a3 3 0 0 0 -6 0 c0 4 2 7 6 10 z" />
        </G>
      );
    case 'shield':
      return (
        <G {...c}>
          <Path d="M12 3 l8 3 v6 c0 5 -3.5 8 -8 9 -4.5 -1 -8 -4 -8 -9 V6 l8-3 z" />
          <Path d="M9 12 l2 2 l4-4" />
        </G>
      );
  }
}

/**
 * Sparkline path used by Story / Product Detail.
 * Draws gradient-filled area + line + endpoint dots.
 */
export interface GlowSparkProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  showDots?: boolean;
}

export const GlowSpark: React.FC<GlowSparkProps> = ({
  data,
  color,
  width = 220,
  height = 56,
  showDots = true,
}) => {
  if (data.length < 2) return null;
  const min = Math.min(...data) - 4;
  const max = Math.max(...data) + 4;
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });
  const path = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="glowSpark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={area} fill="url(#glowSpark)" />
      <Path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {showDots &&
        pts.map((p, i) => (
          <Circle
            key={i}
            cx={p[0]}
            cy={p[1]}
            r={i === pts.length - 1 ? 4 : 2}
            fill={color}
          />
        ))}
    </Svg>
  );
};
