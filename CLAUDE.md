# CLAUDE.md — 프로젝트 컨텍스트

> 이 파일은 Claude Code가 항상 읽는 프로젝트 개요다. 상세 작업 지시는 `docs/phaseN.md`에 있다.
> 작업할 때는 **현재 진행 중인 phase 문서를 함께 열어** 그 안의 태스크를 하나씩 수행한다.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

---

## 프로젝트: Lifebook (라이프북)

개인의 인생 연혁표를 AI와 함께 채워나가는 **회고 서비스**.
시대의 큰 사건을 단서로 흐릿한 개인 기억을 되살려, 가족·배우자와 함께 떠들게 한다.

**북극성 (모든 판단 기준)**

> 시대의 큰 사건을 단서 삼아 흐릿한 개인 기억을 되살리고, 그것을 가족과 함께 떠들 수 있게 한다.

- **메인 시나리오**: 가족·배우자와 함께 떠드는 도구 (단, 혼자 해도 충분히 재미있어야 함)
- **핵심 타깃**: 30대 이상 전 연령, 특히 추억의 가치가 큰 고령층 → **시니어 접근성**(큰 글씨·고대비·단순한 동선)을 UX 기본 원칙으로 둔다.

---

## 핵심 컨셉 — 이벤트 두 종류

| 구분   | 앵커(Anchor)                      | 트리거(Trigger)               |
| ------ | --------------------------------- | ----------------------------- |
| 정의   | 누구나 아는 시대적 사건           | 관심사 기반 개인화 사건       |
| 예시   | IMF, 9.11, 박근혜 탄핵, 코로나    | 특정 게임/영화/노래           |
| 정확성 | **100% 보장 필수** (수동 검증 DB) | 질문형으로 던져 사용자가 확정 |
| `tier` | `verified`                        | `suggested`                   |

**원칙: AI는 사건을 창작하지 않는다.** 검증된 DB에서 끌어와 고르고 말투만 입히는 RAG 역할만 수행한다.

---

## 기술 스택 (확정)

- **풀스택**: Next.js 16 (App Router) + TypeScript + Tailwind CSS + Turbopack
- **DB**: PostgreSQL + pgvector (이벤트 임베딩 → 트리거 검색)
- **ORM**: Prisma
- **AI**: Anthropic Claude API
- **인증**: Auth.js (이메일 + 소셜 1종)
- **결제**: 국내 PG (초기엔 mock)
- **로컬 DB**: Docker (`pgvector/pgvector` 이미지)

---

## 폴더 구조 (목표)

```
app/                       # Next.js 라우트 (App Router)
components/                # UI 컴포넌트
lib/                       # 공용 로직 (db, ai, auth wrapper 등)
db/                        # 시드 데이터·스크립트
prisma/                    # schema.prisma, migrations/
phase/                     # phase0.md, phase1.md ... (작업 지시)
docs/
  daily/                   # 일자별 작업 로그
  decisions/               # 기술 결정 (PAR 구조)
  troubleshooting/         # 문제 해결 기록
  par-materials.md         # 이력서 PAR 소재 모음
auth.config.ts / auth.ts   # Auth.js v5 (Edge / Node)
proxy.ts                   # Next 16 라우트 보호 미들웨어
```

---

## 작업 규칙 (Claude Code)

1. **한 번에 하나의 태스크만** 수행한다 (현재 phase 문서의 `[ ]` 항목).
2. 태스크 완료 시: ① 동작 확인 → ② 의미 단위 커밋 → ③ 해당 phase 문서 체크박스 체크.
3. 데이터/스키마를 먼저, UI는 점진적으로 올린다.
4. 외부 연동(API·결제)에서 막히면 **mock으로 우회**하고 진도부터 뺀다.
5. 동의/개인정보 흐름은 가짜 데이터로라도 처음부터 넣는다 (솔로=비공개 기본).
6. 스키마 변경은 전체에 영향 → 신중히, 변경 시 마이그레이션 동반.

---

## Phase 개요

각 phase는 `phase/phaseN.md`에 상세 태스크가 있다. 일일 작업 로그는 `docs/daily/`, 기술 결정·트러블슈팅은 `docs/decisions/`·`docs/troubleshooting/`.

| Phase    | 목표                                                       | 문서                                | 상태                              |
| -------- | ---------------------------------------------------------- | ----------------------------------- | --------------------------------- |
| 0        | 프로젝트 셋업 (Next.js + Postgres/pgvector + Prisma)       | `phase/phase0.md`                   | ✅ 완료                           |
| 1        | 데이터 모델 정의 + 앵커 이벤트 시드                        | `phase/phase1.md`                   | ✅ 완료                           |
| 2        | 타임라인 정적 렌더 — **첫 보이는 화면**                    | `phase/phase2.md`                   | ✅ 완료                           |
| 3        | 인증 + 개인정보·국외이전 동의 게이트                       | `phase/phase3.md`                   | ✅ 완료                           |
| 4        | 온보딩 (생애 정보 수집, 대화형)                            | `phase/phase4.md`                   | ✅ 완료                           |
| 5        | 타임라인 개인화 (출생연도 기반)                            | `phase/phase5.md`                   | ✅ 완료 (타임머신으로 대체 예정) |
| 6        | 트리거 이벤트 + RAG (음악, Voyage)                         | `phase/phase6.md`                   | ✅ 완료 (타임머신으로 대체 예정) |
| 7        | AI 대화로 추억 채우기 (Claude + 음성)                      | `phase/phase7.md`                   | ✅ 완료                           |
| 8        | 토큰 결제 (토스 테스트) → **MVP 완성** (`mvp-v1`)          | `phase/phase8.md`                   | ✅ 완료                           |
| 9        | 가족 공유 모드 — 룸/초대/공유 타임라인/공동 추억           | `phase/phase9.md`                   | ✅ 완료                           |
| 9.5      | 음악 재생 (YouTube 검색 링크)                              | `phase/phase9.5.md`                 | ✅ 완료                           |
| **T1~T6** | **타임머신 v1 — 한 달씩 거꾸로 시간여행 (사건 펼쳐보기)** | `phase/타임머신_구현_기획_phase.md` | ✅ 완료 (v2 로 전환, 코드 보존)       |
| **V1~V4** | **타임머신 v2 — 빈 기억칸 + AI 비서 + 답 깊이 선택** | `phase/타임머신_v2_AI비서_기획.md` | ✅ V1(백엔드)·V2(UI)·V3(멀티턴+저장)·V4(깊이) 완료 |
| **A**     | **출석체크 + 사이드 패널 (동기부여 + 접근성)** | (5-28 일지)                        | ✅ 완료                           |
| **M①②**   | **동기부여 핵심 루프 — ① 쌓이는 재미(진척) + ② 가족 반응(스탬프·알림)** | `phase/동기부여_핵심루프_기획.md`   | ✅ ①② 완료 (③④⑤ 후순위)          |
| **L1~L7** | **v3 인생 연혁 피벗 — 매달 빈 칸 부담 → 가로 시간축의 큰 줄기** | `phase/인생연혁_기획.md`            | ✅ 완료 (v2 코드 전체 보존)       |
| **v3.0+~v3.5** | **v3 사용성 시리즈 — 건너뛰기·기간·나이·카테고리 개편·세로축·빈공간 클릭·글로벌 위젯·토큰 통합** | (`2026-06-03` 일지)            | ✅ 완료                           |
| **P1~P3 + Place** | **인물(Person) 3단계 + 장소 매칭(데이터·API·UI·지도 타일) + 모든 카테고리 장소 확장 + v3 진단 H/M 11항목 픽스** | (`2026-06-04` 일지) | ✅ 완료 (룸·반응·진척 0줄 영향)   |
| 10       | 출력물 서비스 (PDF/포토북 배송)                            | (예정)                              | ▶ 다음                            |
| 11       | 앱 출시 · 커뮤니티 기여 · 광고                             | (예정)                              |                                   |

