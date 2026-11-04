# 밤 우주 단일 테마 — 설계

- 상태: **설계만(코드 변경 0)**. 2026-11-05 작성. 구현은 이 문서의 결정 질문(§6)이 정해진 뒤.
- 작성: Claude Code (성민 요청). 결정 로그: 제안 리뷰 채팅 / 결정 성민.
- 기준 값: My Life 우주 개편 U1 의 밤 우주(`app/globals.css` `[data-space="night"]`, `docs/phase/ui-space.md` §7.1).
- 숫자는 2026-11-05 저장소 grep·계산이다(측정 스크립트는 job 임시 폴더, 커밋 안 함 — 부록 B). 시안 스크린샷은 실제 화면에 CSS·DOM 을 실행 중에 넣어 찍었다(코드 수정 0) — `db/test-logs/screenshots-2026-11-05-night/`(커밋 안 함).
- 참조: `docs/decisions/design-tokens-light-only.md`(이 결정으로 대체), `docs/design-system.md`(구현 때 수정), `docs/phase/ui-space.md`(Q102·Q103·Q142).

## 결정 로그(2026-11-05 — 제안: 리뷰 채팅 / 결정: 성민)

| # | 결정 |
|---|---|
| 테마 | **밤 우주가 Lifebook 단일 테마.** 2026-06-12 "밝은 화면만"(라이트 온리) 결정을 대체한다 |
| 밝은 우주 | **기본에서 제외.** 나중에 "밝게 보기" 설정을 둘지는 보류 |
| Q142 | **무효** — 앱 공통 요소(머리 줄·사이드 패널·비서 버튼·공지 띠)도 밤 |
| 이전 지시 B | **취소** — 밝은 바탕 기준 포커스·입력칸 대비 작업은 하지 않고 이 설계로 대체 |
| 문서 | `docs/decisions/design-tokens-light-only.md` 를 대체 결정 문서로 갱신(같은 커밋). `docs/design-system.md` 는 설계 확정 뒤 구현 때 수정 |

## 0. 요약

- **토큰은 이미 준비돼 있다.** U1 밤 값으로 글자 4.5:1·테두리·포커스·입력칸 3:1 을 전부 넘는다(§1.2). 새로 필요한 토큰은 4가지다: 주요 버튼 글자 `on-action`, 모달 덮개 `scrim`, 연대 틴트 밤 값, 긴 글 방식에 따른 글자(a) 또는 편지지(b) 묶음.
- **앱의 색 사용은 대부분 토큰이다.** 토큰 클래스 3,167곳, `var(--color-…)` 79곳은 값만 바꾸면 따라온다. 직접 적은 색은 194개 화면 파일 중 **115개 파일**에 있다: Tailwind 기본 팔레트 776 · white/black 146 · hex 49(§2).
- **그중 V2·옛 화면이 절반을 넘는다**(46파일 · 516곳). V3 핵심·공통 요소·가입·결제는 54파일 · 약 380곳이다(§2.3).
- **토큰을 그대로 써도 뜻이 뒤집히는 곳이 있다.** `bg-ink/40` 덮개(밤이면 밝은 덮개), 주요 버튼 `text-white`(밤 action 필 위 흰 글자), Tailwind 포커스 고리 바깥 여백 기본값 흰색(`ring-offset-2` 204곳), 그림자 30곳(밤 바탕에서 안 보임)(§1.4).
- **긴 글은 두 안을 390 으로 찍었다** — (a) 아이보리 글자 + 줄 간격 1.9, (b) 밤하늘 위 밝은 편지지 카드. 추천은 **(b), 단 어르신 실기기 확인 뒤 확정**(§3, Q144).
- **단계:** N1 토큰(허용 목록 계정만 밤 — 전환 스위치) → N2 공통 요소 → N3 화면별(V3 → 가입·계정 → 결제·포스터 → 랜딩·공유 → V2 → 관리자) → N4 전원 밤 + 밝은 값 삭제. **V2 화면을 바꾸기 전에는 전원에게 켜지 않는다** — 실고객 2명이 V2 화면을 쓴다(§5, Q145).

## 1. 밤 토큰 — 값과 대비

### 1.1 토큰 표

밝은 값 = 지금 `@theme`. 밤 값 = U1 `[data-space="night"]` 값 + 새로 정한 값(**새** 표시).

