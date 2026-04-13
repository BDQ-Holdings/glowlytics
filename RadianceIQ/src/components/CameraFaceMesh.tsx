import React from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, G, Line, RadialGradient, Stop } from 'react-native-svg';
import { Colors } from '../constants/theme';
import { V, edges, MESH_VB_W, MESH_VB_H } from './meshData';

interface Props {
  status: 'no_face' | 'misaligned' | 'aligned';
  width: number;
  height: number;
}

const AnimatedView = Animated.View;

export const CameraFaceMesh: React.FC<Props> = ({ status, width, height }) => {
  const meshOpacity = useSharedValue(0.25);
  const glowOpacity = useSharedValue(0);

  React.useEffect(() => {
    if (status === 'no_face') {
      meshOpacity.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 750 }),
          withTiming(0.15, { duration: 750 }),
        ),
        -1,
      );
      glowOpacity.value = withTiming(0, { duration: 300 });
    } else if (status === 'misaligned') {
      meshOpacity.value = withTiming(0.3, { duration: 300 });
      glowOpacity.value = withTiming(0, { duration: 300 });
    } else {
      meshOpacity.value = withTiming(0.8, { duration: 400 });
      glowOpacity.value = withTiming(0.6, { duration: 400 });
    }
  }, [status]);

  const meshStyle = useAnimatedStyle(() => ({
    opacity: meshOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const meshColor = status === 'aligned' ? Colors.primary : 'rgba(255, 255, 255, 0.75)';

  // Uniform scaling
  const scale = Math.min(width / MESH_VB_W, height / MESH_VB_H);
  const ox = (width - MESH_VB_W * scale) / 2;
  const oy = (height - MESH_VB_H * scale) / 2;

  return (
    <View style={[styles.container, { width, height }]} pointerEvents="none">
      {/* Glow behind mesh when aligned */}
      <AnimatedView style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <RadialGradient id="meshGlow" cx="50%" cy="50%" r="40%">
              <Stop offset="0%" stopColor={Colors.primary} stopOpacity="0.25" />
              <Stop offset="60%" stopColor={Colors.primary} stopOpacity="0.08" />
              <Stop offset="100%" stopColor={Colors.primary} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle
            cx={150 * scale + ox}
            cy={155 * scale + oy}
            r={MESH_VB_W * scale * 0.45}
            fill="url(#meshGlow)"
          />
        </Svg>
      </AnimatedView>

      {/* Dense triangulated wireframe */}
      <AnimatedView style={[StyleSheet.absoluteFill, meshStyle]}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {/* Face mesh — horizontally compressed for realistic proportions */}
          {/* transform scales x by 0.86 around center to create elongated oval */}
          <G transform={`translate(${150 * scale + ox}, 0) scale(0.86, 1) translate(${-(150 * scale + ox)}, 0)`}>
            {/* All triangle edges — uniform thin lines */}
            {edges.map(([a, b], i) => (
              <Line
                key={i}
                x1={V[a][0] * scale + ox}
                y1={V[a][1] * scale + oy}
                x2={V[b][0] * scale + ox}
                y2={V[b][1] * scale + oy}
                stroke={meshColor}
                strokeWidth={0.7}
              />
            ))}
          </G>
        </Svg>
      </AnimatedView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
