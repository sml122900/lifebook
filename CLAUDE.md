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

| Phase | 목표                                                 | 문서                | 상태    |
| ----- | ---------------------------------------------------- | ------------------- | ------- |
| 0     | 프로젝트 셋업 (Next.js + Postgres/pgvector + Prisma) | `phase/phase0.md`   | ✅ 완료 |
| 1     | 데이터 모델 정의 + 앵커 이벤트 시드                  | `phase/phase1.md`   | ✅ 완료 |
| 2     | 타임라인 정적 렌더 — **첫 보이는 화면**              | `phase/phase2.md`   | ✅ 완료 |
| 3     | 인증 + 개인정보·국외이전 동의 게이트                 | `phase/phase3.md`   | ✅ 완료 |
| 4     | 온보딩 (생애 정보 수집, 대화형)                      | `phase/phase4.md`   | ✅ 완료 |
| 5     | 타임라인 개인화 (출생연도 기반)                      | `phase/phase5.md`   | ✅ 완료 |
| 6     | 트리거 이벤트 + RAG (음악, Voyage)                   | `phase/phase6.md`   | ✅ 완료 |
| 7     | AI 대화로 추억 채우기 (Claude + 음성)                | `phase/phase7.md`   | ✅ 완료 |
| 8     | 토큰 결제 (토스 테스트) → **MVP 완성** (`mvp-v1`)    | `phase/phase8.md`   | ✅ 완료 |
| 9     | 가족 공유 모드 — 룸/초대/공유 타임라인/공동 추억     | `phase/phase9.md`   | ✅ 완료 |
| 9.5   | 음악 재생 (YouTube 검색 링크)                        | `phase/phase9.5.md` | ✅ 완료 |
| 10    | 출력물 서비스 (PDF/포토북 배송)                      | (예정)              | ▶ 다음  |
| 11    | 앱 출시 · 커뮤니티 기여 · 광고                       | (예정)              |         |

**최근 태그**:
- `mvp-v1` — Phase 0~8 완료 직후 (MVP 닫힘)
- `phase9-complete` — 공유 기능 + 음악 재생 완료
- `review-pass-1` — 6개 lens 코드 검토 + 바구니 1(4건 즉시 수정) 완료

**바구니 2 후보 (검토에서 발견, 후속 작업)**: leave room + 회원 탈퇴(PIPA 동의 철회권), SharedRoom owner 양도, submitMemoryAnswer idempotency key, Comment polymorphic FK orphan cleanup, `[ai]`/`[tokens]` console 로그 NODE_ENV 가드, `UserMemory.visibility` 컬럼 활용 또는 제거, `getMembership` 중복 호출 감소.

---

## 열린 결정사항

- [x] 서비스명: Lifebook (라이프북) — 정식 출시 전 상표·도메인 확인 필요
- [x] Phase 6에서 우선 연동할 트리거 분야 → **음악** (Voyage AI 임베딩, MusicBrainz 하이브리드 시드)
- [x] 토큰 가격 정책 / 무료 제공량 → N=2,000 / 신규 30토큰 / 1,000원=100토큰 (`lib/tokens/policy.ts`)
- [x] 국내 PG사 → **토스페이먼츠 (테스트 모드)**, 출시 시 prod 키만 교체
- [ ] 포토북 제작·배송 파트너 (Phase 10)
- [ ] SharedRoom owner 양도 정책 (회원 탈퇴 시 룸 보존 vs cascade 삭제)

---

## 법적/개인정보 원칙 (설계 시 항상 고려)

> ⚠️ 법률 자문 아님 — 출시 전 전문 변호사 검토 필수.

- 솔로 콘텐츠 = **비공개 기본**.
- 공유 시 = 명시 동의 + 범위(가족) 한정 + 약관 보증.
- 타인의 민감정보(건강·정치·종교)는 유도하지 않는다.
- 해외 AI API 전송 = 국외이전 동의를 가입 흐름에 선반영.
- 타인 이름은 별명/이니셜 입력 옵션 제공 (최소 수집).
