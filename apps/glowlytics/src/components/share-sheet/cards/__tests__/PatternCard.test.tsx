// PatternCard fit: long quotes must shrink (adjustsFontSizeToFit) and clamp to
// a bounded line count per aspect instead of overflowing the CardShell box.
import React from 'react';
import { render } from '@testing-library/react-native';

import { PatternCard } from '../PatternCard';

const day = { m: 'jul', d: 4 } as never;

describe('PatternCard', () => {
  it('clamps the quote and shrinks the font instead of cropping', () => {
    const { getByText } = render(
      <PatternCard
        day={day}
        aspect="story"
        headline="A very long detected pattern about your skin slowly finding its rhythm over several weeks"
        body="Supporting detail."
      />,
    );
    const quote = getByText(/A very long detected pattern/);
    expect(quote).toHaveProp('numberOfLines', 4);
    expect(quote).toHaveProp('adjustsFontSizeToFit', true);
  });

  it('reduces quote size and line count for the shorter tweet aspect', () => {
    const story = render(<PatternCard day={day} aspect="story" headline="Rhythm" body="x" />);
    const tweet = render(<PatternCard day={day} aspect="tweet" headline="Rhythm" body="x" />);

    expect(story.getByText(/Rhythm/)).toHaveStyle({ fontSize: 32 });
    expect(tweet.getByText(/Rhythm/)).toHaveStyle({ fontSize: 18 });
    expect(tweet.getByText(/Rhythm/)).toHaveProp('numberOfLines', 3);
  });
});
