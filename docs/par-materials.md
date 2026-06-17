# 이력서 소재 모음 (PAR)

## 시니어 친화 회고 서비스의 풀스택 베이스 구축

- **Problem**: 30대~70대 폭넓은 사용자, 특히 고령층까지 편하게 쓰는 회고 서비스가 필요. 4개 분리된 layer(인증/동의/데이터/UI)가 첫날부터 모두 동작해야 다음 phase에서 막힘 없이 진행 가능.
- **Action**: Next.js 16 (App Router + RSC + Turbopack) + Postgres/pgvector + Prisma 7 + Auth.js v5 풀스택을 한 세션에 셋업. 서버 컴포넌트에서 Prisma 직접 호출(별도 API 레이어 0), JWT 세션 + 에지 미들웨어로 라우트 보호, 시니어 접근성(본문 18px+, 카드 88px, 4px focus ring)을 기본값으로 채택.
- **Result**: Phase 0→3 (셋업·데이터·UI·인증) 4단계 완료. 32개 검증된 앵커 이벤트 시드, 1979→2025 연도순 타임라인 정적 렌더, OAuth + 명시 동의 게이트, 무세션 접근 시 307 리다이렉트 모두 검증. 총 25 commit으로 모든 변경 단위가 추적 가능한 상태.

## Prisma 7 driver adapter 패턴으로의 마이그레이션

- **Problem**: Prisma 7부터 PrismaClient 생성자가 `datasourceUrl` / `datasources` 같은 클래식 옵션을 전부 거부. 공식 문서가 충분히 따라잡지 못한 상태에서 첫 DB 핑이 실패.
- **Action**: 에러 메시지를 단서로 생성된 타입 정의(`PrismaClientOptions` 유니온 타입)를 역추적, `adapter | accelerateUrl` 두 가지만 허용됨을 확인. `@prisma/adapter-pg` + `pg`를 도입해 driver adapter 패턴으로 전환.
- **Result**: `SELECT 1` 핑 정상, `@auth/prisma-adapter`(Auth.js)와도 추가 설정 없이 호환. 신생 메이저 버전이라 동일한 함정에 빠질 다음 개발자를 위해 결정 문서(`docs/decisions/prisma-7.md`)와 트러블슈팅 문서(`docs/troubleshooting/prisma-7-client-options.md`)로 정리.

## Edge 미들웨어에서 동의 게이트 분기

- **Problem**: 개인정보 / 국외이전 / 약관 3종 동의를 받지 않은 사용자는 서비스 진입 차단해야 함. 하지만 Next.js 미들웨어는 Edge 런타임이라 Prisma 직접 호출이 불가능.
- **Action**: Auth.js v5의 `jwt` 콜백을 Node-only 인스턴스(`auth.ts`)에서만 실행하도록 분리, DB의 동의 타임스탬프 3종을 읽어 `token.consentComplete` 불리언으로 JWT에 박음. Edge 미들웨어는 동일한 `auth.config.ts`로 JWT만 디코딩해 분기.
- **Result**: 미들웨어에서 DB 호출 0회로 보호 라우트 분기 가능(`/timeline`·`/consent` 무세션 접근 시 307→`/login` 검증). 에지 ↔ Node 코드 분리(`auth.config.ts` / `auth.ts`)는 Auth.js v5의 권장 패턴이지만, 콜백 일부만 Node에 두는 변형 설계로 동의 상태까지 에지에 노출.

## Next.js 16 deprecation 빠른 마이그레이션

- **Problem**: 라우트 보호용 `middleware.ts`를 작성했는데 보호된 경로가 무세션 상태에서도 200 응답. 미들웨어 자체가 실행되지 않는 상태.
- **Action**: matcher / 캐시 / 재시작 등 표면 원인을 차례로 배제한 뒤 dev 서버 stdout에서 deprecation 경고 1줄 발견(`The "middleware" file convention is deprecated. Please use "proxy" instead`).
- **Result**: 파일명 한 줄(`middleware.ts` → `proxy.ts`) 변경으로 5분 이내 종결. 메이저 버전 업그레이드 직후 dev 로그를 우선 확인하는 습관의 가치를 데이터로 확인.

## Voyage AI 임베딩 + pgvector RAG로 세대 맞춤 음악 추천

- **Problem**: 사용자의 회상 기억을 자극할 "그 시절 그 노래"를 자동 추천하고 싶었다. 사용자 출생연도와 관심사·취향(`favMusic`)을 바탕으로 70곡 카탈로그에서 cosine similarity로 매칭하되, 시대 적합성("회상 절정 = 13~25세")도 함께 가중해야 했다.
- **Action**: Voyage AI `voyage-3.5` 모델(1024-dim, 다국어, retrieval 최적화)로 곡 메타데이터 임베딩. PostgreSQL pgvector 확장 + `vector(1024)` 컬럼에 저장(Prisma는 vector 타입 미지원 → `Unsupported` 선언 + raw SQL). 매 사용자 요청에 프로필 문자열을 query 임베딩으로 변환, `embedding <=> $1::vector` 코사인 거리 + `CASE WHEN year - $birthYear BETWEEN 13 AND 25 THEN 1.0 ELSE ...` 가중치를 단일 SQL에서 곱한 score로 정렬.
- **Result**: 1965년생(이문세/김광석 favMusic) → 광화문 연가·이등병의 편지 등 80년대 발라드 상위, 1995년생(BTS/아이유) → 2010년대 K-pop 상위로 명확한 세대 분리 검증. 정확검색(exact kNN)으로 시작했고 1000곡 넘으면 HNSW 인덱스 추가 예정. MusicBrainz 메타데이터 보강과 결합한 하이브리드 시드(매칭 77%, 한국 곡은 한글 검색 한계 수용)도 같이 운영.

## AI 호출 비용을 사용자 토큰으로 환산하는 결제 시스템

- **Problem**: 추억 1건당 Claude API 호출이 가이드 질문 생성 + 답변 요약 두 번 발생. 평균 1,113 AI 토큰. 이를 사용자에게 "내가 토큰 N개 썼다"로 보이게 환산 + 잔액 부족 시 토스페이먼츠로 충전 + 무료 가입 지급까지 한 사이클을 닫아야 했다.
- **Action**: 측정 스크립트로 cycle당 토큰 baseline 확보(±2% variance) → `lib/tokens/policy.ts`에 환산 상수(N=2000, 1 사이클=1 토큰), 신규 30 토큰, 1,000원=100 토큰을 한 곳에 모음. `TokenWallet`(@unique userId) + `TokenTransaction` ledger를 항상 `$transaction`으로 같이 mutate → balance ↔ tx sum invariant. signup grant는 3중 가드(fast path + DB unique + P2002 catch). AI 차감은 **사이클 단위 합산**(호출당 ceil 중복 방지) — AIMessage.chargedAt null인 메시지를 한 번에 settle. 토스 결제는 클라이언트가 packageId만, 서버가 policy.krw 결정 + Toss `/v1/payments/confirm` 호출 후 `confirmed.totalAmount === order.krw`로 다시 검증. paymentKey @unique로 중복 적립 차단.
- **Result**: 8단계(정책→지갑→차감→가드→결제→내역)를 9 커밋으로 완성. 자동 검증으로 happy path / 같은 paymentKey 재시도 / amount mismatch / 무료 grant idempotency 모두 통과. 시크릿 키는 server only, 클라이언트는 packageId 외 어떤 결제 파라미터도 결정 못 함.

## 가족 공유 룸의 다중 layer 권한 게이트

- **Problem**: Phase 9에서 사용자가 가족·배우자와 추억을 공유하는 룸을 만든다. 비멤버 접근 차단 + 미동의 초대자 차단 + 한 사용자가 여러 룸에 속할 때 룸 간 데이터 누수 방지 + 추측 불가능 초대 토큰까지 모두 보장해야 했다.
- **Action**: `RoomMember(@@unique[roomId, userId])`의 `consentAt: DateTime?`을 사실상 멤버십 게이트로. `getMembership()` 단일 함수가 `consentAt = null`을 비멤버로 반환 → 모든 룸 데이터 helper(`listRoomMemories`, `listSharedMemories`, `listRoomCommentsByTarget`, CRUD 액션 5개)가 진입 시 재검증. 초대 토큰은 `randomBytes(32).toString("base64url")` 256bit. `/invite/[token]` 페이지는 동의 화면일 뿐, 도달만으로 멤버 안 됨. ConsentForm checkbox + `joinRoomAction`의 `agree === "on"` 서버 재검증 이중 가드. 룸 데이터 query는 `WHERE userId IN (그 룸 멤버)`로만 — 다른 룸 데이터 누수 SQL 레벨 차단.
- **Result**: 트랙 A(룸+초대+공유 타임라인+댓글) + 트랙 B(공동 추억 작성/편집/삭제)를 7단계, 9 커밋으로 완성. 3 user 검증(alice owner, bob member, eve outside)으로 모든 read/write 권한 매트릭스 9가지 모두 정상 동작 확인. eve는 멤버십 조회·룸 메모리·댓글·공동추억 모두 null 또는 throw로 차단.

## 코드 6개 lens 검토 + 가장 시급한 4건 즉시 수정

- **Problem**: Phase 0~9 + 음악 재생까지 25개 phase, 30개 prisma 모델, 80+ 파일로 누적된 코드. 마이그레이션 직전(또는 phase 10 시작 직전) 시점에 보안·결제·개인정보·데이터모델·안정성·품질 6개 영역 모두 전수 점검 필요.
- **Action**: 각 lens별로 1) 호출 그래프 추적, 2) cascade/unique/index 의도 검증, 3) try/catch 누락 grep, 4) console 경고 dev 로그 추출 패턴으로 진행. 발견사항을 모두 [심각도/파일:줄/문제/제안] 형식으로 정리(50+건). 이후 사용자와 함께 가장 시급한 4건을 "바구니 1"로 묶어 즉시 수정.
- **Result**: 바구니 1 — (1) `chargedAt IS NULL` 조건부 SQL UPDATE + `balance >= cost` 가드로 AI 차감 race-safe (parallel settle 검증), (2) Voyage helper 자체에 try/catch + `failed: boolean` 결과로 외부 부가 기능 실패가 timeline 전체를 무너뜨리지 않게, (3) `app/error.tsx` + `app/global-error.tsx`로 raw 에러 비공개 + 한국어 친화 fallback, (4) 저장 안 되는 marketing 체크박스 UI 제거(정보통신망법 risk 해소). 4 커밋. `mvp-v1` → `phase9-complete` → `review-pass-1` 세 단계 태그로 단계별 백업 푸시.

## "use server" 모듈 제약을 빌드 에러로 발견 → 에러 클래스 별도 모듈 분리

- **Problem**: 토큰 잔액 부족 안내를 위해 `InsufficientBalanceError` 클래스를 만들고 server action에서 throw, client component(`AnswerForm`)에서 message로 분기하려 했다. 그런데 빌드 시 `Only async functions are allowed to be exported in a "use server" file` 에러.
- **Action**: 근본 원인 분석 — `"use server"` 디렉티브는 그 파일의 모든 export를 RPC endpoint로 marking. 클래스는 RPC endpoint가 될 수 없으니 export 거부. 같은 이유로 상수·변수도 export 불가. 해결책으로 클래스 정의를 별도 모듈(`lib/tokens/errors.ts`, use server 아님)로 분리하고 actions.ts는 import만.
- **Result**: 빌드 통과, AnswerForm은 기존 `err.message.includes("insufficient balance")` 분기 유지(instanceof는 server/client 경계 넘으면 불안정). 권장 분리 패턴(에러는 errors.ts, 타입은 types.ts, action 함수만 actions.ts)을 트러블슈팅 문서로 정리해 향후 같은 함정 회피.

## PostgreSQL 조건부 UPDATE + RETURNING으로 race-safe 토큰 차감

- **Problem**: 사용자가 "추억 남기기" 버튼 더블 클릭 또는 네트워크 retry로 같은 답변이 동시 두 번 처리되면 같은 cycle을 두 번 settle → 토큰 2배 차감 + 잔액 음수 가능. PostgreSQL 기본 격리 수준(READ COMMITTED)에서 SELECT 후 UPDATE 패턴으로는 race window 존재.
- **Action**: 한 `$transaction` 안에서 두 raw SQL로 atomic 처리: (1) `UPDATE "AIMessage" SET chargedAt = NOW() WHERE chargedAt IS NULL RETURNING ...` — row-level lock + WHERE 재평가로 race winner 단일 결정, loser는 빈 RETURNING. (2) `UPDATE "TokenWallet" SET balance = balance - $1 WHERE balance >= $1 RETURNING balance` — 잔액 부족 시 빈 결과 → `InsufficientBalanceError` throw → transaction rollback으로 chargedAt 변경까지 모두 되돌림.
- **Result**: 검증 스크립트 `db/test-charge-race.ts`로 `Promise.all([settle, settle])` 시 정확히 하나만 charged=true, 다른 하나는 no_usage 반환 + 잔액 30→29 한 번만 차감 + reconcile match=true 확인. 같은 패턴(조건부 UPDATE + RETURNING)을 향후 inventory / quota / 다른 ledger 도메인에서도 재사용 가능.

## 핵심 UX 를 "타임머신" 모델로 피벗 — 한 세션에 6 phase 완성

- **Problem**: 기존 출생연도 기반 타임라인(Phase 5)·음악 RAG(Phase 6) 은 1979→2025 큰 리스트 + 임베딩 유사도 기반 곡 추천 구조. 사용자가 "어느 달 이야기를 적어야 하지" 결정해야 하는 부담이 큼(시니어에겐 자유도가 곧 막막함) + 추천 관계가 흐림(왜 이 곡인지 불투명). 회상은 "특정 시간의 절단면"이 가장 강력한 단서라는 통찰로 핵심 UX 재설계 결정.
- **Action**: "한 달씩 거꾸로 시간여행" 모델로 6 phase 분할 (T1 데이터 모델 / T2 시드 / T3 월 화면 / T4 음성→AI 다듬기 / T5 음악 카드 / T6 UserMemory 통합). 기간 노출 규칙(`start*12+startM ≤ targetY*12+targetM ≤ end*12+endM`)은 raw SQL 한 줄로. 사용자 입력은 한 달 = 한 묶음(남긴 사건 + 사건별 메모 + 월 회고)으로 모았다가 N+1 UserMemory 행으로 정규화 → 기존 가족 공유(Phase 9)·책 제작(Phase 10) 파이프라인이 코드 수정 0 으로 새 데이터를 흡수.
- **Result**: T1→T6 + 자체 코드 검토 16건 + 시급 6건 픽스까지 한 세션에 마침. 검증 데이터 12개월 (사건 46건 + 음악 128건). 라운드트립 검증으로 alice 가 룸 멤버 bob 에게 자신의 타임머신 추억 + Phase 7 추억을 한 화면에 노출 확인. 기존 화면(Phase 5·6) 은 회귀 안전을 위해 유지하고 새 진입(`/timemachine`) 으로 사용자 트래픽을 점진 이전.

## Tailwind v4 CSS 변수 swap 으로 다크모드 — 컴포넌트 0건 수정

- **Problem**: 100+ 군데에 `bg-white`, `text-zinc-900`, `bg-rose-50` 같은 Tailwind 유틸이 산재. 표준 다크 패턴 `dark:` prefix 를 모두에 추가하면 회귀 위험 + 시간 소모 + 향후 디자인 변경 시 두 색 관리 부담. 시니어 친화 UX 라 다크모드는 부가 옵션이지만 필수.
- **Action**: Tailwind v4 의 모든 색 유틸이 `var(--color-*)` CSS 변수를 참조하는 점을 이용 — `.dark` scope 에서 변수만 redefine. zinc/white/black 뿐 아니라 의미색 (rose/amber/emerald/sky/violet/blue) 도 50↔950, 100↔900 등 대칭 swap (안 그러면 `bg-rose-50` 카드 안 `text-zinc-900` 글자가 안 보이는 콘트라스트 실패). 토글은 쿠키 + 서버 렌더 `<html className="dark">` 로 깜빡임 0 + JS 없이 작동. Windows Chrome 의 `<input>` 흰 배경 문제는 `.dark input[type="..."] / textarea / select` 일괄 규칙으로 해결.
- **Result**: 한 파일(`app/globals.css`) 만 수정해 전체 페이지 다크 일관 적용. 컴포넌트 파일 한 줄도 안 건드림 → 회귀 위험 0. 컴파일 산출물 `curl ...css | awk` 로 `.dark { --color-rose-50: #4d0218 }` 검증. 향후 브랜드 컬러 변경·시즌 테마 같은 디자인 시스템 진화도 같은 방식으로 0 churn 처리 가능.

