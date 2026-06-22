import React from 'react';
import ScanLayout from '../_layout';

// Mock expo-router so we can inspect the Stack.Screen element tree without
// pulling in the native navigator. Stack/Stack.Screen are inert here — we only
// read the React elements ScanLayout returns, never render them.
jest.mock('expo-router', () => {
  const Stack = (props: { children?: React.ReactNode }) => props.children ?? null;
  Stack.Screen = () => null;
  return { Stack };
});

type ScreenProps = { name: string; options?: { gestureEnabled?: boolean } };

const screens = (): ScreenProps[] => {
  const tree = ScanLayout() as React.ReactElement<{ children?: React.ReactNode }>;
  return React.Children.toArray(tree.props.children)
    .filter((c): c is React.ReactElement<ScreenProps> => React.isValidElement(c))
    .map((c) => c.props);
};

describe('ScanLayout', () => {
  it('locks the swipe-back gesture on results so a swipe cannot strand the user', () => {
    const results = screens().find((s) => s.name === 'results');
    expect(results).toBeDefined();
    expect(results?.options?.gestureEnabled).toBe(false);
  });

  it('keeps analyzing locked too (consistent mid-flow protection)', () => {
    const analyzing = screens().find((s) => s.name === 'analyzing');
    expect(analyzing?.options?.gestureEnabled).toBe(false);
  });

  it('does NOT lock the camera back-gesture (users must be able to cancel the scan)', () => {
    const camera = screens().find((s) => s.name === 'camera');
    // camera is unregistered here (defaults to gesture-enabled). If a future
    // change registers it, it must still not disable the back-gesture.
    expect(camera?.options?.gestureEnabled).not.toBe(false);
  });
});
