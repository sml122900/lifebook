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