## 음성 → AI 다듬기 + 일회성 토큰 차감 with RAG 가드

- **Problem**: 타임머신 회고 입력 텍스트가 받아쓰기 결과(어, 음, 그 같은 군더더기 + 비문)라 그대로 책에 들어가면 어색. AI 로 다듬되 사용자가 말하지 않은 사실을 만들어내면 "내 추억이 아닌 것" 이 됨. Phase 7 가이드 대화의 RAG 가드 원칙을 일회성 호출에도 적용 필요. + 결제 구조(Phase 8) 와 연동해 토큰 차감.
- **Action**: 세 layer 로 분리 — (1) `lib/voice-cleanup.ts` RAG 가드 시스템 프롬프트 ("사용자가 말한 사실만 다듬으세요. 추가·해석·과장 금지") + 빈/동일 응답이면 in/out 토큰 0 반환(사용자가 변화 없이 토큰 잃는 일 방지), (2) `lib/tokens/charge.ts:chargeOneShot` 기존 `settleConversationCharges` 의 race-safe 패턴(조건부 wallet UPDATE) 을 conversation 우회로 적용, (3) `app/components/VoiceTextarea.tsx` 에 optional `onCleanup` prop 추가 → 같은 컴포넌트가 STT 만 / STT+AI 다듬기 두 모드 지원.
- **Result**: 실제 messy 한국어 "어 그 8월에 우리 가족이 강원도 갔는데 뭐 그 비가 너무 많이 와서 집에만 있었어요" → "8월에 가족과 강원도에 갔는데 비가 많이 와서 집에만 있었어요." (1 토큰 차감, 군더더기 제거 + 사실 보존 + 추가 사실 없음 검증). 잘 정돈된 입력에는 AI 가 540 토큰 사용했지만 결과가 입력과 동일 → 차감 0 확인. 운영 측 Anthropic 비용 흡수 vs 사용자 신뢰 보호의 트레이드오프를 명시적으로 선택.

## 시드 deterministic id 로 사용자 데이터 referential 안전성

- **Problem**: 타임머신 사건 카탈로그(`MonthEvent`) 시드를 재실행할 때마다 `prisma.monthEvent.deleteMany({})` + `createMany({...})` 패턴이라 매번 새 cuid 부여. 사용자가 "남기기" 한 추억의 FK(`UserMemory.monthEventId`) 는 SetNull 되어 추억 자체는 살아남지만 어느 사건인지 끊김 → UI 에서 "남긴 것" 셋에 안 들어가 사라진 것처럼 보임.
- **Action**: 시드 row 마다 자연키 해시(`SHA-256(section|year|month|title)` → 24자 prefix) 로 deterministic id 생성. per-row upsert(by id) 로 전환 → 시드 재실행해도 같은 사건은 같은 id 유지. DB 에 있지만 시드 밖인 orphan MonthEvent 는 자동 삭제하지 않고 카운트만 경고 출력(사용자 추억 보호 default). 시드 row 의 다른 필드(description/source) 수정은 upsert 가 update 로 반영.
- **Result**: 검증 스크립트 `db/test-h1-h2-fixes.ts` 에서 실제 시드 재실행(`execSync("npx tsx db/seed-timemachine.ts")`) 후 사용자 데이터의 `keptEvent.monthEventId`/story/월 회고가 완전 일치(`JSON.stringify(loadedBefore) === JSON.stringify(loadedAfter)`) 확인. 시드 재실행이 사용자 경험을 깨지 않는 referential 안전성 확보. 카탈로그 시드와 사용자 데이터가 같은 FK 로 묶인 모든 도메인(상품 카탈로그 + 장바구니, 카테고리 + 게시글 등)에 재사용 가능한 패턴.

## 자체 코드 검토 후 진단/픽스 분리 — 16건 진단 → 6건 픽스

- **Problem**: 타임머신 6 phase 한 세션에 닫은 직후 코드 회귀 위험을 진단해야 하지만, 검토와 동시에 픽스를 진행하면 어디서 검토가 끝나고 어디서 픽스가 시작됐는지 불명확 + 사용자 우선순위 의견 반영 어려움.
- **Action**: 사용자가 "지금은 진단만, 코드는 안 고침" 룰 명시. 6 관점(버그/엣지케이스, 기존 기능 회귀, 결제 안전성, 저작권, 일관성, 시니어 UX) 으로 13개 파일 순회 → 16건 발견 → 심각도(높음/중간/낮음) 분류 + 어디서/무엇이/제안 형식으로 보고. 사용자가 6건 골라 픽스 의뢰 → 그 6건만 정확히 픽스 + 라운드트립 회귀 테스트.
- **Result**: 진단 단계가 의도적으로 빈손이라 사용자가 우선순위 결정에 집중 가능. 6건 픽스 후 기존 검증 스크립트 4개 모두 회귀 0 + 신규 검증 스크립트(`test-h1-h2-fixes.ts`) 14/14 통과. 미픽스 10건은 통합 테스트 후 다음 사이클로 명시 이연. 코드 검토 ↔ 수정의 인지 부담을 사용자와 분리하는 워크플로 정립.

## 위험도 기반 출처 분리 — DB(검증) vs Claude 웹 검색(보조)

- **Problem**: 회상 서비스 AI 비서가 "그달 무슨 일이 있었나" / "그때 유행한 노래는" / "그때 인기 드라마는" 같이 성격이 다른 질문에 답해야 함. LLM 단독은 환각 위험(틀린 사건 = 신뢰 붕괴), 검증 DB 단독은 커버리지 부족(취향성은 못 덮음). 한 통로에 몰면 양쪽 단점 곱.
- **Action**: 질문을 키워드로 MUSIC/BIG/TASTE 3분기 → MUSIC·BIG 은 시드 DB(MonthEvent/ChartSong) 우선 + 비어있을 때만 검색 폴백, TASTE 는 바로 검색. DB 답은 LLM 미경유 템플릿 조립으로 **비용 0 + 결정적 + 자신있는 톤**. 검색 답은 Claude `web_search_20250305` 도구 + 가드 시스템 프롬프트(가사·기사 복제 금지 / 단정 금지 "...였던 것 같아요" 톤 / 사용자 기억 대신 만들기 금지 RAG 가드 / 음악은 곡명·아티스트·순위만 이미지/임베드 ❌). API 응답에 raw events/songs 까지 함께 내려 UI 가 SongCard·"내 타임라인 추가" 버튼을 그대로 렌더.
- **Result**: 4 검증 케이스 모두 통과 — (a) BIG/DB 차감 0 (b) MUSIC/DB 차감 0 + 카드 노출 (c) TASTE/web "것 같아요" 톤 + 출처 8건 + 9토큰 (d) BIG miss → web 폴백. 매칭 실패 시 default 를 TASTE(검색) 로 폴백해 "DB 에 없다고 오답" 보다 안전 선택. AI 분류기는 비용·지연 이유로 보류하고 단순 키워드 substring 으로 시작 — 정확성 보고 도입 결정.

## `chargeOneShot.surcharge` 파라미터 — 새 비용 모델을 정책 함수 안 건드리고 표현

- **Problem**: Claude 웹 검색은 토큰 외 도구 사용료($0.01/회) 가 따로 발생. 기존 토큰 정책(`tokensFromUsage(in,out) = ceil((in+out)/2000)`) 함수 안에 새 비용 모델을 우겨 넣으면 기존 호출부(voice_cleanup 등) 가 모두 영향받음 — 회귀 위험.
- **Action**: 정책 함수 무수정. `chargeOneShot(...refId, surcharge: number = 0)` optional 파라미터 추가. cost = `tokensFromUsage(in,out) + surcharge`. surcharge 가 0 보다 크면 in/out 이 0 이어도 차감 발생(cost 분기 따로). 검색 호출부에서 `surcharge: 1` 만 지정하면 운영 비용 가산. 기존 호출부(`"voice_cleanup"` 등) 는 그대로 무영향.
- **Result**: voice_cleanup 회귀 0 + 검색 답 9토큰 정확 차감 + ledger 에 `timemachine_assistant_web` reason 으로 음수 delta 기록. 신규 비용 모델(예: 향후 이미지 생성 가산, 음성 합성 가산) 도입 시 호출부 파라미터만 추가하면 됨 — 정책 함수는 토큰 단가 표현에만 집중.

## 자연키 시드 변경 후 데이터 중복 안전 정리 — 추억 보호 우선 규칙

- **Problem**: 타임머신 시드 정책을 cuid → deterministic sha256 자연키 해시로 변경(H1 픽스, 시드 재실행 referential 안전성). 도입 전 cuid 행 46개가 그대로 남아 deterministic 행 46개와 공존 → 같은 사건이 두 번 노출 (V1 비서 답에서 "한미 정상회담"이 두 번 출력 → 발견). 무작정 cuid 행 삭제는 위험 — 그 사이 사용자가 추억을 그 cuid 행에 연결했을 가능성.
- **Action**: read-only 진단 스크립트(`db/diagnose-monthevent-dupes.ts`) 와 write 스크립트(`db/cleanup-monthevent-dupes.ts`) 를 분리. 진단은 (year, month, section, title) groupBy + 각 행의 추억 연결 카운트 + id 종류(deterministic 24-hex vs cuid) 표시. 정리는 트랜잭션 안에서 한 번 더 추억 연결 재확인 후 규칙 적용: (1) 추억 다행 분산 → skip + 경고 (2) 추억 1행에 있음 → 그 행 보존 (3) 추억 없음 → deterministic 보존, cuid 삭제 (4) 자동 판단 불가 → skip.
- **Result**: 46 그룹 전부 케이스 3 → 추억 손실 0, 옛 cuid 46행만 삭제. 재진단 "중복 그룹 0개" + T6 통합 테스트(15체크) 회귀 0 + V1 비서 답 중복 사라짐 검증. 카탈로그 시드와 사용자 데이터가 FK 로 묶인 모든 도메인에 재사용 가능한 진단/정리 2단계 패턴.

## 정보 push → pull UX 피벗 — 컴포넌트 재사용 5건 / 신규 2건

- **Problem**: 타임머신 v1 (T3~T6) 은 그달 사건·음악을 다 펼쳐서 보여줬음. 실사용 통찰: **관심 없는 정보면 흥미가 식는다.** 정보를 시스템이 "차려주는" 방식의 한계. 빈 기억칸 + AI 비서로 전환하되 기존 자산은 살려야 (T4 음성·T5 음악 카드·T6 저장 구조).
- **Action**: 좌(메인:기억칸 amber 카드)/우(조수:비서 violet 카드) 2단 grid 레이아웃, 모바일은 세로. 비서 패널은 추천 질문 칩 5개 + 자유 입력 + 답변 영역(본문 + 음악 카드 / 사건 "타임라인 추가" 버튼 / 출처 / 차감 안내). 재사용: `VoiceTextarea` `cleanupVoiceTextAction` `SongCard` `saveTimemachineMonthAction` 내비 가드. 보존(미사용): `MonthForm` `EventItem` `MonthStory` — 코드 유지하고 화면에서만 빠짐 (검증 전 v1 정식 drop 보류). 신규: `AssistantPanel.tsx` `MonthV2.tsx`. 비서 → keptEvent 흐름은 client state 만 추가하고 저장 server action 은 T6 그대로.
- **Result**: 한 세션에 V1(백엔드) + V2(UI) 둘 다 닫음. `next build` 통과 / `tsc --noEmit` 0건 / 기존 T1~T6·Phase 7·8·9 회귀 0. 핵심 UX 모델 전환을 컴포넌트 무수정 + 백엔드 surcharge 1줄 추가로 끝내고, 사용자가 비서 답에서 사건을 골라 자기 타임라인에 담는 능동 흐름 확보.

## 멀티턴 컨텍스트 답 우선 라우팅 — 후속 질문은 이전 답 안에서

- **Problem**: 비서가 한 화면에서 멀티턴 대화로 동작해야 하지만, 후속 질문("1번 자세히")마다 web 검색을 또 돌리면 토큰 폭증 + 느림. 일반 AI 채팅처럼 "이전 답 안에서 풀기" 가 default 여야 함.
- **Action**: `askAssistant` 5번째 파라미터 `prior?: ChatTurn[]` 추가. prior 가 있으면 `chat()` 1회 호출 (검색 도구 X) — 시스템 프롬프트가 "이전 대화의 정보만 사용. 등장한 항목 풀어 설명 환영. 정말 새 사실 필요할 때만 정확히 `[SEARCH]` 한 단어만 출력". sentinel 감지 시 검색 폴백 (단 DB 분기는 건너뛰고 검색 직행 — 첫 답에 이미 DB 답을 줬으므로 중복 무의미). 길이 가드: 최근 8턴 + 각 600자 cap (`clampPrior`). 첫 메시지가 assistant 면 한 칸 더 잘라 user 부터 (Anthropic API 400 가드). 컨텍스트 차감 후 검색 실패/빈 답 시 `refundTokens()` 헬퍼로 환불 (race-safe — wallet `balance + n` 음수 불가).
- **Result**: 후속 "1번 자세히" 가 검색 없이 1토큰 차감 (in≈790, out≈100). 답이 이전 답의 항목을 자연스럽게 풀어 설명. 검증 스크립트 v3 (`db/test-assistant-v3.ts`) 4시나리오 — 컨텍스트 답 / 저장-재조회 토큰 0 / T6 keptEvent 공존 / Phase 7 ai_chat 무영향 — 모두 통과. 멀티턴 대화 비용을 90% 가까이 절약 (10토큰 검색 vs 1토큰 컨텍스트).

## 코드 자체 검토 7-카테고리 진단 → 6건 픽스 (사용자 선택 우선순위)

- **Problem**: v2 비서 V1~V3 한 세션에 닫은 직후 또 코드 회귀 위험 진단 필요. 검토와 픽스를 동시에 하면 사용자 우선순위가 반영 안 됨 + 어디까지가 진단인지 불명.
- **Action**: 사용자 "지금은 진단만" 룰. 7 관점(버그·엣지 / 토큰·결제 / 회귀 / 가드 / 프라이버시 / 보안 / 일관성) 으로 8개 파일 순회 → 16건 발견 (높음 2, 중간 11, 낮음 다수). 각 항목에 위치 + 무엇이/왜 + 제안 + 심각도 표시. 사용자가 6건 골라 픽스 의뢰 — B1(멀티턴 페어링) / B2(clampPrior) / B3(빈 답 차감) / T2(환불 — wallet `+n` race-safe 트랜잭션) / S1(citation URL scheme `new URL()` 가드) / P1(가족 공유 안내 문구). T2 는 환불 vs defer 두 방식 비교 후 환불 선택(차감을 검색 뒤로 미루면 두 차감 사이 잔액 race 가능 + ledger 분리 못 함).
- **Result**: 6건 정확히 픽스 + 검증 3개 모두 회귀 0 (test-assistant 4케이스 + test-assistant-v3 4시나리오 + test-t6-integration 15체크). 미픽스 10건은 다음 사이클로 명시 이연. 검토 ↔ 수정 인지 부담을 사용자와 분리하는 워크플로 — 이번이 두 번째 적용 (v1 T6 검토에 이어).

## 3단 모델 라우팅 — 사용자 라벨 어휘로 Haiku/Sonnet/Opus 흡수

