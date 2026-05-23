// Voyage AI embeddings wrapper.
//
// Model: voyage-3.5 (multilingual, retrieval-optimized, 1024-dim).
// Phase 6 uses this both for indexing trigger events ("document") and for
// the per-user query vector ("query") — keep the input_type aligned with
// the call site so cosine similarity stays meaningful.

const VOYAGE_ENDPOINT = "https://api.voyageai.com/v1/embeddings";

export const EMBEDDING_MODEL = "voyage-3.5";
export const EMBEDDING_DIM = 1024;

export type EmbeddingInputType = "document" | "query";

type VoyageResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { total_tokens: number };
};

function getApiKey(): string {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new Error("VOYAGE_API_KEY is not set");
  }
  return key;
}

export async function embedTexts(
  texts: string[],
  inputType: EmbeddingInputType,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const res = await fetch(VOYAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      input: texts,
      model: EMBEDDING_MODEL,
      input_type: inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as VoyageResponse;
  // Voyage may return data out of order; sort by index to be safe.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedOne(
  text: string,
  inputType: EmbeddingInputType,
): Promise<number[]> {
  const [vec] = await embedTexts([text], inputType);
  return vec;
}
