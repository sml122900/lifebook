// S1 — 프라이버시 리댁션 전처리.
//
// 어르신이 "쓰지 마라/빼줘" 처럼 기록을 명시적으로 거부한 구간을, 추출 LLM
// (split/extract)이 *아예 보지 못하게* 전처리에서 결정적으로 제거한다.
// 프롬프트 차단은 확률적이라(실측: 3런 중 1런 누출) 개인정보엔 불충분.
//
// 설계 원칙:
//   - 트리거 감지 = 키워드 코드 매칭(결정적, 100% 재현). LLM 판단 의존 X.
//   - 제거 윈도우 = 트리거 문장 기준 고정(앞 PRECEDING, 뒤 FOLLOWING). 거부
//     대상은 보통 트리거 직전(가끔 직후)에 나오므로 좁은 양방향 윈도우.
//   - 과삭제는 절제: 멀리 있는 정상 내용은 살린다(뒤에 draft 검토·주문 전
//     확인·연혁 삭제의 다층 방어가 더 있음). "좋은 내용 살리기" 우선.
//   - ★ 리댁션은 *추출 입력* 에만. 원본 transcript·audio 는 별도로 보존한다
//     (호출자가 원본을 따로 저장 — 이 함수는 추출용 사본만 가공).
//
// 마스킹 토큰으로 치환 → LLM 은 "여기 뭔가 빠졌다"만 알고 내용은 모른다.

// 기록 거부 트리거. "빼고"(일상어: "옆에서 빼고")는 의도적으로 제외 —
// 오탐 방지. "빼"는 줘/라/주 가 붙을 때만(빼줘/빼라/빼주세요).
const TRIGGER_RE =
  /쓰지\s*마|쓰지\s*말|적지\s*마|적지\s*말|넣지\s*마|넣지\s*말|기록하지\s*마|기록하지\s*말|말하지\s*마|남기지\s*마|빼\s*(줘|라|주)|이건\s*비밀|그건\s*비밀|비밀이(야|니|라|에요|예요)/;

const PRECEDING = 4; // 트리거 직전 문장 수 (거부 대상이 보통 여기 있음)
const FOLLOWING = 2; // 트리거 직후 문장 수 ("쓰지마라 X" 처럼 뒤에 올 때 대비)
const MASK = "[기록 제외 요청 구간]";

// 텍스트를 문장 단위로 쪼갠다. 줄바꿈 + 문장부호(. ? !) 기준. STT 전사는
// 문장부호가 드물 수 있어 줄바꿈도 경계로 쓴다. 빈 조각은 버린다.
function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export type RedactionResult = {
  redacted: string;
  redactionCount: number; // 마스킹된 구간(연속 묶음) 수
  removedSentences: number; // 제거된 문장 수(과삭제 점검용)
};

export function redactTranscript(text: string): RedactionResult {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return { redacted: text, redactionCount: 0, removedSentences: 0 };
  }

  const remove = new Array<boolean>(sentences.length).fill(false);
  for (let i = 0; i < sentences.length; i++) {
    if (TRIGGER_RE.test(sentences[i])) {
      const from = Math.max(0, i - PRECEDING);
      const to = Math.min(sentences.length - 1, i + FOLLOWING);
      for (let j = from; j <= to; j++) remove[j] = true;
    }
  }

  const removedSentences = remove.filter(Boolean).length;
  if (removedSentences === 0) {
    return { redacted: text, redactionCount: 0, removedSentences: 0 };
  }

  // 재조립 — 연속 제거 구간은 마스크 하나로 합친다.
  const out: string[] = [];
  let redactionCount = 0;
  let inRedaction = false;
  for (let i = 0; i < sentences.length; i++) {
    if (remove[i]) {
      if (!inRedaction) {
        out.push(MASK);
        redactionCount++;
        inRedaction = true;
      }
    } else {
      out.push(sentences[i]);
      inRedaction = false;
    }
  }

  return { redacted: out.join("\n"), redactionCount, removedSentences };
}