- **Problem**: 비서 검색 답이 가끔 환각 (인물 직책·연도 혼동). 더 비싼 모델로 가면 정확도 ↑ 비용 ↑. 사용자가 직접 선택 가능해야 하되 **모델 이름 절대 노출 금지** (시니어 타깃, "Haiku/Sonnet/Opus" 의미 불명). DB 답은 검증 데이터라 모델 무관 무료 유지. 기존 Haiku 호출부 회귀 0.
- **Action**: 사용자 라벨 "간단히 / 자세히 / 가장 정확하게" → 백엔드 enum `simple|detailed|precise` → 모델 ID 매핑은 `DEPTH_TO_MODEL` 한 곳. 토큰 정책 `tokensFromUsage` 무수정 — Haiku 단가 calibration 유지. Sonnet/Opus 는 `chargeOneShot.surcharge` 로 차이 흡수: `surcharge = base * (MULTIPLIER[depth] - 1) + WEB_SEARCH_SURCHARGE`. Haiku 일 땐 multiplier=1 → surcharge=base*0+1=1 → 기존과 정확히 동일 (회귀 0). 단가 비율 단순화 (in 단가 1:3:5) — in 토큰이 압도적이라 출력 가중치 무시. ledger reason 에 depth suffix (`_simple`/`_detailed`/`_precise`) — 운영 분석 분리. UI 칩에 추정 토큰 미리 표시 ("약 10/30/50토큰"), 답 카드 배지 `[간단히 답]` — model 필드 응답 X.
- **Result**: 4시나리오 검증 — (a) 3 깊이 ledger 분리 + 콘솔 model= 로그로 라우팅 확인 (b) simple=10/detailed=43/precise=56 비례 차감 (c) DB 답 3 깊이 모두 무료 (d) 컨텍스트도 1:5 비례. 도중 Opus 4.7 `temperature deprecated` 에러 → `supportsTemperature(model)` 가드를 `lib/ai.ts` 한 곳에 추가, 향후 reasoning 모델군 확장 시 prefix 만 추가하면 됨. 사용자 어휘와 백엔드 enum 분리 + multiplier=1 default 회귀 0 패턴은 새 차원 추가의 안전 표준.

## 출석 streak 게임화 — 부드러운 동기부여 + race-safe DB 설계

- **Problem**: 회상 서비스는 "한 번 둘러보고 끝" 위험. 매일 들르는 동기 필요. 시니어 타깃이라 **압박·비난 표현 0** 이 절대 원칙. 같은 날 두 번 눌러도 1회 적립 + 동시 요청에도 중복 없어야 함.
- **Action**: `UserAttendance` 모델 (id, userId, date "YYYY-MM-DD" KST, streak, bonusToken, createdAt) + `@@unique([userId, date])` 가 race-safe 의 단일 결정자. `processAttendance(userId, now?)` 가 한 트랜잭션 안에서 (1) attendance.create — P2002 위반 catch 로 "이미 출석" 친화 분기 (2) wallet `balance + credit` (credit > 0 이라 조건부 UPDATE 불필요) (3) ledger 1~2건. 정책: 매일 5토큰 + 7의 배수 streak 마다 +30 보너스(계속 누적, 끊기면 1 리셋). KST 처리는 `kstDateString = new Date(d+9h).toISOString().slice(0,10)` — timezone 라이브러리 의존 0. 시각: 7개 동그라미 진행도 + 보상 표 + 보너스 예고 버튼 ("오늘 출석체크하기 (5토큰 + 보너스 30토큰!)"). 끊김 직후 streak=1 표시도 "오늘도 와주셨네요" 로 부정 톤 0.
- **Result**: 검증 7시나리오 — 같은 날 중복 / 7일 연속 / 7일째 보너스 / 동시 Promise.all 2번 race / 거른 후 reset / 14일째 또 보너스 / 기존 chargeOneShot 무영향 — 모두 통과. 사용자 동기부여 + 시니어 친화 + 결제 시스템 무영향을 한 모델 + 한 헬퍼로 끝냄. DB unique 가 트랜잭션 잠금 설계보다 단순·강력하다는 표준 패턴 확인.

## 기존 데이터 읽기 집계만으로 동기부여 ① "쌓이는 재미"

- **Problem**: 회상 서비스의 토대 동력은 "내 기록이 쌓이는 걸 눈으로 보는 것". 새 데이터 모델을 또 만들지 않고(스키마 부담 0), 기존 T6 저장(UserMemory)만으로 채운 달·기록량·진척을 시각화해야 함. 매 페이지 로드라 가벼워야 하고, 시니어 도메인이라 **압박 금지**(빈 칸 강조 X).
- **Action**: `getTimemachineProgress` 가 `createdVia in (timemachine_event, timemachine_month)` 행만 집계 — 채운 달 수 / 사건 수 / 글자 수 + 12개월 셀(filled/eventCount/hasStory). 글자 수는 `$queryRaw` 로 `SUM(LENGTH(BTRIM(content,...)))` — 회고 본문을 메모리로 끌어오지 않고 DB 에서 길이만(자체 검토 M4). `ProgressCard`(서버 컴포넌트): 0개월은 "쌓일 거예요" 초대, 빈 달은 연한 회색 무라벨, 채운 달만 amber + "기록 있음" 배지. 노출은 메인·사이드 "내 기록"·월 화면 prev/next.
- **Result**: 새 모델 0, 검증 14/14 (ai_chat·manual 제외 정확, 채운 달·사건·글자 정확). SQL 전환 후에도 글자 수 동일. 표시용 숫자 하나 때문에 대용량 텍스트를 앱으로 끌어오지 않는다는 집계 원칙 확립.

## 감정 스탬프 — 룸별 vs 전역을 프라이버시로 결정 (검토에서 누수 발견)

- **Problem**: 가족 룸 댓글은 자녀에게 부담 → 한 탭 감정 스탬프(❤️뭉클해요 등 4종) 필요. 같은 사람·같은 추억·같은 스탬프 중복 금지 + 토글 + race-safe. 같은 룸 멤버만 반응.
- **Action**: `MemoryReaction`(Comment 와 같은 polymorphic) + race-safe 토글 — 클라가 의도(active)를 보내고 서버는 `create`(P2002 무시)/`deleteMany`(count0 무시) idempotent. 권한은 댓글과 동일(멤버십 + 대상 가시성). **자체 검토(M1)에서 발견**: 처음 unique 가 roomId 를 빼고(전역) 조회는 roomId 로 걸러 → 같은 추억이 두 룸에 보일 때 "눌러도 안 되는" 먹통. 전역(b) vs 룸별(a) 비교 — 전역은 A 룸에만 있는 사람의 반응이 B 룸에 노출되는 **크로스룸 프라이버시 누수**. → unique·삭제에 roomId 포함하는 **룸별(a)** 로 결정. 저장·조회·삭제 기준을 roomId 로 통일.
- **Result**: 검증 20/20(토글·동시·권한·새 반응). unique 키와 WHERE 필터가 어긋나면 먹통이 난다는 것 + 프라이버시 결정이 곧 키 설계라는 학습. 전역의 편의보다 가족 범위 한정 원칙을 우선.

## 가족 소식 읽음 추적 — lazy baseline + DB 시계 + 양방향 한 표면

- **Problem**: 자녀 반응을 어르신이 "다음 접속 때" 눈에 띄게 보고, 한 번 본 건 배지에서 빠져야 함. 자녀도 "부모님 새 이야기"를 앱 안에서. 가입 전 활동이 소급으로 폭주하면 안 됨.
- **Action**: per-item read flag 대신 `FamilyFeedSeen`(사용자당 1행, reactionsSeenAt/recordsSeenAt). "새것" = 활동 `createdAt > seenAt`. 첫 접근 시 `@default(now())` 기준선 생성 → **과거 소급 폭주 차단**. 자체 검토(M2)에서 markSeen 이 Node `new Date()` 를 쓰던 것을 raw `UPDATE … = NOW()`(DB 시계)로 — baseline·createdAt 과 같은 시계라 "봤는데 안 빠짐"(서버/DB 시계 어긋남) 차단. `getFamilyNews` 가 A(내 기록 새 반응) + B(가족 새 기록, 작성자·연·월 단위 묶음) 를 한 번에 → 한 사용자가 어르신/자녀 역할 동시. markSeen 은 메인에서 카드를 실제 볼 때(client mount). **0건이면 카드·배지 전부 숨김**(서운함 0).
- **Result**: 검증 20/20 — 읽으면 0, 룸 없는 사용자 0, 자기 반응 제외, 비멤버 차단. 읽음 추적은 baseline 시각 하나로 충분하되 baseline·활동·markSeen 이 같은 시계여야 경계 버그가 없다는 학습.

## Prisma migrate dev 비대화형 차단 회피 — 수동 migration + deploy

- **Problem**: unique 제약 추가(M1) 마이그레이션에서 `migrate dev` 가 데이터 손실 가능 경고에 y/n 확인을 요구 → Claude Code 의 비대화형 Bash 가 답 못 해 통째로 거부 ("environment is non-interactive, not supported"). 순수 CREATE TABLE 은 통과했으나 경고 붙는 변경만 막힘.
- **Action**: 대상 테이블이 비었음(테스트 정리) 확인 후, 마이그레이션 폴더(`20260528120000_reaction_unique_per_room/migration.sql`)에 DROP/CREATE INDEX 를 직접 작성(인덱스 이름은 직전 자동 생성 이름 참고) → `prisma migrate deploy`(생성 아닌 적용이라 프롬프트 없음) → `prisma generate` 명시 실행(안 하면 `prisma.memoryReaction` undefined 런타임 에러).
- **Result**: 비대화형 환경에서 unique 변경 안전 적용. 경고 붙는 마이그레이션의 표준 우회 절차(수동 SQL + deploy + 명시 generate) 정립.

## 사이드 패널 RSC + client wrapper 패턴 — open state · localStorage · main padding 토글

- **Problem**: 타임머신 모든 화면에 프로필·잔액·출석·메뉴 사이드 패널 필요. 데스크톱 fixed + 모바일 overlay + 상태 기억(localStorage) + 메인 콘텐츠 폭 조정 — server data fetch 와 client state 가 섞임. layout 을 통째로 client 로 만들면 server fetch 못 함.
- **Action**: 2층 구조. `layout.tsx` (RSC) 가 `auth()` + `getBalance()` + `getAttendanceStatus()` 병렬 fetch → `<SidePanelLayout data={...}>{children}</SidePanelLayout>` 으로 wrap. `SidePanelLayout` (client) 이 open state + localStorage + main wrapper 의 `lg:pr-80` 토글 + SidePanel 본체 렌더. 첫 방문 = 열림 (시니어가 "여기 내 정보" 인지) — localStorage 명시 "closed" 일 때만 닫힘. SSR=open / mount 후 보정 + `!transition-none` 으로 첫 paint 깜빡임 차단. 데스크톱: fixed right-0 w-80, open 시 main `lg:pr-80` 으로 우측 양보 / closed 시 main 풀폭. 모바일: 평소 hidden, `≡ 내 정보` 햄버거 → 슬라이드 인 + 백드롭. 두 모드를 같은 컴포넌트로 — `translate-x-full` 클래스만 토글. NextAuth v5 `signOut({ redirectTo: "/" })` server action 으로 로그아웃.
- **Result**: 2 페이지 (`/timemachine` 메인 + `/timemachine/[year]/[month]`) 가 같은 layout 으로 사이드 자동 표시. children RSC 들은 무변경. 기존 wallet/auth/attendance 헬퍼 재사용으로 새 API 0. 데스크톱·모바일 다른 동작이지만 코드 분기 최소화 (단일 컴포넌트 + Tailwind responsive 클래스). 새 페이지를 `/timemachine/*` 하위에 추가하면 자동으로 사이드 패널 포함되어 확장도 쉬움.

## 메인 UX 피벗 — 새 모델 0, 디스크리미네이터 + redirect 만으로 v2 코드 전체 보존

- **Problem**: v2(월별 타임머신) 실사용 통찰 — "매달 빈 칸을 채우라는 게 일기 강박". 메인 UX 를 **인생 연혁(가로 시간축)** 으로 갈아끼워야 하지만, T6 저장·V1~V4 비서·출석·진척·가족 반응·룸 공유 등 8개 기능 모듈이 모두 `UserMemory` 한 모델 위에 얹혀 있음. 새 모델·새 API 를 만들면 8 모듈 모두 분기 케이스 추가 → 회귀 위험 폭증.
- **Action**: 새 모델 0. 기존 `UserMemory` 에 `createdVia="life_event"` 디스크리미네이터 + 5 컬럼 (`eventTitle`, `eventYear`, `eventMonth`, `precision`, `category`) **모두 nullable** additive only. **미러링 약속** — life_event 행은 `year/month/title` 에도 같은 값. 가족 룸의 `listRoomMemories` 가 `year/month/title` 그대로 읽으므로 코드 0줄 추가로 자동 공유. 진입 동선만 갈아끼움 — `/timemachine` 메인 → `/life-timeline` redirect 한 줄로 옛 사이드 패널·옛 북마크 모두 새 메인에 도달. v1 의 `EventItem`·`MonthForm`·`MonthStory` 처럼 v2 의 월 화면도 코드 전체 보존하고 *진입 동선만* 뒷전으로. 7 phase(L1~L7) 한 세션에 닫음.
- **Result**: 검증 — L1~L4 신규 테스트 3개 + T6/v2 비서/진척/출석/가족 반응 회귀 0 + tsc 0건. 새 모델·새 API·새 시드 0 으로 핵심 UX 모델 전환 완성. UserMemory 한 곳에 모인 디스크리미네이터 패턴이 새 입력 흐름(life_event) + 기존 통합(룸·반응·진척) 양쪽을 동시 만족. 사용자 가입 패스도 깨지지 않게 — 기존 v2 사용자(인생 이벤트 0건)는 갑자기 강제 이동 X, 빈 상태에서 부드러운 권유로.

## 첫 진입 분기 게이트 — 신규 vs 기존 사용자 보호 + 사이드 패널 자유 이동 양립

- **Problem**: 메인 페이지에 "처음 사용자 → 가이드 흐름 / 기존 사용자 → 메인" 분기 게이트를 두면 — *기존 사용자가 사이드 패널로 메인에 돌아왔다가 데이터 0건이라 가이드 흐름으로 매번 튕긴다*. 길을 잃음. 동시에 처음 사용자에겐 빈 메인보다 가이드가 먼저여야 함. v2 시절부터 쓰던 사용자(다른 데이터 있음)는 신규 흐름으로 가면 당황.
- **Action**: 게이트를 메인(`/life-timeline`)에 두지 않고 **분기 전용 server component `/enter`** 신설. 로그인(`signIn.redirectTo`) + 동의 완료(`/consent` redirect, `ConsentForm.push`) 직후 도착하는 canonical 1회 진입점. 세 분기 — (1) 인생 이벤트 ≥ 1 → 메인 (2) 인생 이벤트 0 but 다른 UserMemory 있음(v2 기존 사용자) → 메인 (빈 상태 + 부드러운 권유) (3) 둘 다 0 (완전 신규) → 가이드 흐름 `?new=1` (환영 배너). 판정은 `hasAnyUserMemory(userId)` 1 findFirst — createdVia 무관 어떤 행이라도 있으면 v2 활동 흔적. 메인 자체엔 게이트 0 — 그 후 사이드 패널·직접 URL 로 자유롭게 메인 왕복. 랜딩 환영 배너는 서버 `searchParams` 만으로 — 새 DB/localStorage/client 0.
- **Result**: 검증 — `/enter`·메인·가이드·v2 월 화면 모두 unauth 시 307→/login 정상 + 회귀 0. 시나리오 5종 (완전 신규/v2 기존/v3 활성/재로그인/직접 URL) 모두 의도대로. 게이트를 entry-only 로 분리하면 신규 보호와 자유 이동을 동시 만족. 메인에 게이트 두면 둘 중 하나 희생 — 이번 결정이 사이드 패널 패턴(자유 이동) 과 신규 가이드(첫 도착)를 둘 다 살리는 표준.

## Postgres enum 재생성 마이그레이션 — 매핑·삭제·DROP 한 트랜잭션