**타임머신 v1 (T1~T6)**:
- T1 데이터 모델 (`MonthEvent` + `ChartSong` + 4 enum) + 기간 노출 SQL
- T2 시드 (2025.6~2026.5 12개월 — 사건 46건 + 음악 128건). H1 픽스 후 deterministic id 로 시드 재실행 안전
- T3 월 화면 (`/timemachine/[year]/[month]`) + EventItem 3-state + MonthStory + 양방향 네비
- T4 음성→AI 다듬기 (`lib/voice-cleanup.ts` + `chargeOneShot`) — RAG 가드 + H2 픽스 후 빈/동일 응답 차감 0
- T5 음악 카드 (이미지 0, `eraColor` palette, 유튜브 검색 링크)
- T6 UserMemory 통합 (한 달 = N+1 행, 가족 공유 자동 연결)

**타임머신 v2 (V1~V4)** — 정보 push→pull 피벗:
- V1 비서 백엔드 (`lib/timemachine-assistant.ts` + `/api/timemachine/assistant`) — 위험도 기반 라우팅(BIG/MUSIC=DB 우선 무료, TASTE=웹 검색 차감), Claude `web_search_20250305` + 가드 프롬프트, `chargeOneShot.surcharge` 가산
- V2 비서 UI (`AssistantPanel` + `MonthV2`) — 좌(기억칸=MonthStory 승격)/우(비서) 2단 + 칩 5개 + 출처 + "내 타임라인 추가". 기존 `EventItem`/`MonthForm` 코드 보존, 화면에서만 빠짐
- V3 멀티턴 대화 + 답변 저장 — `askAssistant(prior?)`, 컨텍스트 답 우선 (검색 없이 1토큰), `[SEARCH]` sentinel 폴백, `createdVia=timemachine_assistant` UserMemory 저장 + 탭 토글. `refundTokens` 헬퍼로 컨텍스트 미스 후 검색 실패 시 환불
- V4 답의 깊이 3단 — "간단히/자세히/가장 정확하게" (Haiku/Sonnet/Opus, 모델 이름 노출 X). `MODEL_MULTIPLIER` (1/3/5) × `tokensFromUsage` + `WEB_SEARCH_SURCHARGE` 로 차등 차감. Haiku=multiplier 1 → 기존 회귀 0. Opus 4.7 `temperature` 거부는 `supportsTemperature` 가드. ledger reason 에 depth suffix.

**출석 + 사이드 패널 (Phase A)** — 동기부여 + 접근성:
- 출석체크 (`UserAttendance` 모델 + `processAttendance`) — 매일 5토큰 + 7배수 streak 마다 +30 보너스. `@@unique([userId, date])` + P2002 catch 로 race-safe. KST 처리는 `+9h.toISOString().slice(0,10)` (라이브러리 의존 0). 끊김 표현 0 (시니어 친화)
- `AttendanceCard` 시각 — 동그라미 7개 진행도(✓ + 숫자), 보상 표, 보너스 예고 버튼. 사이드 패널 미니: 16px 작은 동그라미 + N/7
- 사이드 패널 (`app/timemachine/layout.tsx` + `SidePanelLayout` client) — 프로필·잔액·충전·출석미니·메뉴(이번달/내기록/가족룸/회원정보/설정)·로그아웃. 데스크톱 fixed right `lg:pr-80`, 모바일 overlay + 햄버거. `localStorage` 상태 기억(첫 방문=열림). `/timemachine` 메인을 redirect→실제 콘텐츠로 변경

