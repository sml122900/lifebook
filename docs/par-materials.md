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
