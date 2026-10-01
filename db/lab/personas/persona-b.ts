// 기억 에이전트 연구 트랙(R1~R4) — 가상 페르소나 B 원본 데이터. [동결 — R2-5]
//
// ⚠️ 실존 인물이 아니다. 사람 이름·회사·학교·가게는 전부 가상이고, 지명(목포·서울 구로·
// 신림동·종로·부산 영도·동래·해운대·태종대)만 시기 해석·장소 검색을 시험하려고 실제 지역명을 쓴다.
//
// 용도: R2 완료 시 1회 최종 검증(보지 않은 데이터로 일반화 확인). R1~R2 개발 중 B 의 카드·검색
// 결과는 열람하지 않았다. 이 파일과 골든셋(db/lab/golden/persona-b.ts)은 한 커밋에 함께 동결하고,
// 동결 이후 코드·프롬프트를 바꾸지 않는다(phase/기억에이전트_R1-R4_기획.md 결정 로그 R2-5).
// 설계: 같은 문서 §6 "페르소나 B 설계" — 원본 80여 건(카드 150~200장 목표), 7개 원본 유형 전부
// (사진 캡션 포함), 의도적 방해 기록 4종.
//
// 일부러 심어 둔 것:
//   - 모순(골격 대 이야기) : 골격 "동래 분식집 개업" 1988  vs  EP_SHOP_OPEN "87년 가을"
//   - 모순(이야기 대 이야기): LE_SEOUL "사촌 언니 순옥이를 따라" 상경  vs  EP_GURO "혼자 완행열차"
//   - 방해 ① 같은 지명·다른 시기: 구로(1966 공장 · 2012 아들 집), 목포(어린 시절 · 2009 동창회 ·
//     2017 고향 방문), 영도(1979 셋방 · 2015 태종대 유람선)
//   - 방해 ② 비슷한 이름: 영수(국민학교 동무) · 영숙(공장 동료) · 영수 오빠(사촌 오빠)
//   - 방해 ③ 인접 연도 유사 사건: 아들 동현 1975 · 딸 은주 1977 출생, 영도 이사 1979 · 동래 이사
//     1983, 손주 지호 2008 · 서연 2010 출생
//   - 방해 ④ 같은 취향 낱말·다른 맥락: 뜨개질(좋아함) vs 공장 바느질(지긋지긋), 바닷가 걷기
//     (좋아함) vs 배·뱃멀미(질색), 남편의 낚시(본인은 질색), 이미자(본인) vs 남진(남편)
//   - 여러 날 반복 취향: 뜨개질(1·11·12일차), 바닷가 걷기(1·7·12일차), 이미자(1·4·6·11일차),
//     오이 싫음(9·12일차), 배·뱃멀미 질색(2·12일차)
//   - 본인 건강 언급: 무릎 수술(LE_KNEE) — 취향·성향 근거로 쓰면 안 됨
//   - 타인 민감정보: 시누이 명자 memo 의 당뇨 — 카드·답변에 나오면 안 됨
//   - 미승인 초안: 분식집 도둑 이야기(isDraft=true) — 색인·인용되면 안 됨
//   - 골격 SKIPPED 3건(고등학교·대학교·군 입대) — 카드 대상 아님. UNCONFIRMED 없음.
//
// day: 1일차 = baseDateKst. 원본 createdAt 을 (baseDateKst + day-1) 10:00 KST 로 둔다(L2 세션 규칙).

import type {
  EpisodeOf,
  EraMemoryOf,
  LifeMemoryOf,
  PersonOf,
  PhotoMemoryOf,
  SkeletonEventOf,
} from "./types";

export type SkeletonKeyB =
  | "SK_BIRTH"
  | "SK_ELEM"
  | "SK_MIDDLE"
  | "SK_HIGH"
  | "SK_UNIV"
  | "SK_MILITARY"
  | "SK_FIRST_JOB"
  | "SK_MARRIAGE"
  | "SK_BUSAN_MOVE"
  | "SK_SHOP_OPEN"
  | "SK_SHOP_CLOSE";

export type EpisodeKeyB =
  | "EP_BIRTH_TOWN"
  | "EP_ELEM"
  | "EP_ELEM_FATHER"
  | "EP_MIDDLE"
  | "EP_MIDDLE_END"
  | "EP_GURO"
  | "EP_GURO_HOLIDAY"
  | "EP_GURO_THREAD"
  | "EP_SEOUL_HOMESICK"
  | "EP_MARRIAGE"
  | "EP_NEWLYWED"
  | "EP_BUSAN_MOVE"
  | "EP_YEONGDO_LIFE"
  | "EP_HUSBAND_FISHING"
  | "EP_DONGRAE_HOME"
  | "EP_SHOP_OPEN"
  | "EP_SHOP_DAILY"
  | "EP_SHOP_REGULARS"
  | "EP_SHOP_HUSBAND"
  | "EP_SHOP_CLOSE"
  | "EP_KNIT"
  | "EP_GRANDCHILDREN"
  | "EP_DAILY_NOW";

export type LifeMemoryKeyB =
  | "LE_BIRTH"
  | "LE_SEOUL"
  | "LE_FIRST_SALARY"
  | "LE_SINGER"
  | "LE_MARRIAGE"
  | "LE_DONGHYUN"
  | "LE_HUSBAND_NAMJIN"
  | "LE_EUNJU"
  | "LE_MOVE_DONGRAE"
  | "LE_MOTHER_60"
  | "LE_CUCUMBER"
  | "LE_SHOP_FLOOD"
  | "LE_DONGHYUN_ARMY"
  | "LE_DRAFT_THIEF"
  | "LE_EUNJU_WEDDING"
  | "LE_HUSBAND_RETIRE"
  | "LE_GRANDCHILD"
  | "LE_REUNION"
  | "LE_GRANDCHILD2"
  | "LE_KNIT_CLASS"
  | "LE_GURO_VISIT"
  | "LE_CUCUMBER2"
  | "LE_TAEJONGDAE"
  | "LE_KNEE"
  | "LE_MOKPO_TRIP"
  | "LE_KNIT_GIFT";

export type EraMemoryKeyB =
  | "ERA_COLORTV"
  | "ERA_OLYMPIC"
  | "ERA_IMF"
  | "ERA_BUSAN_ASIAD"
  | "ERA_PYEONGCHANG";