**v3 인생 연혁 피벗 (L1~L7)** — 기획 `phase/인생연혁_기획.md`:
- L1 데이터 모델 — 새 모델 0. `UserMemory` 에 `createdVia="life_event"` + 5 컬럼 (`eventTitle`, `eventYear`, `eventMonth`, `precision`, `category`) **모두 nullable**. `LifeCategory` (BIRTH/CHILDHOOD/SCHOOL/MILITARY/WORK/RELATIONSHIP/FAMILY/RESIDENCE/OTHER 9종) + `EventPrecision` (EXACT/APPROXIMATE). `year/month/title` 미러링 약속으로 룸·반응·진척 코드 0줄 자동 호환
- L2 초기 질문 폼 (`/life-record`) — 9 카테고리 한 번에 한 화면, 큰 글씨, 모두 건너뛰기 가능. `lib/life-record/questions.ts` + `nextUnansweredCategory(answered)`. `upsertLifeEvent` 카테고리당 최신 1행, L4 자유 추가 행 보존
- L3 가로 시간축 (`/life-timeline`) — `TimelineView` SVG + 점. 앵커=진한 큰 점, 사이=작은 점/약한 색. 점 클릭→`/timemachine/[year]/[month]` (month null→APPROX_DEFAULT_MONTH=6). 정렬: year ASC → month NULLS LAST → createdAt ASC. 빈 상태 = 압박 0 초대 (🌱 + violet 버튼)
- L4 자유 추가/수정/삭제 — `/life-timeline/add`·`/manage`·`/[eventId]`. `createLifeEvent`/`updateLifeEvent`/`deleteLifeEvent` 모두 `userId + createdVia="life_event"` 강제, deleteMany/updateMany 로 일치 없으면 count=0. EXACT/APPROXIMATE 자동 결정 + 명시 EXACT인데 month null → APPROXIMATE 다운그레이드
- L5 메인 재배치 — `/timemachine` 메인 → `/life-timeline` redirect 한 줄. `lib/side-panel-data.ts` 추출로 사이드 패널 양쪽 layout 공유. 사이드 메뉴 정리("내 인생 연혁" top, "이번 달 타임머신", "내 기록" 제거). `V3WelcomeBanner` (localStorage 만). 보조 섹션 = "오늘의 한 걸음" (가족 소식 0건 숨김 + 출석 + 진척)
- L6 AI 비서 모달 — 기존 v2 `AssistantPanel` **무수정** 재사용. `AssistantModal` 이 우측 상단 버튼 + 중앙 모달로 임베드. 맥락 = 가장 최근 life_event `(eventYear, eventMonth ?? 6)`, 0 개면 LATEST 폴백. fallbackLabel 로 답 기준 시기 명시. "타임라인 추가" → `/life-timeline/add` push (v2 keptEvents 의미 X). 저장된 답 prefetch (`listAssistantAnswers`)
- L7 첫 진입 흐름 — **`/enter` 분기 전용 server component** (`signIn.redirectTo` + 동의 완료 redirect). 3 분기: (1) 인생 이벤트 ≥ 1 → `/life-timeline` (2) 인생 이벤트 0 + 다른 UserMemory ≥ 1 (v2 기존) → `/life-timeline` (EmptyState 권유) (3) 둘 다 0 → `/life-record?new=1` (환영 배너). `hasAnyUserMemory(userId)` findFirst 1회. **메인엔 게이트 0** — 사이드 패널 자유 이동 보존. 환영 배너는 서버 `searchParams` 만으로 (새 DB/localStorage/client 0)

**v3 사용성 시리즈 (v3.0+ ~ v3.5)** — L1~L7 통합 테스트 후 발견한 결함·UX 정리. 새 모델 0 정책 계승, 마이그레이션 2건:
- v3.0+ 건너뛰기·기간·나이 — `User.skippedLifeCategories LifeCategory[]` + `UserMemory.endYear Int?` (mig 1). `lib/age.ts` 신규 (`calcAge`/`formatAge`/`calcSchoolYears`/`schoolYearsForCategory`). `nextUnansweredCategory(answered, skipped)` 시그니처 확장 (답함 ∪ 건너뜀). `upsertLifeEvent` 답 저장 시 자동 unmarkSkipped. 인덱스 카드: 답함(emerald)≠건너뜀(zinc 담담)≠아직 (X 표시·rose 금지). 기간 카테고리 폼에 "끝난 해(선택)" + 연도 옆 작은 나이 표시. 학령 카테고리에 amber aside (역계산 힌트). 시각화에서 `expandPeriods` 가 endYear 행을 두 점으로 split(같은 메모리 id 공유 → 룸·반응 한 단위)
- v3.1 카테고리 개편 (10개) — `SCHOOL`→`ELEMENTARY/MIDDLE/HIGH/UNIVERSITY` 4분할, `CHILDHOOD`→`KINDERGARTEN`, `RESIDENCE/OTHER` 삭제. 마이그레이션 2 (`20260602230155_v3_categories_overhaul`) 수동 SQL — Postgres 가 `ALTER TYPE DROP VALUE` 지원 X 라 enum 재생성 패턴. 트러블슈팅: `ALTER COLUMN USING ARRAY(SELECT ... unnest)` 가 `cannot use subquery in transform expression` → `"col"::text[]::"new"[]` 직접 캐스트로 우회. 매핑 정책 (사용자 결정): CHILDHOOD→KINDERGARTEN, SCHOOL→ELEMENTARY 의미 매핑, RESIDENCE/OTHER 행 삭제. `PERIOD_CATEGORIES` = 학령기 5 + MILITARY + WORK
- v3.2 세로 타임라인 — 가로축 라벨 겹침 해소. 데스크톱(sm+) 중앙 세로선 + 좌우 교차 카드, 모바일 왼쪽 선 + 우측 카드. `computePeriodFlags` 가 시작 행 bottomHalf + 끝 행 topHalf + 중간 행 both 로 amber-500 강조 — 기간 안에 다른 이벤트가 끼어도 시선 끊김 0. 라벨에 `(만 N세)` 곁들임
- v3.3 빈 공간 클릭으로 추가 — `LineClickArea` 클라이언트(선 ±20px 폭) onClick → 연도 추정(선형 보간) → `/life-timeline/add?year=YYYY&hint=1`. 각 점 옆 amber `+` 버튼 (h-10 w-10) — 데스크톱 `group-hover` + `group-focus-within`, 모바일 항상. pointer-events 분리: ol/li=none, 점·카드·+버튼=auto → 빈 영역만 통과. `EventForm.defaultYear` prop + `searchParams.year` 검증 + `hint=1` amber aside 안내
- v3.4 글로벌 AI 비서 위젯 — `AssistantModal` 에 `variant?: "inline" \| "floating"` prop 추가 (모달 본문 0줄 수정). `AssistantWidget` server component (`auth()` 후 비인증이면 null, 인증되면 컨텍스트 fetch + floating 렌더). root layout `{children}` 뒤에 마운트. `fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full bg-violet-600` 64×64 둥근 버튼. 사이드 패널 일부 겹침 알려진 trade-off
- v3.5 토큰·출석 통합 페이지 — 새 `/account/tokens` 페이지에 큰 잔액 카드(`text-5xl`) + AttendanceCard (코드 0줄 수정, 정식 자리) + 거래 내역 50건 + "충전→/billing" 진입. 진입점 통일: 설정 페이지에 "토큰" amber 카드 / root header 토큰 버튼 / 사이드 패널 모두 `/account/tokens` 로. `/life-timeline` 메인에서 AttendanceCard import + 렌더 + `getAttendanceStatus` fetch 제거 (메인 fetch 5→4). 사이드 패널 AttendanceMini 는 빠른 접근용 유지 (정식 페이지 vs 빠른 진입 의미 분리). `/billing` 결제 UI 미변경 (토스 콜백 흐름 그대로)

