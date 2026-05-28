// Voyage AI 임베딩 래퍼.
//
// 모델: voyage-3.5 (다국어, 검색 최적화, 1024차원).
// Phase 6 가 트리거 사건 색인("document")과 사용자별 질의 벡터("query")
// 둘 다에 쓴다 — 코사인 유사도가 의미를 가지려면 호출부의 input_type 을
// 용도에 맞춰야 한다.

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
  // Voyage 가 순서를 뒤섞어 줄 수 있으니 index 로 정렬해 안전하게 매핑.
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

// 단일 텍스트 임베딩 — embedTexts 의 단건 편의 래퍼.
export async function embedOne(
  text: string,
  inputType: EmbeddingInputType,
): Promise<number[]> {
  const [vec] = await embedTexts([text], inputType);
  return vec;
}
