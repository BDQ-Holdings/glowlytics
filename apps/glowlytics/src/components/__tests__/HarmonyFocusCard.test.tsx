jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../store/useStore', () => ({
  useStore: jest.fn(),
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HarmonyFocusCard } from '../HarmonyFocusCard';
import { useStore } from '../../store/useStore';

const useStoreMock = useStore as jest.MockedFunction<typeof useStore>;

function setOutputs(outputs: any[]) {
  useStoreMock.mockImplementation((selector: (s: any) => any) =>
    selector({ modelOutputs: outputs }),
  );
}

beforeEach(() => useStoreMock.mockReset());

describe('HarmonyFocusCard', () => {
  it('returns null when no scan has bone-structure data', () => {
    setOutputs([{ daily_id: 'd1', bone_structure: undefined }]);
    const { toJSON } = render(<HarmonyFocusCard />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when the latest scan has zero findings', () => {
    setOutputs([{
      daily_id: 'd1',
      bone_structure: { findings: [], interventions: { lifestyle: [], pharmacological: [], interventional: [] } },
    }]);
    const { toJSON } = render(<HarmonyFocusCard />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when the top finding has no lifestyle suggestions', () => {
    setOutputs([{
      daily_id: 'd1',
      bone_structure: {
        findings: [{ findingCode: 'canthal_tilt_negative', score: 30, severity: 'marked' }],
        interventions: { lifestyle: [], pharmacological: [], interventional: [] },
      },
    }]);
    const { toJSON } = render(<HarmonyFocusCard />);
    expect(toJSON()).toBeNull();
  });

  it('renders the finding title + the top lifestyle action when both exist', () => {
    setOutputs([{
      daily_id: 'd1',
      bone_structure: {
        findings: [{ findingCode: 'canthal_tilt_negative', score: 30, severity: 'marked' }],
        interventions: {
          lifestyle: [{
            id: 'lymphatic_massage',
            tier: 'lifestyle',
            title: 'Lymphatic facial massage',
            body: 'Gentle downward strokes from the centre of the face toward the ears and clavicle move lymph along its natural drainage paths.',
          }],
          pharmacological: [],
          interventional: [],
        },
      },
    }]);
    const { getByText } = render(<HarmonyFocusCard />);
    expect(getByText("Today's focus")).toBeTruthy();
    expect(getByText('Downward eye tilt')).toBeTruthy(); // FINDING_COPY entry for canthal_tilt_negative
    expect(getByText('Lymphatic facial massage')).toBeTruthy();
  });

  it('falls back to a previous scan if the latest has no findings', () => {
    setOutputs([
      // Older scan with usable focus
      {
        daily_id: 'd-old',
        bone_structure: {
          findings: [{ findingCode: 'gonial_angle_obtuse', score: 40, severity: 'moderate' }],
          interventions: {
            lifestyle: [{ id: 'mastic_chewing', tier: 'lifestyle', title: 'Mastic-gum / firm-food chewing', body: 'Chewing harder foods exercises the masseter.' }],
            pharmacological: [], interventional: [],
          },
        },
      },
      // Latest scan came back clean — no findings
      {
        daily_id: 'd-latest',
        bone_structure: { findings: [], interventions: { lifestyle: [], pharmacological: [], interventional: [] } },
      },
    ]);
    const { getByText } = render(<HarmonyFocusCard />);
    expect(getByText('Mastic-gum / firm-food chewing')).toBeTruthy();
  });

  it('opens the matching finding detail screen on press', () => {
    const push = jest.fn();
    (require('expo-router') as { useRouter: () => unknown }).useRouter = () => ({ push, back: jest.fn(), replace: jest.fn() });

    setOutputs([{
      daily_id: 'd1',
      bone_structure: {
        findings: [{ findingCode: 'gonial_angle_obtuse', score: 35, severity: 'moderate' }],
        interventions: {
          lifestyle: [{ id: 'mastic_chewing', tier: 'lifestyle', title: 'Mastic-gum / firm-food chewing', body: 'Body.' }],
          pharmacological: [], interventional: [],
        },
      },
    }]);
    const { getByText } = render(<HarmonyFocusCard />);
    fireEvent.press(getByText('Soft jaw angle'));
    expect(push).toHaveBeenCalledWith({
      pathname: '/architecture/[finding]',
      params: { finding: 'gonial_angle_obtuse', dailyId: 'd1' },
    });
  });
});
