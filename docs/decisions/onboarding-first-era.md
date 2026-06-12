# 결정 — 온보딩 첫 사건 카드 (가입 직후 첫 회상 유도)

2026-06-13. 신규 화면·스키마 변경 0으로 빈 타임라인 첫 이탈을 줄인다.

## Problem

가입·온보딩에서 출생연도만 답한 신규 유저가 `/life-timeline` 에 오면
타임라인에 출생 점 하나뿐 — 사실상 빈 화면이라 "뭘 해야 하지" 하고
이탈한다. 출생연도라는 단서가 이미 있으니, "그 시절 누구나 아는 큰 사건"
하나를 제시해 첫 회상 1건을 유도하면 첫 이탈을 줄일 수 있다.

### 설계 단계에서 잡은 모순

기획의 분기 조건은 "출생연도 有 + 이벤트 0건" 이었으나, `getBirthYear`
는 `UserMemory(createdVia="life_event", category="BIRTH")` 행에서 읽는다
(별도 User.birthYear 컬럼 없음). 즉 **출생연도가 있다 = BIRTH 이벤트가
1건 있다** → "이벤트 0건" 과 양립 불가. 구현 전 계획 단계에서 발견해
조건을 **"BIRTH 외 이벤트 0건"** 으로 재정의했다.

## Action

### 결정 1 — 조건: birthYear 有 + BIRTH 외 이벤트 0건

```
nonBirth = events.filter(e => !(e.kind === "life_event" && e.category === "BIRTH"))
showFirstEra = birthYear != null && nonBirth.length === 0 && firstEraEvent != null
```
출생연도만 답한 상태(출생 점 하나)를 정확히 잡는다. era_event 를 1건
저장하면 nonBirth 가 1 → 분기가 꺼져 카드가 자연 소멸한다.

### 결정 2 — 사건 선택: birthYear+20, POLITICS_SOCIETY VERIFIED, closest

`pickOnboardingEraEvent(birthYear, sections=["POLITICS_SOCIETY"])` —
`target = birthYear + 20`(회상 융기 정점 = 청년기, 가장 생생), POLITICS_
SOCIETY + VERIFIED 후보(37건, 1980~2018 거의 매년) 중 연도가 target 에
가장 가까운 1건. 동률은 연도 asc → id asc 로 결정적(새로고침해도 동일).
closest-match 라 target 이 범위를 벗어나도 자동 흡수(1976→1980, 2024→
2018) — clamp 불필요. POLITICS_SOCIETY VERIFIED 한정 = 100% 인지(앵커
정신). **sections 파라미터화** 로 v2(2002 월드컵 등 SPORTS 앵커) 확장
여지를 열어 둠.

검증: 1956→광주(만24) / 1970→김영삼당선(만22) / 1980→김대중노벨평화상
(만20) / 1990→천안함(만20) / 2000→북미정상회담(만18) — 전 연령 자연 커버.

### 결정 3 — 저장 흐름: "저장 시 생성" (stash-on-save)

EraMemoryEditor 는 이미 stash 된 era_event 에만 동작(`saveEraMemory` 가
미stash 면 not_stashed). 첫 사건은 미stash 라 두 방식 중:
- **A 저장 시 생성(채택)** — 회상 저장 시 `stashEraEvent`(idempotent) +
  `saveEraMemory` 를 묶은 결합 액션. 안 쓰고 떠나면 아무것도 안 남는다.
- B 사전 stash — 카드 노출 시 미리 담음. 안 써도 빈 시대 배경 카드가
  남고 RSC 렌더 중 부수효과 → 비채택.

A 가 "저장 시 첫 기록 생성" 의미에 정확. `stashAndSaveFirstEraMemory
Action` 의 시그니처를 `saveEraMemoryAction` 과 동일하게 맞춰,
EraMemoryEditor 에 **optional `saveAction` prop**(default=현행)으로 주입.
기존 호출자(/era·EraCard) 무영향.

### 결정 4 — 닫기: localStorage 기기-로컬

"나중에 할게요" 는 강제 아님 — 닫으면 빈 타임라인 + 기존 "+ 인생의 한
장면" 폴백. 표시는 **localStorage 기기-로컬**. 스키마 변경 0 제약상 서버
컬럼 불가하고, `onboardingCompletedAt` 재사용은 WelcomeCard 의미와
충돌(다른 상태를 한 필드가 표현)해 배제. 어차피 기록 1건 생기면 자동
소멸하므로 서버 영속 표시는 과하다. 새 기기 재노출은 가벼운 넛지라 무방.

### 결정 5 — 중복 노출 금지

첫 사건 카드 > WelcomeCard > V3 배너 택1. `showWelcome = !showFirstEra
&& …`. 실제로 showFirstEra 면 BIRTH 이벤트가 있어 hasEvents=true →
WelcomeCard 는 원래 안 뜨지만, 명시 가드로 의도를 못박음.

## Result

- 스키마 0, 마이그 0. 신규 라우트 0(/life-timeline 카드 1개).
- 재사용: `stashEraEvent`·`saveEraMemory`·EraMemoryEditor·MonthEvent·
  `getBirthYear` 전부 기존. 신규 = 헬퍼 1·결합 액션 1·카드 1·prop 1.
- tsc 0, build 성공(client/server 경계 클린), 2시나리오 + 선택 5종 +
  회귀(era-stash 17·life-events 7) 0.

### 트레이드오프

- localStorage 닫기는 기기-로컬 → 새 기기 재노출. 영속 닫기를 원하면
  스키마(컬럼) 필요 — 지금은 자동 소멸로 충분해 미도입.
- POLITICS_SOCIETY 한정은 강력한 SPORTS/문화 앵커(월드컵)를 놓침 —
  sections 파라미터로 v2 확장 여지만 열어 둠.

### 일반화된 학습

1. **파생값은 그 원천 데이터의 존재를 함의한다** — "birthYear 有 + 이벤트
   0" 모순처럼, 폴리모픽 테이블에서 파생 헬퍼(getBirthYear)가 곧 행의
   존재를 뜻해 조건이 자기모순일 수 있다. 계획 단계 검증이 구현 낭비를 막음.
2. **컴포넌트 재사용의 제약은 주입점으로 흡수** — EraMemoryEditor 를
   고치는 대신 optional 액션 prop 하나로 stash-on-save 변종을 끼웠다.
3. **"저장 시 생성" 은 순서로 보장** — 사전 stash 대신 저장 결합으로,
   안 쓰면 안 남는 깨끗한 상태를 만든다.
