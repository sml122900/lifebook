# Phase 4 — 온보딩 (대화형 생애 정보 수집)

> **목표**: 로그인·동의를 마친 사용자에게 **부담 없는 대화형 질문**으로 생애 정보를 받아 `LifeProfile`을 채운다. 이 데이터가 (a) 타임라인 시대 범위(Phase 5), (b) 트리거 이벤트 큐레이션(Phase 6), (c) 추억을 붙일 개인 앵커포인트가 된다.
> **선행 조건**: Phase 3 완료(로그인 + 동의 게이트).
> **작업 방식**: 4.1부터 하나씩, 완료 기준 충족 시 커밋 후 다음.

**설계 원칙**
- "부담 없이" — 한 번에 한 질문, **건너뛰기 가능**, 진행률 표시, 따뜻한 톤.
- **민감정보 금지** — 건강·정치성향·종교는 묻지 않는다(타인 것도).
- 타인(가족·친구) 정보는 **별명/이니셜 입력 권장** 안내.
- 시니어 접근성 유지(큰 글씨/큰 버튼/큰 터치 영역).
- 온보딩은 **소프트 게이트** — 신규 사용자를 `/onboarding`으로 보내되, 건너뛰면 바로 `/timeline`. 강제하지 않는다.

---

## 4.1 — 온보딩 대화형 UI

**목적**: 채팅처럼 한 질문씩 묻는 화면.

**작업**
- `/onboarding` 라우트. 한 화면에 **현재 질문 하나** + 진행률 바 + "건너뛰기" / "다음".
- 답변하면 다음 질문으로 부드럽게 전환(애니메이션은 가벼워도 됨).
- 마지막 질문 후 "완료" → `/timeline`.

**완료 기준**: 질문이 하나씩 순서대로 진행되고, 진행률과 건너뛰기가 동작한다.

---

## 4.2 — 질문 스크립트 정의

**목적**: 질문을 코드가 아니라 **설정(config)**으로 분리해 추가/수정이 쉽게.

**작업**: `lib/onboarding/questions.ts`에 질문 배열 정의. 질문 유형(kind) 예시:
```ts
type Question =
  | { id: string; kind: "year";     key: "birthYear"; prompt: string }
  | { id: string; kind: "chips";    key: "interests"; prompt: string; options: string[]; multi: true }
  | { id: string; kind: "textlist"; key: "residences" | "schools"; prompt: string; hint?: string }
  | { id: string; kind: "tags";     key: "favMovies" | "favGames" | "favMusic"; prompt: string; optional: true }
  | { id: string; kind: "text";     key: "siblings" | "parentsInfo" | "closeFriends" | "hobbies"; prompt: string; optional?: boolean; nicknameHint?: boolean };
```
- 권장 질문 순서:
  1. **출생연도**(year) — 시대 범위의 기준, 가장 먼저.
  2. **관심 분야**(chips, 다중선택) — 옵션: 영화, 드라마/예능, 음악, 게임, 스포츠, 시사/뉴스, 기술/IT 등. (Phase 6 트리거 큐레이션의 핵심 입력)
  3. 살았던 지역(textlist), 다닌 학교(textlist)
  4. (선택) 좋아한 영화/게임/음악 제목(tags) — **트리거에 매우 강력한 단서**라 가볍게 권유.
  5. (선택) 형제자매, 부모님, 친한 친구(별명 권장), 취미.

**완료 기준**: 질문 설정만 고치면 온보딩 흐름이 바뀐다(하드코딩 아님).

---

## 4.3 — 응답 저장 (LifeProfile)

**목적**: 답변을 DB에 저장.

**작업**
- 서버 액션으로 단계별(또는 완료 시 일괄) 저장. `birthYear`는 `User`, 나머지는 `LifeProfile`.
- 빈 응답/건너뛴 항목은 저장하지 않음(부분 저장 허용).

**완료 기준**: 온보딩을 마치면 `LifeProfile`과 `User.birthYear`가 채워진다(건너뛴 건 비어 있음).

---

## 4.4 — 별명/이니셜 안내 (타인 정보)

**목적**: 타인 정보 최소 수집.

**작업**
- 친구·가족 관련 질문에 보조 문구: "실명 대신 별명이나 이니셜로 적어도 좋아요."
- 입력값은 그대로 저장(강제 변환 안 함), 안내만 제공.

**완료 기준**: 타인 관련 질문에 별명/이니셜 안내가 보인다.

---

## 4.5 — 온보딩 완료 처리 + 진입 흐름

**목적**: 완료/건너뜀을 기록해 매번 강제하지 않는다.

**작업**
- `User`에 `onboardingCompletedAt DateTime?` 추가(마이그레이션 + `prisma generate`).
- 완료 또는 "전체 건너뛰기" 시 시각 기록.
- 진입 분기는 **미들웨어가 아니라 서버 레이어(레이아웃/페이지)**에서 처리(JWT 부담 회피):
  - 동의 완료 + `onboardingCompletedAt == null` → `/onboarding`
  - 그 외 → `/timeline`

**완료 기준**: 신규 사용자는 첫 진입 시 온보딩으로 가고, 한 번 끝내거나 건너뛰면 이후엔 `/timeline`으로 바로 간다.

---

## ✅ Phase 4 체크포인트

- [ ] `/onboarding` 대화형, 한 질문씩 + 진행률 + 건너뛰기
- [ ] 질문이 config로 분리되어 있음
- [ ] 출생연도→User, 나머지→LifeProfile 저장(부분 저장 허용)
- [ ] 타인 정보 질문에 별명/이니셜 안내
- [ ] 민감정보(건강·정치·종교) 질문 없음
- [ ] 완료/건너뜀 기록 → 재진입 시 강제 안 함
- [ ] 시니어 접근성 유지
- [ ] 의미 단위 커밋 완료

---

## 커밋 가이드 (예시)
- `feat: onboarding conversational ui with progress`
- `feat: question config for onboarding`
- `feat: save responses to life profile`
- `feat: nickname/initial hint for third-party info`
- `feat: onboarding completion flag and entry routing`

## 다음 단계
Phase 4 완료 후 `phase5.md`(타임라인 개인화 — 출생연도 기반 시대 범위)로 진행한다.