- **Problem**: v3 카테고리 개편 (`SCHOOL`→`ELEMENTARY/MIDDLE/HIGH/UNIVERSITY` 4분할, `CHILDHOOD`→`KINDERGARTEN` 재정의, `RESIDENCE/OTHER` 삭제) 에서 Postgres 가 `ALTER TYPE ... DROP VALUE` 를 지원하지 않음. Prisma migrate dev 가 enum 값 제거를 자동 처리 못하고 non-interactive 환경에서 멈춤. 동시에 production 사용자 데이터(테스트 환경엔 시드 + 본인 로그인)는 *의미 매핑* 후 보존, 매핑 불가는 *삭제* 정책으로 둘 다 만족해야.
- **Action**: 수동 마이그레이션 SQL 작성 (`20260602230155_v3_categories_overhaul`) — 6 단계 트랜잭션: (1) 매핑 불가 enum 의 UserMemory 행 DELETE (2) `User.skippedLifeCategories` 배열에서 4종 모두 `array_remove` 4중 (3) 새 enum (`LifeCategory_new`) CREATE (4) `UserMemory.category` 컬럼 타입 ALTER + CASE 매핑 USING (5) `User.skippedLifeCategories` 배열 타입 ALTER — 처음 `USING (ARRAY(SELECT ... FROM unnest(...)))` 가 `cannot use subquery in transform expression` 에러 → text[] 경유 직접 캐스트(`"col"::text[]::"LifeCategory_new"[]`) 로 우회 (6) 옛 enum DROP + RENAME. ALTER COLUMN TYPE 직전에 DEFAULT 임시 DROP/재설정 필요 — 옛 enum default 가 새 enum 으로 자동 변환 안 됨.
- **Result**: 마이그레이션 1 시도 후 서브쿼리 에러 → 5분 만에 text[] 캐스트 패턴 발견 → 트랜잭션 깨끗 롤백 확인(`_prisma_migrations` 행 없음) → SQL 수정 후 두 번째 시도에 적용 성공. 4종 테스트 스크립트 33+17+23+7 통과. *enum 재생성 + 데이터 매핑 + 배열 컬럼* 3개가 한 트랜잭션 안에서 일관적으로 처리되는 단일 SQL 파일 = 향후 다른 enum 변경의 표준 패턴.

## 글로벌 floating 위젯 — root layout RSC + variant prop 으로 인라인 컴포넌트 무수정 재사용

- **Problem**: 기존 비서 모달이 한 페이지(`/life-timeline`) 의 인라인 버튼으로만 진입 가능 — `/life-record`·`/timemachine/...`·`/account/*` 어디서든 비서 호출 흐름이 끊겼다. 위젯 패턴(우측 하단 floating action button) 으로 모든 인증된 페이지에서 진입 가능해야 하지만, 기존 `AssistantModal` 의 모달 본문은 그대로 재사용해야 (v2 AssistantPanel 무수정 정책 + 모달 안 chat / 저장 / 검색 동작 검증된 상태).
- **Action**: `AssistantModal` 에 `variant?: "inline" \| "floating"` prop 1개 추가 — 트리거 버튼 className 만 분기, 모달 본문(open state·useEffect·AssistantPanel 임베드) 은 완전 공유. 새 `AssistantWidget` server component (`app/components/AssistantWidget.tsx`) — `auth()` 후 비인증이면 `return null`, 인증되면 `getLifeEvents`·`listAssistantAnswers` fetch → `AssistantModal variant="floating"` 렌더. root layout 의 `{children}` 뒤에 마운트 — 모든 페이지가 자동으로 위젯 받음. fixed `bottom-6 right-6 z-50` 64×64 둥근 amber-violet 버튼.
- **Result**: 검증 — `/life-record/SCHOOL`·`/account/settings`·`/billing` 등 위젯 무관 페이지에서도 우측 하단 비서 버튼 노출 + 비인증 페이지(`/login`)는 null. tsc 0건. *모달 본문 0줄 수정* 으로 "모든 화면 위젯" 요구 만족 — variant prop 패턴이 비-침투적 재사용의 표준. RSC 가 페이지마다 컨텍스트 fetch(가장 최근 life_event) 하는 비용은 cache() 도입 시 추가 최적화 여지로 후속에 남김.

## 토큰·출석 통합 페이지 신설 — 매일 들르는 화면을 메인에서 분리

- **Problem**: 출석체크 카드가 `/life-timeline` (인생 연혁 메인) 에 박혀 있어 두 가지 문제 — (1) 매일 출석하러 메인 들어가는데 메인의 *연혁 본업* 시선이 흐트림 (2) `/billing` 은 충전 패키지만, 잔액 표시는 헤더에 분산, 거래 내역도 분리. 토큰 관련 정보가 4 곳에 흩어져 사용자는 자기 토큰 상태를 한눈에 못 봄.
- **Action**: 새 페이지 `/account/tokens` — 큰 잔액 카드(`text-5xl` amber) + 기존 AttendanceCard 그대로 재사용 (코드 0줄 수정) + 거래 내역 50건 + "충전하러 가기" → `/billing` (결제 UI 자체 변경 0). 거래내역 한국어 라벨에 `daily_attendance/attendance_streak_bonus` 추가. 진입점 3 곳 통일 — 설정 페이지에 amber "토큰" 카드 추가, root header "토큰 NNN개" → `/account/tokens`, 사이드 패널 "토큰 충전하기" → "토큰 화면 열기". `/life-timeline` 메인에서 AttendanceCard import + 렌더 + getAttendanceStatus fetch 제거 (메인 fetch 5→4).
- **Result**: 검증 — `/account/tokens`·`/billing`·`/life-timeline` 모두 307 정상, `test-attendance.ts` 회귀 통과, tsc 0건. 매일 들르는 화면이 *정식 자리*(설정 → 토큰) 를 얻고 메인은 연혁 본업으로 단순화. 사이드 패널 AttendanceMini 는 빠른 접근용으로 유지 — 두 진입점이 *빠른 접근 vs 정식 페이지* 의미를 분리해 양쪽 다 살림. /billing 미변경으로 토스 결제 콜백 흐름 그대로.

## 인물(Person) 모델을 *additive only* 로 끼우기 — 룸·반응·진척 0줄 수정

- **Problem**: 인생 연혁에 "이 사건에 함께한 분" 을 붙이고 싶은데 기존 룸 공유·감정 스탬프·진척 시각화·T6 timemachine 메모리 같은 검증된 영역을 깨지 말아야. 또 같은 인물을 여러 사건과 연결할 다대다 + 시간순 정렬 + 카운팅이 필요한데 N+1 쿼리 부담은 피해야.
- **Action**: 새 모델 2개 (`Person`, `PersonEvent`) + `UserMemory.personEvents PersonEvent[]` 역참조 1줄만 추가. 기존 모델·기존 createdVia 전부 무수정. `PersonEvent.@@unique([personId, memoryId])` 가 단일 결정자 — 헬퍼는 P2002 catch 로 idempotent 토글. *인생* 이벤트(`createdVia="life_event"`) 만 연결 허용 — 헬퍼에서 `LinkResult = "linked" \| "already" \| "not_found" \| "not_life_event"` enum 4종 반환, timemachine_event/ai_chat 메모리는 거부. CRUD 5개 + link/unlink + 두 조회 헬퍼 (`lib/people.ts`) 모두 `userId` 첫 인자 + `findFirst/updateMany/deleteMany {id, userId}` 패턴으로 권한 검증. N+1 회피용 `countEventsPerPerson` (groupBy 1쿼리) + `listPeopleByEventBatch` (`findMany {memoryId: {in: [...]}}` 1쿼리) 두 batch 헬퍼 추가 — `/people` 목록·연혁 칩이 이벤트 수와 무관하게 상수 쿼리.
- **Result**: 검증 — `db/test-people.ts` 39 assertion 통과 (CRUD/권한 14, link/unlink/idempotent/life_event 가드 12, cascade 4, 정렬/권한 9) + 기존 회귀 0 (test-life-events·test-life-event-crud·test-room-create·test-attendance·test-charge 전부 통과). 새 기능 풀스택을 *기존 영역 0줄 영향* 으로 끼우는 패턴 — additive only 정책 + 헬퍼 단일 진입점 + 비정규화 userId 컬럼 + cascade 가 모여 안전. P2/P3 화면이 이 헬퍼 위에 올라가 모달·연혁 직접 토글 등 풍부한 UX 가 헬퍼 0줄 수정으로 가능.

## v3 신규 코드 자체 진단 → 심각도 분류 → 즉시 픽스 7H+4M

- **Problem**: 인물(P1~P3) + 장소(데이터/API/UI/지도 타일) 까지 한 세션에 풀스택으로 들어오면서 누적 코드가 1000+ 줄. 기능 작동은 OK 지만 race condition·open redirect·정렬 불일치·매직 suffix·IME 가드 누락 같은 *조용한 결함* 을 다음 사이클로 미루기 전에 한 패스로 잡아야.
- **Action**: 8 카테고리(버그·결제·회귀·프라이버시·보안·성능·일관성) 관점으로 신규 lib/app/api 전 영역 한 패스 진단 → 60+ 항목 발견 → 심각도(높음/중간/낮음) 분류 + "어디서/무엇이/왜/제안" 4 필드 보고. 사용자 결정으로 H 7개 + M 4개 즉시 픽스 — H1 safeReturnTo open redirect (URL 객체 + origin + 재구성 일치 검증), H2 skippedLifeCategories race (`$executeRaw` + `array_append(array_remove(...), v)` 단일 statement), H4 originalId 필드 명시 + `:end` 매직 slice 제거, H5 expandPeriods 정렬 제거 (DB 순서 보존 + `flushPendingBefore` 패턴), H6 빈배열 NaN year push 방어, H7 placeSource 정규화 통일 (미지원 source → 전체 null), M3 `lib/josa.ts` 신규 (`withJosa(name, "과/와")`), M7 query prefill, M9 Esc IME 가드 (`isComposing` + input/textarea), M12 AbortController, M20 placeholder 한글화. 나머지 H3 + M(11건) + L(12건) 은 후속 묶음.
- **Result**: 모든 픽스 후 `npx tsc --noEmit` + 회귀 검증 5종 통과. *진단을 코드 변경 *전에* 분리* 한 게 핵심 — 사용자가 보고서만 보고 어느 항목을 어느 사이클에 다룰지 결정 (큰 묶음 vs 즉시 vs 미룸). 매번 발견 즉시 고치면 작업이 폭주하고 우선순위 협의 기회를 잃는다. 60항목 발견 → 11항목 픽스 → 49항목 후속 등록 = 빚을 키우지 않으면서 다음 작업의 흐름도 안 끊는 패턴.

## Postgres 배열 enum race 안전 — `$executeRaw` + `array_append(array_remove(...), v)`

- **Problem**: `User.skippedLifeCategories LifeCategory[]` (Postgres native enum array) 를 동시에 두 카테고리에 add 하거나 add+remove 충돌 시 데이터 손실. Prisma 의 `update({ data: { skippedLifeCategories: { set: [...current, v] } } })` 는 `findUnique → check → update` 3단계라 트랜잭션 밖에서 race window 존재. 시니어 사용자가 빠른 연속 클릭, 또는 페이지 transition 중 다른 카테고리 답 저장이 일어나면 후행 쓰기가 선행을 덮어쓰는 케이스 충분히 발생.
- **Action**: `prisma.$executeRaw` + Postgres 내장 함수로 단일 statement 처리. mark = `array_append(array_remove("col", v::"LifeCategory"), v::"LifeCategory")` — array_remove 로 먼저 빼고 array_append 로 추가하면 항상 정확히 1개 (중복 X, 항상 idempotent). unmark = `array_remove("col", v::"LifeCategory")`. enum cast (`::"LifeCategory"`) 가 placeholder 양옆에 필요 — text 와 enum 비교 못함.
- **Result**: 검증 — `test-life-record-flow.ts` 회귀 통과, race 시나리오 직접 시뮬레이트 안 했지만 SQL 자체가 단일 atomic statement 라 Postgres 가 row lock 으로 race window 0 보장. *Prisma 의 read-modify-write 패턴 → raw SQL atomic statement* 가 enum array 같은 비정형 필드의 race 픽스 표준. JSON 컬럼이나 다른 array 필드도 같은 패턴(`jsonb_set`, `array_*`) 으로 일관 처리 가능. 비용 — type-safe 함수가 raw 로 우회되므로 카테고리 변경 시 SQL 도 점검 필요 (재발 방지 후속에 마이그 동반 노트).

## 지도 SDK 두 종을 같은 인터페이스로 — props 통일 + dispatcher 컴포넌트

- **Problem**: 네이버 지도(`<Script>` 태그로 로드, `window.naver.maps.Map`/`Marker`/`InfoWindow` global API) 와 구글 지도(`@googlemaps/js-api-loader` v2 함수형 `importLibrary` API) 가 라이프사이클·메서드명·좌표 객체(LatLng vs `{lat, lng}`) 다 다름. PlaceSearchInput 한 호출자가 두 SDK 를 직접 분기하면 컴포넌트 비대 + 추가 SDK 도입 시 호출자 또 수정.
- **Action**: 공통 `MapProps = { markers, focusedIdx, className, onMarkerClick }` 인터페이스 정의 (`lib/components/maps/types.ts`). `NaverMap.tsx` 와 `GoogleMap.tsx` 가 같은 인터페이스를 구현 — 내부적으로 세 useEffect 가 책임 분리(ready / markers 변경 / focusedIdx 강조). `PlaceMap.tsx` 가 source ("naver"|"google") 로 둘 중 하나만 마운트하는 dispatcher 1줄. 호출자(`PlaceSearchInput`) 는 `<PlaceMap source={...} {...rest} />` 만 — SDK 차이 노출 X. SDK 로드는 둘 다 idempotent (네이버는 `next/script` dedup, 구글은 loader Promise cache) 라 여러 인스턴스 mount 안전.
- **Result**: B 단계 검색(5결과 + bounds fit) 과 C 단계 단일 마커 미리보기 둘 다 같은 props 로. tsc 0건. 새 지도 SDK(카카오·Mapbox 등) 도입 시 같은 props 구현체 1개 + dispatcher 1줄만 추가하면 호출자 무수정. SDK API 차이를 *인터페이스 통일* 로 흡수하는 표준 패턴.

## 새 디스크리미네이터를 *기존 모델 0 변경* 으로 끼우기 — era_event + partial unique index

- **Problem**: 부모님이 "9·11 같은 큰 사건을 클릭 한 번으로 내 연혁에 담고 싶다" 고 요청. 이미 인생 연혁(life_event)·가족 룸·인물 연결·진척·비서 컨텍스트·반응 스탬프 등 검증된 6 영역이 `UserMemory` 위에 올라가 있어, 새 유형 추가가 어느 한 곳이라도 깨면 회귀가 광범위. 추가로 같은 사용자가 같은 시대 사건을 두 번 담는 중복은 막아야 하는데, 기존 `monthEventId` 컬럼은 nullable 이라 단순 `@@unique` 가 모든 nullable 행에 영향 0 임을 보장해야.
- **Action**: 새 모델 0. `UserMemory.createdVia="era_event"` 한 디스크리미네이터 + 기존 컬럼(year/month/title/eventTitle/eventYear/eventMonth/monthEventId) 재사용. content=null 정책으로 본인 회상 자리 비움(시대 자료는 monthEventId FK join 으로 표시). 중복 차단은 DB-only partial unique index — `CREATE UNIQUE INDEX … ON UserMemory(userId, monthEventId, createdVia) WHERE monthEventId IS NOT NULL`. Prisma `@@unique` 는 partial WHERE 절을 표현 못하므로 schema 에는 의도 주석만 남기고 마이그 SQL 만 partial — 코드는 `try create + catch P2002 → "already"` 패턴으로 compound where 헬퍼 없이도 idempotent. 3컬럼 묶음(userId/monthEventId/createdVia) 이유는 timemachine_event 와 era_event 별도 라이프사이클 보존. 적용 전 충돌 검증 스크립트(`db/check-era-unique-conflict.ts`) 로 monthEventId 있는 기존 행 = 0건, 충돌 = 0 확인 후 `migrate deploy`. `getLifeEvents` 는 `LifeEvent.kind: "life_event" | "era_event"` 필드 추가 + 두 createdVia 모두 가져오는 한 쿼리로 통합 — 호출자(비서 컨텍스트 등)는 `filter(e => e.kind === "life_event")` 한 줄로 분리. 인물 연결 거부는 기존 `lib/people.ts` 의 `not_life_event` 가드가 자동 처리 (정책이 헬퍼 단일 결정자라 새 코드 0). 가족 룸 자동 노출은 year/title 미러링이 listRoomMemories 의 select 와 정확히 맞아 별도 코드 0 — `PersonalMemoryCard:109-113` 가 `{memory.content && ...}` 패턴이라 content=null 시 본문 안 그림 → **레이아웃 0 깨짐**.
- **Result**: 검증 — 새 모델 0, 새 라우트 1(`/era`), 기존 6 영역 회귀 0. `db/test-era-stash.ts` 10 시나리오 (담기/중복/사용자 독립/필드 매핑 8개/getLifeEvents join/인물 거부/룸 노출/idempotent 사이클/life_event 회귀) + 기존 6 스크립트 회귀 통과. *부분 unique* 가 필요해 보이는 케이스의 90% 는 PG 의 NULL unique 동작(`UNIQUE(a, b)` 에서 b NULL 행끼리 자동 무관)으로 standard unique 만으로 충분 — 그 동등성을 검증해 본 뒤 명시 partial 을 결정한 게 핵심. *디스크리미네이터 패턴 + DB-only constraint + 호출자 한 줄 filter* 셋이 모이면 새 도메인을 기존 영역에 0 줄 영향으로 끼울 수 있다.