**인물(Person) P1~P3 + 장소(Place) — 2026-06-04**:
- P1 데이터 모델 — 새 모델 2개 (`Person` + `PersonEvent`) + `UserMemory.personEvents PersonEvent[]` 역참조 1줄. 마이그 `20260603113549_p1_person_and_person_event`. `PersonEvent.@@unique([personId, memoryId])` + P2002 catch 로 idempotent 토글. 헬퍼 9개 (`lib/people.ts`) — `userId` 첫 인자 + `LinkResult` enum 4종 (`linked/already/not_found/not_life_event`) — *인생* 이벤트만 연결 허용(`createdVia="life_event"`). N+1 회피 batch 2개 (`countEventsPerPerson` groupBy / `listPeopleByEventBatch` IN). 검증 `db/test-people.ts` 39 assertion + 기존 회귀 0
- P2 화면 — 신규 5 라우트 (`/people` 목록·`/new`·`/[id]`·`/edit`·`/link`) + 공용 `PersonForm` (datalist 관계 힌트 + birthYear 기반 나이 자동) + `DeletePersonButton` (confirm 모달, L4 패턴) + `UnlinkButton` + `LinkToggleRow` (옵티미스틱 + LinkResult 4종 안내). 진입 2 곳: 사이드 패널 "인물록" + `/life-timeline` 진입 카드 "👥 인물 기록". 연혁 카드 아래 인물 칩 (`👤 철수, 영희`, 4+ "외 N명" 압축)
- P3 연혁에서 직접 연결 심화 — 신규 `PeopleConnectModal` (연결됨 emerald/미연결 zinc 두 섹션 + 옵티미스틱 토글 + 부모 `peopleByEventState` 즉시 동기화). `PersonForm.returnTo?: string \| null` prop 추가 — `/people/new?returnTo=...` 흐름. 카드 안 "👤" 버튼은 `<a>`+`<button>` invalid HTML 회피 위해 Link 와 형제로 분리. fetch 전략: page.tsx 가 `listPeople` 도 prefetch (총 6 fetch) → 모달 열 때 0 쿼리, 토글 1쿼리
- Place 데이터 모델 — 마이그 `20260603134442_place_fields`. `UserMemory` 에 5 컬럼 nullable (`placeName/placeAddress/lat/lng/placeSource`). 기존 행 모두 null 무영향. life_event 미러링 패턴 유지. 모든 createdVia 재사용 가능하도록 prefix X
- Place API (`/api/place-search`) — POST `{query, source}`. auth() 가드 (+ proxy.ts 1차). 네이버 `openapi.naver.com/v1/search/local.json` + WGS84\*10^7 좌표 변환. 구글 `places.googleapis.com/v1/places:searchText` + `X-Goog-FieldMask`. 5초 타임아웃 (AbortController). 처음엔 "auto" 분기였으나 사용자 의도 어긋남(한글로 "Tokyo Tower") → 사용자가 직접 선택하는 UI 로 변경
- Place UI (`PlaceSearchInput`) — 3단 화면: A) 큰 버튼 2개(🗺️ 네이버 / 🌍 구글) → B) 검색 입력 + 결과 5개 + 지도 타일 (결과 hover/click → focusedIdx 강조) → C) 📍 카드 + 작은 미리보기 지도 + [다른 곳으로 바꾸기]
- 지도 타일 렌더 — `@types/navermaps` + `@types/google.maps` + `@googlemaps/js-api-loader` 추가. `app/components/maps/{types,NaverMap,GoogleMap,PlaceMap}.tsx` 신규. 공통 `MapProps` 인터페이스로 두 SDK 흡수, `PlaceMap` 가 source 분기 dispatcher. 세 useEffect 로 책임 분리 (ready / markers 변경 / focusedIdx). 네이버 `next/script` lazy load + 100ms 폴링, 구글 `importLibrary` 함수형 API v2
- 모든 카테고리에 장소 — 처음 8 카테고리(BIRTH/KINDERGARTEN/학령기 4/MILITARY/WORK) 게이트로 도입 후 사용자 요청으로 게이트 제거. `lib/life-events.ts` 의 `PLACE_CATEGORIES`/`isPlaceCategory` 삭제, CategoryForm `hasPlace` prop 제거. EventForm(/life-timeline/add·edit) 에도 PlaceSearchInput 섹션 + place state + payload 통합. 연혁 카드 아래 `PlacePreview` 📍 칩 + 외부 지도 새 탭 (네이버 `map.naver.com/p/search` / 구글 `maps.google.com/?q=` 분기)
- `lib/place-types.ts` 분리 — `lib/life-events.ts` 의 prisma(node-only pg) 의존이 클라 컴포넌트에 끌려와 dns 모듈 빌드 오류. 순수 타입/상수만 분리 (`PlaceInfo` + `EMPTY_PLACE`) — 클라/서버 공용
- v3 진단 H/M 11항목 픽스 — 신규 1000+ 줄 코드 자체 검토 후 사용자가 즉시 픽스 묶음 결정. H1 safeReturnTo open redirect 차단(URL 객체 + origin + 재구성 일치), H2 skippedLifeCategories race(`$executeRaw` + `array_append(array_remove(...))` 단일 statement), H4 `RenderEvent.originalId` 명시(`:end` slice 매직 제거 + `--end` 분리), H5 expandPeriods 정렬 제거(DB 순서 보존 + `flushPendingBefore`), H6 빈배열 NaN year push 방어, H7 placeSource 미지원 시 전체 null, M3 `lib/josa.ts` 신규(`withJosa(name, "과/와")` + FamilyNewsCard 통합), M7 startEditing query prefill, M9 Esc IME 가드(`isComposing` + input/textarea), M12 AbortController(`fetchWithTimeout`), M20 구글 placeholder 한글화

