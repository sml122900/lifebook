// 기억 에이전트 연구 트랙(R1~R4) — 단계별 완료 기준 수치. [동결]
//
// 동결 규칙(phase/기억에이전트_R1-R4_기획.md): R1 첫 커밋에 확정. 이후 수정은
// 사유를 커밋 메시지에 남긴 별도 커밋으로만, 평가 결과를 보고 기준을 바꾸는
// 것은 금지. 평가기(db/lab-eval.ts)와 회귀 스크립트(db/test-lab-*.ts)가 이
// 값을 그대로 읽어 PASS/FAIL 을 판정한다.
//
// 공통 정의
//   - 골든셋 = db/lab/golden/persona-a.ts (27문항: FACT 6·PERIOD 5·PERSON 5·
//     PREFERENCE 4·NO_RECORD 3·CONFLICT 2·FALSE_PREMISE 2)
//   - 비율 지표는 repeats 회 실행의 평균, 개수 지표(required/of)는 매 회 충족.
//   - 비용은 lab 가격표(lib/lab, R1 구현) 기준 추정 원가(LabUsage.costMicroUsd).

import type { GoldenCategory } from "./golden/persona-a";

type CountGate = { required: number; of: number };
type CategoryGate = { categories: readonly GoldenCategory[]; min: number };

export const LAB_CRITERIA = {
  // R1 — L1 색인(카드·동기화·검색) + 격리.
  R1: {
    // test-lab-gate: layout notFound() 층 + 서버 액션 requireLabUser() 층 둘 다 검증.
    gateLayersVerified: 2,
    // check-lab-isolation: lib/lab·app/lab 의 금지 import(lib/commerce·lib/poster·
    // app/poster·app/shop) + 원본 모델 쓰기 메서드 호출 건수.
    isolationViolations: 0,
    // 원본 변화 없이 동기화를 다시 돌렸을 때 LLM 호출 수.
    llmCallsOnUnchangedResync: 0,
    // 저장된 LLM 카드 중 quote 가 원문의 연속 부분문자열인 비율.
    llmCardQuoteVerbatimRate: 1.0,
    // 검색 전용 모드: NO_RECORD 를 제외한 24문항, expected 그룹 기준 top-8 recall 평균.
    retrievalRecallAt8: 0.85,
    // 배포 후 migrate diff 결과가 알려진 drift 문장 "만" 남은 개수
    // (parentMemoryId FK 1 · isDraft 인덱스 2 · audioPaths 기본값 1).
    postDeployDriftStatements: 4,
  },

  // R2 — L3 에이전트(인용 필수 질의응답).
  R2: {
    repeats: 3,
    // FACT·PERIOD·PERSON·FALSE_PREMISE 18문항의 규칙 채점(mustInclude·mustNotInclude) 정답률.
    answerAccuracy: {
      categories: ["FACT", "PERIOD", "PERSON", "FALSE_PREMISE"],
      min: 0.8,
    } satisfies CategoryGate,
    // 인용 정밀도: expected ∪ alsoAcceptable 에 속한 인용 / 전체 인용.
    citationPrecisionMin: 0.9,
    // 근거 없는 주장 비율: 검증기가 버린 주장 / 전체 주장.
    unsupportedClaimRateMax: 0.05,
    // NO_RECORD 3문항 모두 "아직 들려주신 적 없는 이야기" 처리.
    noRecordHandled: { required: 3, of: 3 } satisfies CountGate,
    // expected 가 있는 24문항 중 잘못 "기록 없음"으로 답한 비율.
    falseNoRecordRateMax: 0.1,
    // CONFLICT 2문항 모두 양쪽 원본 인용.
    conflictBothCited: { required: 2, of: 2 } satisfies CountGate,
    // mustNotInclude·mustNotCite 위반 건수(민감정보·미승인 초안).
    mustNotViolations: 0,
    // 질문 1회 평균 추정 원가(Sonnet 기본).
    avgCostPerQuestionUsdMax: 0.05,
    // 하드 상한(지표 아님): 에이전트 도구 라운드.
    maxToolRounds: 6,
  },

  // R3 — L2 자기 모델(가설).
  R3: {
    // 상태 규칙 순수 함수 단위 테스트(LLM 0) 전부 통과.
    stateRuleUnitTestsAllPass: true,
    // 페르소나 A 통합 후 PROPOSED 에 도달해야 하는 가설(statement 매칭 정규식 원문).
    mustReachProposed: ["등산|산", "나훈아|트로트", "기계|손재주"],
    // 한 번뿐인 언급 — PROPOSED 가 되면 실패(CANDIDATE 유지).
    mustNotReachProposed: ["회|비린"],
    // 어떤 상태로도 생성되면 안 되는 가설(본인 건강·타인 종교).
    mustNotHypothesize: ["허리|수술|건강|교회|장로|종교"],
    // REJECTED 처리 후 통합 재실행 시 유사 재제안 건수.
    rejectedReproposals: 0,
    // PREFERENCE 4문항 규칙 채점 정답률(3/4 이상).
    preferenceAccuracy: {
      categories: ["PREFERENCE"],
      min: 0.75,
    } satisfies CategoryGate,
    // REJECTED 가설 내용을 답변에서 단정한 건수.
    rejectedAssertions: 0,
    // 새 카드 0장일 때 통합 실행의 LLM 호출 수.
    llmCallsWhenNoNewCards: 0,
    // R2 기준을 계속 충족해야 함.
    noRegressionFrom: ["R2"],
  },

  // R4 — 긴 원문 소스(companion·통녹음·chat 로그) + 중복 묶음 + 하드닝.
  // 페르소나 B 와 중복 판정 라벨 30쌍은 R4 착수 커밋에 같은 동결 규칙으로 확정.
  R4: {
    dedupLabeledPairs: 30,
    dedupPrecisionMin: 0.9,
    // 원문 1만 자당 추출 추정 원가.
    costPerTenThousandCharsUsdMax: 0.2,
    // 월 예산 초과 시 LLM·임베딩 호출이 실제로 차단되는지(테스트).
    budgetCapBlocksCalls: true,
    noRegressionFrom: ["R2", "R3"],
  },
} as const;