| 묶음 | 토큰 | 쓰는 곳 | 지금(밝음) | 밤 |
|---|---|---|---|---|
| 바탕 단계 | `canvas` | 페이지 바탕(가장 어두움) | `#faf7f0` | `#221d52`(검정 금지 — 가장 어두운 값) |
| | `surface` | 카드·패널·시트·입력칸 | `#fffdf8` | `#2c2664` |
| | `banner` | 안내·강조 상자, 선택 칩, 띠 | `#fff8e8` | `#3a3380` |
| | `ph` | 이미지 자리 | `#e9e1d0` | `#3a3380` |
| | `scrim` **새** | 모달 덮개(지금 `bg-ink/40`) | (ink 40%) | `rgb(8 6 28 / 0.6)` |
| 글자 | `ink` | 본문 | `#2a2520` | `#f1eeff` |
| | `ink-soft` | 보조 글자·입력칸 안내 | `#5c534a` | `#d3ccf5` |
| | `ink-faint` | 가장 옅은 글자 | `#6e655b` | `#bdb5ec` |
| 테두리·포커스 | `line` | 칸·카드·구분선·**입력칸 테두리**(지금 `border-2 border-line`) | `#e5decf` | `#8f87cf` |
| | `brand` | 보조 버튼 테두리·**포커스 고리**·고른 입력칸 | `#c8923d` | `#ffb884` |
| 행동 | `action` | 주요 버튼 필·버튼 글자·링크 | `#8a5f1a` | `#ffc9a3` |
| | `action-hover` | 주요 버튼 누름 | `#6f4c15` | `#ffb884` |
| | `on-action` **새** | 주요 버튼 글자(지금 `text-white`) | `#ffffff` | `#2a1400` |
| 상태 | `danger` | 위험 글자·테두리 | `#b3433b` | `#ff9f96` |
| | `success` | 성공 | `#4d7c4d` | `#93d7a2` |
| | `success-deep` | 뱃지 글자 | `#3e6b3e` | `#a8e2b4` **새 값** |
| | `sage` | 그때의 나 | `#6b8c5a` | `#a9cf97` |
| My Life | `person`·`place`·`glow`·`planet-edge`·`period-edge`·`person-wash`·`place-wash` | 행성·위성·빛 고리 | U1 밝은 값 | U1 밤 값 그대로 |
| 연대 틴트 | `decade-*`(9) | 워시 전용 | `#deceb0` 등 | 스트립 18% / canvas — `#383053`(1940)·`#393155`·`#2d315b`·`#352e4b`·`#352953`·`#322958`·`#2e2c60`·`#2c2d52`·`#2f295a`(2020) **새** |
| | `decade-strip-*`(9) | 4px 스트립 | `#9c8456` 등 | 지금 값 75% + 흰 25% — `#b5a380`(1940)·`#b8a989`·`#86a7a4`·`#aa9b5f`·`#aa8880`·`#9b8998`·`#8995b8`·`#839a7d`·`#8f88a0`(2020) **새**(canvas 대비 최저 4.54) |
| 긴 글 (a) | `ink-reading`·`ink-reading-soft` **새** | 긴 글 본문·보조 | — | `#f3ecdc`·`#e2d9c4`(아이보리) |
| 긴 글 (b) | `paper`·`paper-ink`·`paper-ink-soft`·`paper-line`·`paper-action` **새** | 편지지 카드 안 | — | `#fbf6ea`·`#2a2520`·`#5c534a`·`#8c7d60`·`#8a5f1a` |

- 밝은 값은 코드에서 지운다(밝게 보기 보류 — Q148). 이 표와 git 기록에 남는다.
- 이름 규칙(라이트 온리 결정 2 — 크기 키워드 금지)은 그대로. `on-action`·`scrim`·`paper*`·`ink-reading*` 모두 크기 낱말과 안 겹친다.

### 1.2 대비 표(WCAG 상대 휘도 — 글자 4.5:1, 테두리·포커스·입력칸 3:1)

| 묶음 | 토큰 | 값 | 바탕별 대비 | 기준 | 판정 |
|---|---|---|---|---|---|
| 글자 | 본문 ink | `#f1eeff` | canvas 13.48 · surface 11.74 · banner 9.37 | 4.5 | 통과 |
| 글자 | 보조 ink-soft | `#d3ccf5` | canvas 10.05 · surface 8.75 · banner 6.98 | 4.5 | 통과 |
| 글자 | 희미 ink-faint | `#bdb5ec` | canvas 8.04 · surface 7.00 · banner 5.59 | 4.5 | 통과 |
| 글자 | 버튼·링크 글자 action | `#ffc9a3` | canvas 10.35 · surface 9.01 · banner 7.19 | 4.5 | 통과 |
| 글자 | 주요 버튼 글자 on-action(새) | `#2a1400` | action 11.79 · action-hover 10.38 | 4.5 | 통과 |
| 글자 | 위험 danger | `#ff9f96` | canvas 7.80 · surface 6.79 · banner 5.42 | 4.5 | 통과 |
| 글자 | 성공 success | `#93d7a2` | canvas 9.14 · surface 7.96 · banner 6.35 | 4.5 | 통과 |
| 글자 | 뱃지 success-deep | `#a8e2b4` | canvas 10.40 · surface 9.06 · banner 7.23 | 4.5 | 통과 |
| 글자 | 사람 person | `#8fe0b0` | surface 8.58 · person-wash 6.81 | 4.5 | 통과 |
| 글자 | 장소 place | `#9ccbf5` | surface 7.83 · place-wash 6.60 | 4.5 | 통과 |
| 글자 | 입력칸 안내(placeholder) ink-soft | `#d3ccf5` | surface 8.75 | 4.5 | 통과 |
| 긴 글 (a) | 아이보리 본문 | `#f3ecdc` | canvas 13.07 · surface 11.38 · banner 9.08 | 4.5 | 통과 |
| 긴 글 (a) | 아이보리 보조 | `#e2d9c4` | canvas 10.95 · surface 9.54 · banner 7.61 | 4.5 | 통과 |
| 긴 글 (b) | 편지지 본문 paper-ink | `#2a2520` | paper 14.07 | 4.5 | 통과 |
| 긴 글 (b) | 편지지 보조 paper-ink-soft | `#5c534a` | paper 6.98 | 4.5 | 통과 |
| 긴 글 (b) | 편지지 안 링크·버튼 글자 | `#8a5f1a` | paper 5.22 | 4.5 | 통과 |
| 테두리 | 칸·카드·구분선 line | `#8f87cf` | canvas 4.79 · surface 4.17 · banner 3.33 | 3 | 통과 |
| 입력칸 | 입력칸 테두리 line(지금 border-2 border-line) | `#8f87cf` | surface 4.17 · canvas 4.79 | 3 | 통과 |
| 입력칸 | 입력칸 고른 상태 brand | `#ffb884` | surface 7.93 | 3 | 통과 |
| 포커스 | 포커스 고리 brand(ring-4, 바깥 여백 = canvas) | `#ffb884` | canvas 9.11 · surface 7.93 · banner 6.33 | 3 | 통과 |
| 테두리 | 보조 버튼 테두리 brand | `#ffb884` | canvas 9.11 · surface 7.93 · banner 6.33 | 3 | 통과 |
| 테두리 | 위험 테두리 danger | `#ff9f96` | canvas 7.80 · surface 6.79 · banner 5.42 | 3 | 통과 |
| 테두리 | 지도 행성 테두리 planet-edge | `#ffd2b0` | canvas 11.06 · 성운 보라 6.07 · 성운 파랑 6.53 | 3 | 통과 |
| 테두리 | 빛 고리 glow | `#ffd27a` | canvas 10.80 · 성운 보라 5.93 | 3 | 통과 |
| 긴 글 (b) | 편지지 안 칸 테두리 paper-line | `#8c7d60` | paper 3.73 | 3 | 통과 |
| 긴 글 (b) | 편지지 가장자리 / 밤 바탕 | `#fbf6ea` | canvas 14.26 | 3 | 통과 |
| 연대 틴트 | 워시(스트립 18% / canvas) 위 ink · ink-soft | — | 9개 중 최저 ink 10.56 · ink-soft 7.87 | 4.5 | 통과 |
| 연대 틴트 | 스트립 지금 값 / canvas | — | 9개 중 최저 2.63 → 새 값(75% + 흰 25%) 최저 4.54 | (장식 — 참고) | 새 값으로 |