**동기부여 핵심 루프 (Phase M ①②)** — 기획 `phase/동기부여_핵심루프_기획.md`:
- ① 쌓이는 재미 (`lib/timemachine-progress.ts` + `ProgressCard`) — 기존 T6 `UserMemory` 읽기 집계(새 모델 0). 채운 달·사건·글자 + 12개월 진척 그리드(채움 amber/빈 칸 회색). 글자 수는 `$queryRaw` `SUM(LENGTH(BTRIM))` 로 본문 미로드. 0개월=초대 문구, 압박 금지. 메인·사이드 "내 기록"·월 화면 prev/next 배지
- ② 가족 반응 — `MemoryReaction`(감정 스탬프 4종 ❤️😊👏🙏, Comment 와 같은 polymorphic) + `FamilyFeedSeen`(읽음 추적). 스탬프는 **룸별**(`@@unique([roomId, targetType, targetId, authorId, stamp])`) — 저장·조회 기준 일치 + 크로스룸 누수 차단. 토글 race-safe(클라가 active, 서버 create P2002/deleteMany count0 무시). `StampBar`(룸 `PersonalMemoryCard`), `FamilyNewsCard`(메인, 0건 숨김) + 사이드 "새 소식 N" 배지
- 읽음 추적 — "새것"=`createdAt > seenAt`, `FamilyFeedSeen` 첫 접근 시 `now()` 기준선(소급 폭주 방지). `markSeen` 은 raw `UPDATE = NOW()`(DB 시계, baseline·createdAt 과 일치). 메인에서 카드 볼 때(`FamilyNewsSeen` client mount) 갱신
- 자체 검토 4건 픽스: M1(룸별 스탬프) / M2(markSeen DB 시계) / M4(진척 SQL 집계) / L6(조사 을/를). M3(메인 중복 쿼리)·L1~L5·L7~L10 이연

**v2 UX 정비 (V3·V4 동반)**:
- 채팅창 고정 높이 (`max-h-[60vh]`) + 자동 스크롤 + 12px 스크롤바
- 입력 박스 → 패널 최하단 (일반 채팅방 패턴)
- 칩에 source hint (보통 우리 자료 emerald / 인터넷 검색 zinc) + 답 카드 상단 source 배지 + 안내 어휘 일관화 ("우리 자료"/"인터넷 검색"/"이전 답에서")
- 검색 system prompt 강화 — "검색 결과를 다루는 원칙" 4조항 (모르면 모른다고 / 출처 근거만 / 확실·불확실 구분 / 결과 빈약하면 인정)

**최근 태그**:
- `mvp-v1` — Phase 0~8 완료 직후 (MVP 닫힘)
- `phase9-complete` — 공유 기능 + 음악 재생 완료
- `review-pass-1` — 6개 lens 코드 검토 + 바구니 1(4건 즉시 수정) 완료

**미픽스 후속 작업 (통합 테스트 후 처리)**

타임머신 v1 자체 검토 미픽스 (`docs/daily/2026-05-25.md` 참조):
- M1: 가족 룸에서 타임머신 음악 추억 "들어보기" 누락 (event=null 이라 도메인 모름)
- M3: 음악 폴백 1-step 한계 (연속 결손 대응)
- M4: chargeOneShot 후 DB 실패 시 wallet 복구
- M5: MonthForm initialMap props 동기화 (다중 탭)
- L1: 이모지(🎤·✨) 텍스트/SVG 대체
- L3: 매직 스트링(`timemachine_event` 등) 상수화
- L5: 폴백 호출 직렬 → Promise.all
- L6: seed deleteMany/createMany 트랜잭션
- L7: TimemachineMonth 정식 drop (T6 후 deprecated, 데이터 마이그레이션 검토 후)
- L8: LATEST/EARLIEST 하드코드 → `new Date()` 기반

v2 신규 후속 (`docs/daily/2026-05-27.md` 참조):
- 검색 답 토큰 정책 재조정 — 실측 9토큰 (잠정 2~3 초과). V2 실사용 보고 결정
- v1 사건 그리드(`EventItem`/`MonthForm`) 정식 drop (V2 검증 후)
- `MonthEvent` `(section, year, month, title)` UNIQUE 제약 — 시드 정책 변경 잔재 재발 방지
- 검색 답 캐싱 (시대 공통 질문 = 개인정보 0)

v2 V3·V4 자체 검토 미픽스 (`docs/daily/2026-05-28.md` 참조):
- T1: [SEARCH] 폴백 시 이중 차감(컨텍스트 미스 + 검색)을 UI 에 명확히 (현재는 검색 차감만 표시)
- B4: 후속 질문 category echo (현재는 키워드 재분류, 첫 답 category 이어가는 게 자연스러움)
- B5: [SEARCH] sentinel 회피성 변형 후처리 ("검색이 필요해요" 등)
- B6: 동일 답 중복 저장 차단 (DB UNIQUE 또는 idempotency key)
- B7: 저장 버튼 빠른 더블클릭 옵티미스틱 가드
- C1: 컨텍스트 답 외부 지식 누설 모니터링 (자동 검증 어려움, 사용자 보고 시 프롬프트 보강)
- S2: prior text 길이 cap (API 레이어 — 현재 백엔드 clamp 만)
- S4: 502 응답 message 노출 마스킹 (production 만)
- K2~K5: 다크모드 보강, 에러 메시지 분기, BIG_KEYWORDS 중복 정리

