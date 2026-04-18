const mockQueryGuidelines = jest.fn();
jest.mock('../../rag', () => ({
  queryGuidelines: mockQueryGuidelines,
  embedText: jest.fn(),
}));

beforeEach(() => mockQueryGuidelines.mockReset());

const { lookupIngredient, searchIngredients } = require('../../queries/ingredients');

describe('lookupIngredient', () => {
  it('returns canonical entry with chunkId on every evidence item (Q3)', async () => {
    mockQueryGuidelines.mockResolvedValueOnce([
      {
        id: 'chunk_42',
        score: 0.91,
        text: 'Niacinamide reduces sebum production and improves barrier function.',
        source_citation: 'NIH 2023',
      },
      {
        id: 'chunk_88',
        score: 0.85,
        text: 'Niacinamide pairs well with retinol when introduced gradually.',
        source_citation: 'Dermatology 2024',
      },
    ]);

    const r = await lookupIngredient('niacinamide');
    expect(r.name).toBe('Niacinamide');
    expect(r.aliases).toEqual(expect.arrayContaining(['niacinamide']));
    expect(r.function).toEqual(expect.any(String));
    expect(r.evidence).toHaveLength(2);
    for (const e of r.evidence) {
      expect(e).toHaveProperty('chunkId');
      expect(e).toHaveProperty('source');
      expect(e).toHaveProperty('snippet');
    }
    expect(r.evidence[0].chunkId).toBe('chunk_42');
    expect(r.evidence[0].source).toBe('NIH 2023');
  });

  it('falls back to free-text search for unknown ingredients but still returns chunkId', async () => {
    mockQueryGuidelines.mockResolvedValueOnce([
      { id: 'chunk_99', text: 'Centella asiatica supports skin barrier repair.', source_citation: 'PubMed 2022' },
    ]);
    const r = await lookupIngredient('centella asiatica');
    expect(r.name).toBe('centella asiatica');
    expect(r.evidence[0].chunkId).toBe('chunk_99');
  });

  it('returns empty evidence array (not undefined) when no Pinecone matches', async () => {
    mockQueryGuidelines.mockResolvedValueOnce([]);
    const r = await lookupIngredient('niacinamide');
    expect(r.evidence).toEqual([]);
  });

  it('throws on empty input', async () => {
    await expect(lookupIngredient('')).rejects.toThrow();
    await expect(lookupIngredient(null)).rejects.toThrow();
  });
});

describe('searchIngredients', () => {
  it('clamps limit to 25', async () => {
    mockQueryGuidelines.mockResolvedValueOnce([]);
    await searchIngredients('vitamin', { limit: 100 });
    const [, topK] = mockQueryGuidelines.mock.calls[0];
    expect(topK).toBeLessThanOrEqual(25);
  });

  it('uses default limit of 10 when not provided', async () => {
    mockQueryGuidelines.mockResolvedValueOnce([]);
    await searchIngredients('vitamin');
    const [, topK] = mockQueryGuidelines.mock.calls[0];
    expect(topK).toBe(10);
  });

  it('returns one result per Pinecone match with chunkId citation (Q3)', async () => {
    mockQueryGuidelines.mockResolvedValueOnce([
      { id: 'c1', text: 'Vitamin C is a potent antioxidant for brightening.', source_citation: 'JAMA 2021' },
      { id: 'c2', text: 'L-ascorbic acid penetrates the stratum corneum.', source_citation: 'NIH 2020' },
    ]);
    const results = await searchIngredients('vitamin c');
    expect(results).toHaveLength(2);
    expect(results[0].citations[0].chunkId).toBe('c1');
    expect(results[1].citations[0].chunkId).toBe('c2');
    expect(results[0]).toHaveProperty('name');
    expect(results[0]).toHaveProperty('summary');
  });

  it('throws on empty query', async () => {
    await expect(searchIngredients('')).rejects.toThrow();
  });
});