- **banner 위 line 은 3.33** 으로 가장 낮다(통과). banner 안에 입력칸을 두는 곳은 입력칸 바탕을 surface 로 둔다(지금 규칙과 같음).
- 밝은 테마에서 미달이던 `brand`(2.57~2.71)·`line`(1.25)은 밤에서 6.33~9.11·3.33~4.79 로 통과한다. 이전 지시 B(밝은 바탕 포커스·입력칸)는 이 결정으로 필요 없어졌다.

### 1.3 층 구분 — 그림자 대신 바탕 단계·테두리

- 밤 바탕에서 그림자(`shadow-*` 30곳 · 19파일)는 거의 보이지 않는다. 층(시트·모달·떠 있는 버튼)은 **바탕 단계**(canvas < surface < banner)와 **테두리**(line·brand)로 나눈다(Q150).
- 지금 떠 있는 것의 테두리: 패널·시트 `border-2 border-line`(통과), 비서 버튼 `border-brand`(통과). 그림자만으로 떠 보이던 곳(CoachMarks `shadow-2xl`·사이드 패널 드로어·주소 검색 모달 등)은 N2 에서 테두리를 더한다.

### 1.4 토큰을 그대로 써도 뜻이 뒤집히는 곳

| 곳 | 지금 | 밤에서 | 고칠 방법(N1·N2) |
|---|---|---|---|
| 모달 덮개 `bg-ink/40`·`backdrop:bg-ink/40` | 6곳 · 3파일 | ink 가 밝아져 **밝은 덮개** | `scrim` 토큰(U1 은 `/my-life` 안에서만 덮어씀) |
| 주요 버튼 `bg-action text-white`(`components/ui/Button.tsx`) | 모든 primary | 밝은 필 위 흰 글자(1.3:1) | `text-on-action`(U1 은 CSS 덮어쓰기로 임시 처리) |
| 포커스 고리 바깥 여백 `ring-offset-2` | 204곳 · 77파일 | Tailwind 기본 여백 색이 **흰색**(`@property --tw-ring-offset-color … initial-value:#fff`, 상속 안 함) → 밤 바탕에 흰 줄 | 전역 규칙으로 여백 색 = canvas(유틸리티 `ring-offset-*` 가 있으면 그쪽이 이김) |
| 그림자 | 30곳 · 19파일 | 안 보임 | §1.3 |
| 체크박스·라디오 `accent-*` | 8곳 · 6파일 | 기본 팔레트 색 | `accent-action` 으로 |
| 브라우저 기본 입력칸·스크롤바 | `color-scheme: light` 고정 | 밝은 기본 모양 | `color-scheme: dark` |
| 카카오 로그인 포커스 고리 `ring-[#191600]/30` · 네이버 `ring-[#03C75A]/40` | 2곳 | 어두운 바탕에서 안 보임 | 브랜드 버튼 고리만 `brand` 로(버튼 색은 브랜드 지정 그대로) |
| 그 밖 | `bg-*-50` 처럼 **밝은 기본 팔레트 바탕**을 쓰는 파일 65개 | 그 안의 토큰 글자(ink 등)가 밝아져 **밝은 바탕 위 밝은 글자** — 같은 className 안에서 확인된 곳 5곳, 부모·자식으로 나뉜 곳은 grep 으로 못 셈 | 화면별 단계에서 그 파일을 통째로 토큰으로 |

## 2. 바뀌는 범위 — CSS 변수로 따라오는 것 vs 색을 직접 적은 것

### 2.1 숫자(2026-11-05 — `app`·`components`·`lib` 의 `.ts`·`.tsx`, 생성 파일 제외)

| 종류 | 곳 | 파일 | 밤으로 |
|---|---|---|---|
| 토큰 클래스(`bg-canvas`·`text-ink`·`border-line`…) | 3,167 | — | 값만 바꾸면 따라옴 |
| `var(--color-…)` 직접 | 79 | — | 따라옴 |
| Tailwind 기본 팔레트(`bg-amber-50`·`text-zinc-700`…) | 776 | 87 | **직접 고침** |
| `white`·`black`(`bg-white`·`text-white`…) | 146 | 73 | **직접 고침**(브랜드 버튼 흰 글자는 그대로) |
| 임의값 색 클래스(`bg-[#FEE500]`…) | 15 | 3 | 브랜드 지정색 — 그대로 |
| 코드 안 hex 문자열 | 49 | 15 | 포스터 그림·인쇄물은 그대로, 나머지 고침(§2.3) |
| **직접 색이 하나라도 있는 파일** | — | **115 / 194** | |

### 2.2 직접 색이 0 인 화면(값만 바꾸면 끝)

My Life 지도·목록·패널 대부분(`app/my-life` — EditUI 1곳 제외), 자유 대화 `/chat-v3`(2곳 제외), 랜딩 `/`, 처리방침·약관·환불, 개정 공지 띠, 이야기 상세·글 고치기·이전 판, 오늘의 인터뷰 등. 이 화면들도 §1.4 의 뒤집히는 곳(덮개·주요 버튼·포커스 여백)은 N1 에서 같이 고쳐야 한다.