동기부여 ①② 자체 검토 미픽스 (`docs/daily/2026-05-28.md` 세션2 참조):
- M3: /timemachine 메인·월 화면 중복 쿼리 (layout `getFamilyNewsCount` + page `getFamilyNews`, 출석 2회) — React `cache()` 또는 layout 단일 패스 (검증 스크립트가 비-RSC 직접 호출이라 cache() 도입 주의)
- L1: 스탬프 옵티미스틱 토글 순서 역전 시 DB↔화면 잠깐 불일치
- L2: markSeen 카드 mount 즉시 (스크롤로 지나쳐도 "봤음"); 같은 렌더 사이드 배지 stale
- L3: `reaction-actions` 화이트리스트의 `shared_memory` 죽은 경로 (UI·소식 모두 미사용 → 표면 축소)
- L4: 멤버 탈퇴 후에도 반응/댓글 잔존 (멤버십 삭제 cascade 없음) → 소식에 나간 사람 반응
- L5: 가족 소식·룸 카드 `name ?? email` → 이름 없는 가족 이메일 노출 (별명/이니셜 원칙)
- L7: `FamilyNewsSeen` markSeen 에러 무로그(`.catch(()=>{})`)
- L8: `StampBar` console.error NODE_ENV 가드 (기존 K1 과 함께)
- L9: 스탬프 이모지 구형 단말 tofu 가능(라벨로 완화); 신규 카드 다크모드 육안 미검증
- L10: 진척/소식 큰 `IN (myMemoryIds)` 리스트 (프롤픽 사용자)

V4 신규 후속:
- 검색 토큰 추정값 (10/30/50) 실측 보고 재조정. 특히 Opus 의 base * 5 가 실제 사용 패턴에 적절한지
- depth 별 ledger reason 분리됨 — 운영 분석 대시보드 검토 (어느 depth 가 가장 사용?)

Phase A (출석 + 사이드) 신규 후속:
- 출석 streak ≥ 30 같은 milestone UX 분기 (지금은 7배수 보너스만)
- LATEST_YEAR/MONTH 하드코드 (출석 사이드 패널 "이번 달" 링크) — L8 후속과 함께 `new Date()` 기반으로

v3 인생 연혁 (L1~L7) 신규 후속:
- 통합 사용성 검증 — 실 사용자 시나리오 (연혁 골격 → 점 클릭으로 월 화면 → 비서 회상)
- 비서 맥락 확장 — 전 시점 질문 모드 (지금은 (year, month) 컨텍스트 한 곳)
- /enter 분기 telemetry — 신규 vs 기존 vs 활성 사용자 비율
- ~~모바일 가로 시간축 — 가로 스크롤 vs 세로 변환~~ (v3.2 에서 세로 통일로 해결)
- v1 사건 그리드 / v2 일부 화면 정식 drop (v3 검증 후) — `EventItem`·`MonthForm` 등
- L2 폼·L4 자유 추가 사이 데이터 정합 — 같은 카테고리 여러 행 정책 확인
- `test-family-reactions` markSeen 2건 pre-existing 실패 (M2 영역, L7 무관) — 후속 사이클

v3.0+~v3.5 신규 후속 (`docs/daily/2026-06-03.md` 참조):
- 사이드 패널 ↔ 글로벌 AI 비서 위젯 위치 겹침 정리 (lg 에서 `right-[22rem]` 등으로 안쪽 이동)
- `/account/tokens` 와 `/billing` 거래 내역 중복 — `reasonLabel` 상수 통합 (또는 거래내역 헬퍼 추출)
- TimelineView 의 `expandPeriods`/`computePeriodFlags` 단위 테스트 (UI 검증 어려운 순수 함수 영역)
- 카테고리 마이그 후 사용자가 SCHOOL→ELEMENTARY 로 매핑된 행을 실제 본인 학교(중·고·대)로 재분류하는 UX (manage 페이지에서)
- 빈 공간 클릭의 연도 추정 정확도 (사용자 실측 후 padding 조정 — 현재는 min/max 양 끝 보간만)
- + 버튼 호버 영역 — 데스크톱에서 점 → 버튼 마우스 이동 시 group-hover 끊김 살짝 (group div 가 자식 width 합집합이지만 마진 영역 비어있음)
- `LATEST_YEAR/MONTH` 하드코드 (위젯·사이드·life-timeline·page.tsx 등 4 곳) — L8 후속과 함께 `new Date()` 기반 통합
- 글로벌 위젯 RSC fetch — 모든 페이지 render 마다 `getLifeEvents` + `listAssistantAnswers` 중복. React `cache()` 도입 후보 (M3 후속과 함께 결정 필요 — 비-RSC 직접 호출 영향)
- v3.0+ 검증 스크립트 `test-life-skip-period-age.ts` 가 새 enum(ELEMENTARY/KINDERGARTEN/FAMILY) 갱신됐지만 통합 시나리오(같은 사용자가 4 단계 모두 거치는) 는 없음 — e2e 후속

