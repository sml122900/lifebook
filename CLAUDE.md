# CLAUDE.md — 프로젝트 컨텍스트

> 이 파일은 Claude Code가 항상 읽는 프로젝트 개요다. 

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
| **v3 월 OFF** | **월 화면 비활성화 — 메인 동선에서 '월' 개념 제거, 연혁 이벤트 클릭 → 편집 화면, 시드는 보존(archived)** | (`2026-06-06` 일지) | ✅ 완료                           |
| **v3.6 + endMonth + 비서 UI** | **홈 link 픽스 · 기간 끝 월(endMonth) · AssistantPanel 모드 선택 · 지도 ncpKeyId · 지도 진단 5건 픽스 · Auth.js cache 복구** | (`2026-06-08` 일지) | ✅ 완료                           |
| **E1 + E2** | **시대 연혁 둘러보기(/era) + 클릭 한 번 담기 — 1980~2019 사건 88·음악 73 시드 적재 + era_event 디스크리미네이터 + 연혁 시각 분리(slate) + 가족 룸 자동 노출** | (`2026-06-08` 일지) | ✅ E1·E2 완료 |
| **/era UX** | **텍스트 폭탄 해소 — 사건 리스트+아코디언(`grid-rows-[0fr↔1fr]`) + lucide 카테고리 아이콘 4종 + 연대별 은은한 배경(amber/emerald/sky/violet) + 사건 더 알아보기 구글 검색(민감 사건 포함 모든 사건, 정책 함수 폐기)** | (`2026-06-08` 일지 세션2) | ✅ 완료 |
| **E3** | **era_event 본인 회상(content) 입력 — saveEraMemory + EraMemoryEditor(default/compact 양쪽 공용) + 가족 룸 자동 전파(0줄) + 17 시나리오 회귀 통과** | (`2026-06-08` 일지 세션3) | ✅ 완료 |
| **Supabase 이전** | **Docker → Supabase Postgres + Storage. Prisma 7 url/directUrl 분리, search_path 설정, pgvector extensions 스키마, 마이그 29건 + 시드 4종 + 임베딩 재생성 + 로그인 검증** | (`2026-06-09` 일지) | ✅ 완료 |
| **Photo 1·2** | **사진 풀스택 1·2단계 — Storage 검증(1) → Photo 모델 + UserMemory 1:N + transaction + orphan 방지(2). 3~7단계(연혁 표시·인물·장소·공유·썸네일) 후속** | (`2026-06-09` 일지) | ✅ 1·2단계 완료 |
| **UX 픽스 5** | **PlaceSearchInput previewMarkers useMemo · ProgressCard 메인 제거 · 건너뛰기 → 인덱스 · 튜토리얼 안내 · "← 인생 연혁으로" 9곳** | (`2026-06-09` 일지) | ✅ 완료 |
| **Photo 3·4·5 + periodAnchor** | **사진 연혁 표시(3)·이벤트 첨부(4)·마무리(5) + 기간 시작/끝 사진 분리(periodAnchor) + 자유추가 기간 입력 + 룸 leak 픽스. getLifeEvents 순수 DB(경로만)·page.tsx signed URL 배치·photo=sky+📷·라이트박스 보기전용** | (`2026-06-09` 세션2 일지) | ✅ 완료 (6·7단계 후속) |
| **Photo×인물·장소(A·B·C) + SSR 픽스 2** | **사진 메모리 인물 연결(not_linkable·LINKABLE Set) + 장소 매칭(validatePlace 순수모듈·updatePhotoMemoryPlace) + 기간 중복 렌더 억제(isPeriodEnd suppress, 앵커X) + `"use server"` number export·`window` SSR 버그 픽스** | (`2026-06-10` 일지) | ✅ 완료 |
| **Photo 6 (EXIF·대량·첨부/빼기)** | **EXIF 촬영일 자동(exifr lazy)·dateSource·GPS 무손실 strip(piexifjs, 4경로) + 대량 업로드(concurrency 3·부분실패·일괄연도) + movePhotoToMemory(넣기/빼기=독립복귀, 삭제X) + add 화면 사진 + 코드리뷰 H1·M1·M2·M3** | (`2026-06-10` 세션2 일지) | ✅ 완료 |
| **테스트 전 정비** | **헤더 "타임머신" 입구 제거(라우트·코드 보존) + 첫 방문 환영 카드(onboardingCompletedAt 재사용·마이그 0·V3 배너 배타) + dev 중 build → .next 충돌 트러블슈팅** | (`2026-06-11` 일지) | ✅ 완료 |
| **디자인 토큰** | **라이트 온리 토큰 시스템 — `@theme` 팔레트(canvas/surface/ink/line/brand/action/danger/success/banner + 연대 틴트·스트립) + Pretendard/명조 + Button 5위계·EmptyState + 다크모드 폐기(ThemeToggle 삭제) + 100여 파일 치환 + 칩 스펙 + 사이드 패널 root 글로벌화** | (`2026-06-12` 일지) | ✅ 완료 |
| **문장 다듬기** | **회상 AI 다듬기(맞춤법+군말·반복·비문) — refined 3컬럼(원문 비파괴) · 무료 Haiku · 전/후 카드 승인 게이트 · 길이 가드 0.6~1.2 · getLifeEvents 표시 스왑** | (`2026-06-12` 일지) | ✅ 완료 |
| **다듬기 UX·모델·404** | **자동저장 통합(RefineSection→EventForm, 미저장 draft 오발 해소) + 연혁 카드 회상 표시(EventCard line-clamp)·revalidate /manage + 적용후 2단 상시(토글 폐기) + 깨진 입력(자모깨짐) 교정·NO_CHANGE 엄격화 + 모델 3종(빠르게/꼼꼼하게/가장 정밀=Haiku/Sonnet/Opus)·차등 차감 1/3/5(저장 시에만·402) + manage era·photo 404 kind 분기** | (`2026-06-13` 일지) | ✅ 완료 |
| **랜딩 + /privacy** | **비로그인 랜딩(/) 6섹션(히어로·작동3단계·결과물·기념일#anniversary·신뢰·CTA) — lib/landing-copy 카피 분리 + data-slot 8개 + primary S1·S6만 + `--color-ph` + 공개 정적 /privacy(데이터 원칙 골자 v0 초안, PUBLIC_PATHS 등록)** | (`2026-06-13` 일지) | ✅ 완료 |
| **온보딩 첫 사건** | **가입 직후 빈 타임라인 이탈 해소 — birthYear+BIRTH외 0건이면 시대 앵커 1개 제시(pickOnboardingEraEvent: +20·POLITICS_SOCIETY VERIFIED·closest, 카테고리 파라미터화) + EraMemoryEditor saveAction prop 주입(stash+저장 결합) + localStorage 닫기. 스키마 0** | (`2026-06-13` 일지) | ✅ 완료 |
| **privacy v1.0 + consent** | **개인정보 처리방침 v1.0(회사 약속 4조 + 1~10항, 사업자등록 전 `[ ]` placeholder) + 동의 문구 v1.0 정합(수집·이용·국외이전 Anthropic/미국·"자세히 보기"→/privacy·라이프북 한글화)** | (`2026-06-13` 세션2 일지) | ✅ 완료 |
| **모바일 터치** | **390px 시니어 점검 — 타임라인 아이콘 버튼 32~40→44px(패딩만), 모달/링크 44→48px, 카드 회상 14→18·제목 16→18px, 라이트박스 max-w-full. 드로어 패널 확인, 점 확대 보류** | (`2026-06-13` 세션2 일지) | ✅ 완료 |
| **토큰 패키지 4종 + Opus차감** | **TOPUP_PACKAGES 4종(1k/3k/5k/10k +보너스)·SIGNUP 30→50·Opus 다듬기 8배(REFINE_MODEL_MULTIPLIER 1/3/8, 비서 1/3/5와 분리)·success 재방문 가드(findSettledOrder)** | (`2026-06-13` 세션2 일지) | ✅ 완료 |
| **ProductOrder + /shop** | **실물 상품 판매 — ProductOrder 모델(TokenOrder 분리)·confirm 공용 재사용·settleProductOrder·배송지 스냅샷·상수 카탈로그(포스터49k/씨앗19k/책99k+배송3k)·/shop 5라우트·테스트 배너. 마이그 순수 ADD** | `docs/decisions/product-order-commerce.md` | ✅ 완료 |
| **랜딩 연결 + Vercel** | **S3 배지 제거→/shop 상세 링크·S4→/shop/book·proxy /shop 비로그인 둘러보기·postinstall prisma generate(배포 blocker 해소)·env 16키 인벤토리** | (`2026-06-13` 세션2 일지) | ✅ 완료 |
| **배포 전 코드리뷰** | **보안·정합·회귀 점검(결제·인증·개인정보 통과) + A(탈퇴 ProductOrder 정리) + B(test-topup-settle 격리 P2002 픽스). C(가족룸 교정본) 출시 후** | `docs/troubleshooting/test-payment-key-collision.md` | ✅ A·B 완료 |
| **소셜 로그인 확장** | **카카오·네이버 로그인 추가 — 스키마/마이그/패키지 0(next-auth 내장). 인증 게이트가 이미 provider-무관임을 입증(email nullable+unique·Account 식별·consentComplete 단일 플래그). 네이버 검색 키 → AUTH_NAVER_ID/SECRET 정리(로그인+검색 한 앱 공유). 브랜드색 토큰 예외(56px·18px 유지) + profile() 커스텀(회원이름 우선)** | `docs/decisions/social-login-providers.md` | ✅ 완료 (키·콜백 등록 = 사용자) |
| **배포 마무리 (OG·랜딩·DB점검)** | **카톡 공유 미리보기(metadataBase+openGraph+twitter+동적 OG 이미지 1200×630) + /opengraph-image 미들웨어 PUBLIC 등록 + 랜딩 8슬롯 실화면(next/image fill, S4 grid 수축 픽스) + 운영 DB 읽기전용 점검 스크립트 + 계정연결 조사(자동 불가 결론)** | `docs/troubleshooting/og-image-middleware-redirect.md` | ✅ 완료 |
| **포스터 (T1·T2 + 피커 + 편집 트릴로지)** | **연혁→인생 나무 3계층 렌더 엔진(매핑·렌더러·매니페스트, 엔진 종지식 0) + 배송 섹션 + 종 피커(느티나무·인생 강물) + 클라 편집(빼기·S/M/L·위치·크기·메모) — render.ts/mapping.ts 무수정·클라 휘발성·마이그 0·어르신 auto 경로 보존. sephirot 블록(슬롯 DOM 비호환)** | `docs/decisions/poster-tree-editor.md` | ✅ 완료 (인쇄 굽기·sephirot flat 후속) |
| **포스터 → /shop CTA + Toss 심사 대응** | **/poster "주문하기" → `/shop/poster/order` 연결(결제 보안 재구현 0) + 전자상거래법 풋터(BUSINESS_INFO 단일 출처·root layout) + /shop 상품별 고유 이미지 3종 + `lib/commerce/products.ts` image/imageAlt 필드 추가** | (`2026-06-17` 일지) | ✅ 완료 |
| **사업자 실값 + /privacy placeholder** | **BUSINESS_INFO 실값(상호·대표자·147-02-03988·주소·CS) + /privacy Anthropic 보유기간 명시(7일 이내 자동 삭제) + 보호책임자·호스팅사·사업자정보 5 Row 교체. 잔여: `[시행일]`×2(6/30)·통신판매업 신고번호(~6/19)** | (`2026-06-17` 일지) | ✅ 완료 |
| **sephirot 3번째 템플릿** | **STEP0 15항목 grep 재검증 PASS(슬롯14 flat·`#node` 0·음수좌표 0·transform 0) → `lib/poster/templates/sephirot.ts` 매니페스트(sentinel chapter no-op·zelkova significanceVariants 재사용) → 피커 3종(`#5C4A6B`) 추가. render.ts/mapping.ts diff 0** | (`2026-06-17` 일지) | ✅ 완료 |
| **인앱 브라우저 구글 로그인 대응** | **카톡·인스타·네이버 인앱 WebView 구글 403 disallowed_useragent 대응 — UA 감지 후 Android(KakaoTalk 전용 API 우선·Chrome intent 폴백)/iOS(amber 배너+URL 복사) 분기. 카카오·네이버 서버 액션 무변. `InAppBrowserGuard`·`InAppIosBanner`·`InAppGoogleNote` 3 export** | `docs/troubleshooting/inapp-browser-google-login.md` | ✅ 완료 |
| **이메일+비밀번호 회원가입·로그인 (Credentials)** | **Auth.js Credentials(Node-only, `auth.ts` 에만 추가·Edge `auth.config.ts` 무변) + bcryptjs(cost=12) + `User.passwordHash String?` 마이그 + `/signup` 신규 + `/login` 이메일 섹션. 기존 Kakao/Naver/Google OAuth·JWT 전략 완전 무변. 가입→자동 로그인 NEXT_REDIRECT re-throw 패턴** | (`2026-06-18` 일지) | ✅ 완료 |
| **React.cache() 중복 쿼리 제거** | **request 단위 메모 — `getLifeEvents`·`listAssistantAnswers`·`getBalance`·`getAttendanceStatus`·`getFamilyNewsCount` 5종에 `async _X + export const X = cache(_X)` 패턴 적용. 함수 시그니처·반환값·호출부 0줄 수정. `/life-timeline` 1요청 DB 쿼리 −2건** | (`2026-06-18` 일지) | ✅ 완료 |
| **연혁 → /poster 진입 버튼** | **`/life-timeline` hasEvents 액션 섹션 버튼 행에 amber-500 채움 Link 추가 — "이 연혁으로 포스터 만들기". 포스터 엔진·에디터·/poster 페이지 무수정, 마이그 0, +6줄** | (`2026-06-18` 일지 세션2) | ✅ 완료 |
| **Phase 8** | **이야기 주체 확장 — `Person.subjectType` discriminator(인물·장소·물건) + `/people` 3탭 UI + `PersonForm` isPerson 분기 + `PeopleConnectModal` 타입 확장. `PersonEvent`·`LinkResult`·가족 룸 0줄 수정. 마이그 1(ADD COLUMN·인덱스)** | (`2026-06-19` 일지) | ✅ 완료 |
| **장소 Autocomplete (#9)** | **Google Places Autocomplete 2-step — 인코딩 버그(CP949→UTF-8 mojibake) 진단 + `places:autocomplete` 후보 드롭다운 + `places/{placeId}` 상세 2단계. `Content-Type: charset=utf-8` 명시 + `PLACE_ID_RE` path injection 방지. `PlaceSearchInput` Google 분기(Naver 무변). 마이그 0** | (`2026-06-21` 일지) | ✅ 완료 |
| **CLOVA Speech 조사 (#10 STEP 0)** | **WAV/OGG/WebM 세 포맷 모두 CLOVA 200 COMPLETED — 변환 불필요. 현재 `audio/webm;codecs=opus` 그대로 전달 가능. `lib/storage.ts` 무수정. Phase 1 설계 확정(FreeRecorder + lib/clova-speech.ts + /api/clova-stt + createdVia="free_recording")** | (`2026-06-21` 일지) | ✅ 완료 |
| **온보딩 채팅 (B1~E)** | **채팅형 온보딩 4단계 — 11질문 채팅 UI(Haiku 파싱) + 인라인 위젯(LLM 0) + 장소 매핑(PlaceSearchInput 재사용) + 인물 추출(Sonnet → isDraft=false 즉시 확정)** | (`2026-06-22~23` 일지) | ✅ 완료 |
| **온보딩 장소 위젯 (F5) + AI 비서 통합 (G1·G2)** | **F5 온보딩 장소 위젯 검색창 상시화(네이버 기본·구글 전환·결과없음 텍스트만, PlaceSearchInput import 제거하고 /api/place-search 직접) + G1 비서 3버튼 허브(💬이야기 나누기→companion·🕰️그 시절·❓사용법 챗=Haiku 무료 `/api/tutorial-chat`) + G2 시대 목록 담기(연대 탭·사건/음악·`era-pick-actions` getEraCatalog/addEraItemAsLifeEvent → life_event isDraft=false). region 필터 불가(시대데이터 지역차원 X)·stories 모드 코드 보존·마이그 0** | (`2026-06-24` 일지) | ✅ 완료 |
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

**v3 월 OFF — 메인 동선에서 '월' 개념 제거 (2026-06-06)**:
- 통찰 — 사용자는 사건의 *순서* 는 기억해도 정확한 *월* 은 떠올리지 못한다. v3 피벗 때 메인은 연혁으로 옮겼지만 *클릭 동선*(점→월 화면, 사이드 "이번 달 타임머신", 진척 그리드 칸→월 화면)은 잔재로 살아 있었다. 이번에 네 진입로 모두 닫음
- 라우트 — `app/timemachine/[year]/[month]/page.tsx` 의 `export default` 를 `redirect("/life-timeline")` 한 줄로 교체. 기존 `TimemachineMonthPage` 함수는 `_TimemachineMonthPageArchived` 로 보존 + `__preserve_archived_exports` 객체 한 번 참조로 `no-unused-vars` 회피. 부활 시 default export 만 archived 로 가리키면 끝. 직접 URL·옛 북마크·외부 링크 모두 안전하게 흡수
- 사이드 패널 — `SidePanel.tsx` "이번 달 타임머신" `MenuItem` 한 블록 삭제, `SidePanelData` 타입에서 `currentMonthHref` 제거. `lib/side-panel-data.ts` 도 필드 + `LATEST_YEAR/MONTH` 상수 제거(사용처 0). 메뉴 6→5개
- 연혁 이벤트 클릭 — `TimelineView.tsx` 의 `timemachineHref(e)` → `editHref(e: RenderEvent) → /life-timeline/${e.originalId}/edit`. isPeriodEnd 행도 originalId 라 "끝" 점 눌러도 같은 이야기 편집(H4 originalId 명시 픽스 활용). aria "그 시기의 타임머신 열기" → "이 이야기 편집하기". `APPROX_DEFAULT_MONTH` 상수 미사용→제거(page.tsx 비서 fallback 용은 그대로)
- 진척 그리드 — `ProgressCard.tsx` 의 12개월 그리드 각 칸 `Link` → `<li>` 시각만. 안내문 "달별 기록 (눌러서 그 달로 이동)" → "달별 기록". aria "보러 가기" → 정보성. 채움/빔 색상은 그대로(동기부여 가치 보존)
- 보존 — 시드(MonthEvent·ChartSong), 컴포넌트(MonthV2·MonthForm·MonthStory·EventItem·SongCard·AssistantPanel), 비서 API(`/api/timemachine/assistant`)·server actions·revalidatePath 모두 무수정. 비서는 life_event 기반 컨텍스트로 이미 동작 → 영향 0. 시대 사건/음악 DB 는 비서가 여전히 참조해 AI 채팅 용도로 살아있음
- 검증 — tsc/build/people(39)/life-events(7)/timemachine-progress(15)/timemachine-screen 모두 통과. 새 lint 이슈 0 (기존 14건 pre-existing). build 결과에 `/timemachine/[year]/[month]` 라우트는 redirect 함수로 살아있음

**v3.6 + endMonth + 비서 UI 마무리 (2026-06-08)**:
- 홈 page link `/timeline` → `/life-timeline` 한 줄 픽스 (v3 메인 일관)
- 기간 카테고리(학령기 5 + 군대 + 첫 직장) `endMonth Int?` 추가 — 마이그 `20260607000000_end_month_for_period_events`. ADD COLUMN 한 줄, 기존 행 무영향. 끝 점이 endMonth 있으면 EXACT 큰 점 + "YYYY년 MM월" 라벨, 없으면 기존처럼 APPROXIMATE
- AssistantPanel 모드 선택 UI — selecting → stories(무료) / ask(토큰). "← 뒤로" + 모드별 칩 2~3개 + 깊이 토글은 ask 모드에서만. state(messages/savedAnswers/depth) 모드 전환에도 보존. 백엔드(`/api/timemachine/assistant`) 무수정
- 네이버 NCP 신형 키 = `ncpKeyId` (X-NCP-APIGW-API-KEY-ID 라벨), 구형 `ncpClientId` 폐기. `.env.example` 에 서버용/클라용 키 분리 정책 주석 (다음 배포 함정 방지)
- 지도 작업 점검 5건 픽스 — M2(같은 해 endMonth split: `(endYear !== eventYear || endMonth != null)`), M3(flushPendingBefore month 활용), H1(외부 API 메시지 친화 통일 + console.error 서버 로그만), H2(.env 키 분리 주석), M1(PlaceSearchInput AbortController)
- Auth.js dev cache stale → callback 404 사고 복구 — `.next/dev` 캐시 + 좀비 node 프로세스 정리로 catch-all 라우트 재등록

**시대 연혁 — E1(둘러보기) + E2(클릭 담기) (2026-06-08)**:
- 부모님 요청 두 개 동시 해결 — "카테고리별 시대 연혁 보기" + "9·11 같은 큰 사건 클릭 한 번으로 담기"
- **시드 적재** (E1 전제): 1980~2019 사건 88건 + 음악 73곡. `db/seed/era-events/` 폴더에 CSV + 자동 생성기(`_generate.ts`, RFC 4180 미니 파서 — 곡명/가수 안 쉼표 6건 정상 보존) + 생성된 `era-events.ts`/`era-music.ts`. `db/seed-era-events.ts` 가 deterministic id(SHA-256 24자) + per-row upsert — seed-timemachine 의 ChartSong `deleteMany+createMany` 패턴 대신 upsert 로 변경 (기존 2025-2026 음악 128곡 보존). MonthEvent 46→134 / ChartSong 128→201 (2025+ 보존 검증 통과)
- **E1 `/era` 둘러보기** (읽기 전용): 사이드 패널 "그 시절 둘러보기" 진입 + 연대 탭 4개(1980/90/2000/2010) + 사건 카테고리 필터 5개 + 한 연대씩만 표시(시니어 친화) + 음악 "▶ 유튜브에서 듣기" 검색 링크(저작권: 임베드·음원·앨범커버 X). `lib/era-labels.ts` (한글 라벨·연대 헬퍼·youtubeSearchHref) + `lib/era-events.ts` (`year ∈ [1980, 2024)` findMany) + `app/era/{layout,page,EraView}.tsx`
- **E2 클릭 담기**: 사건 카드 → "내 연혁에 담기" → `UserMemory(createdVia="era_event")` 한 행 생성 (year/month/title 미러링, content=null 본인 회상 자리 비움, precision=EXACT, category=null, monthEventId FK 로 출처 추적). 옵티미스틱 토글 + 담은 카드 emerald 강조 + "✓ 내 연혁에 있어요"
- **DB partial unique** — 마이그 `20260608000000_era_event_unique`: `CREATE UNIQUE INDEX … ON UserMemory(userId, monthEventId, createdVia) WHERE monthEventId IS NOT NULL`. Prisma `@@unique` 가 partial WHERE 표현 못 함 → schema 주석만, 마이그 SQL 만 partial. 코드는 P2002 catch 패턴(`stashEraEvent` → "stashed"/"already"). 3컬럼 묶음 이유: timemachine_event 와 era_event 별도 라이프사이클 보존. 적용 전 검증(`db/check-era-unique-conflict.ts`) — 충돌 0, monthEventId 있는 행 자체 0 (era_event 가 monthEventId 첫 사용)
- **`getLifeEvents` 확장**: `LifeEvent` 에 `kind: "life_event" | "era_event"` + `eraDescription`/`eraSource`/`eraSection` 필드. 두 createdVia 모두 가져옴 + monthEvent join. 호출자(`/life-timeline/page.tsx`)가 비서 컨텍스트는 `kind === "life_event"` filter 한 줄로 분리
- **연혁 시각 분리** (`TimelineView` 300+ 줄 변경): life_event = amber 점/카드, **era_event = slate-400 작은 점 + slate-50 카드 + "시대 배경" 뱃지 + 시대 자료(description) + 출처**. era 점·카드 **클릭 불가**(Link X) + 👤 인물 버튼 안 그림 + PlacePreview 안 그림. 카드 하단 "내 연혁에서 빼기" 버튼(옵티미스틱 hide → server action → router.refresh()). Legend 에 "시대 배경" 항목 추가
- **정책 가드** (이미 정함): 인물 연결 거부 — `lib/people.ts` `not_life_event` 가드 자동 처리 / 가족 룸 자동 노출 — `PersonalMemoryCard:109-113` 가 content null 시 본문 안 그려 레이아웃 0 깨짐 확인 / 비서 컨텍스트 제외 — 위 한 줄 filter
- 검증: `db/test-era-stash.ts` 10 시나리오(담기·중복·사용자 독립·필드 매핑 8개·getLifeEvents join·인물 거부·룸 노출·idempotent 사이클·life_event 회귀) + 기존 6 스크립트 회귀 통과

**`/era` UX 개편 — 텍스트 폭탄 해소 + 시각·감성 (2026-06-08 세션 2)**:
- 사용자가 E1+E2 직접 써본 후 "한 연대에 15건이 다 펼쳐져서 텍스트 폭탄" + "그림 없이 텍스트만이라 밋밋함" 두 문제 즉시 발견 → 한 세션에 세 축으로 해결
- **아코디언** — `EraEventCard` → `EraEventRow`. 평소엔 헤더 한 줄(아이콘 + 제목 + 카테고리 뱃지 + ✓ + ▼), 헤더 전체 `<button>` (`min-h-[56px]` 시니어 터치) 클릭 → 펼침. 전환 = `grid-rows-[0fr ↔ 1fr]` 패턴(height auto 트랜지션 대응 + 자식 `overflow-hidden`). 여러 개 동시 펼침 허용
- **lucide-react 아이콘** — 이모지 tofu 방지. `SECTION_ICON`: 정치사회 `Landmark` / 문화연예 `Film` / 스포츠 `Trophy` / 생활경제 `ShoppingBag`. 색은 카테고리 뱃지 톤 한 단계 진한 text-600(충돌 0). `lucide-react@^1.17.0` 추가
- **연대 배경** — `DECADE_BG_CLASS` 추가. 사건·음악 섹션 컨테이너 `bg-{color}-50/60`. 80s amber·90s emerald·00s sky·10s violet. 카드(흰색/emerald-50) 위로 떠 보이며 색 분리, 가독성 0 영향
- **사건 외부 검색 = 구글** — 처음엔 음악과 같은 유튜브 검색 + `showsYoutubeLink` 정책 함수(POLITICS_SOCIETY OFF + 24 키워드 부분 매칭)로 민감 사건 차단. 사용자 통찰 "구글은 위키·뉴스·백과 위주라 안전"으로 사건 전부 구글(`googleSearchHref`)로 전환, 정책 함수·키워드 죽은 코드 완전 제거(git history 가 복원 안전망 — YAGNI). 음악만 유튜브 유지(rose vs sky 톤으로 "영상·듣기" vs "정보 찾기" 분리)

**E3 — era_event 본인 회상 (2026-06-08 세션 3)**:
- E2 에서 의도적으로 비워둔 content 자리를 채우는 풀스택. 가족 룸 자동 전파 + 인물·비서 정책 보존
- **백엔드** — `saveEraMemory(userId, monthEventId, content) → "saved"|"cleared"|"not_stashed"|"too_long"` 4 결과 enum. 권한 = `updateMany {userId, monthEventId, createdVia:"era_event"}` 단일 가드(count=0 → not_stashed). 길이 500자 + trim → 빈 문자열이면 null 정규화. 새 헬퍼 `getStashedEraMemories`(Map: monthEventId → content) 추가 (기존 `getStashedEraEventIds` 보존)
- **server action** `saveEraMemoryAction` — auth + `revalidatePath` 세 경로(`/era`, `/life-timeline`, `/rooms`). 가족 룸 갱신 포함
- **EraMemoryEditor 공용 컴포넌트** — `app/era/EraMemoryEditor.tsx` 신규(default/compact variant). VoiceTextarea 재사용(음성 STT). 잔량 표시 + 저장 결과별 안내. 옵티미스틱 `onSaved` 콜백으로 부모 state 즉시 동기화
- **/era 펼친 상세** — 담은 사건만 EraMemoryEditor 항상 노출(default 톤, emerald). 안 담은 사건엔 안 보임(정책: 담아야 적을 수 있음). EraView state `Set<string>` → `Map<string, string|null>` 로 마이그
- **/life-timeline EraCard** — viewing/editing 분리(작은 카드 시각 부담 회피). 평소 "그때 저는 — [내용]" + 작은 [수정] / content null 이면 [✏️ 그때 어떻게 지내셨나요?] 부드러운 버튼. 클릭 시 compact editor 펼침
- **LifeEvent.monthEventId 노출** — `lib/life-events.ts` 타입 + select + 매핑에 추가(life_event=null, era_event=채워짐). EraCard 가 저장 키로 사용. `lib/people.ts` listEventsByPerson 매핑에 `monthEventId: null` 한 줄
- **가족 룸** — `PersonalMemoryCard:109-113` 의 `{memory.content && ...}` 가드 그대로 → content 채우면 자동 노출, null 이면 안 그림. **변경 0줄**
- **정책 보존** — 인물 연결 거부(not_life_event), 비서 컨텍스트 필터(`filter(kind === "life_event")`) 모두 무수정
- 검증: `test-era-stash` **17 시나리오 통과**(기존 10 + E3 신규 7) + test-people(39)/test-life-events 회귀 0 + tsc/빌드 통과

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

v3 월 OFF 신규 후속 (`docs/daily/2026-06-06.md` 참조):
- `/timemachine/[year]/[month]` 라우트 진입 텔레메트리 — redirect 흡수율(외부 링크·옛 북마크) 확인 후 라우트·시드 본격 제거 시점 결정
- `AssistantPanel` 의 `(year, month)` 컨텍스트 — life_event 기반은 OK 지만 "특정 시기 외 전반적 질문" 모드도 검토 (L7·인물 모달 후속과 결합)
- `ProgressCard` 자체 재구성 — v3 인생 연혁이 메인이라 "월별 진척" 의 가치 약화. "연도별 이야기 수" 같은 v3 친화 카드 후보
- 사이드 패널 메뉴 5개로 줄어든 시각 여백 정리 (현재는 단순 제거만)
- archived `_TimemachineMonthPageArchived` + `__preserve_archived_exports` 패턴 — 부활 결정 시 default export 한 줄 교체로 복구. 일정 기간 사용 0 유지 확인 후 별도 `_archived/` 폴더로 이동 검토
- ProgressCard import path 가 여전히 `app/timemachine/ProgressCard.tsx` (CLAUDE.md L8 기존 후속과 동일 영역) — 월 도메인 폴더에 남은 v3 친화 컴포넌트 위치 재정리 시 함께

v3.6 + endMonth + 비서 UI 신규 후속 (`docs/daily/2026-06-08.md` 참조):
- AssistantPanel 모드 선택 화면(ModeSelectionView/ModeCard) 다크모드 미대응 — CLAUDE.md M2 영역과 함께
- TimelineView 의 `expandPeriods`/`computePeriodFlags` 같은 해 endMonth 케이스 단위 테스트 (UI 검증 어려운 순수 함수 영역)
- `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` 환경변수 rename → `..._KEY_ID` (의미 명확). `.env.local` 동기화 필요
- Auth.js dev cache stale → catch-all 404 패턴 — 운영 노하우 문서화 또는 dev 시작 시 .next 자동 정리 정책 검토
- 지도 점검 H3·M4·M5·M6·M7·L1~L8 — 인물·다크모드·매직 상수·escape 표준화 등 다음 정리 사이클로
- 좀비 node 프로세스 (포트 3000 점유) — Windows 환경 자동 정리 스크립트 후보

E1 + E2 신규 후속 (`docs/daily/2026-06-08.md` 참조):
- ✅ **E3 era_event 본인 회상 추가 UI** — 2026-06-08 세션 3에서 완료(EraMemoryEditor + saveEraMemory 4 결과 enum)
- 가족 룸 시대 자료 한 줄 표시 — `listRoomMemories` 가 monthEvent join 안 함. 추가 select + `PersonalMemoryCard` 가 era_event 분기로 description 한 줄 노출. "엄마가 9·11 테러를 기억하신다" 만 보지 말고 "9·11 테러는…" 같이
- era_event 옆 + 버튼 활용 — 그 시기에 본인 이야기 추가 단축 (`/life-timeline/add?year=` prefill 기존 패턴 재사용)
- 시대 시드 확장 — 1980 이전(60-70년대) + 2020-2024 메우기. 어르신 회상 범위 확장 (현재 1980~2019 88건/73곡)
- partial unique index vs PG NULL unique 동등성 검토 — 인덱스 사이즈 절감 미미. standard `@@unique` 로 단순화 가능성(드리프트 우려 0)
- `CREATED_VIA_ERA_EVENT` 상수 lib/era-stash 와 lib/life-events 두 곳 정의 — cross-import 회피용. 상수 모음(`CREATED_VIA = {...}`) 통합 후보 (CLAUDE.md M15 영역)
- /era + EraView 다크모드 미대응 (M2 영역)
- /era 진입 텔레메트리 — 어떤 카테고리·연대가 많이 담기는지, 빼기 비율은 얼마인지 (시드 큐레이션 우선순위 데이터)
- listEventsByPerson 의 `kind: "life_event" as const` 상수 매핑 — 정책상 인물 연결은 life_event 만이라 OK. 정책 변경 시 함께 봐야

`/era` UX 개편 신규 후속 (`docs/daily/2026-06-08.md` 세션 2 참조):
- 펼친 상세 아이콘(🔍·▶·✓·▼·▲) 다크모드 대응 — CLAUDE.md M2 영역
- 헤더 영역 카테고리 뱃지 + ✓ + ▼ 라이트모드 정렬 — 좁은 모바일에서 길이 큰 카테고리 라벨이 사건 제목과 줄바꿈 시 시각 부담 점검
- `expandedIds` 셋이 연대/카테고리 바뀌어 사라진 카드의 id 도 보존 — 누적 미미하나 정리 후보(가비지 컬렉션)
- 사건 ✓ 표시는 헤더에만, 자세히 → 펼침 안 "내 연혁에 있어요" 표시도 시각 중복 가능성 — 사용성 점검
- lucide-react 트리 셰이킹 측정 — 4 아이콘만 import 인데 번들 영향 미세하지만 비교 데이터 후속

E3 신규 후속 (`docs/daily/2026-06-08.md` 세션 3 참조):
- `EraMemoryEditor` 가 외부 prop(initialContent) 변경 시 internal value 무동기화 — 다른 클라이언트가 회상 수정 시 사용자가 새로고침해야 반영. 단일 사용자 가정 OK 이지만 가족 룸과 양쪽 화면 동시 사용 시 통보 패턴 후속
- EraCard viewing/editing 모드 전환에 부드러운 트랜지션 미적용 — 즉시 전환. 펼침 트랜지션(`grid-rows-[0fr↔1fr]`) 적용 후보
- /era 펼친 상세에서 안 담은 사건 펼쳤다가 담으면 회상 영역이 갑자기 나타남 — 시각 깜박임. 옵티미스틱 stash → 회상 영역 fade-in 트랜지션 후보
- ERA_MEMORY_MAX_LENGTH 상수 lib/era-stash 와 app/era/actions(`ERA_MEMORY_LIMIT` 별명) 두 곳 export — 두 이름 중 하나로 통일 (단일 진실 원천)
- 회상 작성 텔레메트리 — 담은 사건 중 회상 채운 비율, 평균 길이, 음성 vs 타이핑 비율 (E3 사용성 데이터)
- /life-timeline EraCard 의 `e.content` prop 변경 시 localContent state sync 미동작 (useState 초기값만) — `useEffect` 또는 props key 패턴 검토
- viewing 모드의 "그때 저는" 본문 + emerald-700 텍스트 톤 — 가족 룸의 표시와 시각 일관성 점검 (룸 PersonalMemoryCard 는 zinc-800 본문)

Supabase 이전 신규 후속 (`docs/daily/2026-06-09.md` 참조):
- `.env.docker-backup` 정책 — 영구 보존 vs 일정 기간 후 정리 시점 결정
- Supabase 비용 모니터링 (Free 1GB Storage + 500MB DB → 사용자 ≥ 10명 시점에 Pro 검토)
- OnboardingForm 의 `router.push("/timeline")` (옛 메인) → `/life-timeline` 잔재 픽스 — 사용자가 짚은 onboarding 동선 정렬
- /timeline 라우트 자체 archived 패턴 적용 후보 (v3 월 OFF 와 같이 redirect 한 줄로 교체)
- profile/actions.ts·memory/actions.ts 의 `revalidatePath("/timeline")` 잔재 — `/life-timeline` 도 같이 또는 단일화
- Supabase Auth 자체와 Auth.js 의 JWT 충돌 가능성 (RLS 설계 변경 시점에 주의)
- pgbouncer connection_limit=1 정책 — 로컬 dev / serverless production 별 분기 필요시
- Storage cleanup cron (orphan DB-만/Storage-만 잔여 시) — 현재 정상 흐름은 둘 다 정리하지만 외부 조작 방어

Photo 1·2단계 신규 후속 (`docs/daily/2026-06-09.md` 참조):
- 3단계: 인생 연혁 카드에 사진 썸네일 미리보기 + 이벤트 편집 화면에 사진 추가 섹션
- 4단계: 인물 매칭 — `lib/people.ts` `not_life_event` 가드 확장 또는 분리(`not_life_or_photo`)
- 5단계: 장소 매칭 — `PlaceSearchInput` 재사용으로 추가 코드 0
- 6단계: 가족 룸 공유 — `PersonalMemoryCard` 의 사진 분기 + signed URL 권한 확장(룸 멤버)
- 7단계: HEIC 변환·EXIF strip·takenAt 자동 추출·썸네일 별도 저장·페이지네이션
- 8단계: 자녀 대리 업로드
- 사진별 visibility 토글 정책 (기본 룸 공유 ON vs OFF) — 6단계에서 결정
- service_role 키 회전 운영 절차 (1년 1회 또는 사고 시)
- Supabase Free 용량 quota 모니터링 도구 + 사용자별 limit
- /photos 페이지의 RSC 가 매 요청 signed URL N건 발급 — 1시간 만료 활용 캐싱 검토 (CLAUDE.md M3·M4 영역과 같이)
- PhotosGrid 모달의 background overlay 시 body scroll lock 안 적용 — 작은 사용성 (휠로 페이지 스크롤 가능)
- DELETE 라우트 idempotency — 같은 photoId 두 번 호출 시 두 번째는 404 (의도된 동작이지만 클라가 race 시 에러 노출 가능)
- `_test_archived` 폴더 일정 기간 후 별도 `_archived/` 폴더로 이동 검토

UX 픽스 5건 신규 후속 (`docs/daily/2026-06-09.md` 참조):
- ProgressCard 컴포넌트 + lib/timemachine-progress.ts + db/test-timemachine-progress.ts — 메인에서 빠졌지만 코드 보존. 부활 시 import 한 줄. 일정 기간 사용 0 유지 확인 후 archive 폴더로 이동 검토
- life-record 안내 박스 톤 — 사용자 피드백 받아 더 짧게/길게 조정 (현재 두 단락)
- PlaceSearchInput previewMarkers 외 다른 prop 도 같은 패턴(NaverMap onMarkerClick 등) 점검 — CLAUDE.md M6 후속 영역과 함께

Photo 3·4·5 + periodAnchor 신규 후속 (`docs/daily/2026-06-09.md` 세션2 참조):
- **사진 6단계(가족 룸 공유)** — `listRoomMemories` 의 `createdVia: { not: "photo" }` 제외를 해제 + signed URL 권한(룸 멤버) + PersonalMemoryCard 사진 분기(이미지 표시). 룸 leak 픽스가 이 단계의 선결 조건을 정리해 둠
- **사진 5단계(장소)** — `PlaceSearchInput` 재사용. **인물 매칭**(4단계 일부)은 `lib/people.ts` `not_life_event` 가드 확장 또는 분리 검토
- 사진 7단계 — HEIC 변환·EXIF strip·takenAt 자동·썸네일 별도 저장·페이지네이션·signed URL 캐싱(매 RSC N건 발급)
- 인물·장소도 기간 시작/끝 양쪽 중복(originalId 공유) — 사진 periodAnchor 와 같은 패턴으로 4·5단계 때 처리(메모해 둠)
- `createdVia` 매직 스트링 분산("photo" 가 rooms.ts·life-events.ts·photos.ts 세 곳) — `CREATED_VIA = {...}` 상수 모음 통합 후보(CLAUDE.md M15 영역)
- `db/backfill-photo-eventyear.ts` — idempotent no-op(2단계 테스트 사진 이미 삭제). 기록용 보존, 일정 후 archive 후보
- TimelineView `expandPeriods`/`computePeriodFlags`/PhotoStrip 앵커 필터 — UI 검증 어려운 순수 함수 단위 테스트 후보(CLAUDE.md 기존 후속 영역)
- 마이그/`prisma generate` 후 dev 서버 stale 클라이언트(`Unknown field` 에러) — .next 정리 + 재시작 필요. dev 시작 시 .next 자동 정리 정책 후보(Auth.js stale 패턴과 같이)
- /photos·EventPhotos·라이트박스 다크모드 미대응(CLAUDE.md M2 영역)

Photo×인물·장소(A·B·C) + SSR 픽스 신규 후속 (`docs/daily/2026-06-10.md` 참조):
- 사진 6단계(가족 룸 공유) 시 인물·장소도 룸 카드에 — 현재 룸은 photo 제외(leak 픽스), 6단계에서 photo 노출 + signed URL + 인물·장소 칩 함께 설계
- `not_linkable` 가 people-link 도메인, `lib/photos.ts` 의 `not_life_event` 가 attach 도메인 — 두 enum 이 의미가 겹쳐 보임. attach 쪽도 `not_linkable`/`not_attachable` 로 명확화 후보(지금은 grep 으로 분리 확인만)
- 인물·장소도 기간 시작/끝 양쪽 originalId 공유 → 렌더 억제(`!isPeriodEnd`)로 풀었지만, 사진(periodAnchor)·인물·장소 세 갈래가 split 처리 제각각 — `expandPeriods` 가 한 곳에서 "기간 부가정보는 시작 점에" 일괄 정책화 후보
- 글로벌 위젯·지도 `ssr:false` 적용 후 첫 상호작용 시 지도 청크 lazy fetch 지연 — 시니어 체감 점검(스피너/placeholder 보강 여부)
- `lib/era-constants.ts` 처럼 prisma 없는 순수 상수 모듈이 늘어남(place-types·place-validate·era-constants) — `lib/_pure/` 같은 폴더로 모을지 검토(클라/서버 공용 경계 가시화)
- `validatePlace` 가 이제 life-timeline·photos 두 진입 — `RawPlace` 입력 형태가 FormData(사진 API) vs 객체(life action) 두 갈래라 호출자마다 파싱. 공통 파서 후보
- TimelineView `PhotoCard` 의 `localPlace`/`localPeople` 옵티미스틱 state — 다른 탭에서 같은 사진 장소 수정 시 미동기화(단일 사용자 가정 OK, E3 EraCard 와 같은 후속 영역)

Photo 6 (EXIF·대량·첨부/빼기) 신규 후속 (`docs/daily/2026-06-10.md` 세션2, 코드리뷰 L1~L3):
- L1: 매직 스트링 "photo" 분산 — `rooms.ts:155` `{ not: "photo" }` 등이 `CREATED_VIA_PHOTO` 상수 안 씀. `CREATED_VIA = {...}` 통합(기존 M15 영역)
- L2: BulkUploadForm 대량 dataURL 메모리 — 30장 동시 EXIF/strip 시 일시 메모리(30장 cap이라 제한적). 필요 시 strip 도 concurrency 제한
- L3: 기간 이벤트에 넣은 사진 anchor=both 고정 — `movePhotoToEventAction` 이 기존 periodAnchor 유지. 기간 사건에 넣으면 시작·끝 양쪽 표시, 편집에서 재태그 가능하나 안내 없음
- `stripGps`/`extractPhotoDate` 단위 테스트 부재 — FileReader(브라우저 API) 의존이라 node 불가. jsdom 또는 e2e 후보(현재 grep+빌드+사용자 실측)
- EXIF orientation — `stripGps` 가 무손실(orientation 태그 보존)이라 OK 지만, 향후 썸네일·재인코딩(7단계) 도입 시 orientation 베이크 필요
- 사진 7단계 — HEIC 변환·EXIF 전체 strip·썸네일 별도 저장·signed URL 캐싱·페이지네이션(현재 listUserPhotos limit 200)
- 대량 업로드 진척/실패 텔레메트리 — 어느 dateSource 비율, 평균 배치 장수, strip 차단율(시드/UX 데이터)

테스트 전 정비 신규 후속 (`docs/daily/2026-06-11.md` 참조):
- 부모님 테스트 실관찰 — 환영 카드 → [시작하기] → add 폼 흐름, 문구 톤 피드백 후 조정
- dev 시작 시 `.next` 자동 정리 정책 — Auth.js stale·Prisma stale 패턴과 같은 영역(기존 후속 2건과 통합). 작업 수칙: dev 떠 있는 동안 `next build` 금지, 타입 검증은 `tsc --noEmit` 으로 분리 (`docs/troubleshooting/dev-server-build-next-conflict.md`)
- 레거시 /onboarding·/timeline 라우트 정식 archived 검토 — onboardingCompletedAt 의미가 환영 카드로 확장됐으니 레거시 동선 정리 시 함께 (Supabase 이전 후속의 /timeline archived 항목과 동일 영역)

디자인 토큰 + 문장 다듬기 신규 후속 (`docs/daily/2026-06-12.md` 참조):
- 가족 룸(`listRoomMemories`)은 원문 표시 유지 — 룸에도 교정본(displayRefined 스왑) 적용할지 별도 결정
- era_event 회상(EraMemoryEditor)에는 다듬기 진입로 없음 — life_event 편집 화면만. 확장 여부
- 길이 가드 하한 0.6 실사용 모니터링 — 장문에서 모델 문장 누락이 통과할 여지(프롬프트 "빼지 마라" 조항으로 보완 중)
- 무료 다듬기 호출 빈도 텔레메트리 — 남용 시 rate limit 검토
- `db/test-refine-lv2.ts` — 실 API 1건 호출 일회성 스크립트(회귀 자동화 아님), 일정 후 archive 후보
- rose(영상)/sky(정보)/blue(스포츠) 의미 분리 보조 팔레트 + 사이드 패널 amber 강조 토큰 미전환 — 의미색 토큰화 여부 다음 정리 사이클
- 다크모드 폐기로 기존 M2(다크모드 미대응) 후속 일괄 무의미화 — 후속 목록 정리 사이클에서 일괄 제거 후보

다듬기 UX·모델·404 신규 후속 (`docs/daily/2026-06-13.md` 참조):
- 무료→유료 전환 후 다듬기 호출 빈도·tier 분포 텔레메트리 — 어느 tier(빠르게/꼼꼼하게/가장 정밀)가 많이 쓰이는지, 신규 30토큰 소진 속도
- opus 가 짧은 단편에서 no_change 잦은지 모니터링 — reasoning 모델 특성. 잦으면 프롬프트 보강 또는 짧은 글은 opus 비권장 안내
- no_change 시 Anthropic 비용 흡수(특히 opus) — 호출 전 사전 게이트(잔액·최소 길이) 도입 여부. 현재 비서도 안 하는 패턴이라 미도입
- "아니" 같은 회색지대 군말 — 문두 군말 조항에 예시 있어도 모델이 수사적 반문으로 판단해 보존. 과교정 리스크로 강제 안 함, 사용자 보고 시 재검토
- 다듬기 토큰 라벨(1/3/5)은 안내용 근사치 — 긴 회상은 실제 더 차감. "약 N토큰" 식 기대치 관리 문구 검토
- manage 의 era·photo 행 — 현재 "안내" 유지. 장기적으로 "목록 제외"(life_event 만) vs 유지 결정. 같은 root 로 photo 독립 메모리도 안내 대상
- era_event 회상에 다듬기 진입로 — life_event 편집 화면만 있음(전날 후속 계속). EraMemoryEditor 에 tier 선택 다듬기 확장 여부
- 가족 룸(`listRoomMemories`) 교정본 적용 여부 — 전날 후속 계속(룸은 원문 유지)
- `db/test-refine-lv2.ts` — 지갑 생성 + tier/문장 인자 받게 보강됨. 실 API 일회성(회귀 자동화 아님), 일정 후 archive 후보

진입·법적 화면 톤 정리 (후순위 — 부모님 테스트 후. 지금은 모바일·결제 우선):
- 로그인/로그아웃/계정/이메일/초대 링크/consent 동의문 + global-error·/timeline(레거시) "새로고침" 등 IT용어·외래어 — 어르신 핵심 화면(연혁·era·사진·회상)은 2026-06-13 정제 완료, 진입·법적·설정 화면은 보류. 별도 톤 패스로 일괄 정리

랜딩 + 온보딩 신규 후속 (`docs/daily/2026-06-13.md` 참조):
- 랜딩 실화면 캡처 8개 슬롯(data-slot) 채우기 — hero-timeline(9/16)·step-1~3·product-poster·book·keepsake·anniversary-book
- 랜딩 카피 확정 — S2/S3/S5/S6 더미 → lib/landing-copy 한 파일 교체. S6 헤드라인·S2/S3/S5 본문
- /privacy v0 초안 → 법적 최종 문구 확정·게시(데이터정책 소관, 별도 세션)
- S4 CTA "선물 준비 알아보기" — 선물 안내 페이지/섹션 생기면 /login 에서 교체
- 온보딩 첫 사건 선택 v2 — sections 확장(2002 월드컵 등 SPORTS 앵커). pickOnboardingEraEvent 이미 파라미터화됨
- 온보딩 닫기 영속성 — 현재 localStorage 기기-로컬(기록 생기면 자동 소멸). 새 기기 재노출이 문제되면 서버 컬럼 검토(현재 스키마 0 우선)
- 온보딩 텔레메트리 — 첫 사건 카드 제시→저장 전환율, "나중에" 비율, 어느 연대 사건이 회상으로 이어지는지
- 첫 사건 카드 노출 시 추가 1쿼리(pickOnboardingEraEvent) — 자격자만(birthYear+nonBirth0)이라 영향 작지만 React cache() 후보(기존 M3/M4 영역)

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
- [x] 월 화면 비활성화 정책 (2026-06-06) → **삭제 X, redirect + archived**. `/timemachine/[year]/[month]` 는 `/life-timeline` 으로 redirect, 기존 함수는 `_TimemachineMonthPageArchived` 로 보존. 시드(MonthEvent·ChartSong)·비서 API·시드 의존 컴포넌트 모두 무수정. 부활 시 default export 만 archived 로 교체
- [x] 연혁 이벤트 클릭 동선 (2026-06-06) → `/timemachine/[year]/[month]` (월 화면) → `/life-timeline/[eventId]/edit` (이야기·장소·인물 통합 편집). 메인 동선에서 '월' 개념 완전 제거 — 사이드 "이번 달 타임머신" 메뉴·진척 그리드 칸 진입로도 함께 닫음
- [x] 기간 카테고리 끝 월(2026-06-08) → `UserMemory.endMonth Int?`. endMonth 있으면 끝 점이 EXACT 큰 점 + "YYYY년 MM월" 라벨. 같은 해(`endYear === eventYear`)라도 endMonth 명시되면 끝 점 split. flushPendingBefore 가 month 비교로 같은 해 다른 사건과 정렬
- [x] AssistantPanel 모드 선택 UI (2026-06-08) → selecting → "📚 그 시절 이야기"(우리 자료 무료) / "🔍 AI에게 물어보기"(인터넷 검색 토큰). 깊이 토글은 ask 모드에서만. state(messages/savedAnswers/depth) 모드 전환에도 보존. 백엔드 무수정
- [x] 네이버 지도 SDK 신형 키 (2026-06-08) → `?ncpKeyId=` (X-NCP-APIGW-API-KEY-ID 라벨). 구형 `ncpClientId` 와 호환 X. 환경변수명은 호환 위해 유지(`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`)
- [x] 지도 키 분리 정책 (2026-06-08) → `.env.example` 에 서버용/클라용 명시. 구글: 서버 IP 제한 / 클라 referrer 제한. 네이버: developers.naver.com 검색 키 / NCP Maps Dynamic Map 키 (완전히 다른 시스템)
- [x] place-search 외부 API 메시지 (2026-06-08) → 502 catch 의 `e.message` 사용자 노출 차단. 친화 메시지 한 종("장소를 찾지 못했어요…") + console.error 서버 로그만. 입력 검증 400 은 그대로 통과
- [x] 시대 사건 클릭 담기(E2, 2026-06-08) → 새 모델 0. `UserMemory.createdVia="era_event"` + monthEventId FK + year/month/title 미러링. content=null (본인 회상 자리 비움, 시대 자료는 monthEventId join 으로 표시). precision=EXACT, category=null
- [x] era_event 중복 차단(2026-06-08) → DB-only partial unique `(userId, monthEventId, createdVia) WHERE monthEventId IS NOT NULL`. Prisma `@@unique` 가 partial WHERE 표현 못 함 → schema 주석만. 코드는 P2002 catch 패턴. 3컬럼 묶음(timemachine_event 와 era_event 별도 라이프사이클 보존)
- [x] era_event 카드 클릭 동선(2026-06-08) → A안 클릭 비활성 + "내 연혁에서 빼기" 버튼만. 본인 회상 추가는 E3 후속. 인물 연결도 거부(`not_life_event` 가드)
- [x] LifeEvent kind 필드(2026-06-08) → `"life_event" | "era_event"`. 비서 컨텍스트는 호출자가 `filter(e => e.kind === "life_event")` 한 줄로 분리. life_event 만 가져오는 함수 별도 안 만듦(단순화)
- [x] /era 음악 정책(2026-06-08) → 곡명·가수·유튜브 검색 링크만. 임베드·음원·앨범커버 X (저작권)
- [x] /era 사건 리스트 아코디언(2026-06-08) → 평소 헤더 한 줄, 클릭 시 펼침. `grid-rows-[0fr↔1fr]` 패턴. 여러 개 동시 펼침 허용. 카드 컴포넌트명 `EraEventCard` → `EraEventRow`
- [x] 사건 외부 검색 = 구글 / 음악 = 유튜브(2026-06-08) → 사건은 모든 사건에 구글 검색(위키·뉴스·백과 안전). 음악은 유튜브 검색. `showsYoutubeLink` 정책 함수 + 24 키워드 폐기(git history 복원 안전망). rose(영상) vs sky(정보) 톤으로 시각 분리
- [x] era_event content 채우기(E3, 2026-06-08) → `saveEraMemory(userId, monthEventId, content) → "saved"|"cleared"|"not_stashed"|"too_long"`. 권한 = updateMany {userId, monthEventId, createdVia:"era_event"} 단일 가드. 길이 500자, trim 후 빈 문자열 → null 정규화
- [x] E3 양쪽 진입로 공용 컴포넌트(2026-06-08) → `EraMemoryEditor` (default/compact variant) 한 곳에서만 정의, /era 펼친 상세 + /life-timeline EraCard 가 import 해서 같은 동작. /era 는 항상 노출, EraCard 는 viewing/editing 분리(작은 카드 시각 부담 회피)
- [x] LifeEvent.monthEventId 노출(2026-06-08) → life_event 는 null, era_event 만 채워짐. EraCard 가 회상 저장 키로 사용. `lib/people.ts` listEventsByPerson 매핑은 항상 null
- [x] E3 가족 룸 노출(2026-06-08) → PersonalMemoryCard 변경 0줄. 기존 `{memory.content && ...}` 가드가 content 채우면 자동 노출, null 이면 안 그림
- [x] DB = Supabase Postgres(2026-06-09) → Docker 로컬 → Supabase 이전. pooling(6543, lib/db.ts PrismaPg adapter) + direct(5432, prisma.config.ts datasource.url 우선) 분리. 로컬 백업 .env.docker-backup 보존
- [x] pgvector 스키마(2026-06-09) → "extensions" 스키마(Supabase 권장). `ALTER DATABASE postgres SET search_path = "$user", public, extensions;` 가 vector 컬럼 마이그 통과의 단일 조건. schema.prisma 에 `extensions = [vector(schema: "extensions")]` 명시
- [x] .env 정책(2026-06-09) → 같은 키 중복 금지(Next @next/env 와 dotenv 우선순위 차이가 silent fail). 비밀번호 `$`/`#` 금지(dotenv 보간/주석 충돌)
- [x] 사진 데이터 모델(2026-06-09) → 옵션 C (Photo + UserMemory 1:N). 모든 사진은 UserMemory 1행에 매여 있고(독립 = `createdVia="photo"` 신규, life_event 첨부 = 기존), 한 메모리에 사진 N장. cascade delete (User/UserMemory → Photo DB), Storage 정리는 헬퍼에서 명시
- [x] 사진 Storage 권한(2026-06-09) → service_role 키로 서버 사이드 우회 + signed URL 발급(1시간). 클라 RLS 안 씀. NEXT_PUBLIC 접두사 금지, 진단 시 메타만(len/startsWith/exists)
- [x] 사진 orphan 방지(2026-06-09) → 업로드는 Storage put → DB tx (실패 시 try/catch 로 Storage 롤백). 삭제는 Storage remove → DB tx(Photo + photo-only 메모리 정리, life_event 첨부는 메모리 보존)
- [x] 사진 HEIC 정책(2026-06-09) → 1·2단계 거부 + 친화 안내("아이폰 설정→카메라→포맷→호환성"). magic number 검증으로 mimeType 위장 + 브라우저 라벨 오류(Safari HEIC→jpeg) 둘 다 차단
- [x] 사진 1단계 archive(2026-06-09) → app/photos/test → app/photos/_test_archived (Next.js private folder 패턴, 라우트 X 코드 보존). storage.ts 의 listUserPhotos → listStoragePhotos rename(photos.ts 와 충돌 회피)
- [x] 사진 연혁 표시(3단계, 2026-06-09) → `getLifeEvents` 는 photos **경로만**(순수 DB 유지 — test 스크립트가 Storage 자격증명 없이 호출). signed URL 은 page.tsx(RSC)가 `Promise.all` 배치 발급(개별 try/catch). `LifeEvent.kind` 3종 + `createIndependentPhoto` eventYear/eventMonth 미러링(없으면 사진이 타임라인에서 빠짐)
- [x] 사진 시각 구분(2026-06-09) → life=amber / era=slate / **photo=sky+📷**. 독립 사진 행(썸네일 주인공) + life_event 첨부 strip(최대 3장+"외 N장"). 라이트박스 **보기 전용**(삭제는 /photos·편집에서만). photo 행엔 인물·장소 안 그림(4·5단계)
- [x] 사진 비서 컨텍스트(2026-06-09) → **제외**. 기존 `filter(kind==="life_event")` 가 photo(새 kind) 자동 제외 — 코드 0줄
- [x] 사진 이벤트 첨부(4단계, 2026-06-09) → `attachPhotoToMemory` 검증을 **Storage 업로드 전에**(소유+life_event) → orphan 방지. POST `/api/photos` memoryId 분기. `EventPhotos` 형제(EventForm 무수정, 버튼은 children 으로 받아 맨 아래). 편집 화면은 삭제 OK
- [x] periodAnchor(2026-06-09) → `Photo.periodAnchor String @default("both")`(마이그 ADD COLUMN, 기존 행·단일 시점 자동 both). 기간 split 시작/끝 점에 사진 분리(`start`/`end`/`both`). `expandPeriods` `isPeriodStart` 마킹 + `PhotoStrip` 앵커 필터. PATCH `/api/photos/[id]` 재태그. 라벨 **공통 `시작 무렵 / 기간 전체 / 끝 무렵`**(카테고리별 입학·졸업 폐기 — 학교에만 맞아서)
- [x] 기간 = endYear 유무(2026-06-09) → 카테고리가 아니라 endYear 가 기간 표식(타임라인 split 이 이미 endYear 기준). EventForm 경로만 디커플(`createLifeEvent`/`updateLifeEvent`/`validate` 게이트 제거). **`/life-record` 의 `upsertLifeEvent` 는 카테고리 게이트 유지**(blast radius 절단). add 폼에 "한동안 이어진 일이에요" 토글
- [x] 사진 가족 룸 노출(2026-06-09) → **6단계 전까지 제외**. `listRoomMemories` 가 createdVia 필터 없이 멤버 전체 메모리 노출 → photo(year/title 미러링)가 이미지 없는 텍스트로 새던 leak 발견. `where` 에 `createdVia: { not: "photo" }`(era_event 는 E2/E3 정책상 유지). 회귀 `test-photo-room-isolation`
- [x] 사진 인물 연결(2026-06-10) → photo 메모리도 인물 연결 허용. `LinkResult.not_life_event` → `not_linkable` + `LINKABLE_CREATED_VIA = Set([life_event, photo])` 화이트리스트(era_event 거부). 독립 사진만 직접 매김, 첨부 사진은 부모 life_event 인물 상속. ⚠️ `lib/photos.ts` 의 별개 `not_life_event`(첨부 도메인)는 미수정(grep 으로 도메인 분리 확인)
- [x] 사진 장소 매칭(2026-06-10) → `validatePlace` 를 `"use server"` 밖 **순수 모듈 `lib/place-validate.ts`** 로 추출(life-timeline·사진 공유). `createIndependentPhoto` place 저장 + `updatePhotoMemoryPlace`(`updateMany {createdVia:"photo"}` 가드) + `updatePhotoPlaceAction`. PhotoCard 가 장소 모달 self-manage(`e.place` 이미 객체에 있음 → threading X). 마이그 0
- [x] 기간 인물·장소 중복(2026-06-10) → 사진(periodAnchor) 과 달리 인물·장소는 *기간 전체* 정보 → **앵커 없이 렌더 억제**. `TimelineView` 양쪽 카드에서 `{!e.isPeriodEnd && ...}` 로 시작 점에만. Photo 컬럼·마이그 0
- [x] era_event 길이 상한 위치(2026-06-10) → `"use server"`(app/era/actions.ts)는 number export 불가("found number"). 클라(EraMemoryEditor)는 prisma 의존 `lib/era-stash` import 못 함 → 순수 모듈 **`lib/era-constants.ts`** 단일 진실 원천(서버 재노출 + 클라 직접 import). `place-types.ts` 패턴
- [x] 지도 SDK SSR 격리(2026-06-10) → `@googlemaps/js-api-loader` 모듈 최상단 `window.trustedTypes` → SSR `window is not defined`. `PlaceSearchInput` 이 `PlaceMap` 을 `next/dynamic({ ssr:false })` 로 로드(지도=SEO 가치 X). dispatcher 한 곳 감싸 네이버·구글 모든 사용처 차단
- [x] 사진 EXIF·GPS(Photo 6 1단계, 2026-06-10 세션2) → `lib/photo-exif.ts`(클라). `extractPhotoDate`(DateTimeOriginal??CreateDate??lastModified??null + `dateSource` exif/file/none), `stripGps`(piexifjs GPS IFD만 무손실 제거, JPEG). exifr/piexifjs 함수 안 `await import`(초기 번들 0). `Photo.takenAt` 컬럼 기존(마이그 0)
- [x] GPS strip 정책(2026-06-10 세션2) → **업로드 전 클라에서 제거(기기 안 떠남) + 실패 시 차단**. `hadGps && !stripped` → 그 사진 업로드 거부(load 실패도 보수적 차단). 4경로(단일/대량/새이벤트/편집첨부) 전부 적용. 회상+가족공유라 누수 0 우선
- [x] 사진 사건 이동(Photo 6 3단계, 2026-06-10 세션2) → `movePhotoToMemory`(파일 이동 X, `Photo.memoryId` 재지정). 넣기=독립→life_event(era/남거부 `dest_not_linkable`/`dest_not_found`), **빼기=사건→독립 복귀(삭제 아님 — 어르신 사진 보존)**. 옛 photo-only 부모 비면 정리(orphan 0), life_event 부모 보존. 독립 복귀 연/월=takenAt 우선. `db/test-photo-move.ts` 17
- [x] add 화면 사진(2026-06-10 세션2) → add 는 memoryId 없어 즉시 첨부 불가 → `NewEventForm` 이 사진 보류 + `EventForm.onAfterCreate(eventId)` 에서 생성 직후 첨부. periodAnchor=both 고정(세분은 편집). 첨부 실패는 push 전 alert(M2)
- [x] 독립 photo 메모리 생성 단일화(M3, 2026-06-10 세션2) → `buildPhotoMemoryData` 헬퍼로 `createIndependentPhoto`·`movePhotoToMemory` 공유(autoTitle·year/month·eventYear 미러링·place)
- [x] 헤더 타임머신 입구(2026-06-11) → root layout 헤더의 "타임머신" 버튼 제거 — redirect 만 남은 v2 잔재 입구가 어르신 혼란 유발. 라우트·archived 코드·시드 전부 보존(비활성화+보존 원칙). 메인 동선 타임머신 입구 = 0
- [x] 첫 방문 환영 카드(2026-06-11) → 새 컬럼/마이그 0 — 기존 `User.onboardingCompletedAt` 재사용(레거시 /onboarding 설정·/timeline 체크뿐, v3 신규는 영원히 null = 정확한 첫 방문 신호). 표시 = `null && 이벤트 0건`. 닫기/시작하기 모두 `updateMany where null`(레거시 완료 시각 보존). V3WelcomeBanner 와 배타 렌더 + 닫을 때 localStorage 키 동시 마킹(배너 연속 노출 차단)
- [x] 디자인 토큰 = 라이트 온리(2026-06-12) → 다크모드 폐기(ThemeToggle·theme-actions 삭제, `color-scheme: light` 고정) — 기존 "CSS 변수 swap" 결정 대체. 토큰명에 크기 키워드 금지(base→canvas, `text-base` 충돌). 버튼 위계 5종(primary 필=bg-action 화면당 1개, destructive=빨강 필 금지), 칩 선택=banner+brand 보더(필 금지), 연대 틴트=워시 전용(텍스트 배경 금지). `docs/decisions/design-tokens-light-only.md`
- [x] 문장 다듬기 정책(2026-06-12) → 원문 영구 보존(refinedText 별도 컬럼 + displayRefined 승인 게이트 + "원래 글 보기" 상시), 무료(Haiku, chargeOneShot 0), 길이 가드 0.6~1.2(벗어나면 no_change — 0.8 은 군말 입말 과차단 실측으로 완화), content 수정 시 refined 3필드 초기화. 표시 스왑은 getLifeEvents 한 곳(편집 화면은 원문 고정). 사투리 보존은 예시 열거로 프롬프트 고정. `docs/decisions/memory-refine.md`
- [x] 다듬기 자동저장 UX(2026-06-13) → RefineSection 을 EventForm 안으로 이동(라이브 content 수신). [글 다듬기]=현재 textarea 자동 저장(saveMemoryContentAction)→교정→전/후 카드. "저장→재진입" 동선·미저장 draft 오발 해소. 빈 칸이면 aria-disabled+안내 토스트. 적용 후 "원래 글 보기" 토글 폐기→원래글/다듬은글 2단 상시. 메인 EventCard 에 회상 미리보기(line-clamp-2, !isPeriodEnd) 추가(스왑이 메인에 안 보이던 버그) + apply/discard/saveContent revalidate 에 /manage 추가
- [x] 다듬기 깨진 입력 교정(2026-06-13) → 프롬프트에 자모깨짐(ㅁㄴㅇ)·오타뭉침 맥락 추정 교정(불가하면 그 부분만 삭제) + 문두 군말(근데 그니까) 제거 + NO_CHANGE 엄격화("정말 깨끗한 글에만, 하나라도 있으면 교정"). "아니" 군말은 과교정 리스크로 미반영
- [x] 다듬기 모델 선택+차등 차감(2026-06-13) → tier 3종(haiku/sonnet/opus, UI 라벨 "빠르게/꼼꼼하게/가장 정밀"+1/3/5토큰). 무료→유료 전환(Haiku 도 1토큰, 멘탈 모델 일관성). chargeOneShot surcharge=tokensFromUsageForModel−tokensFromUsage 로 배수(정책 함수 무수정). **실제 교정본 저장될 때만 과금**(NO_CHANGE·길이가드 0) — 차감을 저장 *앞*에 둬 잔액 부족이면 저장 없이 InsufficientBalanceError→API 402. opus 4.7 temperature 거부는 supportsTemperature 가드 자동 흡수. 실측 haiku1/sonnet3/opus no_change0. `docs/decisions/memory-refine-model-tiers.md`
- [x] manage era·photo 404(2026-06-13) → getLifeEvents 는 3종(life_event·era_event·photo) 반환인데 manage 가 무분별하게 /[id]/edit 링크 → getLifeEventById(life_event 필터) null → 404. 같은 UserMemory 테이블이라 e.kind 분기(백엔드 0): life_event=수정/삭제, era_event="그 시절 둘러보기"(/era), photo="사진 화면"(/photos) 안내. 행은 목록 유지. A안(라우트 분기+EraView focus 신규) 대신 B안(편집면이 다른 게 데이터 정직). `docs/troubleshooting/manage-era-photo-edit-404.md`
- [x] 랜딩(/) + 공개 /privacy(2026-06-13) → 비로그인 랜딩(로그인은 /life-timeline 리다이렉트), 6섹션 와이어 v0.2. 헤더는 기존 layout 재사용(중복 X), 카피 lib/landing-copy 분리(확정 슬롯 + 더미), 이미지 슬롯 data-slot 8개, primary S1·S6만, 본문 18px 하한, `--color-ph` 토큰. 히어로 9/16(세로 모바일)·카드 4/3. 개인정보 링크 깨짐 방지 위해 공개 정적 /privacy(데이터 원칙 골자 v0 초안 — 법적 최종본은 데이터정책 소관) 동반 + proxy PUBLIC_PATHS 등록. S4 CTA 는 /login(후속 교체)
- [x] 온보딩 첫 사건 카드(2026-06-13) → birthYear 有 + **BIRTH 외 이벤트 0건**(getBirthYear 가 BIRTH 행 파생이라 "0건"과 모순 → 재정의)이면 시대 앵커 1개 제시. `pickOnboardingEraEvent`(target=birthYear+20, POLITICS_SOCIETY VERIFIED closest, 결정적 tie-break, sections 파라미터화로 v2 SPORTS 확장 여지). 저장 시 생성 = EraMemoryEditor optional `saveAction` prop(기존 호출자 무영향)에 stash+저장 결합 액션 주입. 닫기 = localStorage 기기-로컬(스키마 0, 기록 1건이면 자동 소멸). 첫사건>WelcomeCard>V3배너 택1. `docs/decisions/onboarding-first-era.md`
- [x] 개인정보 처리방침 v1.0 + consent 정합(2026-06-13) → /privacy 공개 정적(회사 약속 4조 + 1~10항, 사업자등록 6/17 전까지 `[ ]` placeholder). consent 동의문이 v1.0과 정합(국외이전 Anthropic/미국 명시 + 거부권 + "자세히 보기"→/privacy). 법적 영역이라 과도한 의역 금지·정확성 우선
- [x] 토큰 패키지 4종 + 기본지급 50(2026-06-13) → TOPUP_PACKAGES(1k/3k/5k/10k, 보너스 +30/75/250, tokens=총량 스냅샷·settle 무수정). SIGNUP_GRANT 30→50(신규만, 기존 지갑 무영향)
- [x] Opus 다듬기 차감 8배(2026-06-13) → `REFINE_MODEL_MULTIPLIER`(1/3/8) **신설로 비서 `MODEL_MULTIPLIER`(1/3/5)와 분리**. 공유 확인 후 "다듬기만" 결정(비서 Opus는 5 유지). 원가 초과 방지. RefineSection 근사치 라벨도 8로 동기화
- [x] 결제 success 재방문 가드(2026-06-13) → `findSettled{Order,ProductOrder}`로 confirm 호출 *전에* paid 확인 → "이미 충전/접수됐어요"(이미 처리된 결제에 confirm 재호출 시 에러화면 뜨던 것 방지). 토큰·상품 양쪽
- [x] 실물 상품 판매(2026-06-13) → **별도 `ProductOrder` 모델 + 결제 confirm 공용 재사용**. TokenOrder와 분리 이유: settle 부수효과 정반대(적립 vs 미적립)·배송 status 추가·필수 필드 상이. 가격=상수 카탈로그(서버 진실)·배송지=주문 스냅샷·전상법 5년 SetNull. 수량 v1 1 고정. `docs/decisions/product-order-commerce.md`
- [x] /shop 게이트(2026-06-13) → `/shop`·`/shop/<id>`(상세)는 proxy 비로그인 둘러보기 허용(랜딩 S3·S4 유입), 주문·결제(`/shop/<id>/order`·`/shop/order/*` 2단 경로)부터 로그인. 공개 페이지는 auth() 미호출이라 안전
- [x] Vercel prisma generate(2026-06-13) → `package.json` `postinstall: prisma generate`. 생성물(lib/generated/prisma)이 gitignore·미추적이라 Vercel install 후 클라이언트 누락 → 빌드 실패. build는 `next build` 유지(분리). migrate deploy는 운영 DB에 이미 적용
- [x] 탈퇴 시 ProductOrder 정리(2026-06-13) → `productOrder.deleteMany({pending/failed/canceled})`. paid 이후(preparing/shipped/delivered)는 FK SetNull 익명화 보존(전상법). TokenOrder 패턴과 동일하나 보존 status가 여럿이라 삭제 대상 명시
- [x] 소셜 로그인 카카오·네이버(2026-06-13 세션3) → **스키마/마이그/패키지 0**. next-auth 내장 provider 를 `auth.config.ts` `providers: [Google, Kakao, Naver]` 에 추가 + `login/page.tsx` 버튼 3개(카카오 #FEE500/네이버 #03C75A 브랜드색 = 디자인 토큰 의도된 예외, 56px·18px 유지, 순서 카카오→네이버→구글). 마이그 불필요 근거: `User.email String? @unique`(Postgres NULL 다중 허용 → 카카오 무이메일 가입 OK)·식별은 `Account(provider, providerAccountId)`(email 무관)·게이트(`proxy.ts`/`/enter`/온보딩)가 `consentComplete` 단일 플래그라 provider-무관. 별도 계정 정책(이메일 자동 병합 X = Auth.js 기본). `docs/decisions/social-login-providers.md`
- [x] 네이버 env 정리(2026-06-13 세션3) → `NAVER_MAP_CLIENT_ID/SECRET`(이름과 달리 NCP 지도 아닌 developers.naver.com **지역 검색 API** 키, place-search 검색창용) → `AUTH_NAVER_ID/SECRET` 로 rename. 한 네이버 앱 키로 검색+로그인 공유(Auth.js 자동 인식). 코드 1줄(`place-search/route.ts`)+`.env`+`.env.example`. ⚠️ `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`(NCP Maps 타일 SDK)는 완전히 다른 시스템 — 무수정
- [x] 소셜 profile() 매핑(2026-06-13 세션4) → 카카오·네이버 기본 profile() 이 name 에 별명을 넣음 → **회원이름 우선** 커스텀(네이버 `response.name`, 카카오 `kakao_account.profile.nickname`/`properties.nickname`, 둘 다 폴백 + 한글 기본값). next-auth 소스 타입 직접 확인. 사용자는 콘솔 제공정보에 "이름" 동의항목 선택해야 실명 내려옴
- [x] 계정 연결(2026-06-13 세션4, 보류) → 자동 연결 **불가**(kakao/naver 이메일 미수집 = 매칭 키 없음, Auth.js 자동매칭은 이메일뿐). 로그인 상태 signIn 은 linkAccount 로 기존 User 에 Account 추가됨(JWT 도 동작, 마이그 0)이나 ① 이미 둘 다 계정 생긴 뒤엔 OAuthAccountNotLinked 에러 ② linkAccount 는 데이터 병합 안 함. → 6/19 엔 "단일 로그인 수단 유도"가 어르신에 적합, 수동 연결 UI 는 출시 후
- [x] OG 메타 + 동적 이미지(2026-06-13 세션4) → `layout` metadataBase(`lifebook-mauve.vercel.app`)+전역 openGraph(siteName/locale/type)+twitter(summary_large_image), `page` 랜딩 오버라이드(S1.sub 재사용 + siteName 등 재명시 — Next openGraph **깊은 병합 안 함**). `app/opengraph-image.tsx` 동적 1200×630(Noto Serif KR subset fetch, woff2 회피 truetype 매칭). ⚠️ `/opengraph-image`(점 없는 경로)가 미들웨어 matcher 못 걸러 인증 리다이렉트 → `proxy.ts` PUBLIC_PATHS 등록 필수. `docs/troubleshooting/og-image-middleware-redirect.md`
- [x] 랜딩 이미지 슬롯(2026-06-13 세션4) → placeholder `Slot` → `next/image`(fill·object-cover), optional `src`/`alt`/`imgClassName`(미전달=placeholder). 8슬롯 전부 실화면(hero 9:16 object-top·step 4:3·product 4:3·anniversary 3:4). ⚠️ S4 책이 fill 의 intrinsic 너비 0 으로 grid `auto` 트랙 수축(2px) → `lg:grid-cols-[1fr_220px]` 고정. alt 는 PRODUCT_ALT/STEP_ALT 매핑(title 과 다른 경우)
- [x] 포스터 3계층 + 편집 트릴로지(2026-06-16) → 엔진(매핑·렌더러·매니페스트) 종지식 0, 종 추가=SVG+매니페스트 1개. 편집(빼기·S/M/L·위치·크기·메모)은 `PosterInteractive` 클라 후처리 단일 useEffect(idempotent)·인라인 setAttribute/style(CSS/presentation 충돌 회피). 드래그=포인터+`getScreenCTM().inverse()`, 크기=중심 scale로 transform 확장, 메모=별도 effect 격리+`dragRef.kind` 분기 재사용. `render.ts`/`mapping.ts` 무수정·마이그 0·미리보기 전용(인쇄 굽기 후속). sephirot=슬롯 DOM 비호환 STOP. `docs/decisions/poster-tree-editor.md`
- [x] Google autocomplete 인코딩 정책(2026-06-21) → `Content-Type: application/json; charset=utf-8` 명시(mojibake 방지) + Node.js `JSON.stringify()` 기본 UTF-8. placeId path injection 방지 `PLACE_ID_RE = /^[A-Za-z0-9_-]{5,200}$/`. 기존 searchText/네이버 경로 무수정
- [x] Google 장소 검색 2-step(2026-06-21) → autocomplete(후보+placeId, 좌표 없음) → detail(좌표+주소) 분리. 이유: searchText 는 완전한 이름 필요, autocomplete 는 타이핑 중 약칭("중산고") 에서도 후보 표시. API 호출 1회 추가이나 사용자 재시도 감소
- [x] CLOVA Speech 오디오 포맷(2026-06-21) → WAV/OGG/WebM 세 포맷 모두 CLOVA `/recognizer/upload` 200 COMPLETED 확인. **변환 불필요** — 현재 `audio/webm;codecs=opus`(Chrome/Edge 기본) 그대로 전달. Phase 1 구현 시 MIME 타입 그대로 사용
- [x] 채팅 온보딩 진입 분기(B1, 2026-06-22) → `/enter` 에서 `birthYear+이벤트 없음` 조건 → `/onboarding-chat`. 기존 `/life-record` 흐름 보존(둘 다 살아있음). `/api/onboarding-chat` 에서 필드별 파싱 프롬프트 + JSON 추출(birthYear/residences/schools 등). 필수 필드 스킵 시 1회 재요청 후 통과. 완료 시 `lib/companion.ts` `buildSystemPrompt` 에 LifeProfile 섹션 주입(동반자가 온보딩 답변 자동 활용)
- [x] 온보딩 위젯 LLM 우회(B2, 2026-06-22) → `widgets.tsx`: `YearWidget`(숫자 입력) · `ChipsWidget`(관심분야 다중선택) · `MultiItemWidget`(항목 추가형). 위젯 선택 → `handleDirectSubmit` 으로 직접 저장(Haiku 파싱 0). 자유 텍스트 병행 허용. 어르신 친화 min-h-[56px]·연도 text-[22px]·Enter 지원
- [x] 온보딩 장소 저장 위치(D, 2026-06-22) → `LifeProfile.residencePlaces/schoolPlaces Json?`(마이그 1). `PlaceableMultiItemWidget` 신규 — MultiItemWidget + 항목별 "📍 지도에서 찾기" 토글. `PlaceSearchInput` 재사용(새 API 0). 좌표 있는 항목만 upsert(나중 map/poster용, 현재 소비처 없음)
- [x] 온보딩 인물 확정 정책(E, 2026-06-22~23) → `extractOnboardingPeople(answers)` — siblings·parentsInfo·closeFriends 텍스트에서 Sonnet으로 후보 최대 5명 추출 → `phase="people"` 전환, 채팅으로 하나씩 성함 확인 → `createPerson(isDraft:false)` 즉시 저장. 후보 없으면 직행. 각 후보 "이 분은 넘어가기" 허용. companion draft(isDraft=true, AI 추론)와 완전 분리 경로
- [x] 온보딩 장소 위젯 검색 상시화(F5, 2026-06-24) → `PlaceableMultiItemWidget` 재작성. "📍 지도에서 찾기" 버튼 게이트 제거 → 검색창 상시 노출(네이버 기본 + "구글로 전환"). 결과 클릭=좌표 포함 추가 / "검색 없이 추가"·결과 없음=텍스트만(좌표 null). `PlaceSearchInput` import 제거하고 `/api/place-search` 직접 호출(같은 debounce, 컴포넌트 무수정). 저장 정책·마이그 무변
- [x] AI 비서 3버튼 허브(G1, 2026-06-24) → `selecting` 모드를 2버튼→3버튼: 💬이야기 나누기(`onNavigate("/life-timeline/companion")`, 모달 닫고 라우팅) · 🕰️그 시절 이야기(기존 stories/ask 플로우를 `era-selecting`로 한 단계 내림) · ❓사용법 물어보기(신규 tutorial 챗). 컨텍스트 year/month는 버튼2에만 필요
- [x] 사용법 안내 챗(G1, 2026-06-24) → `/api/tutorial-chat` 신규(Haiku, `TUTORIAL_CHAT_MODEL` env). 웹검색·DB·**토큰 차감 전부 X**(`auth()` 게이트만). prior 8턴 clamp. 시스템 프롬프트에 Lifebook 기능·태도 고정. UI는 companion/AssistantPanel 채팅 패턴 재사용 + 자주 묻는 질문 칩 4개
- [x] 시대 목록에서 고르기(G2, 2026-06-24) → "그 시절 이야기" 갈래에 browse 모드 추가(기존 ask=AI 대화와 둘 중 선택). `era-pick-actions.ts`: `getEraCatalog()`(listEraEvents/Songs 재사용 전체 + birthYear→defaultDecade) + `addEraItemAsLifeEvent(kind,id)`(서버 재조회 → `createLifeEvent` isDraft=false, content 빈칸, category FAMILY 기본). 연대 탭(1980/90/2000/2010)·사건/음악 탭·"기억나요" 세션 옵티미스틱. ⚠️ region은 시대데이터 지역차원 없어 필터 불가(birthYear만). /era era_event(시대배경)와 별개로 life_event(본인사건)로 담김. stories 모드 코드 보존·마이그 0
- [ ] CLOVA Phase 1 구현 → FreeRecorder 컴포넌트(통 녹음), lib/clova-speech.ts, /api/clova-stt, /life-timeline/free-record 화면, createdVia="free_recording"
- [ ] 가족 룸 교정본(C, 출시 후) → listRoomMemories는 원문 유지. 룸에도 다듬은 글 표시할지 미정
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
