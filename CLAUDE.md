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

V4 신규 후속:
- 검색 토큰 추정값 (10/30/50) 실측 보고 재조정. 특히 Opus 의 base * 5 가 실제 사용 패턴에 적절한지
- depth 별 ledger reason 분리됨 — 운영 분석 대시보드 검토 (어느 depth 가 가장 사용?)

Phase A (출석 + 사이드) 신규 후속:
- 출석 streak ≥ 30 같은 milestone UX 분기 (지금은 7배수 보너스만)
- LATEST_YEAR/MONTH 하드코드 (출석 사이드 패널 "이번 달" 링크) — L8 후속과 함께 `new Date()` 기반으로

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