## CSV → 시드 모듈 → upsert 적재 — 파이프라인의 멱등성을 모든 단계에 분배

- **Problem**: 어르신이 검증한 시대 사건/음악 CSV 두 개(88건/73곡, 1980~2019). 기존 seed-timemachine.ts 의 2025~2026 데이터(MonthEvent 46건, ChartSong 128곡)는 절대 보존하면서 추가 적재. CSV 안에 쉼표 포함 행("윤도현 밴드(YB), 붉은악마", "눈, 코, 입") 6건이라 단순 split 불가 — RFC 4180 정식 파서 필요. 그리고 다음에 CSV 가 갱신될 때 같은 파이프라인을 재실행해도 중복 0 / 사용자 추억(monthEventId FK) 끊김 0 보장 필요.
- **Action**: 파이프라인 4단계 모두 멱등. (1) `db/inspect-era-csv.ts` 진단 — RFC 4180 미니 파서(따옴표 안 쉼표/이중따옴표/줄바꿈/UTF-8 BOM 처리) + enum 매핑 검증 + 통계만 출력, DB 안 건드림. (2) `db/seed/era-events/_generate.ts` 자동 변환기 — 같은 파서로 CSV 읽어 `era-events.ts`/`era-music.ts` 두 모듈 자동 생성. AUTO-GENERATED 주석 + 원본 CSV 파일명 + 생성 시각 헤더로 출처 추적. eraColor 는 연대별 자동 분기(1980s/1990s/2000s/2010s). (3) `db/seed-era-events.ts` 적재 — MonthEvent / ChartSong 각각 deterministic id (SHA-256(자연키).slice(0, 24)) 부여 후 per-row upsert. MonthEvent 의 자연키는 `section|year|month|title` 로 seed-timemachine 과 **동일 함수 규칙** — 두 시드가 같은 키로 자연 충돌 0. ChartSong 은 seed-timemachine 의 `deleteMany+createMany` 패턴이 우리한테 그대로 적용되면 기존 128곡이 날아가므로 우리도 per-row upsert (origin|year|month|title|artist 자연키). (4) 적재 전후 카운트 비교 + `2025+ 보존 검증` 강제 — `before2025 === after2025` 가 둘 다 참 아니면 exit 1. revalidate 식 안전망.
- **Result**: 검증 — MonthEvent 46→134 (1980~2019: 88, 2025+: 46 보존), ChartSong 128→201 (1980~2019: 73, 2025+: 110 보존). 재실행 시 "새로 생성 0건, 갱신 88건" 으로 멱등 확인. 두 CSV 모두 enum 매핑 100% (정치사회/문화연예/스포츠/생활경제/검증됨/추정/국내/해외) + 쉼표 포함 행 6건 정상 파싱. *진단·생성·적재가 모두 같은 멱등성 보장* 패턴 — 한 단계만 멱등이면 파이프라인 전체가 깨진다. CSV 갱신 시 generator 만 재실행하면 .ts 모듈 자동 갱신 → seed 재실행 → 변경분만 upsert 로 반영. 다음에 1960-70년대 / 2020-2024 시드 확장도 같은 파이프라인 한 번 더로 끝남.

## 사용자 통찰에 따른 메인 동선 피벗 — 부분 차단은 부분 노출이다

- **Problem**: v3 피벗으로 메인 화면은 인생 연혁(연 단위)으로 옮겼지만, 실사용에서 "작년 사건의 정확한 월은 기억 안 난다" 는 통찰이 드러났다. 메인은 옮겼어도 *클릭 동선* 네 곳(연혁 점, 사이드 "이번 달 타임머신" 메뉴, 진척 그리드 칸, 직접 URL) 이 여전히 월 화면으로 흘렀다. 진입로가 하나라도 남으면 사용자는 결국 그쪽으로 끌려가 "정확한 월" 을 떠올려야 하는 경험으로 복귀. 동시에 시대 사건/음악 DB·비서·시드 컴포넌트는 다른 용도(AI 채팅에서 활용)로 가치가 있어 *코드 삭제 없이* 진입로만 차단해야 했다.
- **Action**: 네 진입로를 한 번에 닫음 — (1) 라우트 `app/timemachine/[year]/[month]/page.tsx` 의 `export default` 를 `redirect("/life-timeline")` 한 줄로 교체, 기존 함수는 `_TimemachineMonthPageArchived` 로 이름만 바꿔 보존. ESLint `no-unused-vars` 회피를 위해 `__preserve_archived_exports` 객체로 한 번 참조하는 패턴 도입 (한 줄 disable 로 정리, 부활 시 default export 만 archived 로 교체). (2) `SidePanel.tsx` "이번 달 타임머신" `MenuItem` 한 블록 + `SidePanelData` 타입의 `currentMonthHref` 필드 제거, `lib/side-panel-data.ts` 헬퍼에서도 동시 정리. (3) `TimelineView.tsx` 의 `timemachineHref(e)` → `editHref(e: RenderEvent) → /life-timeline/${e.originalId}/edit` 로 교체. isPeriodEnd 행도 `originalId` 라 "끝" 점 눌러도 같은 이야기 편집 화면으로(이전 H4 픽스에서 도입한 originalId 명시 필드 덕분에 추가 매핑 불필요). (4) `ProgressCard.tsx` 12개월 그리드 각 칸의 `<Link>` 를 `<li>` 로 — 시각·색상은 그대로(동기부여 가치 보존), 클릭만 제거. 안내문 "달별 기록 (눌러서 그 달로 이동)" → "달별 기록" 으로 자연스럽게.
- **Result**: 시드(MonthEvent·ChartSong)·비서 API(`/api/timemachine/assistant`)·시드 의존 컴포넌트(MonthV2·MonthForm·MonthStory·EventItem·SongCard·AssistantPanel) 모두 무수정. 비서는 life_event 기반 컨텍스트로 이미 동작 → 영향 0. 검증: tsc·build 통과(빌드 결과에 `/timemachine/[year]/[month]` 라우트 redirect 함수로 살아있음), people(39)/life-events(7)/timemachine-progress(15)/timemachine-screen 회귀 0, 새 lint 이슈 0. *진입로는 통제 가능한 수의 분기로 묶어 한 번에 차단해야 효과가 있다* — 단일 진입로 차단은 부분 노출과 같다는 교훈. archived + 보존 패턴은 메이저 UX 결정의 되돌릴 수 있는 단방향 문 — 한 줄 교체로 복구 가능한 안전망이 의사결정 속도를 높였다.

## 텍스트 폭탄을 아코디언으로 — `grid-rows-[0fr↔1fr]` 패턴 + 시각·감성 보강 3단

- **Problem**: `/era` 둘러보기에서 한 연대(예 1980 → 15건) 사건이 모두 카드로 펼쳐져 description·출처·담기 버튼이 동시 노출. 시니어가 훑기 어려운 "텍스트 폭탄". 동시에 사진은 저작권 위험으로 못 쓰는 회상 서비스라 시각·감성 보강 자체가 까다로움 — 다른 안전한 시각 장치 필요.
- **Action**: 세 축 동시 개선. (1) **아코디언** — 카드 → 행 컴포넌트(`EraEventRow`). 평소엔 헤더 한 줄(아이콘 + 제목 + 카테고리 뱃지 + ✓ + ▼) 만, 헤더 전체 `<button>` (`min-h-[56px]` 시니어 터치) 클릭 → 그 자리에서 펼침. 펼침 전환은 `grid-rows-[0fr ↔ 1fr]` 패턴 — height auto 가 transition 안 되는 한계를 우회하면서 부드러운 펼침 (자식 `overflow-hidden`). 여러 개 동시 펼침 허용 (한 연도 안 비교 자연스러움). (2) **lucide-react 카테고리 아이콘** — 이모지 대신 SVG (기기별 tofu 방지 + 일관된 stroke). `SECTION_ICON` 매핑: 정치사회 `Landmark` / 문화연예 `Film` / 스포츠 `Trophy` / 생활경제 `ShoppingBag`. 색은 카테고리 뱃지(border/bg 50) 한 단계 진한 text-600 — 뱃지 옆에 배치돼도 시각 충돌 0. (3) **연대별 은은한 배경** — `DECADE_BG_CLASS` 추가, 사건·음악 섹션 컨테이너에 `bg-{color}-50/60` (60% opacity). 80s amber·90s emerald·00s sky·10s violet. 카드(흰색/emerald-50)가 배경 위로 떠 보이며 색 분리, 텍스트 가독성 0 영향. (4) **사건 외부 검색** — 처음엔 음악과 같은 유튜브 검색을 사건에도 (`showsYoutubeLink` 정책 함수 + 24개 키워드로 정치사회·테러·참사 OFF) 도입했지만, 사용자 통찰로 "구글 검색은 위키·뉴스·백과 위주라 민감 사건도 안전" → 사건 전부 구글 검색으로 전환, 정책 함수·키워드 죽은 코드 완전 제거. 음악만 유튜브 유지(rose vs sky 톤 분리로 "정보 찾기" vs "영상·듣기" 시각 구분).
- **Result**: 컴포넌트명도 `EraEventCard` → `EraEventRow` 로 (행 개념 명확화). tsc/빌드 통과, 백엔드·담기 토글·연대 탭·카테고리 필터 모두 무영향. 사진 없는 회상 서비스에서 *카테고리 아이콘 + 연대 색 + 행→펼침* 세 장치만으로 "시각·감성 충분" 사용성 — 시드 88건 한 화면 압박 0. *부분 차단(키워드 블랙리스트) 보다 더 안전한 진입로(구글) 가 있으면 전환이 정답* — 한 번 만든 정책 함수를 폐기하는 결정도 git history 가 복원 안전망이라 YAGNI 원칙 따르기 쉽다. `grid-rows` 트릭은 React 컴포넌트의 height auto 트랜지션 표준 — JS height 측정 없이 CSS 만으로.

## E2 → E3 — 디스크리미네이터에 후속 필드 채우기 (변경 0 영역으로 풀스택 기능 한 번 더)

- **Problem**: E2 에서 `UserMemory.createdVia="era_event"` 디스크리미네이터로 시대 사건 담기를 끼웠는데 content=null 정책으로 본인 회상 자리만 비워둠. E3 는 그 자리를 채우는 풀스택 기능 — 양쪽 진입로(/era 펼침 + /life-timeline EraCard) + 가족 룸 자동 전파 + 인물 연결·비서 컨텍스트 정책 보존 + 옵티미스틱 UX 가 한 세션에 필요. 회상 길이 제한·빈 입력 처리·동시 두 화면 일관성·권한 검증 등 풀스택 디테일 다수.
- **Action**: 새 모델 0 (E2 디스크리미네이터 재사용). 백엔드 = `lib/era-stash.ts` 에 `saveEraMemory(userId, monthEventId, content) → "saved"|"cleared"|"not_stashed"|"too_long"` 4 결과 enum + `getStashedEraMemories(userId) → Map<monthEventId, content>` (기존 `getStashedEraEventIds` 는 보존). 권한은 `updateMany {userId, monthEventId, createdVia:"era_event"}` 단일 가드 — count=0 이면 `not_stashed`. 길이 500자 정규화는 `trim → 빈 문자열이면 null`. server action `saveEraMemoryAction` 은 auth() + `revalidatePath` 세 경로(`/era`, `/life-timeline`, `/rooms`). UI = `EraMemoryEditor` 공용 컴포넌트(default/compact variant) — 한 곳에서만 정의, 양쪽이 import 해서 같은 동작 보장. `/era` 는 펼친 상세에 항상 노출(default 톤), `/life-timeline` 의 작은 카드는 viewing/editing 모드 분리(평소엔 "그때 저는 — [내용]" + 작은 [수정], 클릭 시 compact editor 펼침) — 카드 시각 부담 회피. VoiceTextarea(음성 STT) 재사용 — 시니어 타이핑 부담 0. 옵티미스틱은 `onSaved(newContent)` 콜백으로 부모 state 즉시 동기화. `LifeEvent` 타입에 `monthEventId: string | null` 추가 (life_event = null, era_event = 채워짐) — EraCard 가 저장 키로 사용. 가족 룸 전파는 `PersonalMemoryCard:109-113` 의 `{memory.content && ...}` 가드가 이미 있어 변경 0줄 — content 채우면 자동 노출, null 이면 안 그림 → 레이아웃 0 깨짐. 인물 연결 거부(`not_life_event`) 와 비서 컨텍스트 제외(`filter(kind === "life_event")`) 정책도 그대로.
- **Result**: 검증 — `test-era-stash` 17 시나리오 통과 (기존 10 + E3 신규 7: saved/cleared/not_stashed/too_long/prefetch/룸 노출/monthEventId 매핑). test-people(39)/test-life-events 회귀 0. tsc+빌드 통과. 양쪽 화면이 한 server action·한 컴포넌트·한 디스크리미네이터 위에 올라가 일관성 자동 — *디스크리미네이터 패턴의 진짜 가치는 "후속 필드 채우기" 가 영역 확장이 아니라 같은 모델의 다른 컬럼 채우기로 끝난다는 것*. E2 가 끼운 자리에 E3 가 흘러 들어가듯 자연 확장 — 새 마이그 0, 새 모델 0, 가족 룸·비서·인물 정책 무수정. "콘텐츠 채우기" 가 풀스택 변경 없이 기존 인프라를 그대로 흐르는 패턴.

## Docker → Supabase 이전 — 7번의 디버깅 사이클로 잡은 silent fail 두 가지

- **Problem**: 로컬 Docker PostgreSQL → Supabase (사진 기능의 Storage 준비를 위해). 표면적으론 `prisma migrate deploy` 한 줄과 `.env` 두 변수 교체로 끝나야 하지만 실제는 7번 사이클의 디버깅 — pgvector 가 extensions 스키마에 있어 search_path 미지정이면 `type "vector" does not exist`, Prisma 7 의 url/directUrl 가 schema.prisma 에서 빠져 prisma.config.ts 단일 위치로 이동, pgbouncer transaction mode 가 advisory lock 안전성 깨 migrate 가 hang(직접 5432 DIRECT_URL 필수), `?pgbouncer=true` 누락 시 prepared statement 충돌, 시드는 다 통과했는데 로그인만 막히는 silent fail.
- **Action**: 단계별 안내(8단계) + 단계마다 사용자 확인 받고 진행. 가장 까다로웠던 두 silent fail: (1) **`.env` 의 DATABASE_URL 중복 라인** — 옛 로컬 URL(line 1)을 주석 처리 안 한 채 새 Supabase URL(line 35) 추가. tsx+dotenv(시드)는 마지막 이김 → 시드는 정상이었음. Next.js @next/env(dev 서버)는 *첫 번째 이김* → dev 가 옛 `app:app@localhost` 로 접속. 에러 메시지의 `for `postgres`` (사용자 ID에 점 + REF 없음)가 결정적 단서 — Supabase pooler 라면 `postgres.{REF}` 필수. awk 로 라인별 길이/따옴표 메타만 출력해 "DATABASE_URL 라인이 두 줄" 즉시 발견. (2) **비밀번호의 `$` 문자** — 비번 `yq5-$BZL$Qy*gnt` 가 dotenv 의 변수 보간으로 해석돼 `$BZL`/`$Qy` 가 빈 문자열로 치환. **🚨 부산물**: grep 출력으로 비밀번호 평문이 컨텍스트 노출 → 즉시 알리고 Supabase reset 권장 → 새 비번(`$`/`#` 금지) 적용. 진단 도구로 시종일관 `len/startsWith/has dot` 같은 메타만 사용(값 노출 0). 정책 도출 — 비번에 `$`/`#` 금지, .env 의 같은 키 중복 금지, service_role 키 절대 grep/cat/console.log.
- **Result**: 사용자 검증 — pgvector cosine 검색 정상, 로그인·세션·인증·룸·연혁 모두 통과. *DB 마이그레이션의 80%는 SQL 이 아니라 환경변수의 silent fail 이다* — Prisma 7 의 url 위치 변경 + pgbouncer + dotenv 우선순위 + 비번 특수문자 보간 같은 *각각은 작지만 결합되면 디버깅 지옥* 인 함정들. 사용자가 직접 단계별로 검증하고, 진단은 메타만 출력하고, 가설→반증→가설→반증 사이클로 좁혀가는 패턴이 정답. 옛 라인 주석 처리·새 비번 규칙 같은 사후 정책은 다음 이전 작업의 안전망. *비번 노출 같은 사고가 나면 즉시 정직하게 알리고 회복 경로(키 reset)를 함께 제안* 하는 게 신뢰 회복의 단일 길.

