// POST /api/onboarding-chat
//   body: { key: string, input: string }
//   → { value: number | string | string[] | null, region?: string | null }
//
// 온보딩 자유 텍스트 답변을 구조화(추출). 추출은 전역 모델과 무관히 Sonnet 고정
// (안정적 구조화 — 사용자 모델 선택 영향 없음).
// 건너뛰기 판정은 클라에서 먼저 하므로 여기선 skip 없음.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { chat } from "@/lib/ai";

// 추출 고정 모델(opus 차단). 클라가 보내는 model 슬러그는 무시한다.
const PARSE_MODEL = "claude-sonnet-4-6";

const INTEREST_OPTIONS = ["영화", "드라마/예능", "음악", "게임", "스포츠", "시사/뉴스", "기술/IT"];

function buildPrompt(key: string, input: string): string {
  const escaped = input.replace(/"/g, '\\"').slice(0, 300);
  switch (key) {
    case "birthYear":
      return `사용자 답변에서 출생연도(숫자)와 주요 고향(짧게, 없으면 null)을 추출하세요.
답변: "${escaped}"
JSON만 반환: {"value": <숫자|null>, "region": <문자열|null>}`;

    case "interests":
      return `다음 7개 중 사용자가 언급한 것을 모두 추출하세요(없으면 []): ${INTEREST_OPTIONS.join(", ")}
답변: "${escaped}"
JSON만 반환: {"value": [<string>,...]}`;

    case "residences":
      return `사용자 답변에서 살았던 지명을 모두 추출하고, 가장 주요한 곳을 region(짧게, 없으면 null)으로 분리하세요.
답변: "${escaped}"
JSON만 반환: {"value": [<string>,...], "region": <string|null>}`;

    case "schools":
      return `사용자 답변에서 학교명을 모두 추출하세요.
답변: "${escaped}"
JSON만 반환: {"value": [<string>,...]}`;

    case "favMovies":
      return `사용자 답변에서 영화 제목을 모두 추출하세요.
답변: "${escaped}"
JSON만 반환: {"value": [<string>,...]}`;

    case "favGames":
      return `사용자 답변에서 게임 이름을 모두 추출하세요.
답변: "${escaped}"
JSON만 반환: {"value": [<string>,...]}`;

    case "favMusic":
      return `사용자 답변에서 노래 제목이나 가수 이름을 모두 추출하세요.
답변: "${escaped}"
JSON만 반환: {"value": [<string>,...]}`;

    default:
      // siblings, parentsInfo, closeFriends, hobbies — 자연스럽게 한 줄 정리
      return `사용자 답변을 자연스럽게 한 문장으로 정리하세요. 내용 없으면 null.
답변: "${escaped}"
JSON만 반환: {"value": <string|null>}`;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let key: string, input: string;
  try {
    const body = (await req.json()) as { key?: unknown; input?: unknown };
    if (typeof body.key !== "string" || typeof body.input !== "string") {
      return NextResponse.json({ value: null });
    }
    key = body.key;
    input = body.input.trim().slice(0, 500);
  } catch {
    return NextResponse.json({ value: null });
  }

  if (!input) return NextResponse.json({ value: null });

  try {
    const prompt = buildPrompt(key, input);
    const result = await chat([{ role: "user", content: prompt }], {
      model: PARSE_MODEL,
      maxTokens: 200,
      temperature: 0,
    });

    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ value: null });

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("[onboarding-chat] parse error", e instanceof Error ? e.message : e);
    return NextResponse.json({ value: null });
  }
}
