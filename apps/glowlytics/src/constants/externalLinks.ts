export const PRIVACY_POLICY_URL = 'https://glowlytics.ai/privacy';
export const TERMS_OF_USE_URL = 'https://glowlytics.ai/terms';
export const APPLE_STANDARD_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

interface SourceMatcher {
  label: string;
  url: string;
  patterns: RegExp[];
}

export const MEDICAL_SOURCE_MATCHERS: SourceMatcher[] = [
  {
    label: 'American Academy of Dermatology',
    url: 'https://www.aad.org/public/diseases/acne/derm-treat/treat',
    patterns: [/AAD/i, /JAAD/i, /acne guidelines/i, /teledermatology/i, /NMSC/i, /melasma/i],
  },
  {
    label: 'AAD Sunscreen Guidance',
    url: 'https://www.aad.org/public/skin-hair-nails/skin-care/sunscreen/choosing-the-right-sunscreen',
    patterns: [/sunscreen/i, /sun protection/i, /SPF/i, /photoaging/i, /UV/i],
  },
  {
    label: 'American College of Obstetricians and Gynecologists',
    url: 'https://www.acog.org/womens-health/infographics/the-menstrual-cycle',
    patterns: [/ACOG/i, /menstrual cycle/i, /cycle/i],
  },
  {
    label: 'ACOG Skin Guidance During Pregnancy',
    url: 'https://www.acog.org/womens-health/faqs/skin-conditions-during-pregnancy',
    patterns: [/pregnan/i, /retinoid/i],
  },
  {
    label: 'World Health Organization UV Index Guidance',
    url: 'https://www.who.int/news-room/questions-and-answers/item/radiation-the-ultraviolet-%28uv%29-index',
    patterns: [/WHO/i, /UV index/i],
  },
];

export const resolveMedicalSourceUrl = (sourceCitation?: string | null): string | null => {
  if (!sourceCitation) return null;
  const match = MEDICAL_SOURCE_MATCHERS.find(({ patterns }) =>
    patterns.some((pattern) => pattern.test(sourceCitation)),
  );
  return match?.url ?? null;
};

export const resolveMedicalSourceLabel = (sourceCitation?: string | null): string => {
  if (!sourceCitation || sourceCitation.trim().length === 0) {
    return 'Clinical source';
  }
  return sourceCitation.trim();
};