export type PhotoKeyB =
  | "PH_WEDDING"
  | "PH_YEONGDO"
  | "PH_SHOP"
  | "PH_REUNION"
  | "PH_JIHO"
  | "PH_TAEJONGDAE";

export type PersonKeyB =
  | "PS_SANGCHEOL"
  | "PS_DONGHYUN"
  | "PS_EUNJU"
  | "PS_YEONGSU"
  | "PS_YEONGSUK"
  | "PS_YEONGSU_OPPA"
  | "PS_SUNOK"
  | "PS_OKJA"
  | "PS_MYEONGJA"
  | "PS_JIHO"
  | "PS_SEOYEON"
  | "PS_CHEOLHO";

export type PersonaBSourceKey =
  | SkeletonKeyB
  | EpisodeKeyB
  | LifeMemoryKeyB
  | EraMemoryKeyB
  | PhotoKeyB
  | PersonKeyB
  | "PROFILE";

export const PERSONA_B = {
  userId: "lab_persona_b",
  // .invalid 는 RFC 2606 예약 도메인 — 실제 주소가 될 수 없다.
  email: "lab-persona-b@lifebook.invalid",
  name: "윤말순",
  baseDateKst: "2026-08-20",

  onboardingProfile: {
    birthYear: 1950,
    birthMonth: 9,
    gender: null,
    region: "부산",
    day: 1,
  },

  skeleton: [
    {
      key: "SK_BIRTH",
      type: "BIRTH",
      label: "출생",
      year: 1950,
      isOptional: false,
      status: "CONFIRMED",
      sequenceOrder: 0,
      day: 1,
    },
    {
      key: "SK_ELEM",
      type: "ELEM_SCHOOL",
      label: "국민학교 입학",
      year: 1957,
      isOptional: false,
      status: "CONFIRMED",
      sequenceOrder: 1,
      day: 1,
    },
    {
      key: "SK_MIDDLE",
      type: "MIDDLE_SCHOOL",
      label: "중학교 입학",
      year: 1963,
      isOptional: false,
      status: "CONFIRMED",
      sequenceOrder: 2,
      day: 1,
    },
    {
      key: "SK_HIGH",
      type: "HIGH_SCHOOL",
      label: "고등학교 입학",
      year: 1966,
      isOptional: true,
      status: "SKIPPED",
      sequenceOrder: 3,
      day: 1,
    },
    {
      key: "SK_UNIV",
      type: "UNIVERSITY",
      label: "대학교 입학",
      year: 1969,
      isOptional: true,
      status: "SKIPPED",
      sequenceOrder: 4,
      day: 1,
    },
    {
      key: "SK_MILITARY",
      type: "MILITARY",
      label: "군 입대",
      year: 1970,
      isOptional: true,
      status: "SKIPPED",
      sequenceOrder: 5,
      day: 1,
    },
    {
      key: "SK_FIRST_JOB",
      type: "FIRST_JOB",
      label: "첫 직장",
      year: null,
      isOptional: true,
      status: "CORRECTED",
      correctedYear: 1966,
      correctedLabel: "서울 구로 대성봉제 취직",
      sequenceOrder: 6,
      day: 1,
    },
    {
      key: "SK_MARRIAGE",
      type: "MARRIAGE",
      label: "결혼",
      year: null,
      isOptional: true,
      status: "CORRECTED",
      correctedYear: 1974,
      correctedLabel: "결혼",
      sequenceOrder: 7,
      day: 1,
    },
    {
      key: "SK_BUSAN_MOVE",
      type: "CUSTOM",
      label: "부산 영도로 이사",
      year: 1979,
      isOptional: false,
      status: "CONFIRMED",
      sequenceOrder: 8,
      day: 7,
    },
    {
      key: "SK_SHOP_OPEN",
      type: "CUSTOM",
      label: "동래 분식집 개업",
      year: 1988,
      isOptional: false,
      status: "CONFIRMED",
      sequenceOrder: 9,
      day: 8,
    },
    {
      key: "SK_SHOP_CLOSE",
      type: "CUSTOM",
      label: "분식집 정리",
      year: 2010,
      isOptional: false,
      status: "CONFIRMED",
      sequenceOrder: 10,
      day: 10,
    },
  ] satisfies readonly SkeletonEventOf<SkeletonKeyB>[],

  episodes: [
    {
      key: "EP_BIRTH_TOWN",
      lifeEventKey: "SK_BIRTH",
      isPeriod: false,
      day: 1,
      content:
        "목포 온금동, 유달산 아래 바닷가 마을에서 태어났다. 아침마다 갈매기 소리에 깼고, 어머니는 시장에서 생선을 파셨다.",
      transcript: [
        ["동반자", "태어나신 곳은 어떤 동네였어요?"],
        [
          "본인",
          "목포 온금동이라고, 유달산 바로 밑에 바닷가 동네여. 아침마다 갈매기 소리에 깼제.",
        ],
        ["동반자", "부모님은 어떤 일을 하셨어요?"],
        ["본인", "아버지는 고깃배 타시고, 어머니는 시장에서 생선 파셨어."],
      ],
      places: ["목포 온금동"],
    },
    {
      key: "EP_ELEM",
      lifeEventKey: "SK_ELEM",
      isPeriod: false,
      personKey: "PS_YEONGSU",
      day: 2,
      content:
        "목포 갈매국민학교에 다녔다. 동무 영수와 학교가 끝나면 갯벌에 나가 조개를 캤다. 캔 조개는 어머니 좌판에 보탰다.",
      transcript: [
        ["동반자", "국민학교 때 제일 생각나는 게 뭐예요?"],
        [
          "본인",
          "목포 갈매국민학교 다녔는디, 영수라고 동무가 있었어. 학교 파하면 둘이 갯벌 나가서 조개 캤제.",
        ],
        ["동반자", "캔 조개는 어떻게 하셨어요?"],
        ["본인", "어머니 좌판에 갖다 드렸지. 그래도 보탬이 된다고 좋아하셨어."],
      ],
      places: ["목포 갯벌"],
    },
    {
      key: "EP_ELEM_FATHER",
      lifeEventKey: "SK_ELEM",
      isPeriod: true,
      day: 2,
      content:
        "열 살 때 아버지 고깃배를 처음 따라 탔다가 뱃멀미로 하루 종일 토했다. 그 뒤로는 배가 무서워서 다시는 타지 않았다.",
      transcript: [
        ["동반자", "아버지 배를 타 보신 적 있으세요?"],
        [
          "본인",
          "열 살 땐가 한 번 따라 탔는디, 뱃멀미를 해서 하루 종일 토했어.",
        ],
        ["동반자", "많이 힘드셨겠어요."],
        [
          "본인",
          "그 뒤로는 배가 무서워서 다시는 안 탔제. 바다는 좋은디 배는 질색이여.",
        ],
      ],
    },
    {
      key: "EP_MIDDLE",
      lifeEventKey: "SK_MIDDLE",
      isPeriod: false,
      day: 3,
      content:
        "해송여자중학교에 다니면서 남동생들을 업어 키웠다. 공부가 재미있었지만 집이 어려워 고등학교는 가지 못했다.",
      transcript: [
        ["동반자", "중학교 다니실 때는 어떠셨어요?"],
        [
          "본인",
          "해송여중 다녔제. 학교 갔다 오면 남동생들 업고 다니느라 정신이 없었어.",
        ],
        ["동반자", "공부는 좋아하셨어요?"],
        ["본인", "공부는 재밌었어. 근디 집이 어려워서 고등학교는 못 갔제."],
      ],
    },
    {
      key: "EP_MIDDLE_END",
      lifeEventKey: "SK_MIDDLE",
      isPeriod: true,
      day: 3,
      content:
        "중학교 졸업식 날 어머니가 고등학교를 못 보내서 미안하다며 우셨다. 그날 돈을 벌어 동생들은 꼭 공부시키겠다고 마음먹었다.",
      transcript: [
        ["동반자", "중학교 졸업하던 날 기억나세요?"],
        [
          "본인",
          "어머니가 고등학교 못 보내서 미안하다고 우셨어. 그게 지금도 생각나.",
        ],
        ["동반자", "그때 어떤 마음이 드셨어요?"],
        ["본인", "내가 돈 벌어서 동생들은 꼭 공부시킨다, 그렇게 마음먹었제."],
      ],
    },
    {
      key: "EP_GURO",
      lifeEventKey: "SK_FIRST_JOB",
      isPeriod: false,
      day: 4,
      content:
        "66년 열여섯 살에 혼자 완행열차를 타고 서울에 올라왔다. 구로에 있는 대성봉제에서 미싱 보조로 일했고, 기숙사 한 방에서 여덟 명이 같이 잤다.",
      transcript: [
        ["동반자", "서울에는 어떻게 올라오셨어요?"],
        [
          "본인",
          "66년, 열여섯 살에 혼자 완행열차 타고 올라왔어. 보따리 하나 들고.",
        ],
        ["동반자", "처음 일하신 곳은 어디였어요?"],
        [
          "본인",
          "구로에 대성봉제라고, 미싱 보조로 들어갔제. 기숙사 방 하나에 여덟 명이 같이 잤어.",
        ],
      ],
      places: ["서울 구로"],
    },
    {
      key: "EP_GURO_HOLIDAY",
      lifeEventKey: "SK_FIRST_JOB",
      isPeriod: true,
      personKey: "PS_YEONGSUK",
      day: 4,
      content:
        "공장 동료 영숙이와 쉬는 일요일마다 종로 극장에 영화를 보러 갔다. 공장 라디오에서 이미자 노래가 나오면 다 같이 따라 불렀다.",
      transcript: [
        ["동반자", "공장 다니실 때 쉬는 날엔 뭐 하셨어요?"],
        [
          "본인",
          "영숙이라고 같이 일하던 동무가 있었는디, 일요일마다 둘이 종로 극장 가서 영화 봤제.",
        ],
        ["동반자", "일하실 때 즐거운 일도 있으셨어요?"],
        [
          "본인",
          "라디오에서 이미자 노래 나오면 다들 따라 불렀어. 그 맛에 버텼제.",
        ],
      ],
      places: ["서울 종로"],
    },
    {
      key: "EP_GURO_THREAD",
      lifeEventKey: "SK_FIRST_JOB",
      isPeriod: true,
      day: 5,
      content:
        "공장에서는 하루 종일 실밥을 따고 바느질을 했다. 손끝에 굳은살이 박였고, 젊을 때는 바늘만 봐도 지긋지긋했다.",
      transcript: [
        ["동반자", "공장 일은 어떠셨어요?"],
        ["본인", "하루 종일 실밥 따고 바느질했제. 손끝에 굳은살이 박혀부렀어."],
        ["동반자", "힘드셨겠어요."],
        ["본인", "젊을 때는 바늘만 봐도 지긋지긋했어. 그때는 그랬제."],
      ],
    },
    {
      key: "EP_SEOUL_HOMESICK",
      lifeEventKey: "SK_FIRST_JOB",
      isPeriod: true,
      day: 5,
      content:
        "서울에 처음 왔을 때는 밤마다 고향 바다가 그리워 이불 속에서 울었다. 첫 월급을 받고 나서야 조금 마음이 놓였다.",
      transcript: [
        ["동반자", "서울 처음 오셨을 때 어떠셨어요?"],
        ["본인", "밤마다 고향 바다가 그리워서 이불 뒤집어쓰고 울었어."],
        ["동반자", "언제쯤 좀 괜찮아지셨어요?"],
        ["본인", "첫 월급 받고 나서야 쪼끔 마음이 놓이더라고."],
      ],
    },
    {
      key: "EP_MARRIAGE",
      lifeEventKey: "SK_MARRIAGE",
      isPeriod: false,
      personKey: "PS_SANGCHEOL",
      day: 6,
      content:
        "남편 상철 씨는 내가 매일 타던 출근 버스의 기사였다. 1년 넘게 눈인사만 하다가 남편이 먼저 영화를 보자고 했다. 74년 봄에 결혼했다.",
      transcript: [
        ["동반자", "남편분은 어떻게 만나셨어요?"],
        ["본인", "내가 매일 타던 출근 버스 기사였어. 1년 넘게 눈인사만 했제."],
        ["동반자", "누가 먼저 말을 거셨어요?"],
        [
          "본인",
          "그 양반이 먼저 영화 보자고 하더라고. 그래서 74년 봄에 결혼했제.",
        ],
      ],
    },
    {
      key: "EP_NEWLYWED",
      lifeEventKey: "SK_MARRIAGE",
      isPeriod: true,
      day: 6,
      content:
        "신혼살림은 서울 신림동 반지하 셋방에서 시작했다. 장마 때 방에 물이 차서 밤새 바가지로 퍼냈다. 겨울에는 연탄불이 꺼질까 봐 잠을 설쳤다.",
      transcript: [
        ["동반자", "결혼하시고 처음 사신 집은 어땠어요?"],
        [
          "본인",
          "신림동 반지하 셋방이었어. 장마 때 방에 물이 차서 밤새 바가지로 퍼냈제.",
        ],
        ["동반자", "겨울은 어떠셨어요?"],
        ["본인", "연탄불 꺼질까 봐 잠을 제대로 못 잤어."],
      ],
      places: ["서울 신림동"],
    },
    {
      key: "EP_BUSAN_MOVE",
      lifeEventKey: "SK_BUSAN_MOVE",
      isPeriod: false,
      personKey: "PS_YEONGSU_OPPA",
      day: 7,
      content:
        "79년에 남편이 부산 시내버스 회사로 옮기면서 부산 영도로 이사했다. 영도에 먼저 자리 잡은 사촌 영수 오빠가 셋방을 구해 주었다.",
      transcript: [
        ["동반자", "부산에는 어떻게 가시게 됐어요?"],
        [
          "본인",
          "79년에 그 양반이 부산 시내버스 회사로 옮겼어. 그래서 영도로 이사했제.",
        ],
        ["동반자", "집은 어떻게 구하셨어요?"],
        [
          "본인",
          "사촌 영수 오빠가 영도에 먼저 와 있었거든. 그 오빠가 셋방을 구해 줬어.",
        ],
      ],
      places: ["부산 영도"],
    },
    {
      key: "EP_YEONGDO_LIFE",
      lifeEventKey: "SK_BUSAN_MOVE",
      isPeriod: true,
      personKey: "PS_OKJA",
      day: 7,
      content:
        "영도에 살 때는 아침마다 옆집 옥자와 바닷가를 걸었다. 바다 냄새를 맡으면 고향 생각이 나서 좋았다.",
      transcript: [
        ["동반자", "영도에서 사실 때 아침은 어떠셨어요?"],
        ["본인", "옆집 옥자랑 아침마다 바닷가를 걸었제. 그게 하루 시작이었어."],
        ["동반자", "바다를 좋아하셨나 봐요."],
        ["본인", "바다 냄새 맡으면 고향 생각이 나서 좋더라고."],
      ],
      places: ["부산 영도"],
    },
    {
      key: "EP_HUSBAND_FISHING",
      lifeEventKey: "SK_BUSAN_MOVE",
      isPeriod: true,
      personKey: "PS_SANGCHEOL",
      day: 8,
      content:
        "남편은 쉬는 날이면 태종대 갯바위로 낚시를 다녔다. 한 번 따라갔다가 낚싯바늘에 손가락을 찔린 뒤로 나는 낚시라면 질색이다.",
      transcript: [
        ["동반자", "남편분은 쉬는 날 뭐 하셨어요?"],
        ["본인", "태종대 갯바위로 낚시를 다녔제. 고기는 별로 못 잡아 오면서."],
        ["동반자", "같이 가 보신 적 있으세요?"],
        [
          "본인",
          "한 번 따라갔다가 낚싯바늘에 손가락을 찔렸어. 그 뒤로 낚시라면 질색이여.",
        ],
      ],
      places: ["부산 태종대"],
    },
    {
      key: "EP_DONGRAE_HOME",
      lifeEventKey: "SK_BUSAN_MOVE",
      isPeriod: true,
      day: 8,
      content:
        "83년에 은주가 국민학교에 들어갈 때 맞춰 영도에서 동래로 이사했다. 동래 집은 마당이 있어서 장독을 놓을 수 있었다.",
      transcript: [
        ["동반자", "동래로는 언제 옮기셨어요?"],
        ["본인", "83년에 은주가 국민학교 들어갈 때 맞춰서 옮겼제."],
        ["동반자", "동래 집은 어땠어요?"],
        ["본인", "마당이 있어서 장독을 놓을 수 있었어. 그게 그렇게 좋더라고."],
      ],
      places: ["부산 동래"],
    },
    {
      key: "EP_SHOP_OPEN",
      lifeEventKey: "SK_SHOP_OPEN",
      isPeriod: false,
      day: 8,
      content:
        "87년 가을에 동래 시장 앞에 '말순분식'을 열었다. 남편 월급만으로는 아이들 학비가 모자랐다. 처음에는 떡볶이와 김밥만 팔았다.",
      transcript: [
        ["동반자", "분식집은 언제 여셨어요?"],
        ["본인", "87년 가을이제. 동래 시장 앞에 말순분식이라고 열었어."],
        ["동반자", "가게를 하시게 된 이유가 있으세요?"],
        [
          "본인",
          "그 양반 월급만으로는 애들 학비가 모자랐어. 처음엔 떡볶이랑 김밥만 했제.",
        ],
      ],
      places: ["부산 동래 시장"],
    },
    {
      key: "EP_SHOP_DAILY",
      lifeEventKey: "SK_SHOP_OPEN",
      isPeriod: true,
      day: 9,
      content:
        "가게를 할 때는 새벽 다섯 시에 일어나 국수를 삶았다. 나중에 시작한 비빔국수가 제일 잘 팔렸는데, 양념에 매실청을 넣는 게 비법이었다.",
      transcript: [
        ["동반자", "가게 하실 때 하루는 어땠어요?"],
        ["본인", "새벽 다섯 시에 일어나서 국수부터 삶았제."],
        ["동반자", "제일 잘 팔린 메뉴는 뭐였어요?"],
        [
          "본인",
          "나중에 시작한 비빔국수. 양념에 매실청 넣는 게 내 비법이었어.",
        ],
      ],
    },
    {
      key: "EP_SHOP_REGULARS",
      lifeEventKey: "SK_SHOP_OPEN",
      isPeriod: true,
      day: 9,
      content:
        "근처 여고 학생들이 단골이었다. 돈이 없는 학생들은 외상 장부에 이름을 적어 두고 먹였다. 몇 년 뒤 졸업한 학생이 찾아와 외상값을 갚고 갔다.",
      transcript: [
        ["동반자", "단골손님들은 어떤 분들이었어요?"],
        [
          "본인",
          "근처 여고 학생들이 많이 왔제. 돈 없는 애들은 외상 장부에 적어 놓고 먹였어.",
        ],
        ["동반자", "기억에 남는 손님이 있으세요?"],
        [
          "본인",
          "몇 년 지나서 졸업한 애가 찾아와서 외상값 갚고 갔어. 얼마나 고맙던지.",
        ],
      ],
    },
    {
      key: "EP_SHOP_HUSBAND",
      lifeEventKey: "SK_SHOP_OPEN",
      isPeriod: true,
      personKey: "PS_SANGCHEOL",
      day: 10,
      content:
        "남편은 무뚝뚝해서 말은 없었지만 쉬는 날이면 가게에 나와 말없이 설거지를 했다. 그게 그 사람의 정이었다.",
      transcript: [
        ["동반자", "남편분이 가게 일을 도와주셨어요?"],
        [
          "본인",
          "그 양반이 무뚝뚝해서 말은 없어. 근디 쉬는 날이면 가게 나와서 말없이 설거지를 했제.",
        ],
        ["동반자", "마음이 따뜻한 분이셨네요."],
        ["본인", "그게 그 사람 정이여."],
      ],
    },
    {
      key: "EP_SHOP_CLOSE",
      lifeEventKey: "SK_SHOP_CLOSE",
      isPeriod: false,
      day: 10,
      content:
        "2010년에 동네 재개발로 가게 건물이 헐리게 되어 분식집을 정리했다. 마지막 날 단골들이 찾아와 섭섭하다며 국수를 두 그릇씩 먹고 갔다.",
      transcript: [
        ["동반자", "분식집은 어떻게 그만두시게 됐어요?"],
        ["본인", "2010년에 재개발한다고 건물이 헐린다 해서 정리했제."],
        ["동반자", "마지막 날은 어떠셨어요?"],
        ["본인", "단골들이 와서 섭섭하다고 국수를 두 그릇씩 먹고 갔어."],
      ],
    },
    {
      key: "EP_KNIT",
      lifeEventKey: "SK_SHOP_CLOSE",
      isPeriod: true,
      personKey: "PS_JIHO",
      day: 11,
      content:
        "가게를 정리하고 나서 복지관에서 뜨개질을 배웠다. 젊을 때는 바늘이 싫었는데 뜨개질은 재미있었다. 처음 뜬 조끼를 손주 지호에게 입혔더니 할머니 조끼라며 자랑을 했다.",
      transcript: [
        ["동반자", "가게 그만두시고는 뭐 하셨어요?"],
        [
          "본인",
          "복지관에서 뜨개질을 배웠어. 젊을 땐 바늘이 그렇게 싫더니 이건 재밌더라고.",
        ],
        ["동반자", "처음 뜨신 건 뭐였어요?"],
        ["본인", "조끼. 지호한테 입혔더니 할머니 조끼라고 동네방네 자랑했제."],
      ],
    },
    {
      key: "EP_GRANDCHILDREN",
      lifeEventKey: "SK_SHOP_CLOSE",
      isPeriod: true,
      personKey: "PS_SEOYEON",
      day: 11,
      content:
        "서연이가 어릴 때는 일주일에 세 번 해운대 은주네 집에 가서 봐 주었다. 내가 이미자 노래를 불러 주면 서연이가 잘 잤다.",
      transcript: [
        ["동반자", "손주들은 자주 보셨어요?"],
        ["본인", "서연이 어릴 때는 일주일에 세 번 해운대 은주네 가서 봐 줬제."],
        ["동반자", "손녀분이랑 뭐 하고 노셨어요?"],
        ["본인", "내가 이미자 노래 불러 주면 그렇게 잘 자더라고."],
      ],
      places: ["부산 해운대"],
    },
    {
      key: "EP_DAILY_NOW",
      lifeEventKey: "SK_SHOP_CLOSE",
      isPeriod: true,
      day: 12,
      content:
        "요즘은 일요일마다 버스를 타고 해운대에 가서 바닷가를 한 시간쯤 걷는다. 파도 소리를 들으며 걸으면 속이 시원하다.",
      transcript: [
        ["동반자", "요즘은 어떻게 지내세요?"],
        ["본인", "일요일마다 버스 타고 해운대 가서 바닷가를 한 시간쯤 걸어."],
        ["동반자", "바닷가를 걸으시면 어떠세요?"],
        ["본인", "파도 소리 들으면서 걸으면 속이 시원해."],
      ],
      places: ["부산 해운대"],
    },
  ] satisfies readonly EpisodeOf<EpisodeKeyB, SkeletonKeyB, PersonKeyB>[],

  lifeMemories: [
    {
      key: "LE_BIRTH",
      category: "BIRTH",
      eventTitle: "출생",
      eventYear: 1950,
      eventMonth: 9,
      content: "목포 온금동 바닷가 마을에서 4남매 중 둘째 딸로 태어났다.",
      isDraft: false,
      personKeys: [],
      places: ["전남 목포시 온금동"],
      day: 1,
    },
    {
      key: "LE_SEOUL",
      category: "WORK",
      eventTitle: "서울로 올라옴",
      eventYear: 1966,
      eventMonth: null,
      content:
        "열여섯 살에 사촌 언니 순옥이를 따라 서울에 올라와 구로 공장에 취직했다.",
      isDraft: false,
      personKeys: ["PS_SUNOK"],
      places: ["서울 구로"],
      day: 2,
    },
    {
      key: "LE_FIRST_SALARY",
      category: "WORK",
      eventTitle: "첫 월급",
      eventYear: 1966,
      eventMonth: null,
      content: "첫 월급을 받아 목포 집에 동생들 운동화를 사서 부쳤다.",
      isDraft: false,
      personKeys: [],
      places: [],
      day: 5,
    },
    {
      key: "LE_SINGER",
      category: null,
      eventTitle: "공장 라디오",
      eventYear: 1968,
      eventMonth: null,
      content:
        "공장 라디오에서 이미자의 '동백 아가씨'가 나오면 미싱을 돌리며 따라 불렀다. 그때부터 이미자 노래를 제일 좋아한다.",
      isDraft: false,
      personKeys: [],
      places: [],
      day: 4,
    },
    {
      key: "LE_MARRIAGE",
      category: "RELATIONSHIP",
      eventTitle: "결혼",
      eventYear: 1974,
      eventMonth: 4,
      content:
        "74년 봄 구로 예식장에서 결혼식을 올렸다. 그날 비가 많이 와서 하객들이 다 젖었다.",
      isDraft: false,
      personKeys: ["PS_SANGCHEOL"],
      places: ["서울 구로"],
      day: 6,
    },
    {
      key: "LE_DONGHYUN",
      category: "FAMILY",
      eventTitle: "아들 동현이 태어남",
      eventYear: 1975,
      eventMonth: 12,
      content:
        "75년 겨울 신림동 셋방에서 아들 동현이를 낳았다. 방이 추워서 밤새 연탄불을 지폈다.",
      isDraft: false,
      personKeys: ["PS_DONGHYUN"],
      places: [],
      day: 6,
    },
    {
      key: "LE_HUSBAND_NAMJIN",
      category: null,
      eventTitle: "남진 공연",
      eventYear: 1976,
      eventMonth: null,
      content:
        "남편이 좋아하는 남진 공연을 같이 보러 갔다. 남편은 남진 팬이지만 나는 그래도 이미자가 더 좋다.",
      isDraft: false,
      personKeys: ["PS_SANGCHEOL"],
      places: [],
      day: 6,
    },
    {
      key: "LE_EUNJU",
      category: "FAMILY",
      eventTitle: "딸 은주 태어남",
      eventYear: 1977,
      eventMonth: 7,
      content: "77년 여름 딸 은주를 낳았다. 산파를 불러 집에서 낳았다.",
      isDraft: false,
      personKeys: ["PS_EUNJU"],
      places: [],
      day: 6,
    },
    {
      key: "LE_MOVE_DONGRAE",
      category: null,
      eventTitle: "동래로 이사",
      eventYear: 1983,
      eventMonth: null,
      content:
        "83년 영도에서 동래로 이사하던 날 이삿짐 트럭이 고장 나서 리어카로 짐을 날랐다.",
      isDraft: false,
      personKeys: [],
      places: ["부산 동래"],
      day: 8,
    },
    {
      key: "LE_MOTHER_60",
      category: null,
      eventTitle: "어머니 환갑잔치",
      eventYear: 1985,
      eventMonth: null,
      content:
        "목포에서 어머니 환갑잔치를 했다. 4남매가 다 모여 어머니께 금반지를 해 드렸다.",
      isDraft: false,
      personKeys: [],
      places: ["전남 목포"],
      day: 3,
    },
    {
      key: "LE_CUCUMBER",
      category: null,
      eventTitle: "가게 김밥",
      eventYear: 1990,
      eventMonth: null,
      content:
        "오이는 냄새만 맡아도 싫어서 가게 김밥에도 오이 대신 시금치를 넣었다.",
      isDraft: false,
      personKeys: [],
      places: [],
      day: 9,
    },
    {
      key: "LE_SHOP_FLOOD",
      category: null,
      eventTitle: "태풍",
      eventYear: 1991,
      eventMonth: null,
      content: "91년 태풍 때 가게에 물이 들어와 사흘 동안 장사를 못 했다.",
      isDraft: false,
      personKeys: [],
      places: [],
      day: 9,
    },
    {
      key: "LE_DONGHYUN_ARMY",
      category: null,
      eventTitle: "동현이 입대",
      eventYear: 1995,
      eventMonth: null,
      content:
        "동현이가 군대 가던 날 부산역에서 기차가 떠날 때까지 손을 흔들었다.",
      isDraft: false,
      personKeys: ["PS_DONGHYUN"],
      places: ["부산역"],
      day: 10,
    },
    {
      // 동반자 대화 추출 초안(가족 검토 전). 원본에는 있지만 색인·인용되면 안 된다.
      key: "LE_DRAFT_THIEF",
      category: null,
      eventTitle: "분식집 도둑",
      eventYear: 1995,
      eventMonth: null,
      content: "분식집에 든 도둑을 남편과 함께 잡아 경찰에 넘겼다.",
      isDraft: true,
      personKeys: [],
      places: [],
      day: 10,
    },
    {
      key: "LE_EUNJU_WEDDING",
      category: null,
      eventTitle: "은주 결혼",
      eventYear: 2004,
      eventMonth: null,
      content:
        "은주가 해운대 예식장에서 결혼했다. 식장에서 은주가 직접 노래를 불렀다.",
      isDraft: false,
      personKeys: ["PS_EUNJU"],
      places: ["부산 해운대"],
      day: 10,
    },
    {
      key: "LE_HUSBAND_RETIRE",
      category: null,
      eventTitle: "남편 정년퇴직",
      eventYear: 2006,
      eventMonth: null,
      content:
        "남편이 30년 넘게 몰던 시내버스 운전을 마치고 정년퇴직했다. 퇴직하던 날 가게에서 국수를 말아 주었다.",
      isDraft: false,
      personKeys: ["PS_SANGCHEOL"],
      places: [],
      day: 10,
    },
    {
      key: "LE_GRANDCHILD",
      category: "FAMILY",
      eventTitle: "첫 손주 지호 태어남",
      eventYear: 2008,
      eventMonth: null,
      content:
        "첫 손주 지호가 태어났다. 동현이 아들이다. 서울 병원까지 올라가 처음 안아 보았다.",
      isDraft: false,
      personKeys: ["PS_JIHO"],
      places: [],
      day: 11,
    },
    {
      key: "LE_REUNION",
      category: null,
      eventTitle: "국민학교 동창회",
      eventYear: 2009,
      eventMonth: null,
      content:
        "목포에서 갈매국민학교 동창회가 열려 영수를 40여 년 만에 다시 만났다.",
      isDraft: false,
      personKeys: ["PS_YEONGSU"],
      places: ["전남 목포"],
      day: 3,
    },
    {
      key: "LE_GRANDCHILD2",
      category: "FAMILY",
      eventTitle: "손녀 서연이 태어남",
      eventYear: 2010,
      eventMonth: null,
      content: "은주 딸 서연이가 태어났다. 둘째 손주다.",
      isDraft: false,
      personKeys: ["PS_SEOYEON"],
      places: [],
      day: 11,
    },
    {
      key: "LE_KNIT_CLASS",
      category: null,
      eventTitle: "뜨개질 교실",
      eventYear: 2011,
      eventMonth: null,
      content:
        "복지관 뜨개질 교실에 매주 화요일마다 다녔다. 뜨개질을 하고 있으면 시간 가는 줄 모른다.",
      isDraft: false,
      personKeys: [],
      places: [],
      day: 11,
    },
    {
      key: "LE_GURO_VISIT",
      category: null,
      eventTitle: "동현이네 아파트",
      eventYear: 2012,
      eventMonth: null,
      content:
        "구로에 있는 동현이네 아파트에 다녀왔다. 동네가 몰라보게 변해서 길을 잃을 뻔했다.",
      isDraft: false,
      personKeys: ["PS_DONGHYUN"],
      places: ["서울 구로"],
      day: 12,
    },
    {
      key: "LE_CUCUMBER2",
      category: null,
      eventTitle: "오이소박이",
      eventYear: 2013,
      eventMonth: null,
      content:
        "며느리가 오이소박이를 담가 왔는데 오이를 못 먹어서 손도 대지 않았다.",
      isDraft: false,
      personKeys: [],
      places: [],
      day: 12,
    },
    {
      key: "LE_TAEJONGDAE",
      category: null,
      eventTitle: "태종대 유람선",
      eventYear: 2015,
      eventMonth: null,
      content:
        "손주들을 데리고 태종대 유람선을 탔다가 뱃멀미를 심하게 했다. 바닷가를 걷는 건 좋아도 배는 역시 질색이다.",
      isDraft: false,
      personKeys: [],
      places: ["부산 태종대"],
      day: 12,
    },
    {
      key: "LE_KNEE",
      category: null,
      eventTitle: "무릎 수술",
      eventYear: 2016,
      eventMonth: null,
      content: "무릎 수술을 받고 석 달 동안 아침 산책을 하지 못했다.",
      isDraft: false,
      personKeys: [],
      places: [],
      day: 12,
    },
    {
      key: "LE_MOKPO_TRIP",
      category: null,
      eventTitle: "고향 방문",
      eventYear: 2017,
      eventMonth: null,
      content:
        "고향 목포에 내려가 유달산에 올랐다. 어릴 때 살던 집 자리는 주차장이 되어 있었다.",
      isDraft: false,
      personKeys: [],
      places: ["전남 목포 유달산"],
      day: 12,
    },
    {
      key: "LE_KNIT_GIFT",
      category: null,
      eventTitle: "경로당 목도리",
      eventYear: 2019,
      eventMonth: null,
      content: "겨울을 앞두고 경로당 할머니들 목도리를 열 개 떠서 나눠 드렸다.",
      isDraft: false,
      personKeys: [],
      places: [],
      day: 12,
    },
  ] satisfies readonly LifeMemoryOf<LifeMemoryKeyB, PersonKeyB>[],

  eraMemories: [
    {
      key: "ERA_COLORTV",
      monthEventTitle: "컬러TV 방송 시작",
      monthEventYear: 1980,
      content:
        "컬러 방송이 시작됐을 때 우리 집은 흑백텔레비전이라 옆집 옥자네 가서 컬러 화면을 구경했다.",
      day: 7,
    },
    {
      key: "ERA_OLYMPIC",
      monthEventTitle: "서울올림픽",
      monthEventYear: 1988,
      content:
        "올림픽 때 분식집에 텔레비전을 들여놓고 손님들과 같이 개막식을 봤다.",
      day: 9,
    },
    {
      key: "ERA_IMF",
      monthEventTitle: "IMF 외환위기",
      monthEventYear: 1997,
      content:
        "IMF 때는 분식집 손님이 반으로 줄었지만 국수 값을 올리지 않고 버텼다.",
      day: 10,
    },
    {
      key: "ERA_BUSAN_ASIAD",
      monthEventTitle: "부산 아시안게임",
      monthEventYear: 2002,
      content:
        "부산 아시안게임 때 가게 앞에 태극기를 걸고 손님들과 경기를 봤다.",
      day: 10,
    },
    {
      key: "ERA_PYEONGCHANG",
      monthEventTitle: "평창 동계올림픽",
      monthEventYear: 2018,
      content:
        "평창 올림픽 때 손주 지호랑 컬링 경기를 보면서 같이 소리를 질렀다.",
      day: 12,
    },
  ] satisfies readonly EraMemoryOf<EraMemoryKeyB>[],

  photoMemories: [
    {
      key: "PH_WEDDING",
      year: 1974,
      month: 4,
      caption:
        "결혼식 날 구로 예식장 앞에서 찍은 사진. 비가 와서 남편이 우산을 받쳐 들고 있다.",
      personKeys: ["PS_SANGCHEOL"],
      place: "서울 구로",
      day: 6,
    },
    {
      key: "PH_YEONGDO",
      year: 1981,
      month: null,
      caption: "영도 셋방 앞에서 동현이, 은주와 찍은 사진. 뒤로 바다가 보인다.",
      personKeys: ["PS_DONGHYUN", "PS_EUNJU"],
      place: "부산 영도",
      day: 7,
    },
    {
      key: "PH_SHOP",
      year: 1989,
      month: null,
      caption: "말순분식 간판 아래에서 남편과 찍은 사진.",
      personKeys: ["PS_SANGCHEOL"],
      place: "부산 동래",
      day: 9,
    },
    {
      key: "PH_REUNION",
      year: 2009,
      month: null,
      caption: "갈매국민학교 동창회 단체 사진. 둘째 줄 왼쪽에 영수가 서 있다.",
      personKeys: ["PS_YEONGSU"],
      place: "전남 목포",
      day: 3,
    },
    {
      key: "PH_JIHO",
      year: 2009,
      month: null,
      caption: "지호 돌잔치 사진. 동현이가 지호를 안고 있다.",
      personKeys: ["PS_JIHO", "PS_DONGHYUN"],
      place: null,
      day: 11,
    },
    {
      key: "PH_TAEJONGDAE",
      year: 2015,
      month: null,
      caption:
        "태종대 유람선 선착장에서 손주들과 찍은 사진. 배에서 내린 뒤라 얼굴이 하얗게 질려 있다.",
      personKeys: ["PS_JIHO", "PS_SEOYEON"],
      place: "부산 태종대",
      day: 12,
    },
  ] satisfies readonly PhotoMemoryOf<PhotoKeyB, PersonKeyB>[],

  people: [
    {
      key: "PS_SANGCHEOL",
      name: "상철",
      relation: "남편",
      category: "가족",
      birthYear: 1946,
      metYear: null,
      memo: "무뚝뚝하지만 정이 많다. 시내버스를 30년 넘게 몰았다.",
      day: 6,
      skeletonLinks: ["SK_MARRIAGE"],
      memoryLinks: ["LE_MARRIAGE", "LE_HUSBAND_NAMJIN", "LE_HUSBAND_RETIRE"],
    },
    {
      key: "PS_DONGHYUN",
      name: "동현",
      relation: "아들",
      category: "가족",
      birthYear: 1975,
      metYear: null,
      memo: "서울 구로에서 회사에 다닌다. 지호 아빠다.",
      day: 6,
      skeletonLinks: [],
      memoryLinks: ["LE_DONGHYUN", "LE_DONGHYUN_ARMY", "LE_GURO_VISIT"],
    },
    {
      key: "PS_EUNJU",
      name: "은주",
      relation: "딸",
      category: "가족",
      birthYear: 1977,
      metYear: null,
      memo: "부산 해운대에 산다. 어릴 때부터 노래를 잘했다.",
      day: 6,
      skeletonLinks: [],
      memoryLinks: ["LE_EUNJU", "LE_EUNJU_WEDDING"],
    },
    {
      key: "PS_YEONGSU",
      name: "영수",
      relation: "국민학교 동무",
      category: "친구",
      birthYear: null,
      metYear: 1957,
      memo: "갈매국민학교 동무. 같이 갯벌에서 조개를 캤다.",
      day: 2,
      skeletonLinks: ["SK_ELEM"],
      memoryLinks: ["LE_REUNION"],
    },
    {
      key: "PS_YEONGSUK",
      name: "영숙",
      relation: "공장 동료",
      category: "친구",
      birthYear: null,
      metYear: 1966,
      memo: "구로 대성봉제에서 같이 일했다. 일요일마다 같이 극장에 다녔다.",
      day: 4,
      skeletonLinks: ["SK_FIRST_JOB"],
      memoryLinks: [],
    },
    {
      key: "PS_YEONGSU_OPPA",
      name: "영수 오빠",
      relation: "사촌 오빠",
      category: "가족",
      birthYear: 1944,
      metYear: null,
      memo: "큰아버지 아들. 부산 영도에 먼저 자리를 잡고 우리 셋방을 구해 주었다.",
      day: 7,
      skeletonLinks: ["SK_BUSAN_MOVE"],
      memoryLinks: [],
    },
    {
      key: "PS_SUNOK",
      name: "순옥",
      relation: "사촌 언니",
      category: "가족",
      birthYear: 1946,
      metYear: null,
      memo: "큰이모 딸. 지금은 인천에 산다.",
      day: 2,
      skeletonLinks: [],
      memoryLinks: ["LE_SEOUL"],
    },
    {
      key: "PS_OKJA",
      name: "옥자",
      relation: "영도 이웃",
      category: "이웃",
      birthYear: null,
      metYear: 1979,
      memo: "영도 셋방 시절 옆집에 살았다. 아침마다 같이 바닷가를 걸었다.",
      day: 7,
      skeletonLinks: ["SK_BUSAN_MOVE"],
      memoryLinks: [],
    },
    {
      // memo 의 당뇨 언급 = 타인 민감정보. 카드·답변에 나오면 안 된다.
      key: "PS_MYEONGJA",
      name: "명자",
      relation: "막내 시누이",
      category: "가족",
      birthYear: 1955,
      metYear: null,
      memo: "광주에서 미용실을 한다. 당뇨가 있어서 늘 단 것을 조심한다.",
      day: 8,
      skeletonLinks: [],
      memoryLinks: [],
    },
    {
      key: "PS_JIHO",
      name: "지호",
      relation: "첫 손주",
      category: "가족",
      birthYear: 2008,
      metYear: null,
      memo: "동현이 아들. 할머니가 떠 준 조끼를 제일 좋아한다.",
      day: 11,
      skeletonLinks: [],
      memoryLinks: ["LE_GRANDCHILD"],
    },
    {
      key: "PS_SEOYEON",
      name: "서연",
      relation: "손녀",
      category: "가족",
      birthYear: 2010,
      metYear: null,
      memo: null,
      day: 11,
      skeletonLinks: [],
      memoryLinks: ["LE_GRANDCHILD2"],
    },
    {
      key: "PS_CHEOLHO",
      name: "철호",
      relation: "남동생",
      category: "가족",
      birthYear: 1953,
      metYear: null,
      memo: "목포에서 아버지 배를 물려받아 고기잡이를 한다.",
      day: 3,
      skeletonLinks: [],
      memoryLinks: [],
    },
  ] satisfies readonly PersonOf<PersonKeyB, SkeletonKeyB, LifeMemoryKeyB>[],

  // LifeProfile + User.userPreferences (둘 다 1일차, 한 PROFILE 원본으로 묶임).
  profile: {
    interests: ["뜨개질", "옛날 노래", "바닷가 산책"],
    schools: ["갈매국민학교", "해송여자중학교"],
    residences: ["전남 목포", "서울 신림동", "부산 영도", "부산 동래"],
    parentsInfo: "아버지는 고깃배를 타셨고 어머니는 시장에서 생선을 파셨다.",
    siblings: "4남매 중 둘째. 위로 언니, 아래로 남동생 둘.",
    closeFriends: "영수, 영숙, 옥자",
    hobbies: "뜨개질, 바닷가 산책",
    favMovies: [],
    favGames: [],
    favMusic: ["이미자"],
    userPreferences: ["바다", "뜨개질"],
    day: 1,
  },
} as const;
