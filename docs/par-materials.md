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