### 2.3 묶음별(단계 §5 와 같은 묶음 — 괄호 = 파일 안 직접 색 수)

| 묶음 | 파일 | 기본 팔레트 | white·black | hex | 파일(합계) |
|---|---|---|---|---|---|
| T2 공통 요소 | 19 | 121 | 19 | 9 | `timemachine/SidePanel.tsx`(42) · `components/PlaceSearchInput.tsx`(25) · `timemachine/AttendanceCard.tsx`(17) · `components/FreeRecorder.tsx`(14) · `components/VoiceTextarea.tsx`(10) · `components/PlacesEditor.tsx`(9) · `components/CoachMarks.tsx`(5) · `components/ScreenTour.tsx`(4) · `components/AiModelChips.tsx`(4) · `components/AddressSearch.tsx`(4) · `components/maps/NaverMap.tsx`(3) · `global-error.tsx`(3) · `components/maps/GoogleMap.tsx`(2) · `manifest.ts`(2) · `components/PaymentMethodChoice.tsx`(1) · `components/ui/Button.tsx`(1) · `life-timeline/AssistantModal.tsx`(1 — 비서 버튼) · `error.tsx`(1) · `layout.tsx`(1) |
| N3-1 V3 핵심(My Life·대화·인물) | 9 | 67 | 12 | 0 | `people/PersonForm.tsx`(30) · `people/page.tsx`(10) · `people/[personId]/link/LinkToggleRow.tsx`(9) · `people/[personId]/DeletePersonButton.tsx`(9) · `people/[personId]/page.tsx`(8) · `people/[personId]/link/page.tsx`(6) · `people/[personId]/UnlinkButton.tsx`(4) · `chat-v3/ChatV3Client.tsx`(2) · `my-life/EditUI.tsx`(1) |
| N3-2 가입·계정·법적·도움말 | 19 | 50 | 27 | 18 | `onboarding-chat/widgets.tsx`(24) · `login/page.tsx`(12) · `login/InAppBrowserGuard.tsx`(9) · `account/delete/page.tsx`(9) · `join/JoinForm.tsx`(8) · `onboarding-chat/OnboardingChatClient.tsx`(7) · `account/tokens/page.tsx`(7) · `account/profile/ProfileEditForm.tsx`(3) · `invite/[token]/page.tsx`(2) · `consent/ConsentChecklist.tsx`(2) · `account/settings/page.tsx`(2) · `account/delete/WithdrawForm.tsx`(2) · `invite/[token]/ConsentForm.tsx`(2) · `account/orders/page.tsx`(1) · `signup/SignupForm.tsx`(1) · `onboarding/OnboardingForm.tsx`(1) · `login/LoginCredentialsForm.tsx`(1) · `help/page.tsx`(1) · `consent/ConsentForm.tsx`(1) |
| N3-3 결제·상점·포스터 화면 | 13 | 51 | 21 | 3 | `poster/custom/CustomBackgroundClient.tsx`(18) · `poster/select/PosterSelectClient.tsx`(18) · `poster/order/PosterOrderForm.tsx`(8) · `poster/view/page.tsx`(7) · `poster/page.tsx`(7) · `shop/[productId]/order/OrderForm.tsx`(7) · `billing/page.tsx`(3) · `billing/TopupButton.tsx`(2) · `shop/order/success/page.tsx`(1) · `shop/order/fail/page.tsx`(1) · `billing/success/page.tsx`(1) · `poster/TemplateSubmitButton.tsx`(1) · `billing/fail/page.tsx`(1) |
| 포스터 그림 자체 — **바꾸지 않음**(인쇄물 색) | 6 | 9 | 7 | 31 | `poster/PosterCompose.tsx`(25 — 그림 둘레 UI 클래스는 N3-3 에서 따로 확인) · `poster/print-export.ts`(7) · `lib/poster/templates/zelkova.ts`(4) · `lib/poster/compose-layout.ts`(4) · `poster/PosterInteractive.tsx`(4) · `lib/poster/background-prompt.ts`(3) |
| N3-4 랜딩·공유 미리보기 | 1 | 0 | 0 | 4 | `opengraph-image.tsx`(4) — 랜딩 `page.tsx` 는 직접 색 0. 그 밖 `public/offline.html`(hex 4) |
| N3-5 V2·옛 화면 | 46 | 460 | 55 | 1 | `life-timeline/TimelineView.tsx`(55) · `life-timeline/manage/DraftReview.tsx`(34) · `life-timeline/EventForm.tsx`(32) · `photos/bulk/BulkUploadForm.tsx`(31) · `life-timeline/PeopleConnectModal.tsx`(26) · `life-timeline/free-record/FreeRecordClient.tsx`(25) · `life-timeline/[eventId]/edit/EventPhotos.tsx`(21) · `era/EraView.tsx`(18) · `life-record/[category]/CategoryForm.tsx`(17) · `timemachine/[year]/[month]/AssistantPanel.tsx`(17) · `photos/PhotosUploadForm.tsx`(16) · `timemachine/ProgressCard.tsx`(14) · `life-timeline/manage/DraftLocationCard.tsx`(14) · `timemachine/FamilyNewsCard.tsx`(14) · `timemachine/[year]/[month]/MonthV2.tsx`(12) · 그 밖 31파일(각 1~9) — 전체는 부록 A |
| N3-6 관리자 | 2 | 18 | 5 | 0 | `admin/orders/[orderId]/page.tsx`(19) · `admin/orders/page.tsx`(4) |

- 말동무(V2 — `life-timeline/companion/CompanionClient.tsx`(8)·`StoryTimelinePanel.tsx`(2))는 N3-5 에 들어 있다.

## 3. 긴 글 화면 — (a) 아이보리 글자 + 줄 간격 vs (b) 밤하늘 위 밝은 편지지

