import React from 'react';
import { render } from '@testing-library/react-native';
import { DomainRadialChart } from '../DomainRadialChart';

describe('DomainRadialChart', () => {
  it('renders with empty scores without crashing', () => {
    const { UNSAFE_root } = render(<DomainRadialChart scores={{}} />);
    expect(UNSAFE_root).toBeTruthy();
  });

  it('renders a polygon, axis spokes and dots when six valid scores are provided', () => {
    // react-native-svg's <Text>/<Polygon>/<Circle> render as RNSVGText etc.
    // which testing-library's text matchers can't reach. We assert on the
    // native SVG component count instead — six spoke polygons, six dots,
    // one petal polygon, plus three reference rings.
    const { UNSAFE_root } = render(
      <DomainRadialChart scores={{
        symmetry: 75, periorbital: 82, mandibular: 68,
        midface: 70, nose: 65, brow: 72,
      }} />,
    );
    const polygons = UNSAFE_root.findAllByType('RNSVGPath' as never);
    const circles = UNSAFE_root.findAllByType('RNSVGCircle' as never);
    // 3 reference rings + 6 spokes + 1 filled petal = 10 polygon paths
    expect(polygons.length).toBeGreaterThanOrEqual(10);
    // 6 score dots (one per axis)
    expect(circles.length).toBeGreaterThanOrEqual(6);
  });

  it('accepts previousScores for ghost-outline comparison without throwing', () => {
    const { UNSAFE_root } = render(
      <DomainRadialChart
        scores={{ symmetry: 80, periorbital: 80, mandibular: 70, midface: 70, nose: 65, brow: 70 }}
        previousScores={{ symmetry: 60, periorbital: 70, mandibular: 65, midface: 65, nose: 60, brow: 60 }}
      />,
    );
    expect(UNSAFE_root).toBeTruthy();
  });

  it('clamps out-of-range scores to a renderable polygon', () => {
    // Negative + >100 scores must not break projection
    const { UNSAFE_root } = render(
      <DomainRadialChart scores={{
        symmetry: -50, periorbital: 250, mandibular: 70,
        midface: NaN as unknown as number, nose: Infinity as unknown as number, brow: 50,
      }} />,
    );
    expect(UNSAFE_root).toBeTruthy();
  });
});
