/**
 * RAG pipeline tests — rag.js (embedText, seedGuidelines, queryGuidelines)
 *
 * The RAG module uses OpenAI embeddings to vectorize dermatology guideline
 * chunks and stores/queries them in Pinecone. These tests mock both the
 * OpenAI embeddings API and the Pinecone client so nothing hits the network.
 */

process.env.NODE_ENV = 'development';

// ---- Module mocks ----

const mockEmbeddingsCreate = jest.fn();
const mockUpsert = jest.fn();
const mockQuery = jest.fn();

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    embeddings: {
      create: mockEmbeddingsCreate,
    },
  }));
});

const mockIndex = {
  upsert: mockUpsert,
  query: mockQuery,
};

jest.mock('@pinecone-database/pinecone', () => ({
  Pinecone: jest.fn().mockImplementation(() => ({
    index: jest.fn().mockReturnValue(mockIndex),
  })),
}));

// ---- Tests ----

describe('rag.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the cached pineconeIndex between tests by re-requiring
    jest.resetModules();
  });

  describe('embedText()', () => {
    test('calls OpenAI with text-embedding-3-small and returns the vector', async () => {
      // Re-mock after resetModules
      jest.mock('openai', () => {
        return jest.fn().mockImplementation(() => ({
          embeddings: {
            create: mockEmbeddingsCreate,
          },
        }));
      });
      jest.mock('@pinecone-database/pinecone', () => ({
        Pinecone: jest.fn().mockImplementation(() => ({
          index: jest.fn().mockReturnValue(mockIndex),
        })),
      }));

      const fakeVector = new Array(1536).fill(0.01);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: fakeVector }],
      });

      const { embedText } = require('../rag');
      const result = await embedText('test dermatology query');

      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'test dermatology query',
      });
      expect(result).toEqual(fakeVector);
      expect(result).toHaveLength(1536);
    });
  });

  describe('seedGuidelines()', () => {
    test('generates embeddings for all 18 chunks and upserts to Pinecone', async () => {
      process.env.PINECONE_API_KEY = 'test-key';

      jest.mock('openai', () => {
        return jest.fn().mockImplementation(() => ({
          embeddings: {
            create: mockEmbeddingsCreate,
          },
        }));
      });
      jest.mock('@pinecone-database/pinecone', () => ({
        Pinecone: jest.fn().mockImplementation(() => ({
          index: jest.fn().mockReturnValue(mockIndex),
        })),
      }));

      const fakeVector = new Array(1536).fill(0.02);
      // embedText is called once per chunk -- 18 times total
      mockEmbeddingsCreate.mockResolvedValue({
        data: [{ embedding: fakeVector }],
      });
      mockUpsert.mockResolvedValue({});

      const { seedGuidelines, GUIDELINE_CHUNKS } = require('../rag');
      const result = await seedGuidelines();

      expect(result.seeded).toBe(GUIDELINE_CHUNKS.length);
      expect(GUIDELINE_CHUNKS.length).toBeGreaterThanOrEqual(18);
      // embedText called once per chunk
      expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(GUIDELINE_CHUNKS.length);
      // upsert called once with { records: [...] }
      expect(mockUpsert).toHaveBeenCalledTimes(1);
      const upsertArg = mockUpsert.mock.calls[0][0];
      expect(upsertArg).toHaveProperty('records');
      expect(upsertArg.records).toHaveLength(GUIDELINE_CHUNKS.length);
      // Each vector should have id, values, metadata
      expect(upsertArg.records[0]).toHaveProperty('id');
      expect(upsertArg.records[0]).toHaveProperty('values');
      expect(upsertArg.records[0]).toHaveProperty('metadata');
      expect(upsertArg.records[0].metadata).toHaveProperty('text');
      expect(upsertArg.records[0].metadata).toHaveProperty('category');

      delete process.env.PINECONE_API_KEY;
    });
  });

  describe('queryGuidelines()', () => {
    test('embeds the query, calls Pinecone query, and maps results', async () => {
      process.env.PINECONE_API_KEY = 'test-key';

      jest.mock('openai', () => {
        return jest.fn().mockImplementation(() => ({
          embeddings: {
            create: mockEmbeddingsCreate,
          },
        }));
      });
      jest.mock('@pinecone-database/pinecone', () => ({
        Pinecone: jest.fn().mockImplementation(() => ({
          index: jest.fn().mockReturnValue(mockIndex),
        })),
      }));

      const fakeVector = new Array(1536).fill(0.03);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: fakeVector }],
      });
      mockQuery.mockResolvedValueOnce({
        matches: [
          {
            id: 'aad-acne-mgmt-01',
            score: 0.95,
            metadata: { text: 'Acne management guideline text', category: 'acne_management' },
          },
          {
            id: 'aad-sun-protection-01',
            score: 0.85,
            metadata: { text: 'Sun protection guideline text', category: 'sun_protection' },
          },
        ],
      });

      const { queryGuidelines } = require('../rag');
      const results = await queryGuidelines('how to treat acne', 5);

      // Verify embedding was created for the query
      expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'how to treat acne',
      });

      // Verify Pinecone was queried with correct params
      expect(mockQuery).toHaveBeenCalledWith({
        vector: fakeVector,
        topK: 5,
        includeMetadata: true,
      });

      // Verify result mapping
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'aad-acne-mgmt-01',
        score: 0.95,
        text: 'Acne management guideline text',
        category: 'acne_management',
        signal: 'general',
        evidence_level: 'C',
        source_citation: '',
      });

      delete process.env.PINECONE_API_KEY;
    });

    test('uses default topK of 3', async () => {
      process.env.PINECONE_API_KEY = 'test-key';

      jest.mock('openai', () => {
        return jest.fn().mockImplementation(() => ({
          embeddings: {
            create: mockEmbeddingsCreate,
          },
        }));
      });
      jest.mock('@pinecone-database/pinecone', () => ({
        Pinecone: jest.fn().mockImplementation(() => ({
          index: jest.fn().mockReturnValue(mockIndex),
        })),
      }));

      const fakeVector = new Array(1536).fill(0.04);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: fakeVector }],
      });
      mockQuery.mockResolvedValueOnce({ matches: [] });

      const { queryGuidelines } = require('../rag');
      await queryGuidelines('sunscreen recommendations');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({ topK: 3 })
      );

      delete process.env.PINECONE_API_KEY;
    });
  });

  describe('getPineconeIndex()', () => {
    test('throws if PINECONE_API_KEY is missing', async () => {
      delete process.env.PINECONE_API_KEY;

      jest.mock('openai', () => {
        return jest.fn().mockImplementation(() => ({
          embeddings: {
            create: mockEmbeddingsCreate,
          },
        }));
      });
      jest.mock('@pinecone-database/pinecone', () => ({
        Pinecone: jest.fn().mockImplementation(() => ({
          index: jest.fn().mockReturnValue(mockIndex),
        })),
      }));

      const fakeVector = new Array(1536).fill(0.05);
      mockEmbeddingsCreate.mockResolvedValueOnce({
        data: [{ embedding: fakeVector }],
      });

      const { queryGuidelines } = require('../rag');

      await expect(queryGuidelines('test')).rejects.toThrow('PINECONE_API_KEY not configured');
    });
  });
});