대상: 이야기 상세 `/my-life/story/[id]`·글 고치기 `…/edit`·이전 판 `…/history`·인물 글 `/my-life/person/[id]/edit`·처리방침·약관·환불·도움말. 지금 모두 토큰만 쓰는 화면이라(§2.2) 어느 안이든 화면 코드 변경은 작다.

| | (a) 아이보리 글자 + 줄 간격 확대 | (b) 밤하늘 위 밝은 편지지 카드 |
|---|---|---|
| 모양 | 밤 바탕 그대로, 본문 글자만 아이보리 `#f3ecdc`(차가운 ink 대신 따뜻한 흰색), 줄 간격 1.625 → 1.9 | 머리 줄·돌아가기·버튼은 밤, **제목·본문·함께 나온 분**만 밝은 종이 카드(`#fbf6ea`, 모서리 14px, 테두리 1px) 안. 카드 안 줄 간격 1.8 |
| 390 시안 | `night-a-story-390x844.png`(+ 처리방침 `night-a-privacy-390x844.png`) | `night-b-story-390x844.png`(+ 처리방침 `night-b-privacy-390x844.png`) |
| 대비 | 본문 13.07 · 보조 10.95(§1.2) | 본문 14.07 · 보조 6.98 · 칸 테두리 3.73 · 카드 가장자리 14.26 |
| 한 화면에 보이는 양(390×844, 이야기 3문단) | 본문 3문단 + "함께 나온 분"·"이야기에 나온 곳"까지 첫 화면 안 | 카드 안쪽 여백만큼 줄이 짧아져 본문 3문단 + "함께 나온 분"까지("이야기에 나온 곳"은 첫 화면 아래) |
| 좋은 점 | 테마가 하나로 끝남 — 새 토큰 2개. "단일 테마" 결정의 뜻에 가장 가깝다 | 긴 글을 밝은 바탕 어두운 글자로 읽는다. "책·편지·일기장" 은유가 Lifebook 과 맞는다. 카드 안은 지금 밝은 토큰 값을 거의 그대로 쓴다 |
| 걸리는 점 | 긴 글을 밝은 글자로 오래 읽는다. 밝은 글자가 번져 보이는 눈(난시 등)에서 불리할 수 있다는 지적이 있다 — **이 문서에서 연구로 확인하지 않음** | 밤 화면 안에 밝은 판이 하나 생긴다 — 어두운 방에서 눈부심. 카드 안 입력칸·버튼(글 고치기)은 편지지 토큰 묶음(`paper*` 5개)이 따로 필요 — 라이트 온리 결정이 경계한 "두 벌" 의 작은 판 |
| 고칠 곳 | 긴 글 화면 8개의 본문 `p`·`li` 줄 간격과 글자색(공용 본문 부품 `BodyView` + 법적 화면 `P` 상수) | 긴 글 화면 8개에 카드 감싸기(공용 부품 1개) + `paper*` 토큰. 법적 화면은 `main` 안 본문을 카드로 |

- **추천: (b)**, 단 **어르신 실기기(밤 실내 조명)에서 눈부심을 본 뒤 확정**(Q144). 근거: 이 서비스의 긴 글은 "다시 읽는 내 이야기"와 "꼼꼼히 읽어야 하는 약관"이라 읽기 쉬움이 우선이고, 편지지는 그 은유를 화면에 그대로 옮긴다. 편지지 묶음은 카드 안에만 있는 부품 토큰이라 "테마 두 벌"(화면 전체를 바꾸는 모드)은 아니다.
- (b) 로 정해도 카드 바깥(머리 줄·버튼·사이드 패널)은 밤이다. 카드 색은 흰색이 아니라 `#fbf6ea`(지금 canvas 와 같은 계열)로 눈부심을 줄였다. 눈부심이 문제면 카드를 한 단계 어둡게(예: `#efe7d6`) 낮추고 대비를 다시 잰다.

## 4. 그 밖에 영향받는 것

| 곳 | 지금 | 밤 단일 테마에서 | 할 일 |
|---|---|---|---|
| 랜딩 `/`(비로그인) | 직접 색 0, 샘플 포스터 그림 4장(`public/sample-poster*.webp`) | 바탕·글자는 따라옴. 포스터는 밝은 종이 인쇄물 그대로 — 밤 바탕 위 액자처럼 보임 | 첫인상 390 실측(히어로 포스터 대비·카피 한 번 보기). `public/landing/*.png`(옛 밝은 화면 캡처)는 상점 상품 그림 등에서 쓰는지 N3-4 에서 확인 |
| 공유 미리보기 `app/opengraph-image.tsx`(hex 4) | 1200×630 밝은 그림 | 카톡 미리보기와 앱 첫 화면 색이 달라짐 | 밤으로(Q146 추천) — 글자 대비 4.5 다시 잼 |
| PWA | `manifest.ts` `background_color`·`theme_color` `#faf7f0` · `layout.tsx` `viewport.themeColor` · `public/offline.html`(hex 4) · 아이콘 | 안드로이드 상태 줄·시작 화면이 밝음 | `#221d52` 로 · offline.html 도 밤 · 아이콘 마크가 밤 바탕 시작 화면에서 보이는지 확인 |
| 결제 | 주문·성공·실패 화면은 우리 것, 카드 입력은 토스 결제창(`requestPayment` — 토스 화면으로 이동) | 우리 화면은 밤, **토스 결제창만 밝음**(바꿀 수 없음) | 기록만. 테스트 모드 안내 배너·결제 수단 고르기(`PaymentMethodChoice`) 색 확인 |
| 로그인·이메일 가입 `/login`(hex 11)·`/join`(hex 8)·`/signup` | 카카오 `#FEE500`·네이버 `#03C75A`·구글 버튼 | 버튼 색은 각 사 브랜드 지정색 그대로(밤 바탕에서도 잘 보임) | 브랜드 버튼 포커스 고리만 `brand` 로(§1.4) · 인앱 브라우저 안내(`InAppBrowserGuard` amber 9)·이메일 입력칸은 토큰으로 |
| 말동무(V2 `/life-timeline/companion`) | 채팅 말풍선 white·black, 캐릭터 애니메이션 `public/characters/*/*.json`(밝은 바탕 기준으로 그린 그림) | 말풍선은 토큰으로 바꾸면 되나, **캐릭터 그림의 가장자리 색이 밤 바탕에서 어떻게 보이는지 모름** | N3-5 에서 캐릭터 3종 × 4동작을 밤 바탕에서 실측 |
| 포스터 미리보기·편집·주문 | 포스터 그림(SVG·캔버스·인쇄 PNG)은 인쇄물 색(hex 31) | 그림은 그대로(인쇄 결과와 같아야 함). 둘레 UI(템플릿 고르기·편집 도구줄)만 밤 | Q151 — 그림 둘레에 얇은 테두리로 종이와 화면 경계 |
| 지도 타일(네이버·구글 SDK — 장소 검색·장소 패널) | 밝은 지도 | 밤 화면 안 밝은 지도 | 그대로(Q147 추천 — SDK 다크 스타일은 따로 작업, 수요 보고) |
| 사진 | — | 그대로 | — |
| 코치마크(둘러보기 — `CoachMarks` 그림자 구멍) | 어두운 덮개로 대상만 밝게 | 밤 바탕은 이미 어두워 덮개 효과가 약함 | 대상 테두리(brand 4px)로 강조 — N2 실측 |
| 개정 공지 띠·비서 버튼·[내 정보] | 띠는 토큰만, [내 정보]는 `SidePanel` 의 amber 기본 팔레트 | 시안에서 [내 정보] 글자가 어두운 바탕 위 어두운 글자로 안 보임(`night-a-story` 스크린샷 오른쪽 위) | N2 첫 번째 |
| 관리자 `/admin` | 기본 팔레트 23 | — | 마지막(N3-6), 운영자만 봄 |