## 1단계 극소화 + service_role 직접 패턴 — Supabase Storage 위에 사진 풀스택을 두 단계로

- **Problem**: 사진 기능은 *Storage·인증·DB 정합성·UX·권한·매직 넘버·HEIC·orphan 정리* 같은 함정이 동시에 있는 큰 영역. 한 번에 풀스택 짜면 어느 함정에서 막히는지 분리 어렵고, 잘못된 결정이 뒤늦게 드러나면 재작업 비용 큼. 또 service_role 키(모든 RLS 우회 마스터)는 직전 비번 노출 사고 이후 *어떻게 다루느냐* 자체가 정책 사항.
- **Action**: 두 단계 분할로 위험 절단. **1단계** — Storage 가 동작하는지만 검증. DB 변경 0. `app/photos/test` + `app/api/photos/test-upload` + `lib/storage.ts` 만. 검증 통과(jpg/png/webp 업로드, signed URL 표시, HEIC 거부, magic number 위장 차단, 10MB 거부) 후 archived. **2단계** — Photo 모델(마이그 1) + UserMemory 1:N + createIndependentPhoto(Storage put → DB tx → 실패 시 try/catch 로 Storage 롤백) + deletePhotoOwned(Storage remove → DB tx, 권한 + life_event 첨부는 메모리 보존). orphan 방지 핵심: 둘 다 정리되거나 둘 다 안 변하거나. 권한 = service_role 우회 + lib/photos.ts 의 헬퍼가 userId 단일 결정자. 옵션 C(Photo+UserMemory 1:N) 채택 — 디스크리미네이터(B)는 사진 여러 장 표현 불가, 새 모델 only(A)는 룸·반응·진척 자동 호환 X. 보안 정책 정착 — NEXT_PUBLIC 접두사 금지 명시 검증, `len/startsWith('eyJ')/!!process.env.NEXT_PUBLIC_*` 메타만 진단, 서버 응답에 Storage 에러 디테일 0(service_role 단서 보호), 1단계 archived 는 Next.js `_` 접두사 private 폴더 패턴(라우트 X, 코드 보존). magic number 검증 = JPEG/PNG/WebP 헤더 + HEIC ftyp 브랜드(`heic/heix/mif1/msf1/hevc/hevx`) 명시 차단 — 브라우저가 HEIC 를 image/jpeg 로 잘못 보내는 경우(Safari)도 헤더로 차단.
- **Result**: 검증 통과 — jpg/png/webp/HEIC/10MB/위장 6 케이스 모두 친화 메시지, 사진 업로드 → DB+Storage 둘 다 생성, 삭제 → 둘 다 정리(orphan 0), 풀스크린 모달 + 옵티미스틱 hide. 빌드 38 라우트(이전 35 + 사진 3). 기존 회귀 0(인생 연혁·룸·비서 모두 무영향 — photo 가 아직 거기 표시 X로 의도된 3단계+). *"가장 작게" 의 진짜 정의는 검증 가능한 단위*: 1단계는 "Storage가 동작하는가" 한 가지만 답하고, 2단계는 "DB 정합성" 한 가지에 집중. 답이 잘못되면 그 단계만 되돌리면 됨. *service_role 같은 마스터 키 패턴은 RLS 회피 트레이드오프 — 권한 헬퍼 단일 진입점 강제(lib/photos 의 userId 첫 인자)와 메타-only 진단 정책이 함께 적용돼야 안전*. orphan 방지의 핵심은 "Storage 먼저 + try/catch 로 롤백" 단방향 흐름 — DB transaction 만으로는 Storage 까지 안 닿으므로 명시 보완.

## 디스크리미네이터 확장과 leak 발견 — 사진을 인생 연혁에 얹으면서 가족 룸에 새던 한 줄

- **Problem**: 사진을 인생 연혁(가로 시간축)에 표시하려면 사진 메모리(`createdVia="photo"`)가 기존 `getLifeEvents`(life_event/era_event 디스크리미네이터로 동작)에 합류해야 한다. 그런데 ① `getLifeEvents` 는 test 스크립트가 직접 호출하는 순수 DB 함수라 signed URL(Storage 네트워크 I/O)을 넣으면 깨진다. ② 기간 이벤트(학교/군대/직장)는 시작·끝 두 점으로 split 되는데 사진이 양쪽에 다 떠 "입학식 사진이 졸업 점에도" 보인다. ③ year/title 미러링을 photo 메모리에도 넣자, `listRoomMemories`(createdVia 필터 없이 멤버의 모든 UserMemory 노출)가 사진을 **가족 룸에 이미지 없는 텍스트 카드로 새게** 만들었다 — 사진 룸 공유는 미설계(6단계).
- **Action**: ① 책임 분리 — `getLifeEvents` 는 photos 경로만 들고 오고(순수 DB 유지), signed URL 은 RSC(page.tsx)가 `Promise.all` 로 배치 발급(개별 try/catch → 실패분만 썸네일 누락, 화면 안 깨짐). test 스크립트가 Storage 자격증명 없이 계속 통과. ② `Photo.periodAnchor`(both/start/end, DEFAULT both → 기존 행·단일 시점 자동 보존) 추가, `expandPeriods` 가 split 시작 행에 `isPeriodStart` 마킹, `PhotoStrip` 이 끝점=end/both·시작점=start/both·단일=전부 필터. 사진별 PATCH 재태그. ③ **마무리 단계의 "영향 0 확인"에서 leak 발견** — era_event 가 룸에 노출되는 걸 검증하다 같은 경로로 photo 도 샌다는 걸 추론, `listRoomMemories` where 에 `createdVia: { not: "photo" }` 한 줄(era 는 정책상 유지) + 회귀 테스트로 고정. 추가로 "기간"을 카테고리가 아니라 endYear 유무로 재정의(타임라인 split 이 이미 endYear 기준) — EventForm 경로만 디커플하고 `/life-record` 의 upsert 는 카테고리 게이트 유지해 blast radius 절단.
- **Result**: 사진 3·4·5단계 + periodAnchor + 기간 자유추가 완성. 신규 회귀 photo-attach(18)·photo-anchor(15)·photo-room-isolation(4) + 기존 11개 스크립트 회귀 0, `tsc`/`eslint`/`build`(6.9s) 0. *핵심 교훈 셋*: (1) **순수 함수 경계를 지키면 테스트가 살아있다** — 같은 데이터라도 "DB 읽기"와 "네트워크 I/O"를 다른 레이어로 가르니 함수가 자격증명 없이 검증 가능. (2) **디스크리미네이터에 컬럼을 미러링하면 그 컬럼을 읽는 *모든* 기존 쿼리에 영향** — year/title 미러링이 룸 노출까지 번진 건 "기존에 영향 0인가"를 *능동적으로 추적*(era 노출 경로 → photo 도 같은 경로)했기에 출시 전 발견. (3) **마무리의 "영향 확인"은 체크박스가 아니라 실제 추론** — 통과한 테스트만 보지 않고 "이 데이터가 닿는 다른 쿼리는?"을 묻는 것이 leak 을 잡았다.


## 디스크리미네이터를 인물·장소로 확장 + 기간 중복은 렌더 억제로 — 사진 매칭(A·B·C)

- **Problem**: 사진(`createdVia="photo"` 메모리)에 인물·장소를 매기는데, ① 인물 연결은 그동안 life_event 만 허용(`not_life_event` 가드)이라 photo 거부 ② 장소 검증 로직(`validatePlace`)이 `"use server"` 파일 안에 있어 사진 쪽에서 재사용 불가 ③ 기간 이벤트(학교/군대)는 타임라인에서 시작·끝 두 점으로 split 되는데 인물·장소가 양쪽에 다 떠 "입학 때 친구가 졸업 점에도" 보이는 중복. 사진의 periodAnchor(Photo 컬럼) 와 달리 인물·장소는 *기간 전체*에 걸친 정보라 같은 방식이 안 맞음.
- **Action**: ① `LinkResult.not_life_event` → **`not_linkable`** 리네임 + `LINKABLE_CREATED_VIA = Set([life_event, photo])` Set 가드 — era_event 만 거부, photo 허용. PeopleConnectModal·LinkToggleRow·era-stash 주석까지 한 단어로 통일. ⚠️ `lib/photos.ts` 의 *별개* `not_life_event`(첨부 도메인)는 grep 으로 people 도메인만 0건 확인 후 미수정(같은 문자열 다른 의미 구분). ② `validatePlace` 를 `"use server"` 밖 **순수 모듈 `lib/place-validate.ts`** 로 추출 → life-timeline 액션과 사진(`updatePhotoPlaceAction`)이 공유. H7 정책(미지원 placeSource → 전체 null) 보존. ③ 중복은 **앵커 없이 렌더 억제** — `TimelineView` 양쪽 카드에서 `PlacePreview`·`PeoplePreview` 를 `{!e.isPeriodEnd && (...)}` 로 감싸 시작 점에만. Photo 컬럼·마이그 0. 독립 사진은 PhotoCard 가 장소 모달 self-manage(`e.place` 가 이미 객체에 있음 → prop threading X), 인물은 RSC fetch 라 threading — 데이터 출처에 따라 패턴 분기.
- **Result**: 마이그 0(전부 기존 컬럼 재사용), 신규 `test-photo-place`(12) + 회귀 photo-attach(18)·anchor(15)·room-isolation(4)·people(39)·era-stash(17) 0. *교훈*: (1) **디스크리미네이터에 "연결 허용 목록"을 Set 로 두면 새 createdVia 합류가 한 줄** — boolean 가드(`=== "life_event"`) 보다 ReadonlySet 화이트리스트가 확장에 강하다. (2) **같은 문자열이 다른 도메인에서 다른 의미** — `not_life_event` 가 people-link 와 photo-attach 두 곳에 있어, 리네임 전 grep 으로 도메인 분리 확인이 안전망. (3) **중복 표현은 데이터 성격으로 푼다** — 시점-특정(사진)은 컬럼(periodAnchor), 기간-전체(인물·장소)는 렌더 억제. 같은 "split 중복"도 의미가 다르면 해법이 다름.

## 잠재 SSR 버그 2건은 "새 진입점"에서 터진다 — 메인 페이지에 위젯을 합류시키며 드러난 것들

- **Problem**: 사진 장소 매칭이 `PlaceSearchInput`/`updatePhotoPlaceAction` 을 `/life-timeline`(메인 페이지·메인 액션 번들)에 *처음* 합류시키자, 그동안 다른 라우트에만 있어 안 보이던 두 SSR 버그가 메인에서 동시에 터졌다. ① `"use server"` 파일(`app/era/actions.ts`)이 `export const ERA_MEMORY_LIMIT = 500`(number) — Next 16 은 async 함수만 허용("found number"). ② `@googlemaps/js-api-loader` 가 모듈 최상단에서 `window.trustedTypes` 평가 → `"use client"` 컴포넌트라도 SSR 모듈 평가에서 `window is not defined`. 증상은 "사진 장소 추가 시 에러" 한 줄이었지만 원인은 둘 다 *합류로 인한 재검증·재평가*.
- **Action**: ① 클라(`EraMemoryEditor`)가 그 숫자를 필요로 하는데 정의처 `lib/era-stash`(prisma 의존)를 import 못 해 "use server" 액션을 우회 통로로 쓰고 있었다 → prisma 없는 **순수 모듈 `lib/era-constants.ts`** 신설(`place-types.ts` 패턴). 서버는 import+재노출(호출자 무수정), 클라는 직접 import. ② 패키지 dist 를 직접 grep 해 `window.trustedTypes` 가 함수 밖 최상단임을 확정 → `PlaceMap` 을 **`next/dynamic({ ssr:false })`** 로 격리(지도는 SEO 가치 0). dispatcher 한 곳을 감싸 NaverMap/GoogleMap 모든 사용처 차단. `/add`·`/photos` 도 같은 체인이라 함께 단단해짐.
- **Result**: 픽스 후 `✓ Compiled` 직후 첫 `GET /life-timeline` 이 **200**(이전엔 매 콜드 컴파일 첫 요청 500). tsc/build/회귀 0. *교훈*: (1) **잠재 위반은 "새 진입점"에서 표면화** — 두 버그 다 코드는 그대로였고 메인 그래프에 새 노드를 더하며 재검증·재평가가 돌아 드러났다. 모듈 그래프 확장 시 기존 노드까지 재검증됨을 염두. (2) **"use server" 는 number 도 거부** — 클래스만이 아니다. 클라가 서버 전용 모듈 상수를 필요로 하면 액션 파일을 통로로 쓰지 말고 순수 모듈로. (3) **"콜드 첫 요청만 500" 은 일시 현상이 아니라 "워밍 전엔 항상"** — dev 의 자가 회복에 속지 말고, 모듈 최상단 window 접근은 `ssr:false` 로 근본 차단.


## 사진 EXIF·GPS strip·대량 업로드·사건 첨부/빼기 — 클라/서버 경계로 검증 전략을 가른 후속

- **Problem**: 회상 서비스에 사진 대량 업로드가 필요한데 동시에 함정이 많음 — (1) EXIF 촬영일을 읽어 연혁에 자동 배치하되 카톡·캡처처럼 EXIF 없는 사진도 처리, (2) **GPS 위치정보 누수**(가족 공유 회상이라 집 위치 노출은 치명적), (3) 수십 장을 한 번에 올릴 때 네트워크·Storage 부하와 부분 실패, (4) 사진을 사건에 넣고 빼되 어르신이 사진을 잃지 않게. 클라 전용 로직(EXIF/strip)과 DB 로직(이동/정합성)이 섞여 검증 전략부터 갈렸다.
- **Action**: 3단계 분할. **1단계** — `lib/photo-exif.ts`(클라): `extractPhotoDate`(DateTimeOriginal??CreateDate??lastModified??null + `dateSource` 플래그로 exif=확실/file=추정/none=수동 UI 분기), `stripGps`(piexifjs로 GPS IFD만 비우는 무손실 — 재인코딩 없이 GPS가 기기를 떠나기 전 제거, JPEG only). exifr/piexifjs 는 함수 안 `await import` 로 lazy → 초기 번들 0. `Photo.takenAt` 은 스키마에 미리 박힌 컬럼이라 마이그 0. **2단계** — 대량(`BulkUploadForm`): 다중선택 → EXIF 병렬 → 연도 ASC→takenAt ASC 그룹 → concurrency 3 워커풀 + 부분 실패 격리(한 장 실패해도 나머지) + 날짜없음 일괄 연도. **3단계** — `movePhotoToMemory`(파일 이동 X, `Photo.memoryId` 재지정만): 넣기=독립→life_event, **빼기=사건→독립 복귀(삭제 아님)** 로 어르신 사진 보존. 옛 photo-only 부모 비면 정리(orphan 0), life_event 부모는 다른 데이터라 보존. 커밋 전 코드리뷰로 4건 픽스 — H1(편집 첨부만 strip 누락, `append("file"` grep 으로 4경로 중 1곳 raw 발견) / M1(strip 실패 시 **차단** — `hadGps && !stripped`, load 실패도 보수적 차단) / M2(첨부 실패 alert) / M3(독립 메모리 생성 중복 → `buildPhotoMemoryData` 헬퍼).
- **Result**: `db/test-photo-move.ts` 17 시나리오 + 회귀(place/attach/anchor/room-isolation/people) 0, 빌드·tsc 0. GPS strip 은 실 사진(37.64/126.93)으로 업로드 후 Storage 파일 `exifr.gps()`=undefined 실측 통과. *교훈 셋*: (1) **클라/서버 경계가 검증 전략을 가른다** — `stripGps`(FileReader=브라우저 API)는 node 테스트 불가라 grep+빌드+실측, `movePhotoToMemory`(Storage 안 건드리는 순수 DB)는 tsx 17 시나리오 자동. 한 기능이라도 레이어로 갈라 각자 맞는 검증을. (2) **흩어진 정책은 grep 으로 못 박는다** — GPS strip 이 4개 업로드 진입로에 흩어져 1곳(편집 첨부)이 raw 였던 걸 `append("file"` 한 줄 grep 이 잡았다. (3) **같은 단어라도 도메인이 다르면 연산이 다르다** — "사건에서 빼기"를 삭제(`deletePhotoOwned`) 대신 독립 복귀(`movePhotoToMemory`)로 둬 어르신이 사진을 잃지 않게. 프라이버시 결정(strip 실패=차단)도 "편의 vs 누수 0"에서 회상+가족공유 맥락이 차단을 정답으로 만든다.

