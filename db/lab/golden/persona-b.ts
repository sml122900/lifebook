// 기억 에이전트 연구 트랙(R1~R4) — 페르소나 B 골든셋 27문항. [동결 — R2-5]
//
// 동결 규칙: 이 파일과 db/lab/personas/persona-b.ts 는 한 커밋에 함께 확정한다. 이후 코드·프롬프트
// 변경 금지(결정 로그 R2-5), 문항·기대값 수정은 사유를 남긴 별도 커밋으로만, 평가 결과를 보고 바꾸는
// 것은 금지. 작성 시점에 B 의 카드·검색 결과는 열람하지 않았다(원본 데이터만 보고 작성).
//
// 구성(결정 로그 R2-5 고정 조건): 유형 비율 A 와 동일 — 사실 6 · 시기 5 · 인물 5 · 취향 4 ·
// 기록 없음 3 · 모순 2 · 거짓 전제 2. 모순은 골격 대 이야기 1문항(B-C1) + 이야기 대 이야기 1문항(B-C2).
// 필드 의미는 db/lab/golden/persona-a.ts 머리 주석과 같다. 문항마다 "방해:" 주석에 헷갈리기 쉬운
// 원본(설계 §6 의 mustNotCite 후보)을 적었다 — 채점은 정밀도(expected ∪ alsoAcceptable 밖 인용 감점)로
// 반영하고, 인용 자체가 잘못인 원본(미승인 초안)만 mustNotCite 로 둔다.

import type { PersonaBSourceKey } from "../personas/persona-b";
import type { GoldenItemOf } from "../personas/types";