- 이메일 발송·PDF 는 없다(확인). 인쇄물은 포스터뿐이다.

## 5. 단계 분할과 390 실측 기준

```
N1 토큰 ─▶ N2 공통 요소 ─▶ N3 화면별(-1 V3 → -2 가입·계정·법적 → -3 결제·포스터 → -4 랜딩·공유·PWA → -5 V2 → -6 관리자) ─▶ N4 전원 밤
     (N1~N3 는 허용 목록 계정만 밤 — html 의 테마 표시로 전환)
```

| 단계 | 하는 것 | 완료 기준(390×844·390×667 실측) |
|---|---|---|
| **N1 토큰** | `globals.css`: 밤 값 블록을 `html[data-theme="night"]` 로(U1 의 `[data-space]` 를 넓힌 것), 새 토큰 `on-action`·`scrim`·연대 밤 값·긴 글 묶음(Q144 결과), 포커스 바깥 여백 기본 = canvas, `color-scheme: dark`. 테마 표시는 **허용 목록 계정만**(서버가 html 에 표시 — 운영 사용자 영향 0). `Button` primary `text-white` → `text-on-action`. U1 지도 안 토글은 이 단계에서 뺀다(Q149) | 토큰 대비 회귀(지금 `test-my-life` ⑬ 대비 검사를 전역 토큰 검사로 옮겨 넓힘 — §1.2 표 전부) · 허용 목록 아닌 계정 화면 변화 0(스크린샷 비교) · 빌드 · 21종 |
| **N2 공통 요소** | 머리 줄·[내 정보]·사이드 패널·공지 띠·비서 버튼·모달 덮개·입력칸·코치마크·장소 검색·음성 입력·지도 둘레·오류 화면·출석 카드(T2 19파일) | 그 파일들 직접 색 0(회귀가 grep 으로 고정 — 예외 목록만 허용) · 390 스크린샷: 머리 줄 + 띠, 사이드 패널 열림, 모달 + 덮개, 입력칸 포커스(키보드 Tab), 비서 버튼 · 포커스 고리 바깥 흰 줄 0 |
| **N3-1 V3 핵심** | My Life(지도 바탕 하나로·토글 없음), `/chat-v3`, `/interview`, `/people`, 이야기 상세·글 고치기·이전 판·인물 글(긴 글 안 적용) | 화면마다: 직접 색 0 · 390 첫 화면·패널·시트 스크린샷 · 글자 18px 하한·누르는 곳 56 그대로 · 첫 화면 글자 수 변화 0(테마만) |
| **N3-2 가입·계정·법적** | `/login`·`/join`·`/signup`·`/consent`·`/account/*`·`/help`·처리방침·약관·환불·초대·온보딩 채팅 | 위와 같음 + 브랜드 버튼 3종 포커스 고리 보임 · 긴 글 안 적용(법적 화면) |
| **N3-3 결제·포스터** | `/billing`·`/shop`·`/poster/*` 둘레 UI(그림 제외) | 위와 같음 + 포스터 그림 픽셀 변화 0(같은 입력으로 인쇄 PNG 해시 비교) · 토스 결제창 왕복 1회(테스트 키) |
| **N3-4 랜딩·공유·PWA** | 랜딩·공유 미리보기 그림·manifest·viewport·offline.html | 비로그인 390 첫 화면 · 공유 그림 1200×630 대비 · 안드로이드 상태 줄 색 |
| **N3-5 V2·옛 화면** | life-timeline·timemachine·photos·era·rooms·life-record·memory·timeline·말동무(46파일 · 516곳) | 위와 같음 + 말동무 캐릭터 3종 밤 바탕 실측 · **실고객 V2 화면은 이 단계가 끝나기 전엔 밤으로 안 감** |
| **N3-6 관리자** | `/admin/orders` | 직접 색 0 |
| **N4 전원 밤** | 테마 표시를 전원에게 → 밝은 값·전환 스위치 삭제(밝게 보기 보류 — Q148) · `docs/design-system.md` 갱신 · 앱 전체 직접 색 grep 0(예외 목록만) | 전 화면 390 스크린샷 · 21종 · 빌드 · 운영 계정 첫 화면 확인 |

