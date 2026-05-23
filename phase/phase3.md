# Phase 3 — 인증 + 개인정보·국외이전 동의 게이트

> **목표**: 로그인할 수 있게 하고, 첫 진입 시 **명시 동의 게이트**(개인정보 수집·이용 + AI API 국외이전)를 통과해야만 서비스에 들어오게 한다. 미로그인·미동의는 막는다.
> **선행 조건**: Phase 2 완료, git 워킹 트리 정리됨.
> **작업 방식**: 3.1부터 하나씩, 완료 기준 충족 시 커밋 후 다음.

**설계 원칙 (CLAUDE.md 준수)**
- 동의는 **명시적**이어야 한다 — 사전 체크 금지, 자동 동의 타이머 금지, "계속하려면 동의"식 강제 끼워넣기 금지.
- 솔로 콘텐츠 = **비공개 기본**.
- AI API 국외이전 동의는 AI 기능(Phase 7) 전에 **가입 흐름에 선반영**한다.
- ⚠️ 동의 문구는 **임시 플레이스홀더**로 작성하고, 정식 출시 전 변호사 검토가 필요하다는 주석을 남긴다.

---

## 3.1 — Auth.js 설치 + OAuth 1종

**목적**: 가입/로그인 기반을 만든다.

**작업**
- Auth.js(NextAuth) 설치 + 설정.
- 우선 **OAuth 1종**으로 시작(개발 편의상 Google 권장). 이메일 매직링크는 SMTP가 필요해 마찰이 있으니 후순위/선택.
- 한국 정식 출시용으로 **카카오/네이버 로그인**을 추후 추가한다는 메모를 남긴다(시니어·국내 사용자 친화).
- `.env`에 OAuth 클라이언트 ID/Secret 항목 추가(값은 사용자가 직접 발급해 넣음 — 코드에 하드코딩 금지).

**완료 기준**: `/login`에서 OAuth 로그인 → 콜백 → 세션 생성까지 동작한다.

---

## 3.2 — Prisma 어댑터 + User 모델 정합

**목적**: Auth.js 세션/계정을 DB에 저장하고, 기존 User 모델과 합친다.

**작업**
- Auth.js Prisma 어댑터 설치, 어댑터가 요구하는 모델 추가: `Account`, `Session`, `VerificationToken`.
- 기존 `User` 모델을 어댑터 규격에 맞게 정렬(아래는 핵심 필드 가이드, 어댑터 표준 필드는 Auth.js 문서 기준):
  ```prisma
  model User {
    id            String    @id @default(cuid())
    name          String?
    email         String?   @unique
    emailVerified DateTime?
    image         String?
    // --- 우리 도메인 필드 ---
    birthYear     Int?
    region        String?
    // --- 동의 타임스탬프 (3.3에서 사용) ---
    termsConsentAt            DateTime?
    privacyConsentAt          DateTime?
    overseasTransferConsentAt DateTime?
    createdAt     DateTime  @default(now())
    accounts      Account[]
    sessions      Session[]
    profile       LifeProfile?
    memories      UserMemory[]
  }
  ```
- 마이그레이션 생성·적용 후 `npx prisma generate` (Prisma 7: generate 누락 주의).

**완료 기준**: 로그인 시 User/Account/Session 레코드가 DB에 생성된다.

---

## 3.3 — 동의 게이트 화면

**목적**: 첫 진입 시 명시 동의를 받고 시각을 기록한다.

**작업**
- `/consent` 페이지: 항목별 **개별 체크박스**(전부 사전 체크 해제 상태).
  - [ ] (필수) 개인정보 수집·이용 동의
  - [ ] (필수) AI 처리 위한 **국외이전** 동의 — "입력하신 내용이 해외 AI 서비스로 전송될 수 있습니다" 취지
  - [ ] (필수) 서비스 이용약관 동의
  - (선택) 마케팅 수신 등은 분리, 선택 항목으로.
- 필수 항목 모두 체크해야 "시작하기" 활성화. 동의 시 해당 `*ConsentAt`에 현재 시각 저장.
- 동의 문구는 임시 텍스트 + `// TODO: 법무 검토 필요` 주석.

**완료 기준**: 필수 동의 없이는 진행 불가, 동의 시 타임스탬프가 User에 저장된다.

---

## 3.4 — 보호 라우트 (미들웨어)

**목적**: 로그인·동의 상태에 따라 접근을 통제한다.

**작업**: Next.js 미들웨어(또는 Auth.js 가드)로 분기.
- 미로그인 → `/login`
- 로그인했으나 필수 동의 미완료 → `/consent`
- 둘 다 완료 → 정상 접근(`/timeline`, 이후 `/onboarding` 등)
- 공개 경로(`/`, `/login`, `/consent`, 정적 자원)는 예외.

**완료 기준**: 미로그인/미동의 상태로 `/timeline` 접근 시 각각 `/login`·`/consent`로 리다이렉트된다.

---

## 3.5 — 로그인/로그아웃 UI

**목적**: 시니어도 쉬운 진입.

**작업**
- `/login`: 큰 버튼의 OAuth 로그인, 군더더기 없는 화면(시니어 접근성 기준 유지 — 큰 글씨/큰 버튼).
- 헤더/메뉴에 로그아웃, 로그인된 사용자 표시(이름 또는 이메일).

**완료 기준**: 로그인→서비스 진입→로그아웃 한 바퀴가 부드럽게 된다.

---

## 3.6 — 솔로=비공개 기본 (자리 잡기)

**목적**: 공유 기능(Phase 9) 전까지 모든 개인 데이터는 비공개임을 모델/쿼리에서 보장.

**작업**
- `UserMemory` 조회는 항상 `where: { userId: 현재유저 }`로 스코프(타인 데이터 노출 불가).
- (선택) `UserMemory`에 `visibility String @default("private")` 필드를 미리 두어 Phase 9 공유에 대비.

**완료 기준**: 현재 유저의 메모리만 조회되며, 타인 데이터에 접근할 경로가 없다.

---

## ✅ Phase 3 체크포인트

- [ ] OAuth 로그인/로그아웃 동작, 세션 DB 저장
- [ ] 첫 진입 시 동의 게이트, 필수 동의 없이는 진입 불가(사전 체크·자동 동의 없음)
- [ ] 개인정보·국외이전·약관 동의 시각이 User에 저장됨
- [ ] 보호 라우트: 미로그인→/login, 미동의→/consent
- [ ] 동의 문구에 `법무 검토 필요` 주석
- [ ] 의미 단위 커밋 완료

---

## 커밋 가이드 (예시)
- `feat: set up auth.js with google oauth`
- `feat: add prisma adapter models and align user`
- `feat: consent gate with explicit opt-in`
- `feat: route protection for auth + consent`
- `feat: login/logout ui (senior-friendly)`
- `chore: scope user memory queries to current user`

## 다음 단계
Phase 3 완료 후 `phase4.md`(온보딩 — 대화형 생애 정보 수집)로 진행한다.