export const GOLDEN_PERSONA_B: readonly GoldenItemOf<PersonaBSourceKey>[] = [
  // ── 사실 조회 (6) ─────────────────────────────────────────────
  {
    // 방해: LE_GURO_VISIT(같은 구로 · 2012 아들 집)
    id: "B-F1",
    category: "FACT",
    question: "서울 올라와서 처음 다닌 공장이 어디였지?",
    expected: [["EP_GURO", "SK_FIRST_JOB"]],
    alsoAcceptable: [
      "LE_SEOUL",
      "PS_YEONGSUK",
      "EP_GURO_HOLIDAY",
      "EP_GURO_THREAD",
      "EP_SEOUL_HOMESICK",
      "LE_FIRST_SALARY",
      "LE_SINGER",
    ],
    mustInclude: [/대성봉제|봉제/],
  },
  {
    // 방해: EP_SHOP_OPEN(처음엔 떡볶이·김밥), LE_CUCUMBER(가게 김밥)
    id: "B-F2",
    category: "FACT",
    question: "분식집에서 제일 잘 팔리던 메뉴가 뭐였지?",
    expected: [["EP_SHOP_DAILY"]],
    alsoAcceptable: [
      "EP_SHOP_OPEN",
      "SK_SHOP_OPEN",
      "EP_SHOP_REGULARS",
      "EP_SHOP_CLOSE",
      "PH_SHOP",
    ],
    mustInclude: [/비빔국수/],
  },
  {
    // 방해: LE_SHOP_FLOOD(가게에 물이 듦 · 1991), EP_BUSAN_MOVE(영도 셋방), LE_MOVE_DONGRAE
    id: "B-F3",
    category: "FACT",
    question: "결혼하고 처음 살던 집은 어디였지?",
    expected: [["EP_NEWLYWED", "LE_DONGHYUN"]],
    alsoAcceptable: [
      "SK_MARRIAGE",
      "EP_MARRIAGE",
      "LE_MARRIAGE",
      "PS_SANGCHEOL",
      "PROFILE",
    ],
    mustInclude: [/신림동/],
  },
  {
    id: "B-F4",
    category: "FACT",
    question: "우리 남편은 무슨 일을 했었지?",
    expected: [
      ["PS_SANGCHEOL", "EP_MARRIAGE", "EP_BUSAN_MOVE", "LE_HUSBAND_RETIRE"],
    ],
    alsoAcceptable: [
      "SK_MARRIAGE",
      "SK_BUSAN_MOVE",
      "LE_MARRIAGE",
      "PH_WEDDING",
      "EP_SHOP_HUSBAND",
    ],
    mustInclude: [/버스/],
  },
  {
    // 방해: LE_KNEE(무릎 수술 · 2016 — 가게 정리 이유가 아님)
    id: "B-F5",
    category: "FACT",
    question: "분식집은 왜 그만뒀었지?",
    expected: [["EP_SHOP_CLOSE"]],
    alsoAcceptable: ["SK_SHOP_CLOSE", "EP_KNIT"],
    mustInclude: [/재개발|헐/],
    mustNotInclude: [/무릎[^.?!]{0,15}(그만|접|정리)/],
  },
  {
    // 방해: LE_GRANDCHILD2(손녀 서연 · 2010 — 인접 연도 유사 사건)
    id: "B-F6",
    category: "FACT",
    question: "첫 손주 이름이 뭐였지?",
    expected: [["LE_GRANDCHILD", "PS_JIHO"]],
    alsoAcceptable: ["EP_KNIT", "PH_JIHO", "PS_DONGHYUN"],
    mustInclude: [/지호/],
    mustNotInclude: [/첫[^.?!]{0,10}서연/],
  },

  // ── 시기 추론 (5) ─────────────────────────────────────────────
  {
    // 방해: EP_HUSBAND_FISHING(남편의 쉬는 날), EP_DAILY_NOW(요즘 일요일)
    id: "B-T1",
    category: "PERIOD",
    question: "공장 다닐 때 쉬는 날엔 뭐 했지?",
    expected: [["EP_GURO_HOLIDAY", "PS_YEONGSUK"]],
    alsoAcceptable: ["SK_FIRST_JOB", "EP_GURO", "LE_SINGER", "PROFILE"],
    mustInclude: [/극장|영화/],
  },
  {
    // 방해: LE_REUNION(2009 동창회)·LE_MOKPO_TRIP(2017 고향 방문)·PH_REUNION — 같은 목포, 다른 시기
    id: "B-T2",
    category: "PERIOD",
    question: "열 살 무렵엔 어디 살았지?",
    expected: [
      [
        "EP_ELEM",
        "EP_ELEM_FATHER",
        "SK_ELEM",
        "LE_BIRTH",
        "EP_BIRTH_TOWN",
        "PROFILE",
      ],
    ],
    alsoAcceptable: ["PS_YEONGSU", "SK_BIRTH", "PS_CHEOLHO"],
    mustInclude: [/목포/],
  },
  {
    // 방해: ERA_PYEONGCHANG(다른 올림픽), ERA_BUSAN_ASIAD
    id: "B-T3",
    category: "PERIOD",
    question: "88올림픽 할 때 나는 뭐 하고 있었지?",
    expected: [["ERA_OLYMPIC"]],
    alsoAcceptable: [
      "EP_SHOP_OPEN",
      "EP_SHOP_DAILY",
      "EP_SHOP_REGULARS",
      "EP_SHOP_HUSBAND",
      "SK_SHOP_OPEN",
      "PH_SHOP",
      "EP_DONGRAE_HOME",
    ],
    mustInclude: [/분식|가게|장사/],
  },
  {
    // 방해: LE_DONGHYUN(아들 출생 1975 — 인접 연도 유사 사건)
    id: "B-T4",
    category: "PERIOD",
    question: "1977년에 무슨 일이 있었지?",
    expected: [["LE_EUNJU", "PS_EUNJU"]],
    alsoAcceptable: ["EP_NEWLYWED", "SK_MARRIAGE"],
    mustInclude: [/은주/],
    mustNotInclude: [/동현[^.?!]{0,15}1977|1977[^.?!]{0,15}동현/],
  },
  {
    // 방해: EP_DONGRAE_HOME·LE_MOVE_DONGRAE(1983 동래 이사 — 같은 부산, 인접 연도)
    id: "B-T5",
    category: "PERIOD",
    question: "부산 처음 이사 와서는 어디 살았지?",
    expected: [["EP_BUSAN_MOVE", "SK_BUSAN_MOVE"]],
    alsoAcceptable: [
      "EP_YEONGDO_LIFE",
      "EP_HUSBAND_FISHING",
      "PS_YEONGSU_OPPA",
      "PS_OKJA",
      "PH_YEONGDO",
      "ERA_COLORTV",
      "PROFILE",
    ],
    mustInclude: [/영도/],
  },

  // ── 인물 (5) ──────────────────────────────────────────────────
  {
    // 방해: PS_YEONGSU_OPPA(사촌 오빠)·PS_YEONGSUK(공장 동료) — 비슷한 이름
    id: "B-P1",
    category: "PERSON",
    question: "영수는 어떻게 알던 사이지?",
    expected: [["PS_YEONGSU", "EP_ELEM"]],
    alsoAcceptable: ["LE_REUNION", "PH_REUNION", "SK_ELEM", "PROFILE"],
    mustInclude: [/국민학교|동무|동창/],
  },
  {
    // 방해: PS_YEONGSU(국민학교 동무) — 비슷한 이름
    id: "B-P2",
    category: "PERSON",
    question: "영숙이는 누구였지?",
    expected: [["PS_YEONGSUK", "EP_GURO_HOLIDAY"]],
    alsoAcceptable: ["SK_FIRST_JOB", "EP_GURO", "PROFILE"],
    mustInclude: [/공장|동료|봉제/],
  },
  {
    // 방해: PS_YEONGSU·EP_ELEM(국민학교 동무 영수) — 비슷한 이름
    id: "B-P3",
    category: "PERSON",
    question: "영수 오빠는 나랑 어떤 사이였지?",
    expected: [["PS_YEONGSU_OPPA", "EP_BUSAN_MOVE"]],
    alsoAcceptable: ["SK_BUSAN_MOVE"],
    mustInclude: [/사촌/],
  },
  {
    id: "B-P4",
    category: "PERSON",
    question: "남편 상철 씨는 어떤 사람이라고 했었지?",
    expected: [["PS_SANGCHEOL", "EP_SHOP_HUSBAND"]],
    alsoAcceptable: [
      "EP_MARRIAGE",
      "EP_BUSAN_MOVE",
      "EP_HUSBAND_FISHING",
      "LE_MARRIAGE",
      "LE_HUSBAND_NAMJIN",
      "LE_HUSBAND_RETIRE",
      "SK_MARRIAGE",
      "PH_WEDDING",
      "PH_SHOP",
    ],
    mustInclude: [/무뚝뚝|정이/],
  },
  {
    id: "B-P5",
    category: "PERSON",
    question: "막내 시누이 명자 얘기 뭐라고 했었지?",
    expected: [["PS_MYEONGJA"]],
    mustInclude: [/광주|미용실/],
    // 타인 건강 = 민감정보. 원본 memo 에 있지만 카드·답변에 나오면 안 된다.
    mustNotInclude: [/당뇨|혈당|단 것/],
  },

  // ── 취향 추론 (4) ─────────────────────────────────────────────
  {
    // 방해: EP_GURO_THREAD(공장 바느질은 지긋지긋 — 같은 '바늘' 맥락 반대)
    id: "B-L1",
    category: "PREFERENCE",
    question: "내가 즐겨 하는 취미가 뭐지?",
    expected: [["EP_KNIT", "LE_KNIT_CLASS", "LE_KNIT_GIFT", "PROFILE"]],
    alsoAcceptable: [
      "EP_YEONGDO_LIFE",
      "EP_DAILY_NOW",
      "PS_JIHO",
      "PS_OKJA",
      "LE_SINGER",
    ],
    mustInclude: [/뜨개/],
    mustNotInclude: [/바느질을 좋아/],
  },
  {
    // 방해: PS_EUNJU(노래 잘하는 딸) — LE_HUSBAND_NAMJIN 은 "나는 이미자가 더 좋다"라 근거로 인정
    id: "B-L2",
    category: "PREFERENCE",
    question: "내가 좋아하는 가수가 누구지?",
    expected: [
      [
        "PROFILE",
        "LE_SINGER",
        "EP_GURO_HOLIDAY",
        "LE_HUSBAND_NAMJIN",
        "EP_GRANDCHILDREN",
      ],
    ],
    mustInclude: [/이미자/],
  },
  {
    id: "B-L3",
    category: "PREFERENCE",
    question: "내가 싫어하는 음식이 있었나?",
    expected: [["LE_CUCUMBER", "LE_CUCUMBER2"]],
    mustInclude: [/오이/],
  },
  {
    // 방해: EP_HUSBAND_FISHING(낚시 질색), EP_ELEM_FATHER·LE_TAEJONGDAE 의 배 질색, LE_KNEE(본인 건강)
    id: "B-L4",
    category: "PREFERENCE",
    question: "나 바다 좋아하는 편이야?",
    expected: [["EP_YEONGDO_LIFE", "EP_DAILY_NOW", "LE_TAEJONGDAE", "PROFILE"]],
    alsoAcceptable: [
      "EP_ELEM_FATHER",
      "EP_BIRTH_TOWN",
      "EP_SEOUL_HOMESICK",
      "PS_OKJA",
      "PH_TAEJONGDAE",
      "PH_YEONGDO",
    ],
    mustInclude: [/걷|산책/],
    // 본인 건강(무릎 수술)은 취향·성향의 근거로 말하면 안 된다.
    mustNotInclude: [/무릎이 (안 좋|약)|건강이 안 좋/],
  },

  // ── 기록 없음 (3) ─────────────────────────────────────────────
  {
    id: "B-N1",
    category: "NO_RECORD",
    question: "어릴 때 키우던 고양이 이름이 뭐였지?",
    expected: [],
    expectNoRecord: true,
  },
  {
    // 방해: PROFILE closeFriends(영수·영숙·옥자 — 중학교 친구가 아님)
    id: "B-N2",
    category: "NO_RECORD",
    question: "중학교 때 제일 친했던 친구가 누구였지?",
    expected: [],
    alsoAcceptable: ["SK_MIDDLE", "EP_MIDDLE", "EP_MIDDLE_END"],
    expectNoRecord: true,
  },
  {
    // 미승인 초안(LE_DRAFT_THIEF)에만 있는 이야기 — 기록 없음이 정답.
    id: "B-N3",
    category: "NO_RECORD",
    question: "분식집에 도둑 들었던 얘기 했었지?",
    expected: [],
    alsoAcceptable: [
      "EP_SHOP_OPEN",
      "EP_SHOP_DAILY",
      "EP_SHOP_REGULARS",
      "SK_SHOP_OPEN",
    ],
    mustNotCite: ["LE_DRAFT_THIEF"],
    mustNotInclude: [/도둑을 (잡으셨|잡았)/],
    expectNoRecord: true,
  },

  // ── 모순 (2) ──────────────────────────────────────────────────
  {
    // 골격 기록 대 이야기 기록: 골격 1988 vs EP_SHOP_OPEN "87년 가을"
    id: "B-C1",
    category: "CONFLICT",
    question: "분식집 몇 년도에 열었지?",
    expected: [["SK_SHOP_OPEN"], ["EP_SHOP_OPEN"]],
    alsoAcceptable: ["EP_SHOP_DAILY", "PH_SHOP", "ERA_OLYMPIC"],
    mustInclude: [/1988|88년/, /1987|87년/],
    expectConflict: true,
  },
  {
    // 이야기 기록 대 이야기 기록: LE_SEOUL "사촌 언니 순옥이를 따라" vs EP_GURO "혼자"
    id: "B-C2",
    category: "CONFLICT",
    question: "서울 처음 올라올 때 누구랑 같이 갔었지?",
    expected: [["LE_SEOUL"], ["EP_GURO"]],
    alsoAcceptable: ["SK_FIRST_JOB", "PS_SUNOK", "EP_SEOUL_HOMESICK"],
    mustInclude: [/사촌 ?언니|순옥/, /혼자/],
    expectConflict: true,
  },

  // ── 거짓 전제 (2) ─────────────────────────────────────────────
  {
    id: "B-X1",
    category: "FALSE_PREMISE",
    question: "내가 대구에서 태어났다고 했었지?",
    expected: [["LE_BIRTH", "PROFILE", "EP_BIRTH_TOWN"]],
    alsoAcceptable: ["SK_BIRTH", "EP_ELEM"],
    mustInclude: [/목포/],
  },
  {
    id: "B-X2",
    category: "FALSE_PREMISE",
    question: "분식집은 서울에서 했었지?",
    expected: [["EP_SHOP_OPEN", "SK_SHOP_OPEN", "PH_SHOP"]],
    alsoAcceptable: [
      "EP_SHOP_DAILY",
      "EP_SHOP_REGULARS",
      "EP_SHOP_HUSBAND",
      "EP_SHOP_CLOSE",
      "LE_CUCUMBER",
      "LE_SHOP_FLOOD",
      "LE_HUSBAND_RETIRE",
      "ERA_OLYMPIC",
      "ERA_IMF",
      "ERA_BUSAN_ASIAD",
    ],
    mustInclude: [/부산|동래/],
  },
];
