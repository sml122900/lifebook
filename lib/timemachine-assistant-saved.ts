// Phase V3 — 비서 답변 저장/조회/삭제.
//
// 저장 모델: UserMemory 행 한 줄.
//   - createdVia = "timemachine_assistant"
//   - monthEventId = null (사건 직접 연결 X — 답 자체를 보관)
//   - title       = 사용자 질문 (≤ 200자 cut)
//   - content     = AnswerSnapshot 의 JSON 직렬화 — 텍스트·출처·곡 카드
//     까지 그대로 보존해 토큰 0 으로 재렌더.
//   - year/month  = 해당 달
//
// T6 와의 분리:
//   - saveTimemachineMonth 의 deleteMany 필터는 ["timemachine_event",
//     "timemachine_month"] 만 → 비서 저장 행은 절대 안 지워짐.
//   - loadTimemachineMonth 의 findMany 필터도 같은 두 종만 읽음 → 비서
//     행은 keptEvents/monthStory 에 끼지 않음.
// Phase 7 와의 분리:
//   - "ai_chat" / "manual" 행과 createdVia 가 달라 서로 영향 없음.
//
// 가족 룸 공유: lib/rooms.ts 의 listRoomMemories 는 createdVia 와 무관하게
// UserMemory 를 읽으므로 비서 저장 답도 자동으로 가족에게 노출된다.
// 본 답 자체에 개인 식별정보가 들어가지 않으므로(공적 사실 요약) 위험 낮음.

import { prisma } from "./db";

const CREATED_VIA_ASSISTANT = "timemachine_assistant";

const MAX_QUESTION_CHARS = 200;
// content JSON 길이 cap — DB 컬럼은 text 라 사실상 제한 없지만, 비정상
// 큰 페이로드 차단. 보통 검색 답 + 출처 6건이 1KB 안.
const MAX_CONTENT_CHARS = 16_000;

export type AnswerSnapshot = {
  text: string;
  source: "db" | "web" | "context";
  category: "MUSIC" | "BIG" | "TASTE";
  citations: { url: string; title: string }[];
  songs: {
    rank: number | null;
    title: string;
    artist: string;
    eraColor: string | null;
  }[];
  // events 는 title/description/section 만 비정규화 저장. id 는 시드 재
  // 실행 등으로 사라질 수 있어 의미 없음. UI 는 "내 타임라인에 추가"
  // 버튼을 저장된 답에서는 노출하지 않는다 (이미 결정된 답이라 추가는
  // 채팅 모드에서만 가능 — 단순성).
  events: { title: string; description: string; section: string }[];
  // V4 — 어떤 깊이로 답했는지. 옛 저장 호환을 위해 optional.
  depth?: "simple" | "detailed" | "precise";
};

export type SavedAnswer = {
  id: string;
  question: string;
  createdAt: Date;
  answer: AnswerSnapshot;
};

export async function saveAssistantAnswer(
  userId: string,
  year: number,
  month: number,
  question: string,
  answer: AnswerSnapshot,
): Promise<string> {
  if (!Number.isInteger(year) || year < 1900) {
    throw new Error("invalid year");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("invalid month");
  }
  const q = question.trim();
  if (q === "") {
    throw new Error("question required");
  }

  const titleCut = q.length > MAX_QUESTION_CHARS
    ? q.slice(0, MAX_QUESTION_CHARS)
    : q;

  const json = JSON.stringify(answer);
  if (json.length > MAX_CONTENT_CHARS) {
    throw new Error("answer too large");
  }

  const row = await prisma.userMemory.create({
    data: {
      userId,
      year,
      month,
      title: titleCut,
      content: json,
      createdVia: CREATED_VIA_ASSISTANT,
    },
    select: { id: true },
  });
  return row.id;
}

export async function listAssistantAnswers(
  userId: string,
  year: number,
  month: number,
): Promise<SavedAnswer[]> {
  const rows = await prisma.userMemory.findMany({
    where: {
      userId,
      year,
      month,
      createdVia: CREATED_VIA_ASSISTANT,
    },
    select: { id: true, title: true, content: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const out: SavedAnswer[] = [];
  for (const r of rows) {
    if (r.content === null) continue;
    try {
      const answer = JSON.parse(r.content) as AnswerSnapshot;
      out.push({
        id: r.id,
        question: r.title,
        createdAt: r.createdAt,
        answer,
      });
    } catch {
      // 손상된 JSON 은 조용히 skip — 사용자 흐름 안 막음. dev 환경에서만
      // 콘솔 경고.
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[assistant-saved] bad JSON in UserMemory ${r.id}`);
      }
    }
  }
  return out;
}

export async function deleteAssistantAnswer(
  userId: string,
  id: string,
): Promise<void> {
  // userId 와 createdVia 모두 강제 — 다른 사람의 행이나 다른 종류의
  // UserMemory (keptEvent, ai_chat 등) 가 실수로 지워질 가능성 차단.
  await prisma.userMemory.deleteMany({
    where: { id, userId, createdVia: CREATED_VIA_ASSISTANT },
  });
}