인물(P) + 장소(Place) + v3 진단 미픽스 후속 (`docs/daily/2026-06-04.md` 참조):
- H3: `PersonEvent.userId` DB 무결성 — CHECK 트리거 또는 컬럼 제거 후 JOIN 권한 검증 전환 (성능 trade-off)
- M2: v3 신규 12+ 파일 (TimelineView, PeopleConnectModal, PlaceSearchInput, NaverMap/GoogleMap 컨테이너, /people 모든 페이지, AssistantModal 등) 다크모드 미대응
- M4: /life-timeline page.tsx fetch 직렬화 — events 의존 `listPeopleByEventBatch` 가 5개 병렬 후 직렬. React `cache()` 도입 후보
- M5: AssistantModal `EMPTY_SET` 모듈 상수 — 여러 인스턴스가 같은 빈 Set 공유. 미래 mutation 위험
- M6: NaverMap `[markers, ready, onMarkerClick]` deps — 부모가 매번 새 함수 주면 마커 전부 재생성
- M8: 네이버/구글 InfoWindow 의 자체 `escape()` 함수 — 표준 lib (DOMPurify 또는 React portal) 로 교체
- M10: `linkPersonAction` revalidatePath 범위 (현재 3 경로 fire — 호출 컨텍스트별 분기)
- M11: NaverMap `LatLngBounds` 초기 인자에 `markers[0]` 두 번 — 의도 불분명
- M13: `PERIOD_CATEGORIES` `lib/life-events.ts` vs `EventForm.tsx` 중복 정의 — `lib/life-categories.ts` 추출 후보 (클라/서버 공용 = place-types.ts 패턴)
- M14: `APPROX_DEFAULT_MONTH = 6` 중복 (TimelineView vs page.tsx) — 상수 한곳에
- M15: `createdVia`/`placeSource` 매직 스트링 — `CREATED_VIA = {...}`, `PLACE_SOURCE = {...}` 상수 모음
- M16: CategoryForm 클라 측 `endYear < year` 즉시 안내 (현재 서버 라운드트립 후 표시)
- M17: 인물 detail → 비서 모달 진입로 (인물 컨텍스트 회상 자연스러운 자리)
- M18: /enter race / `hasOther` 1쿼리 의존 — `next/cache` 비활성화 검토
- L1: `calcAge`/`schoolYearsForCategory` 가 birthYear 미래 연도(예: 2050) 가드 부재 — 호출자 보호 X
- L2: `lib/life-events.ts:34, 474` 등 주석에 `SCHOOL/WORK/MILITARY/RESIDENCE` v3.1 이전 enum 명 stale
- L3: validatePlace 원본 길이 차단 부재 (trim 후만 검사) — 큰 영향 X
- L4: countEventsPerPerson 가 PersonEvent.userId 비정규화 신뢰 — H3 와 동일 영역
- L5: 구글 모드 결과 없을 때 안내문 한국어 고정 — 시니어 친화 OK 이지만 일관성 (M20 픽스됨)
- L6: /api/place-search proxy.ts 가 1차 차단 — 라우트 401 가드는 defense-in-depth (도달 안 함, 의도된 패턴)
- L7: PlaceSearchInput `onChange` deps 변경 시 핸들러 재바인딩 (useCallback OK 보장 의존)
- L8: ProgressCard/FamilyNewsCard import path 가 `app/timemachine/...` 잔재 — 정리 후속
- L9: EventForm category 기본값 `FAMILY` — 분류 UI 제거 후 의도된 동작이지만 룸 분류 시 가중치 영향
- L10: UnlinkButton 가 `unlinkPersonAction` 결과 무시 — 실패 시 사용자 알림 X (LinkToggleRow 는 처리함)
- L11: `linkPersonToEvent` 직렬 두 findFirst — 한 쿼리로 합칠 수 있지만 가독성 우선
- L12: people/[id] 의 metYear IIFE 가독성 — 일반 함수 또는 미리 계산 변수로
- 네이버 NCP Client ID 클라 노출 — NEXT_PUBLIC 의도된 노출. `.env.example` 에 도메인 화이트리스트 안내 추가 필요
- 인물 모달 → 비서 모달 → /life-timeline/add 연결 흐름 — onAddEvent 가 (year, month) 컨텍스트 분리

이전 바구니 2 후보 (review-pass-1 에서 발견):
- ✅ 회원 탈퇴 (PIPA 동의 철회권) — 5/25 완료
- 미진행: submitMemoryAnswer idempotency key, Comment polymorphic FK orphan cleanup, `[ai]`/`[tokens]` console 로그 NODE_ENV 가드, `UserMemory.visibility` 컬럼 활용/제거, `getMembership` 중복 호출 감소.

---

## 열린 결정사항