## 레거시 필드 재사용으로 마이그 0 온보딩 — "영원히 null" 인 필드는 신규 신호다

- **Problem**: 부모님 테스트 직전, 처음 로그인한 사용자가 안내 0 으로 빈 연혁 화면에 떨어짐 — 첫 행동 하나를 제시하는 1회성 환영 카드가 필요. "사용자당 한 번" 보장에는 DB 필드가 필요한데 새 컬럼(`welcomeDismissedAt` 등)은 마이그레이션 동반, localStorage(기존 V3 배너 패턴)는 브라우저별이라 보장 안 됨. 또 신규 사용자는 localStorage 도 비어 있어 기존 V3 배너("새로워졌어요")와 환영 카드가 두 장 연속 노출되는 시니어 부담 동선.
- **Action**: 스키마 추가 전에 *기존 필드의 현재 의미*를 먼저 추적 — `User.onboardingCompletedAt`(Phase 4 레거시)은 설정처 1곳(레거시 /onboarding)·체크처 1곳(레거시 /timeline)뿐이고, v3 신규 사용자는 `/enter → /life-record` 동선이라 이 필드가 **영원히 null**. 즉 "한 번도 온보딩류를 본 적 없음" 신호로 의미가 정확히 일치 → 재사용 결정, 마이그 0. 닫기/시작하기 모두 `updateMany {id, onboardingCompletedAt: null} → now()` — where null 조건으로 레거시 온보딩 완료 사용자의 원래 시각을 덮어쓰지 않는 idempotent 처리. 표시 조건은 `null && 이벤트 0건`(기존 사용자 오발동 차단). 배너 충돌은 두 겹 — 렌더에서 `showWelcome ? 환영카드 : V3배너` 배타 + 환영 카드 닫을 때 V3 배너의 localStorage 키도 함께 찍어 "닫자마자 다음 배너" 시퀀스 차단.
- **Result**: 새 컬럼·마이그 0 으로 사용자당 1회 환영 카드 완성. `db/test-welcome-card.ts` 4 시나리오(신규 조건 true → 닫기 1행 → 재방문 false → **중복 닫기 0건+시각 보존**) + build/회귀 0. *교훈*: (1) **nullable 레거시 필드는 "그 흐름을 안 거친 사용자" 의 신호로 재사용 가능** — 단, 설정처/체크처 전수 추적으로 부작용이 바람직한 방향인지(레거시 리다이렉트 미발동 = 오히려 정답) 확인이 선행. (2) **1회성 UI 가 여러 장이면 배타 렌더 + 종료 신호 전파** — 각자 독립 조건이면 연속 노출로 안내가 소음이 된다.

## 다크모드를 "기능 추가"가 아니라 "부채 제거"로 판단해 폐기 — 디자인 토큰 라이트 온리

- **Problem**: 화면 전반의 색이 zinc/amber/white 하드코드로 분산돼 페이지마다 미묘하게 다른 톤. 다크모드(CSS 변수 swap)는 모든 신규 화면에 "다크 대응" 부채를 지워 미대응 후속(M2)이 계속 쌓였고, 핵심 타깃(시니어)의 다크모드 수요는 사실상 0. 버튼·칩 위계와 터치 크기(48px+)가 코드 리뷰로만 지켜지는 상태.
- **Action**: 디자이너 토큰 가이드 v1.0 기반 시리즈(1~5차). ① `@theme` 단일 라이트 팔레트(canvas/surface/ink 계열/line/brand/action/danger/success/banner + 연대 틴트·스트립) — 토큰명 "base" 가 Tailwind `text-base`(크기)를 색상 유틸리티로 덮어쓰는 충돌을 발견해 canvas 로 개명(색 토큰명에 크기 키워드 금지 규칙화). ② 다크모드 폐기 — ThemeToggle·쿠키 액션 삭제, `color-scheme: light` 고정. ③ 규칙을 컴포넌트로 집행 — Button 위계 5종(primary 필 화면당 1개, destructive 는 빨강 필 금지) + size 가 터치 최소 보장, 선택 칩은 필 금지(banner+brand 보더), 연대 틴트는 워시 전용(텍스트 배경 금지). ④ 100여 파일 일괄 치환 + grep 검증(`bg-white|text-black|ThemeToggle` 잔존 0).
- **Result**: 표면색·위계·서체(Pretendard+명조)가 단일 진실 원천으로 통일, 신규 화면의 다크 대응 부채 원천 제거. *교훈*: (1) 타깃이 좁으면 모드는 기능이 아니라 세금 — 수요 증거 전엔 지불하지 않는다. (2) 유틸리티 생성형 CSS 에서 토큰명은 네임스페이스 충돌 검토가 필수. (3) 디자인 규칙의 집행자는 가이드 문서가 아니라 컴포넌트 variant.

## AI 가 사용자 글을 고치는 기능 — 비파괴 + 승인 게이트 + 실측으로 가드 재조정

- **Problem**: 어르신 입말 회상(군말·오타·사투리 혼재)을 가족에게 보여줄 글로 다듬는 AI 기능. 원문이 자산(말투·사투리 = 그 사람)이라 덮어쓰기 금지, AI 창작 금지(없는 내용·감정 추가 시 회상이 소설이 됨), 시니어가 변경을 인지·통제할 수 있어야 함.
- **Action**: ① 비파괴 구조 — refinedText 별도 컬럼 + 사용자가 전/후 카드 보고 [이대로 바꾸기] 눌러야 표시 전환(displayRefined 게이트), 전환 후에도 "원래 글 보기" 상시, content 수정 시 교정본 자동 무효화. ② 표시 스왑은 읽기 헬퍼 한 곳(`getLifeEvents`)에서 — 호출자 0줄 자동 적용, 편집 화면은 원문 고정(교정본 재편집 사고 차단). ③ 프롬프트 금지 조항과 서버 길이 가드(결과/원문 비율)를 쌍으로. ④ 실측 1건이 스펙을 고침 — 하한 0.8 이 군말 많은 글(제거만으로 67%)을 과차단 → 0.6 완화 + 프롬프트 수치 삭제("요약하지 마라"로 대체). "어머이"→"어머니" 표준화 누출 → 추상 조항 대신 예시 열거(어머이·억수로·~카더라)로 고정.
- **Result**: 재실측 76% 통과 — 사투리 3종 보존 + 군말 전부 제거, 마이그 1건(ADD COLUMN 3줄)·새 모델 0, 기존 테스트 24건 회귀 0. *교훈*: (1) AI 의 사용자 콘텐츠 수정은 별도 컬럼·전/후 비교·명시 승인이 한 세트. (2) 가드 임계값은 책상이 아니라 도메인 실측으로 — 표본 1건이 0.8→0.6 을 결정. (3) 모델에게 추상 금지("사투리 보존")보다 구체 예시("어머이 그대로")가 작동한다.

## AI 텍스트 교정 — 정밀도 선택 + 차등 과금 + "결과 있을 때만 과금"

- **Problem**: 무료 단일 모델(Haiku) 다듬기의 한계 — 어려운 회상(자모 깨짐·복잡한 비문)은 품질이 들쭉날쭉한데 더 좋은 모델을 고를 수 없고, 무료 전면은 좋은 모델 무제한 사용 시 운영 비용 통제 불능. 동시에 시니어 대상이라 "모델 이름"이 아니라 "비용과 정성"으로 선택지를 줘야 함.
- **Action**: ① 비서(타임머신)용으로 만든 tier·차등 차감 인프라(`MODEL_MULTIPLIER` 1/3/5, `tokensFromUsageForModel`, `chargeOneShot.surcharge`)를 다듬기에 재이식 — 정책 함수 무수정, surcharge 인자(`base*(multiplier-1)`)로 배수 표현. ② UI 는 모델명 숨기고 "빠르게/꼼꼼하게/가장 정밀 + 1/3/5토큰" 칩. ③ **차감을 저장 앞에 배치** — 검증 통과 → chargeOneShot(잔액 부족이면 throw) → 저장. 그래서 NO_CHANGE·왜곡 의심(길이 가드 탈락)이면 차감 0, 잔액 부족이면 결과 없이 402. ④ Opus 4.7 temperature 거부는 기존 `supportsTemperature` 가드가 자동 흡수.
- **Result**: 마이그 0·새 함수 거의 0, 실측 haiku 1 / sonnet 3 토큰 차감 + opus no_change 0토큰(저장 안 돼 과금 0)으로 "저장 시에만 과금" 입증, 회귀 0. *교훈*: (1) 한 번 만든 차등 정책 인프라는 surcharge 같은 확장점 하나로 다른 기능에 재사용된다. (2) "결과 없으면 과금 0"은 문서가 아니라 *차감을 저장 앞에 두는 순서*로 강제된다. (3) 무료→유료 전환은 멘탈 모델 일관성(왜 빠르게만 공짜?)으로 판단 — 셋 다 과금하되 최저가로.

## 폴리모픽 테이블의 목록 — kind 분기로 잘못된 편집 라우트 404 흡수

- **Problem**: 한 테이블(`UserMemory`)이 디스크리미네이터(`createdVia`)로 세 종류(직접 입력 이벤트·시대 사건 담기·사진)를 담는데, 관리 목록이 이를 구분 없이 모두 같은 편집 라우트(`/[id]/edit`)로 링크. 편집 화면은 한 종류(life_event) 전용이라 나머지 두 종류는 `getLifeEventById`의 `createdVia` 필터에서 null → 404. 삭제 경로도 동일 필터라 함께 깨짐.
- **Action**: A안(라우트 분기 + 대상 화면에 딥링크/focus 신규 구현 + 삭제 의미 분리)과 B안(목록 유지 + kind별 안내) 비교. era 사건은 편집 필드(카테고리·장소·인물)를 하나도 안 가져 EventForm 자체가 부정합 + per-id 딥링크 부재 → 데이터 구조상 B 가 자연스럽다 판단. 읽기 헬퍼가 *이미* 노출하던 `kind`로 목록 한 곳에서 분기 — life_event 는 현행 수정/삭제, era_event 는 "그 시절 둘러보기"(/era), photo 는 "사진 화면"(/photos) 안내. 백엔드 0줄.
- **Result**: 1파일 변경으로 두 종류 404 + 삭제 실패 동시 해소, 3종 행 분기 매핑 실측. *교훈*: (1) 폴리모픽 행은 "같은 테이블, 다른 편집면" — 라우팅을 억지로 맞추기보다 표시 분기로 흡수하는 게 데이터 구조에 정직하다. (2) 한 증상(era 404) 뒤에 같은 root 의 잠복 결함(photo·삭제)이 숨어 있어, 근본 원인(필터 vs 무분별 링크)을 봐야 전부 잡힌다.

## 랜딩 페이지 — 카피·이미지 슬롯 분리로 "교체 가능한" 마케팅 표면

- **Problem**: 비로그인 첫 인상을 좌우하는 랜딩이 "Lifebook + 한 줄" 수준. 디자이너 와이어(6섹션)를 구현하되, 카피·이미지가 아직 확정 전이라 나중에 실화면 캡처·확정 카피를 끼울 때 코드를 다시 헤집지 않아야 함. 시니어 타깃이라 큰 글씨·primary 절제(화면당 1개 원칙)도 지켜야 함.
- **Action**: ① 카피를 `lib/landing-copy.ts` 상수로 분리(확정 슬롯은 그대로, 미확정은 더미) → 카피 확정 시 한 파일만 교체, page 무수정. ② 모든 이미지 placeholder 에 `data-slot` 고유 id(hero-timeline·step-1-era·product-book…) → 캡처 끼울 위치 식별. ③ 기존 레이아웃 헤더 재사용(중복 헤더 회피), primary 버튼은 히어로·마지막 CTA 두 곳만, 디자인 토큰(`--color-ph` placeholder 1개 추가). ④ 개인정보 링크가 깨진 채 안 나가게 공개 정적 `/privacy`(데이터 원칙 골자 + 표준 구조 v0 초안)를 같은 커밋에 묶고 미들웨어 공개경로 등록.
- **Result**: 카피·이미지가 코드와 분리돼 비개발자도 교체 지점이 명확, primary 절제·18px 하한·cream 단일 무드로 시니어 친화. tsc·build 통과, /privacy 비로그인 200 + 랜딩 링크 무결 확인. *교훈*: (1) 미확정 콘텐츠(카피·이미지)는 상수·data-id 로 분리해 "교체 가능한 표면"으로 만든다. (2) 외부 링크(처리방침)는 대상 페이지와 같은 커밋으로 — 깨진 링크가 배포에 나가지 않도록 순서를 강제.

## 온보딩 빈 화면 이탈 — 출생연도 단서로 첫 사건 1개 제시 (계획 단계 모순 발견)

- **Problem**: 가입 후 출생연도만 답한 신규 유저의 타임라인이 점 하나뿐인 빈 화면 → 첫 이탈. 출생연도 단서로 "그 시절 누구나 아는 큰 사건"을 제시해 첫 회상을 유도하고 싶음. 단 신규 화면·스키마 변경 0, 기존 컴포넌트 재사용 제약.
- **Action**: ① **계획 단계에서 조건 모순 발견** — "출생연도 有 + 이벤트 0건"인데 출생연도가 BIRTH 이벤트에서 파생되므로 0건과 양립 불가 → "BIRTH 외 0건"으로 재정의(구현 낭비 방지). ② 사건 선택: `target=birthYear+20`(회상 융기 정점) + POLITICS_SOCIETY VERIFIED(누구나 아는 앵커, 1980~2018 조밀) closest-match + 결정적 tie-break, 카테고리 파라미터화로 v2 확장 여지. ③ 재사용: 기존 회상 에디터가 "이미 담은 사건"에만 동작하는 제약을, 컴포넌트 수정 없이 **optional 액션 prop**으로 stash+저장 결합 액션을 주입해 "저장 시 생성"으로 흡수. ④ 닫기는 localStorage 기기-로컬(스키마 0, 기록 1건이면 자동 소멸).
- **Result**: 스키마·마이그·신규 라우트 0, 신규는 헬퍼1·액션1·카드1·prop1. tsc·build·2시나리오(출생연도 有→제시·저장후 소멸 / 無→폴백)·선택 5종·회귀 0. *교훈*: (1) 폴리모픽 테이블에서 파생 헬퍼(getBirthYear)는 곧 행의 존재를 함의 → 조건이 자기모순일 수 있어 계획 단계 검증이 중요. (2) 컴포넌트 재사용 제약은 고치지 말고 주입점(prop)으로 흡수. (3) "저장 시 생성"은 사전 생성 대신 저장 결합으로 순서 보장해 "안 쓰면 안 남는" 깨끗한 상태를 만든다.