- **허용 목록 단계(N1~N3)를 두는 이유:** 토큰을 한 번에 뒤집으면 직접 색을 쓰는 115개 파일이 그날 섞인 색(밝은 판 위 밝은 글자 등 — §1.4 마지막 줄)이 된다. 실고객 2명은 V2 화면을 쓴다. 화면을 다 바꾼 뒤 전원에게 켠다(Q145).
- 회귀: 단계마다 "그 묶음 파일의 직접 색 0" 을 회귀에 더해 다시 생기지 않게 한다(예외 = 브랜드 지정색·인쇄물·포스터 그림 — 파일·줄 목록으로).

## 6. 결정 질문

| # | 질문 | 추천 | 근거 |
|---|---|---|---|
| Q144 ★ | 긴 글 화면 — (a) 아이보리 + 줄 간격 / (b) 밝은 편지지 카드 | **(b)**, 어르신 실기기(밤 실내 조명) 눈부심 확인 뒤 확정 | §3 — 읽기 쉬움이 우선인 화면, "책·편지" 은유. 편지지 토큰은 카드 안 부품 |
| Q145 ★ | 전환 방식 | 허용 목록 계정만 밤(N1~N3) → 화면 다 바꾼 뒤 전원(N4). V2 화면 변환 전엔 전원에게 켜지 않음 | §5 — 115파일 섞인 색 방지, 실고객 V2 |
| Q146 | 공유 미리보기 그림·PWA 색 | 밤으로 | 앱 첫 화면과 같은 첫인상 |
| Q147 | 지도 타일(네이버·구글) | 그대로(밝은 지도) | SDK 다크 스타일은 따로 작업 — 수요 보고 |
| Q148 | 밝은 값 보관 | 코드에서 지움(N4), 이 문서 §1.1 표와 git 기록에만 | "밝게 보기" 보류 — 쓰지 않는 두 번째 값은 화면마다 대비 부채(라이트 온리 결정의 학습 1) |
| Q149 | My Life 지도 안 테마 토글(U1, Q103) | N1 에서 삭제. 지도 바탕은 밤 우주 하나 | 단일 테마 |
| Q150 | 층 구분 | 그림자 대신 바탕 단계 + 테두리 | §1.3 — 밤 바탕에서 그림자 안 보임 |
| Q151 | 포스터 그림 | 인쇄물 색 그대로 + 둘레 얇은 테두리 | 화면과 인쇄 결과가 같아야 함 |
| Q152 | 연대 틴트 밤 값 | 워시 = 스트립 18% / canvas, 스트립 = 지금 값 75% + 흰 25% | §1.2 — 워시 위 글자 최저 7.87, 스트립 최저 4.54 |

## 부록 A — 직접 색이 있는 파일 전체(2026-11-05)

`곳 합계 기본팔레트 white·black hex 파일` 순(합계 내림차순).

