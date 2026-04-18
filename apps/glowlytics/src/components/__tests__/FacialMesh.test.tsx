import React from 'react';
import { render } from '@testing-library/react-native';
import { FacialMesh } from '../FacialMesh';
import type { DetectedCondition } from '../../types';

// Mock react-native-svg
jest.mock('react-native-svg', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => <View {...props} />,
    Svg: (props: any) => <View {...props} />,
    Circle: (props: any) => <View {...props} />,
    Defs: (props: any) => <View {...props} />,
    G: (props: any) => <View {...props} />,
    Line: (props: any) => <View {...props} />,
    RadialGradient: (props: any) => <View {...props} />,
    Rect: (props: any) => <View {...props} />,
    Stop: (props: any) => <View {...props} />,
  };
});

describe('FacialMesh', () => {
  it('renders with the Facial Analysis header', () => {
    const { getByText } = render(
      <FacialMesh acneScore={50} sunDamageScore={30} skinAgeScore={40} />
    );
    expect(getByText('Facial Analysis')).toBeTruthy();
  });

  it('shows All clear when no conditions are provided (regardless of scores)', () => {
    const { getByText } = render(
      <FacialMesh acneScore={80} sunDamageScore={80} skinAgeScore={80} />
    );
    // Without condition data from the backend, we don't fabricate zone positions
    expect(getByText('All clear')).toBeTruthy();
  });

  it('shows All clear when conditions is an empty array', () => {
    const { getByText } = render(
      <FacialMesh acneScore={60} sunDamageScore={20} skinAgeScore={20} conditions={[]} />
    );
    expect(getByText('All clear')).toBeTruthy();
  });

  it('shows All clear when conditions is undefined', () => {
    const { getByText } = render(
      <FacialMesh acneScore={20} sunDamageScore={60} skinAgeScore={20} conditions={undefined} />
    );
    expect(getByText('All clear')).toBeTruthy();
  });

  // --- Condition-driven rendering tests ---

  it('uses condition data when conditions prop is provided', () => {
    const conditions: DetectedCondition[] = [
      {
        name: 'rosacea',
        severity: 'moderate',
        zones: [{ region: 'right_cheek', severity: 'moderate' }],
        description: 'Moderate rosacea detected on right cheek',
      },
      {
        name: 'dark_circles',
        severity: 'mild',
        zones: [{ region: 'under_eye', severity: 'mild' }],
        description: 'Mild dark circles under eyes',
      },
    ];

    const { getByText } = render(
      <FacialMesh acneScore={80} sunDamageScore={80} skinAgeScore={80} conditions={conditions} />
    );

    expect(getByText('Rosacea')).toBeTruthy();
    expect(getByText('Dark circles')).toBeTruthy();
  });

  it('shows severity badges for condition-driven zones', () => {
    const conditions: DetectedCondition[] = [
      {
        name: 'acne',
        severity: 'severe',
        zones: [
          { region: 'left_cheek', severity: 'severe' },
          { region: 'chin', severity: 'moderate' },
        ],
        description: 'Severe acne on left cheek, moderate on chin',
      },
    ];

    const { getAllByText } = render(
      <FacialMesh acneScore={20} sunDamageScore={20} skinAgeScore={20} conditions={conditions} />
    );

    expect(getAllByText('elevated').length).toBe(1);
    expect(getAllByText('moderate').length).toBe(1);
  });

  it('shows All clear when conditions have no zones', () => {
    const conditions: DetectedCondition[] = [
      {
        name: 'acne',
        severity: 'mild',
        zones: [],
        description: 'Minimal acne, no specific zones',
      },
    ];

    const { getByText } = render(
      <FacialMesh acneScore={20} sunDamageScore={20} skinAgeScore={20} conditions={conditions} />
    );

    expect(getByText('All clear')).toBeTruthy();
  });

  it('shows lesion count in legend when lesions are present', () => {
    const lesions = [
      { class: 'papule' as const, confidence: 0.8, bbox: [0.3, 0.4, 0.05, 0.05] as [number, number, number, number], zone: 'left_cheek' as const, tier: 'confirmed' as const },
      { class: 'comedone' as const, confidence: 0.6, bbox: [0.5, 0.3, 0.04, 0.04] as [number, number, number, number], zone: 'nose' as const, tier: 'possible' as const },
    ];

    const { getByText } = render(
      <FacialMesh acneScore={50} sunDamageScore={20} skinAgeScore={20} lesions={lesions} />
    );

    expect(getByText('2 lesions detected')).toBeTruthy();
    expect(getByText('1 confirmed')).toBeTruthy();
  });
});