## 실물 커머스 — 결제 보안은 공용, 도메인은 분리한 신규 주문 모델

- **Problem**: 토큰 충전 결제(토스 테스트 + 4중 검증)가 이미 있는 상태에서 실물 상품(포스터·부적·책) 판매를 붙여야 했다. 결제 보안(서버가 금액 진실·confirm·idempotent)은 절대 재구현하면 안 되지만(돈·회귀 위험), 토큰과 상품은 결제 *이후*가 다르다 — 토큰=잔액 적립으로 종료, 상품=배송지 저장 + 주문 상태(접수→발송→완료) 지속.
- **Action**: **결제 *플러밍*만 공용, 도메인 로직은 분리**. `confirmTossPayment`(도메인 무관)는 토큰·상품이 같은 함수 호출, success 페이지 패턴(confirm→settle→금액 대조→paymentKey idempotent→재방문 가드)은 복제. 모델은 `ProductOrder` 별도 신설 — 한 테이블 nullable 범벅 대신(settle 부수효과 정반대·배송 status 추가·필수 필드 상이) 분리. 가격은 상수 카탈로그(서버 진실), 배송지는 주문별 스냅샷, 전상법 5년 보존은 TokenOrder와 동일하게 userId nullable+SetNull. 마이그는 `migrate diff`로 운영 DB 미접촉 SQL 생성 후 사용자 직접 deploy.
- **Result**: 신규 ~900줄에 **결제 보안 재구현 0**, 마이그 순수 ADD(기존 0 영향), 회귀 0. *교훈*: 코드 재사용의 단위는 "기능"이 아니라 "불변식이 같은 레이어" — confirm은 도메인 무관이라 공용, settle은 부수효과가 달라 분리. DRY를 잘못된 층에 적용하면(settle 분기) 회계 회귀를 부른다.

## 배포 전 보안 리뷰 — "테스트 실패"를 프로덕션 무결함으로 분해

- **Problem**: 공개 URL 배포(부모님 폰) 전, 1주 누적분(디자인 토큰·다듬기·모바일·토큰결제·상품결제·랜딩)의 보안·정합·회귀를 점검. 회귀 중 결제 정산 테스트가 P2002로 빨강 → "결제 버그?" 의심.
- **Action**: 심각도순 체계 점검 — 결제(서버 금액 진실·confirm 우회 불가·IDOR·idempotent), 인증(API auth+401), 개인정보(GPS strip 4경로·음성 미저장·비밀키 NEXT_PUBLIC 0), 정합(displayRefined 스왑·탈퇴 SetNull). 테스트 실패는 추적 결과 **격리 결함**으로 분해 — 고정 paymentKey + 법적 보존(SetNull)으로 남은 orphan 행이 전역 unique와 충돌, 운영 키는 토스가 유니크 발급하므로 프로덕션 발생 불가. 발견한 실수정 2건만(탈퇴 ProductOrder 정리·테스트 격리) 반영, 운영 DB orphan은 SELECT 제시 후 사용자 직접 삭제(운영 변경 수칙).
- **Result**: 배포 차단 0으로 결론, 출시 후 후보 명확화. 3종 회귀 green 복구. *교훈*: (1) `onDelete: SetNull`로 법적 보존하는 테이블은 보존 정책과 테스트 격리를 같이 설계해야 — 안 그러면 보존된 자식 행이 다음 테스트를 깬다. (2) "테스트가 빨강"과 "프로덕션이 버그"는 다른 명제 — 분해해 입증해야 잘못된 핫픽스를 막는다.

## 소셜 로그인 확장 — 스키마 0으로 카카오·네이버 추가 (게이트의 provider-무관성 입증)

- **Problem**: 어르신 타깃이라 구글보다 카카오·네이버가 익숙 → 배포 전 두 소셜 로그인 추가. 인증은 모든 동선의 입구라 회귀 위험이 크고, 카카오는 이메일 미수집(닉네임만) 요구라 "이메일 없이 가입이 되는가"가 관건.
- **Action**: 구현 전 **조사로 마이그 불필요를 입증** — ① `User.email String? @unique`(Postgres 는 unique 컬럼 NULL 다중 허용 → 무이메일 다수 OK), ② 계정 식별은 email 아닌 `Account(provider, providerAccountId)` 유니크 → provider 고유 id 로 별도 계정, ③ 동의 게이트(`proxy.ts`)·`/enter`·온보딩이 `consentComplete` 하나만 보고 provider 이름을 grep 으로도 안 봄. 결론적으로 `auth.config.ts` providers 배열 + 로그인 버튼만 추가(next-auth 내장 provider). 네이버는 "이름은 MAP인데 실제론 검색 API"였던 환경변수를 `AUTH_NAVER_ID/SECRET`로 정리해 검색 API와 로그인이 한 키 공유(developers.naver.com 한 앱). 브랜드색은 로그인 가이드 강제라 디자인 토큰의 의도된 예외로 두되 시니어 규격(56px·18px)은 유지.
- **Result**: 스키마·마이그·패키지 0, 변경은 코드 2~3파일. tsc·build 통과, /login 버튼 3개, 동의·온보딩 자동 적용. *교훈*: (1) 인증 같은 고위험 영역은 "코드부터"가 아니라 "왜 안 건드려도 되는지"를 데이터 제약(nullable unique·식별 키)으로 먼저 입증하는 게 더 빠르고 안전하다. (2) 게이트를 처음부터 provider-무관(동의 타임스탬프 파생 플래그)으로 설계해 둔 덕에 신규 provider가 0줄로 올라탔다 — 분기 대신 불변식.

## 카톡 공유 미리보기 — 미들웨어가 OG 이미지를 가로채던 함정

- **Problem**: 6/19 배포 전, 카카오톡·문자로 링크 공유 시 미리보기(제목·설명·썸네일)가 안 떴다. OG 메타가 아예 없었고, 동적 OG 이미지(`app/opengraph-image.tsx`, 1200×630 ImageResponse)를 추가했더니 이번엔 이미지 대신 HTML 이 200 으로 돌아왔다.
- **Action**: ① `metadataBase` + 전역 openGraph(siteName/locale/type) + twitter 카드를 layout 에, 랜딩 카피 오버라이드를 page 에. ② 동적 썸네일은 Noto Serif KR 을 **필요 글자만 subset fetch**(satori 의 woff2 미지원 회피 위해 CSS 에서 truetype URL 만 정규식 추출). ③ "200 인데 text/html" 을 `MaximumRedirection 0` 으로 추적 → 307 발견 → **미들웨어 matcher 의 점(.) 기반 정적파일 제외 규칙이 점 없는 메타데이터 라우트(`/opengraph-image`)를 못 걸러 인증 리다이렉트로 빠짐** 을 진단, PUBLIC_PATHS 등록으로 해소. ④ 인접 함정(Next 의 openGraph 비-깊은병합)까지 페이지에서 siteName 재명시로 보정.
- **Result**: `/opengraph-image` 200 image/png, 랜딩에 og/twitter 8태그 정상. 랜딩 placeholder 8슬롯도 next/image(fill·object-cover)로 전부 실화면 교체(fill 의 intrinsic 0 으로 grid auto 트랙이 수축하던 S4 는 칼럼 폭 고정으로 해결). *교훈*: (1) "200 인데 내용이 이상"하면 리다이렉트를 의심 — 진짜 상태코드를 봐야 한다. (2) 프레임워크의 편의 규칙(matcher 의 점 제외, og 병합)은 메타데이터 파일 컨벤션 같은 경계 케이스에서 새는 추상화 — 외부 크롤러가 받는 라우트는 명시적으로 열어야 한다.

## 포스터 편집기 — 검증된 렌더를 0줄 건드리고 인터랙션 4종을 올린 클라 레이어

- **Problem**: 동결된 디자이너 SVG(7월까지 비주얼 판단 금지)를 종 교체형으로 렌더하고, 그 위에 편집(사건 빼기·크기·위치·메모)을 얹어야 했다. 데모 임박이라 가장 큰 리스크는 "편집을 더하다 이미 검증된 렌더를 깨는 회귀". 제약: 렌더 엔진(`render.ts`/`mapping.ts`) 무수정, 클라 휘발성, 마이그 0, 어르신 기본 동선(아무것도 안 해도 자동 렌더) 보존.
- **Action**: **3계층 경계**(매핑=template-agnostic / 렌더러=매니페스트 구동·종지식 0 / UI=클라)로 종 지식을 매니페스트 한 곳에 가두고, 편집은 전부 `PosterInteractive` 한 파일의 **클라 후처리**로만 구현. 모든 적용을 단일 useEffect에서 state→DOM 전량 재계산(**idempotent** — 재주입·전환마다 안전, 과거 "setState 업데이터 내 DOM 변경이 재렌더로 지워지는" 버그를 post-commit effect로 일원화). 인라인 `setAttribute`/`style`로 적용해 CSS·presentation 속성 충돌 회피. 드래그는 포인터 이벤트(`setPointerCapture` + `getScreenCTM().inverse()`로 반응형 스케일 자동 보정) 인프라를 만들고, 크기(②)는 그 transform을 중심 기준 scale로 확장, 메모(③)는 별도 effect로 격리하되 `dragRef.kind` 분기로 같은 드래그를 재사용 — 슬롯 경로 무수정으로 ①② 회귀 0. 3번째 종(sephirot)은 "100% 동일" 클레임을 grep으로 검증해 슬롯 DOM 비호환(중첩 g·음수좌표·group transform)을 발견, naive 강행 대신 STOP+재작업 요청.
- **Result**: 포스터 11커밋 전 구간 **엔진 diff 0**, 마이그 0, tsc+build 통과, 어르신 auto 경로 무변. 빈 슬롯 토큰 누수는 server가 이미 숨기지만 원인 미확인 → 방어적 "{" 스윕 가드. *교훈*: (1) 동결 자산 위에서는 "재구성(JSX 변환)"이 아니라 "id 기준 문자열 주입 + 경계"가 비주얼 드리프트를 막는다. (2) 인터랙션을 쌓을 땐 공유 인프라(포인터·transform·통합 effect)를 먼저 깔고 신규 기능은 분기(`kind`)·격리(별도 effect)로 올려 회귀 표면을 0으로 유지. (3) 외부(디자이너) "동일" 주장은 grep으로 검증 — 매번 틀렸다. (4) 조용히 망가진 산출물보다 STOP+보고가 낫다.

## NUL 바이트 1개로 git이 소스를 바이너리로 오인 — 표시 vs 실체 분리 진단

- **Problem**: 멀쩡한 코드 추가 커밋이 `0 insertions / Bin 15851->16736`로 나옴. git이 `.tsx`를 바이너리로 분류해 diff·blame이 깨졌다(내용 자체는 정상 커밋).
- **Action**: git 바이너리 휴리스틱(앞부분 NUL 검출)에서 역추적 → `grep -naP '\x00'`로 메모 키 separator에 혼입된 **U+0000 단 1바이트**를 line 42에서 특정 → `perl -i -pe 's/\x00/ /g'`로 일반 공백 치환(키 동작 동일). 커밋 후에도 `git show`가 `Bin->Bin`인 것은 "부모 커밋 블롭이 아직 바이너리"라 비교 상대가 바이너리이기 때문임을 `git cat-file blob`로 현재 HEAD 블롭의 NUL 0을 확인해 분리 입증.
- **Result**: 다음 변경부터 텍스트 diff 정상 복귀. NUL 점검을 커밋 검증 루틴(tsc/build/경계 diff)에 편입. *교훈*: "diff가 Bin"과 "파일이 깨짐"은 다른 명제 — 블롭 자체(`cat-file`)를 봐야 한다. 보이지 않는 제어문자는 `grep -P '\x00'`로 바이트 단위 추적이 가장 빠르다.

## Google OAuth 정책 차단을 코드 없이 우회 — 인앱 브라우저 플랫폼별 대응

- **Problem**: 카카오톡·인스타그램·네이버 앱 인앱 WebView에서 Google OAuth 시도 시 `403 disallowed_useragent`. 코드 버그도 설정 문제도 아닌 Google 정책 — 커스텀 UA WebView의 OAuth를 2019년부터 서버 측에서 차단. OAuth 설정(GCP Console), next-auth 파라미터로는 해결 불가.
- **Action**: "우회"를 포기하고 **플랫폼별 브라우저 전환 유도**로 전환. UA 감지(`KAKAOTALK|Instagram|NAVER|FBAN|FBAV`)→ Android는 KakaoTalk 전용 API(`kakaotalk://web/openExternal`)와 범용 Chrome intent(`intent://…#Intent;scheme=https;package=com.android.chrome;end`)를 app-specific 분기로 mount 즉시 발사, iOS는 "···→Safari로 열기" 안내 배너+URL 복사 버튼. 카카오·네이버는 인앱에서도 작동하므로 서버 액션 무수정, 구글 버튼 아래 한 줄 안내만 추가.
- **Result**: Android KakaoTalk에서 Chrome 자동 전환, iOS에서 Safari 유도 배너 노출. 인앱 사용자 대다수를 카카오·네이버 로그인으로 유도해 이탈 최소화. *교훈*: (1) 외부 서비스(Google OAuth)의 정책 차단은 설정 레벨에서 풀 수 없다 — 프레임워크가 제공하지 않는 layer(OS 브라우저 전환)로 올라가야 한다. (2) 앱 전용 URL 스킴(`kakaotalk://web/openExternal`)은 범용 intent의 상위 호환 — 앱 감지 후 specialized API 우선 시도, 폴백 순서 설계가 핵심.

## 전자상거래법 사업자 정보 고지 — 단일 출처 패턴으로 법적 의무와 유지보수성 동시 확보

- **Problem**: Toss 프로덕션 심사 통과를 위해 전자상거래법상 의무 사항(상호·대표자·사업자번호·주소·CS·통신판매업 신고번호) 6종을 모든 페이지에 고지해야 했다. 하드코딩하면 사업자등록 완료 후 일괄 업데이트 시 누락 위험.
- **Action**: `lib/commerce/business.ts`에 `BUSINESS_INFO const` 단일 출처 정의 → `Footer` 컴포넌트가 import → root layout에 `<Footer />` 한 줄로 전 페이지 자동 고지. `/privacy` 개인정보 처리방침도 동일 const import. 통신판매업 신고번호는 "신고 예정"으로 placeholder 보존(~6/19 발급 후 단 1개 필드 교체).
- **Result**: 전자상거래법 고지 6종 완비, 마이그 0, 변경 파일 3개. *교훈*: 법적 의무 정보는 "어디서 왔는가(출처)"가 명확해야 유지보수할 수 있다 — 비즈니스 상수(사업자번호·주소)는 UI와 법적 문서가 공유하는 단일 const로 관리.

## sephirot 3번째 템플릿 — 엔진 0줄로 SVG 종 추가 검증

- **Problem**: 디자이너가 제공한 sephirot SVG가 렌더 엔진의 계약(슬롯 단층·양수좌표·transform 0)을 만족하는지 사전에 알 수 없었다. naive 추가 시 DOM 비호환으로 렌더 깨짐 위험(실제로 1차 SVG에서 중첩 `<g>`, `#node` 혼입, 음수좌표 발견 → STOP 요청).
- **Action**: **15개 항목 grep 게이트(STEP0)** — 슬롯 수·flat 구조·`#node` 혼입·음수좌표·transform·text id·symbol·가짜데이터 전수 검증. 1차 SVG 비호환 발견 → 디자이너 재작업 요청. 2차 SVG에서 전 항목 PASS 확인 후 매니페스트(`lib/poster/templates/sephirot.ts`) 작성: 챕터 메타포명 보존은 sentinel id(`__sephirot_no_chapter_inject_N`) no-op 패턴, significanceVariants는 zelkova 재사용(동일 심볼 구조). `render.ts`/`mapping.ts` diff 0.
- **Result**: 3번째 종 추가로 렌더 엔진 1줄 수정 없음 검증 — 매니페스트 파일 1개가 종 지식 전체. *교훈*: 외부 자산(디자이너 SVG)은 "동일하다"는 구두 확인보다 grep 체크리스트가 신뢰할 수 있다 — 1차 SVG에서 3개 계약 위반이 실제로 발견됐다.