- [x] 서비스명: Lifebook (라이프북) — 정식 출시 전 상표·도메인 확인 필요
- [x] Phase 6에서 우선 연동할 트리거 분야 → **음악** (Voyage AI 임베딩, MusicBrainz 하이브리드 시드)
- [x] 토큰 가격 정책 / 무료 제공량 → N=2,000 / 신규 30토큰 / 1,000원=100토큰 (`lib/tokens/policy.ts`)
- [x] 국내 PG사 → **토스페이먼츠 (테스트 모드)**, 출시 시 prod 키만 교체
- [x] 핵심 UX 모델 → **타임머신 (한 달씩 거꾸로 시간여행)** — 출생연도 타임라인·음악 RAG 대체 예정
- [x] SharedRoom owner 양도 정책 → **최고참 consent 멤버에 자동 이전**, 없으면 cascade 삭제
- [x] 결제 기록 보존 정책 → paid TokenOrder 는 userId SetNull 익명화 후 5년 보존 (전자상거래법)
- [x] 다크모드 / 라이트모드 → CSS 변수 swap (의미색 50↔950 대칭) — 설정 페이지에서 토글
- [x] 타임머신 v2 비서 출처 정책 → **DB 우선(BIG/MUSIC 무료) + 웹 검색 폴백/TASTE(차감 + 가드 + 출처)**
- [x] 비서 검색 토큰 가산 → `chargeOneShot.surcharge` 파라미터로 표현 (정책 함수 무수정)
- [x] 비서 멀티턴 정책 → 후속은 컨텍스트 답 우선 (검색 없이 1토큰), `[SEARCH]` sentinel 폴백 시 DB 건너뛰고 검색 직행
- [x] 비서 답 깊이 → 사용자 라벨 "간단히/자세히/가장 정확하게" (모델 이름 노출 X), surcharge 로 차이 흡수, Haiku 회귀 0
- [x] 비서 저장 답 가족 공유 → **항상 공유 + 안내 표시** (visibility 토글 안 만듦)
- [x] 출석 보상 정책 → 매일 5토큰 + 7배수 streak 마다 +30 (계속 누적, 끊기면 1 리셋)
- [x] 동기부여 ① 진척 → 기존 T6 읽기 집계(새 모델 0), 글자 수 SQL `SUM(LENGTH())`, 압박 금지(빈 칸 회색·0개월 초대)
- [x] 감정 스탬프 범위 → **룸별**(unique 에 roomId) — 저장·조회 기준 일치 + 크로스룸 누수 차단 (전역은 A 룸 반응이 B 룸에 노출)
- [x] 가족 소식 읽음 추적 → `FamilyFeedSeen` 사용자당 1행 lazy baseline(소급 폭주 방지) + markSeen DB 시계(`NOW()`), 메인 카드 볼 때 갱신, 0건 숨김
- [x] 핵심 UX 모델 v3 → **인생 연혁(가로 시간축)** 이 메인, 매달 채우기 부담 제거. v2 월별 타임머신은 보조(연혁 점 클릭으로 진입)
- [x] 인생 이벤트 저장 → 새 모델 0, 기존 `UserMemory` 에 `createdVia="life_event"` 디스크리미네이터 + 5 컬럼 nullable. `year/month/title` 미러링으로 룸·반응·진척 자동 호환
- [x] 시간 표현 → 앵커(EXACT, 진한 큰 점) + 사이(APPROXIMATE, 작은 점/약한 색). 정확한 월 안 떠올려도 추정 연도만 채우면 됨
- [x] 첫 진입 분기 → 메인엔 게이트 X. `/enter` 분기 전용 페이지 (로그인/동의 직후 1회 진입). 신규 가이드 보호 + 사이드 패널 자유 이동 양립
- [x] 인생 카테고리 v3.1 (10개) → 출생·유치원·초/중/고/대·군대·첫 직장·결혼·자녀. SCHOOL 통합 분할, RESIDENCE/OTHER 삭제. 매핑: CHILDHOOD→KINDERGARTEN, SCHOOL→ELEMENTARY 의미 매핑 + 나머지 삭제
- [x] 건너뛰기 상태 → `User.skippedLifeCategories LifeCategory[]` (새 모델 0, native enum array). 답 저장 시 자동 해제
- [x] 기간 카테고리 끝 연도 → 한 행에 `endYear` 컬럼 (별도 행 X). 룸·반응 한 단위 보존, 시각화에서만 두 점으로 split
- [x] 나이 자동 표시 → BIRTH eventYear 기반 `calcAge`. 폼 연도 옆 작은 텍스트 + 연혁 라벨 `(만 N세)` + 학령 카테고리 역계산 힌트
- [x] 세로 타임라인 (v3.2) → 데스크톱·모바일 모두 세로. 데스크톱은 중앙선 좌우 교차, 모바일은 왼쪽 선 + 우측 카드. 기간은 amber-500 강조선
- [x] 빈 공간 클릭으로 추가 (v3.3) → 선 ±20px 폭 click area + 점 옆 + 버튼. 연도 추정 후 `/life-timeline/add?year=&hint=1` prefill
- [x] 글로벌 AI 비서 위젯 (v3.4) → root layout 우측 하단 floating FAB. `AssistantModal variant="floating"` 으로 모달 본문 재사용
- [x] 토큰·출석 통합 (v3.5) → `/account/tokens` 신설 (잔액 + 출석 + 거래내역). `/life-timeline` 메인에서 AttendanceCard 제거. 진입점 4 곳 통일 (헤더·사이드 패널·설정). `/billing` 결제 UI 미변경
- [x] 인물(Person) 데이터 모델 → 새 모델 2개 (`Person` + `PersonEvent`) additive only. `UserMemory.personEvents` 역참조 1줄. 룸·반응·진척·기존 createdVia 0줄 영향
- [x] 인물 연결 정책 → *인생* 이벤트(`createdVia="life_event"`) 만 허용. timemachine_event/ai_chat 거부 (`LinkResult.not_life_event`). 인물은 인생 골격에만, 월별 회고 추억엔 X
- [x] 인물-이벤트 토글 → P2002 catch + deleteMany count=0 으로 idempotent. 동시 클릭/재전송 안전
- [x] 장소 매칭 → 새 모델 0, `UserMemory` 에 5 nullable 컬럼 (placeName/placeAddress/lat/lng/placeSource). 기존 행 null 무영향. life_event 미러링 패턴 유지
- [x] 장소 검색 엔진 선택 → 자동 분기 X. 사용자가 큰 버튼 2개(🗺️ 네이버 / 🌍 구글) 로 직접 선택 (한글로 "Tokyo Tower" 같은 의도-결과 어긋남 회피)
- [x] 장소 입력 카테고리 → 처음 8 카테고리 게이트 후 사용자 결정으로 *전체 10개 + 연혁 자유 추가/수정* 모두 허용 (결혼식장·자녀 태어난 곳도 의미 있음)
- [x] placeSource 정규화 → 미지원 source(naver/google 외) 시 lat/lng/placeName 도 함께 null. 데이터/UI 일관성 우선
- [x] 지도 SDK 추상화 → 공통 `MapProps` 인터페이스 + 네이버/구글 각 구현체 + `PlaceMap` source 분기 dispatcher. SDK 차이를 호출자에서 숨김
- [x] /people/new returnTo → relative 경로만 + URL 객체로 정규화한 뒤 원본과 일치 검증. 백슬래시·encoded 우회 차단
- [x] skippedLifeCategories race-safe → `$executeRaw` + `array_append(array_remove(...), v)` 단일 statement. Prisma read-modify-write 3단계 race window 제거
- [x] 한국어 조사 헬퍼 → `lib/josa.ts` (`withJosa(name, "과/와")` + `objectJosa` + `subjectJosa`). 받침 유무 + 한글 외 문자 안전 처리
- [ ] 가족 반응 다음 단계 → 가벼운 음성 반응, 자녀 실제 푸시(현재 앱 안 표시까지만)
- [ ] 포토북 제작·배송 파트너 (Phase 10)
- [ ] 타임머신 시드 시기 확장 정책 (과거로 얼마나 / 큐레이션 단위)
- [ ] 비서 검색 답 토큰 정책 재조정 (V4 깊이별 실측 후 — Haiku 10 / Sonnet 43 / Opus 56)
- [ ] 출석 streak 30/100일 같은 milestone UX (지금은 7배수만)

---

## 법적/개인정보 원칙 (설계 시 항상 고려)

> ⚠️ 법률 자문 아님 — 출시 전 전문 변호사 검토 필수.

- 솔로 콘텐츠 = **비공개 기본**.
- 공유 시 = 명시 동의 + 범위(가족) 한정 + 약관 보증.
- 타인의 민감정보(건강·정치·종교)는 유도하지 않는다.
- 해외 AI API 전송 = 국외이전 동의를 가입 흐름에 선반영.
- 타인 이름은 별명/이니셜 입력 옵션 제공 (최소 수집).
