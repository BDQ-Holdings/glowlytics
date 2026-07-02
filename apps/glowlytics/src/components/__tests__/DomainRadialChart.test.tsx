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

  // Six finite scores → six domain labels + six numeric score labels = 12
  // RNSVGText nodes by default. When showScoreLabels is false the six numeric
  // score labels are suppressed (labels only, 6 nodes) while the plotted
  // shape — reference rings, spokes, petal (paths) and score dots (circles) —
  // is untouched. The interpreted rows on the by-area page then own the
  // numbers, so the raw score never appears twice.
  const sixScores = {
    symmetry: 75, periorbital: 82, mandibular: 68,
    midface: 36, nose: 65, brow: 72,
  };

  it('renders a numeric score label for each finite domain by default', () => {
    const { UNSAFE_root } = render(<DomainRadialChart scores={sixScores} />);
    // 6 domain labels + 6 numeric score labels
    expect(UNSAFE_root.findAllByType('RNSVGText' as never)).toHaveLength(12);
  });

  it('suppresses numeric score labels when showScoreLabels is false, keeping the plotted shape', () => {
    const withLabels = render(<DomainRadialChart scores={sixScores} />);
    const shapePaths = withLabels.UNSAFE_root.findAllByType('RNSVGPath' as never).length;
    const shapeDots = withLabels.UNSAFE_root.findAllByType('RNSVGCircle' as never).length;

    const { UNSAFE_root } = render(
      <DomainRadialChart scores={sixScores} showScoreLabels={false} />,
    );
    // Only the 6 domain labels remain — every numeric score text is gone.
    expect(UNSAFE_root.findAllByType('RNSVGText' as never)).toHaveLength(6);
    // Shape is untouched: same rings/spokes/petal paths and score dots.
    expect(UNSAFE_root.findAllByType('RNSVGPath' as never)).toHaveLength(shapePaths);
    expect(UNSAFE_root.findAllByType('RNSVGCircle' as never)).toHaveLength(shapeDots);
  });
});