```
55 51 4 0 app/life-timeline/TimelineView.tsx
42 38 4 0 app/timemachine/SidePanel.tsx
34 30 4 0 app/life-timeline/manage/DraftReview.tsx
32 31 1 0 app/life-timeline/EventForm.tsx
31 30 1 0 app/photos/bulk/BulkUploadForm.tsx
30 26 4 0 app/people/PersonForm.tsx
26 24 2 0 app/life-timeline/PeopleConnectModal.tsx
25 9 7 9 app/poster/PosterCompose.tsx
25 25 0 0 app/components/PlaceSearchInput.tsx
25 21 4 0 app/life-timeline/free-record/FreeRecordClient.tsx
24 13 11 0 app/onboarding-chat/widgets.tsx
21 20 1 0 app/life-timeline/[eventId]/edit/EventPhotos.tsx
19 14 5 0 app/admin/orders/[orderId]/page.tsx
18 17 1 0 app/era/EraView.tsx
18 14 4 0 app/poster/custom/CustomBackgroundClient.tsx
18 12 6 0 app/poster/select/PosterSelectClient.tsx
17 16 1 0 app/life-record/[category]/CategoryForm.tsx
17 15 2 0 app/timemachine/AttendanceCard.tsx
17 13 4 0 app/timemachine/[year]/[month]/AssistantPanel.tsx
16 15 1 0 app/photos/PhotosUploadForm.tsx
14 13 1 0 app/timemachine/ProgressCard.tsx
14 13 1 0 app/life-timeline/manage/DraftLocationCard.tsx
14 12 2 0 app/timemachine/FamilyNewsCard.tsx
14 12 2 0 app/components/FreeRecorder.tsx
12 11 1 0 app/timemachine/[year]/[month]/MonthV2.tsx
12 0 1 11 app/login/page.tsx
10 9 1 0 app/people/page.tsx
10 9 1 0 app/components/VoiceTextarea.tsx
9 9 0 0 app/timeline/page.tsx
9 9 0 0 app/login/InAppBrowserGuard.tsx
9 9 0 0 app/era/EraMemoryEditor.tsx
9 9 0 0 app/components/PlacesEditor.tsx
9 9 0 0 app/account/delete/page.tsx
9 8 1 0 app/timemachine/[year]/[month]/SongCard.tsx
9 8 1 0 app/photos/PhotosGrid.tsx
9 8 1 0 app/people/[personId]/link/LinkToggleRow.tsx
9 8 1 0 app/people/[personId]/DeletePersonButton.tsx
9 8 1 0 app/life-timeline/manage/page.tsx
9 8 1 0 app/life-timeline/manage/DeleteButton.tsx
8 8 0 0 app/photos/page.tsx
8 8 0 0 app/life-timeline/manage/DraftPhotoUpload.tsx
8 7 1 0 app/poster/order/PosterOrderForm.tsx
8 7 1 0 app/people/[personId]/page.tsx
8 6 2 0 app/memory/[eventId]/AnswerForm.tsx
8 6 2 0 app/life-timeline/page.tsx
8 3 5 0 app/life-timeline/companion/CompanionClient.tsx
8 0 1 7 app/join/JoinForm.tsx
7 7 0 0 app/timemachine/[year]/[month]/EventItem.tsx
7 7 0 0 app/account/tokens/page.tsx
7 6 1 0 app/shop/[productId]/order/OrderForm.tsx
7 6 1 0 app/rooms/[roomId]/StampBar.tsx
7 4 3 0 app/poster/view/page.tsx
7 4 2 1 app/life-record/page.tsx
7 1 3 3 app/poster/page.tsx
7 0 7 0 app/onboarding-chat/OnboardingChatClient.tsx
7 0 0 7 app/poster/print-export.ts
6 6 0 0 app/rooms/[roomId]/PersonalMemoryCard.tsx
6 5 1 0 app/timemachine/[year]/[month]/MonthForm.tsx
6 5 1 0 app/people/[personId]/link/page.tsx
5 5 0 0 app/life-record/[category]/page.tsx
5 3 2 0 app/components/CoachMarks.tsx
4 4 0 0 app/rooms/[roomId]/TimelineLegend.tsx
4 4 0 0 app/rooms/[roomId]/SharedMemoryCard.tsx
4 4 0 0 app/people/[personId]/UnlinkButton.tsx
4 4 0 0 app/memory/[eventId]/page.tsx
4 4 0 0 app/components/ScreenTour.tsx
4 4 0 0 app/admin/orders/page.tsx
4 3 1 0 app/rooms/[roomId]/SharedMemoryComposer.tsx
4 3 1 0 app/life-timeline/SwitchToV3Banner.tsx
4 2 2 0 app/components/AiModelChips.tsx
4 1 3 0 app/components/AddressSearch.tsx
4 0 0 4 lib/poster/templates/zelkova.ts
4 0 0 4 lib/poster/compose-layout.ts
4 0 0 4 app/poster/PosterInteractive.tsx
4 0 0 4 app/opengraph-image.tsx
3 3 0 0 app/life-timeline/add/page.tsx
3 3 0 0 app/life-timeline/add/NewEventForm.tsx
3 3 0 0 app/billing/page.tsx
3 2 1 0 app/timemachine/[year]/[month]/page.tsx
3 2 1 0 app/account/profile/ProfileEditForm.tsx
3 1 0 2 app/components/maps/NaverMap.tsx
3 0 0 3 lib/poster/background-prompt.ts
3 0 0 3 app/global-error.tsx
2 2 0 0 app/timemachine/[year]/[month]/MonthStory.tsx
2 2 0 0 app/invite/[token]/page.tsx
2 2 0 0 app/consent/ConsentChecklist.tsx
2 2 0 0 app/account/settings/page.tsx
2 2 0 0 app/account/delete/WithdrawForm.tsx
2 1 1 0 app/rooms/[roomId]/page.tsx
2 1 1 0 app/invite/[token]/ConsentForm.tsx
2 1 1 0 app/billing/TopupButton.tsx
2 1 0 1 app/components/maps/GoogleMap.tsx
2 0 2 0 app/life-timeline/companion/StoryTimelinePanel.tsx
2 0 2 0 app/chat-v3/ChatV3Client.tsx
2 0 0 2 app/manifest.ts
1 1 0 0 app/shop/order/success/page.tsx
1 1 0 0 app/shop/order/fail/page.tsx
1 1 0 0 app/components/PaymentMethodChoice.tsx
1 1 0 0 app/billing/success/page.tsx
1 1 0 0 app/account/orders/page.tsx
1 0 1 0 components/ui/Button.tsx
1 0 1 0 app/signup/SignupForm.tsx
1 0 1 0 app/rooms/[roomId]/shared/[memoryId]/edit/page.tsx
1 0 1 0 app/rooms/[roomId]/CommentThread.tsx
1 0 1 0 app/poster/TemplateSubmitButton.tsx
1 0 1 0 app/onboarding/OnboardingForm.tsx
1 0 1 0 app/my-life/EditUI.tsx
1 0 1 0 app/login/LoginCredentialsForm.tsx
1 0 1 0 app/life-timeline/AssistantModal.tsx
1 0 1 0 app/life-record/complete/page.tsx
1 0 1 0 app/help/page.tsx
1 0 1 0 app/error.tsx
1 0 1 0 app/consent/ConsentForm.tsx
1 0 1 0 app/billing/fail/page.tsx
1 0 0 1 app/layout.tsx
```

## 부록 B — 측정 방법(스크립트는 job 임시 폴더, 커밋 안 함)

- **grep:** `git ls-files` 의 `app`·`components`·`lib` `.ts`·`.tsx`(생성 파일 `lib/generated` 제외). 기본 팔레트 = `(text|bg|border|ring|from|to|via|fill|stroke|outline|divide|placeholder|accent|decoration|shadow|caret)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-숫자` · white/black = 같은 접두사 + `white|black` · hex = `#` 6자리·3자리 · 토큰 클래스 = 같은 접두사 + 토큰 이름.
- **대비:** WCAG 2.x 상대 휘도 `(L1 + 0.05)/(L2 + 0.05)`. 지도 성운은 바탕 위 반투명 색을 섞은 값(`#593d8f`·`#334486`).
- **시안:** 운영 빌드(`next start`) + 헤드리스 Chrome 390×844·DPR 3, 픽스처 계정(`fixture-v14-390@lifebook.invalid` — 측정 뒤 삭제)의 실제 이야기 상세·처리방침에 밤 토큰 CSS 와 (a)/(b) CSS 를 실행 중 넣음. (b) 는 이야기 상세의 제목·본문·함께 나온 분 요소를 카드 하나로 옮김(DOM 이동만). 오른쪽 위 [내 정보] 가 안 보이는 것은 실제 문제(사이드 패널 amber — §4)라 시안에서 고치지 않았다.
