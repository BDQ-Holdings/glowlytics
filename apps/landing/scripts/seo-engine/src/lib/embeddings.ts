/**
 * OpenAI text-embedding-3-small wrapper used by clustering.
 *
 * The model returns 1536-dim vectors at ~$0.02 / 1M tokens, so embedding ~5k
 * cluster heads costs roughly $0.001. Cheap insurance against synonym
 * cannibalization ("vitamin c serum" vs "ascorbic acid").
 */
import OpenAI from "openai";

const EMBED_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 96;

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: (process.env.OPENAI_API_KEY || "").replace(/\s+/g, ""),
    });
  }
  return cachedClient;
}

export async function embedTexts(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];

  const out: number[][] = new Array(inputs.length);
  const client = getClient();

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const slice = inputs.slice(i, i + BATCH_SIZE);
    const res = await client.embeddings.create({
      model: EMBED_MODEL,
      input: slice,
    });

    if (res.data.length !== slice.length) {
      throw new Error(
        `Embedding response length mismatch: requested ${slice.length}, got ${res.data.length}`
      );
    }

    res.data.forEach((entry, idx) => {
      out[i + idx] = entry.embedding;
    });
  }

  return out;
}
