jest.mock('../../store/useStore', () => ({
  useStore: jest.fn(),
}));

import React from 'react';
import { render } from '@testing-library/react-native';
import { DomainHistoryStrip } from '../DomainHistoryStrip';
import { useStore } from '../../store/useStore';

const useStoreMock = useStore as jest.MockedFunction<typeof useStore>;

function mockOutputsWithDomainScores(perScan: Array<Record<string, number | undefined>>) {
  const outputs = perScan.map((domain_scores, i) => ({
    daily_id: `d${i}`,
    bone_structure: { harmony: 70, domain_scores },
  }));
  useStoreMock.mockImplementation((selector: (state: any) => any) =>
    selector({ modelOutputs: outputs }),
  );
}

beforeEach(() => useStoreMock.mockReset());

describe('DomainHistoryStrip', () => {
  it('returns null when no scans have ≥2 domain history points', () => {
    mockOutputsWithDomainScores([
      { symmetry: 70, periorbital: 80 }, // single scan only
    ]);
    const { toJSON } = render(<DomainHistoryStrip />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when the store has no model outputs at all', () => {
    useStoreMock.mockImplementation((selector: (state: any) => any) =>
      selector({ modelOutputs: [] }),
    );
    const { toJSON } = render(<DomainHistoryStrip />);
    expect(toJSON()).toBeNull();
  });

  it('renders each domain label as a regular Text node when ≥2 scans exist', () => {
    mockOutputsWithDomainScores([
      { symmetry: 70, periorbital: 80, mandibular: 65, midface: 70, nose: 60, brow: 70 },
      { symmetry: 75, periorbital: 82, mandibular: 70, midface: 72, nose: 65, brow: 72 },
    ]);
    const { getByText } = render(<DomainHistoryStrip />);
    expect(getByText('Symmetry')).toBeTruthy();
    expect(getByText('Eye region')).toBeTruthy();
    expect(getByText('Jawline')).toBeTruthy();
    expect(getByText('Midface')).toBeTruthy();
    expect(getByText('Nose')).toBeTruthy();
    expect(getByText('Brow')).toBeTruthy();
  });

  it('renders the latest value next to each row', () => {
    mockOutputsWithDomainScores([
      { symmetry: 60, periorbital: 70, mandibular: 60, midface: 60, nose: 55, brow: 60 },
      { symmetry: 80, periorbital: 85, mandibular: 72, midface: 75, nose: 70, brow: 78 },
    ]);
    const { getByText } = render(<DomainHistoryStrip />);
    expect(getByText('80')).toBeTruthy(); // symmetry
    expect(getByText('85')).toBeTruthy(); // periorbital
    expect(getByText('72')).toBeTruthy(); // mandibular
  });

  it('shows positive delta when scores went up', () => {
    // Picked numbers so each delta is unique — avoids getByText matching
    // multiple identical chips.
    mockOutputsWithDomainScores([
      { symmetry: 60, periorbital: 70, mandibular: 50, midface: 55, nose: 40, brow: 65 },
      { symmetry: 80, periorbital: 95, mandibular: 62, midface: 73, nose: 56, brow: 84 },
    ]);
    const { getByText } = render(<DomainHistoryStrip />);
    expect(getByText('+20')).toBeTruthy(); // symmetry  (60→80)
    expect(getByText('+25')).toBeTruthy(); // periorbital (70→95)
    expect(getByText('+12')).toBeTruthy(); // mandibular (50→62)
    expect(getByText('+18')).toBeTruthy(); // midface (55→73)
    expect(getByText('+16')).toBeTruthy(); // nose (40→56)
    expect(getByText('+19')).toBeTruthy(); // brow (65→84)
  });

  it('handles partial domain data without crashing', () => {
    mockOutputsWithDomainScores([
      { symmetry: 70, periorbital: 80 }, // missing 4 domains
      { symmetry: 75, periorbital: 82, mandibular: 70 },
    ]);
    const { UNSAFE_root } = render(<DomainHistoryStrip />);
    expect(UNSAFE_root).toBeTruthy();
  });
});
