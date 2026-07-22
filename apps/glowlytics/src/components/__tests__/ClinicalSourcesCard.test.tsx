import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ClinicalSourcesCard } from '../ClinicalSourcesCard';
import type { RagRecommendation } from '../../types';

jest.mock('@expo/vector-icons', () => ({ Feather: () => null }));

const recs: RagRecommendation[] = [
  { text: 'Use a broad-spectrum SPF 30+ every morning.', category: 'prevention', relevance: 0.9, evidence_level: 'A', source_citation: 'AAD sunscreen guidance' },
  { text: 'Introduce an adapalene retinoid at night.', category: 'treatment', relevance: 0.8, evidence_level: 'B', source_citation: 'AAD acne guidelines' },
  { text: 'Track flares against your cycle phase.', category: 'context', relevance: 0.6, evidence_level: 'C', source_citation: 'ACOG menstrual cycle' },
];

// Real/demo/on-device recs frequently omit source_citation; the source must
// still be inferable from the recommendation's own content.
const noCitationRecs: RagRecommendation[] = [
  { text: 'Apply broad-spectrum SPF 30+ every morning', category: 'prevention', relevance: 0.9 },
];

describe('ClinicalSourcesCard', () => {
  it('(a) is collapsed by default: shows the summary chip, hides source detail', () => {
    const { getByText, queryByText } = render(<ClinicalSourcesCard recommendations={recs} />);
    expect(getByText('Sources (3)')).toBeTruthy();
    expect(queryByText('AAD sunscreen guidance')).toBeNull();
    expect(queryByText('AAD acne guidelines')).toBeNull();
    expect(queryByText('Open source')).toBeNull();
  });

  it('(b) expands on press to reveal the source labels + open links', () => {
    const { getByText, queryAllByText } = render(<ClinicalSourcesCard recommendations={recs} />);
    fireEvent.press(getByText('Sources (3)'));
    expect(getByText('AAD sunscreen guidance')).toBeTruthy();
    expect(getByText('AAD acne guidelines')).toBeTruthy();
    expect(queryAllByText('Open source').length).toBeGreaterThan(0);
  });

  it('(c) shows only the cited sources, never the generic default trio', () => {
    const { getByText, queryByText } = render(<ClinicalSourcesCard recommendations={recs} />);
    fireEvent.press(getByText('Sources (3)'));
    expect(getByText('ACOG menstrual cycle')).toBeTruthy();
    // Old hardcoded DEFAULT_SOURCES trio must be gone:
    expect(queryByText('American Academy of Dermatology')).toBeNull();
    expect(queryByText('American College of Obstetricians and Gynecologists')).toBeNull();
    expect(queryByText('World Health Organization \u2014 UV Index')).toBeNull();
  });

  it('(d) with no recommendations, renders a single minimal row and nothing to expand', () => {
    const { getByText, queryByText } = render(<ClinicalSourcesCard />);
    expect(getByText('Standard clinical references')).toBeTruthy();
    expect(queryByText(/^Sources \(/)).toBeNull();
    expect(queryByText('Open source')).toBeNull();
  });

  it('(e) collapses again on a second press (toggle)', () => {
    const { getByText, queryByText } = render(<ClinicalSourcesCard recommendations={recs} />);
    fireEvent.press(getByText('Sources (3)'));
    expect(getByText('AAD acne guidelines')).toBeTruthy();
    fireEvent.press(getByText('Sources (3)'));
    expect(queryByText('AAD acne guidelines')).toBeNull();
  });

  it('(f) resolves a source from recommendation text when source_citation is missing', () => {
    const { getByText, queryByText } = render(<ClinicalSourcesCard recommendations={noCitationRecs} />);
    // Must NOT collapse to the generic empty line...
    expect(queryByText('Standard clinical references')).toBeNull();
    // ...it surfaces a real, advice-specific source on expand.
    fireEvent.press(getByText('Sources (1)'));
    expect(getByText('AAD Sunscreen Guidance')).toBeTruthy();
  });
});
