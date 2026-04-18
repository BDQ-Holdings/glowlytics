const { queryGuidelines } = require('../rag');

const CANONICAL_INGREDIENTS = {
  niacinamide: {
    name: 'Niacinamide',
    aliases: ['niacinamide', 'vitamin b3', 'nicotinamide'],
    function: 'Barrier-supporting humectant; reduces sebum and improves uneven tone.',
  },
  retinoid: {
    name: 'Retinoid',
    aliases: ['retinol', 'retinal', 'tretinoin', 'retinoid', 'bakuchiol'],
    function: 'Vitamin A derivative; accelerates cell turnover and stimulates collagen.',
  },
  vitamin_c: {
    name: 'Vitamin C',
    aliases: ['vitamin c', 'ascorbic acid', 'l-ascorbic acid'],
    function: 'Antioxidant; brightens uneven tone and supports collagen synthesis.',
  },
  aha_bha: {
    name: 'AHA / BHA',
    aliases: ['glycolic acid', 'lactic acid', 'mandelic acid', 'pha', 'salicylic acid'],
    function: 'Chemical exfoliants; resurface skin and unclog pores.',
  },
  benzoyl_peroxide: {
    name: 'Benzoyl Peroxide',
    aliases: ['benzoyl peroxide'],
    function: 'Antimicrobial; targets acne-causing bacteria within the follicle.',
  },
};

function findCanonical(query) {
  const q = String(query).toLowerCase().trim();
  for (const entry of Object.values(CANONICAL_INGREDIENTS)) {
    if (entry.aliases.some((a) => q.includes(a))) return entry;
  }
  return null;
}

function evidenceFromMatch(match) {
  return {
    source: match.source_citation || null,
    snippet: match.text || null,
    chunkId: match.id,
  };
}

async function lookupIngredient(name) {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('lookupIngredient requires a non-empty name');
  }

  const canonical = findCanonical(name);
  const matches = await queryGuidelines(canonical ? canonical.aliases[0] : name, 3);

  return {
    name: canonical ? canonical.name : name.trim(),
    aliases: canonical ? canonical.aliases : [name.trim().toLowerCase()],
    function: canonical ? canonical.function : null,
    concerns: [],
    evidence: matches.map(evidenceFromMatch),
  };
}

async function searchIngredients(query, { limit = 10 } = {}) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('searchIngredients requires a non-empty query');
  }
  const topK = Math.max(1, Math.min(25, parseInt(limit, 10) || 10));
  const matches = await queryGuidelines(query.trim(), topK);

  return matches.map((m) => {
    const canonical = findCanonical(m.text || query);
    return {
      name: canonical ? canonical.name : query.trim(),
      function: canonical ? canonical.function : null,
      summary: (m.text || '').slice(0, 280),
      citations: [evidenceFromMatch(m)],
    };
  });
}

module.exports = { lookupIngredient, searchIngredients, CANONICAL_INGREDIENTS };
