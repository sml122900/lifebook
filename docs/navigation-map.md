# 라이프북 — 버튼·링크 이동 지도 (Navigation Map)

> 서비스의 모든 버튼/링크가 **어디로 이동하는지** 한눈에 보는 문서.
> 작성: 2026-06-26 · 코드 기준 자동 정리(읽기 전용 탐색).
> 표기: `→ /경로` 내부 이동, `↗ https://…` 외부 새 탭, `⚙ 액션` 서버액션(페이지 전환 없음/새로고침).

---

## 0. 전체 흐름 한눈에

```
(비로그인) /  ──[무료로 시작하기]──▶ /login ──[소셜/이메일 로그인]──▶ /enter (분기)
                                                  │
                              ┌───────────────────┼───────────────────────┐
                       신규(온보딩 X)        기존 이벤트 有              동의 미완료
                              ▼                    ▼                       ▼
                      /onboarding-chat      /life-timeline (메인)        /consent
                              └──────────────▶ /life-timeline ◀──────────┘

/life-timeline (메인) ─ 사이드패널/카드 버튼으로 모든 기능 진입
   ├─ 기록: /life-record · /life-timeline/add · /life-timeline/free-record · /life-timeline/companion
   ├─ 둘러보기: /era · /people · /photos · /rooms
   ├─ 포스터: /poster ▶ /poster/select ▶ /poster/view ▶ /poster/order ▶ (토스결제)
   └─ 계정/결제: /account/* · /billing · /shop
```

---

## 1. 전역 공통 UI (모든 화면 상·하·옆)

### 헤더 — `app/layout.tsx`
| 버튼/라벨 | 이동 | 조건 |
|---|---|---|
| Lifebook (로고) | → `/` | 항상 |
| 로그인 | → `/login` | 비로그인일 때만 |

### 사이드 패널 — `app/timemachine/SidePanel.tsx` (로그인 시에만 표시)
| 메뉴 | 이동 | 조건 |
|---|---|---|
| 토큰 화면 열기 | → `/account/tokens` | |
| 새 가족 소식 | → `/life-timeline` | 새 소식 있을 때만 |
| 내 인생 연혁 | → `/life-timeline` | |
| 이야기 나누기 | → `/life-timeline/companion` | |
| 그 시절 둘러보기 | → `/era` | |
| 인물록 | → `/people` | |
| 내 사진 | → `/photos` | |
| 가족 룸 | → `/rooms` | |
| 상품 구매 | → `/shop` | |
| 회원정보 | → `/account/profile` | |
| 설정 | → `/account/settings` | |
| 고객센터 | → `/help` | |
| 둘러보기 다시 보기 | ⚙ 코치마크 재시작 (다른 페이지면 → `/life-timeline?tour=main`) | |
| 오늘 토큰 받기 | ⚙ 출석 체크 | 오늘 안 받았을 때 |
| 로그아웃 | ⚙ 로그아웃 → `/` | |

### 플로팅 AI 비서 위젯 — `AssistantWidget` / `AssistantModal` (로그인 시, 우측 하단)
| 버튼 | 이동 |
|---|---|
| AI 비서와 대화 (둥근 버튼) | 모달 열기 |
| └ 내 타임라인에 추가 | → `/life-timeline/add` |
| └ 고객센터 안내 링크 | → `/help` |
| └ 충전하러 가기 | → `/billing` (토큰 부족 시) |
| └ 검색 결과 출처 | ↗ 외부 기사 URL (`target=_blank`) |

### 푸터 — `app/components/Footer.tsx`
사업자 정보(상호·대표자·사업자번호·주소·CS·통신판매업)만 **텍스트 표시. 링크 없음.**

---

## 2. 진입 · 인증 · 법적

### 랜딩 `/` — `app/page.tsx` (비로그인 전용, 로그인 시 `/life-timeline`)
| 버튼 | 이동 |
|---|---|
| 무료로 시작하기 (히어로) | → `/login` |
| 3분 만에 둘러보기 | → `#how` (페이지 내 스크롤) |
| 제품 카드 "보러 가기" — 포스터 | → `/shop/poster` |
| 제품 카드 — 자서전 책 | → `/shop/book` |
| 제품 카드 — 인생 씨앗 | → `/shop/charm` |
| 선물 준비 알아보기 | → `/shop/book` |
| 개인정보 처리방침 보기 | → `/privacy` |
| 무료로 시작하기 (하단 CTA) | → `/login` |
| 개인정보 처리방침 (푸터) | → `/privacy` |

### 로그인 `/login` · 회원가입 `/signup`
| 버튼 | 이동 |
|---|---|
| 카카오/네이버/구글로 시작하기 | 소셜 로그인 → 성공 시 `/enter` |
| 이메일로 로그인 (제출) | → `/enter` |
| 회원가입 | → `/signup` |
| 회원가입 제출 | 자동 로그인 → `/enter` |
| 로그인 (signup 화면) | → `/login` |

### 분기·동의 (UI 거의 없는 게이트)
| 화면 | 동작 |
|---|---|
| `/enter` | 비로그인 → `/login` · 이벤트≥1 또는 기존기록 → `/life-timeline` · 신규 → `/onboarding-chat` |
| `/consent` | 비로그인 → `/login` · 동의완료 → `/enter` · "자세히 보기" → `/privacy`(새 창) · 시작하기 → `/enter` |

### 온보딩
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/onboarding-chat` | 진행/넘어가기·인물 정리 완료·나중에 | 최종 → `/life-timeline` |
| `/onboarding` (레거시) | 다음/완료 | → `/timeline`(레거시) |

### 법적·고객센터·초대
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/privacy` | ← 라이프북 홈으로 | → `/` |
| `/help` | 이메일로 문의하기 | ↗ `mailto:` CS 이메일 |
| `/help` | ← 인생 연혁으로 | → `/life-timeline` |
| `/invite/[token]` | (비로그인) | → `/login?callbackUrl=/invite/[token]` |
| `/invite/[token]` | 동의하고 참여 | ⚙ 룸 가입 → `/rooms/{roomId}` |
| `/invite/[token]` | 나중에 하기 | → `/rooms` |

---

## 3. 인생 연혁 (메인 화면)

### `/life-timeline` — `app/life-timeline/page.tsx` + `TimelineView.tsx`
| 버튼 | 이동 |
|---|---|
| + 인생의 한 장면 추가하기 | → `/life-timeline/add` |
| 이벤트 관리 | → `/life-timeline/manage` |
| 👥 인물 기록 | → `/people` |
| 인생 기록 보강 | → `/life-record` |
| 🎙️ 말로 기록하기 | → `/life-timeline/free-record` |
| 이 연혁으로 포스터 만들기 | → `/poster` |
| 인생 기록 시작하기 (빈 상태) | → `/life-record` |
| **연혁 이벤트 점/카드 클릭** | → `/life-timeline/{eventId}/edit` |
| **빈 공간 클릭 / 점 옆 + 버튼** | → `/life-timeline/add?year=YYYY&hint=1` (연도 자동 추정) |
| 장소 칩 (네이버) | ↗ `https://map.naver.com/p/search/{장소명}` |
| 장소 칩 (구글, 좌표) | ↗ `https://maps.google.com/?q={lat},{lng}` |
| 장소 칩 (구글, 이름) | ↗ `https://maps.google.com/?q={장소명}` |
| 첫 방문 환영카드 "시작하기" | → `/life-timeline/add` |

### 하위 화면
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/life-timeline/add` | ← 인생 연혁으로 | → `/life-timeline` |
| `/life-timeline/manage` | ← 인생 연혁으로 / + 더 추가 | → `/life-timeline` · `/life-timeline/add` |
| `/life-timeline/manage` | 수정(life)·둘러보기(era)·사진(photo) | → `/life-timeline/{id}/edit` · `/era` · `/photos` |
| `/life-timeline/[id]/edit` | ← 이벤트 관리 | → `/life-timeline/manage` |
| `/life-timeline/companion` | ← 인생 연혁으로 | → `/life-timeline` |
| `/life-timeline/companion` | 대화 후 / 초안 검토 | → `/life-timeline` · `/life-timeline/manage?draft=1` |
| `/life-timeline/free-record` | ← 인생 연혁으로 / 완료 후 | → `/life-timeline` |
| `/life-timeline/free-record` | 충전하기 | → `/billing` (토큰 부족) |
| `/life-timeline/free-record` | 추천 주제 칩 | → `/life-timeline/free-record?topic=…` |

---

## 4. 인생 기록 · 시대 · 추억

### `/life-record` (9개 카테고리 인덱스)
| 버튼 | 이동 |
|---|---|
| 카테고리 카드(1~9) | → `/life-record/{category}` |
| 시작하기/이어서 하기 | → `/life-record/{다음 카테고리}` |
| 완료 화면으로 | → `/life-record/complete` |
| 👤 인물 추가하기 | → `/people/new?returnTo=/life-record` |
| `/life-record/[category]` 제출 | → 다음 카테고리 또는 `/life-record/complete` |
| `/life-record/complete` | 내 인생 연혁 보러 가기 | → `/life-timeline` (`/timemachine` 경유 리다이렉트) |

### `/era` (그 시절 둘러보기) — `EraView.tsx`
| 버튼 | 이동 |
|---|---|
| 사건 "구글에서 더 알아보기" | ↗ `https://www.google.com/search?q={사건명}` |
| 음악 "유튜브에서 듣기" | ↗ `https://www.youtube.com/results?search_query={검색어}` |
| 내 연혁에 담기 / 빼기 | ⚙ 담기·빼기 (페이지 전환 없음) |

### `/memory/[eventId]` (추억 대화)
| 버튼 | 이동 |
|---|---|
| ← 인생 연혁으로 | → `/life-timeline` |

---

## 5. 인물 · 사진 · 가족 룸

### 인물 `/people`
| 버튼 | 이동 |
|---|---|
| 탭 (인물/장소/물건) | → `/people?tab=person\|location\|thing` |
| + 새 인물 추가 | → `/people/new?type={탭}` |
| 카드 클릭 | → `/people/{personId}` |
| `/people/new` 추가 제출 | → `/people/{id}` 또는 `returnTo` |
| `/people/[id]` 수정 | → `/people/{id}/edit` |
| `/people/[id]` + 이야기 연결 | → `/people/{id}/link` |
| `/people/[id]/edit` 삭제 | ⚙ 삭제 → `/people` |
| `/people/[id]/link` 이벤트 없음 | → `/life-timeline/add` |
| 각 화면 ← 뒤로/목록/상세 | → `/people?tab=…` · `/people/{id}` |

### 사진 `/photos`
| 버튼 | 이동 |
|---|---|
| 여러 장 한꺼번에 올리기 | → `/photos/bulk` |
| `/photos/bulk` ← 내 사진으로 | → `/photos` |
| 대량 업로드 완료 후 "인생 연혁에서 보기" | → `/life-timeline` |
| 사진 업로드/삭제 | ⚙ 새로고침 (페이지 전환 없음) |

### 가족 룸 `/rooms`
| 버튼 | 이동 |
|---|---|
| ← 인생 연혁으로 | → `/life-timeline` |
| 룸 만들기 | ⚙ 생성 |
| 룸 카드 클릭 | → `/rooms/{roomId}` |
| `/rooms/[id]` ← 룸 목록 | → `/rooms` |
| 새 초대 링크 만들기 | ⚙ 생성 → `/invite/{token}` 표시 |
| 공동 추억 편집 | → `/rooms/{id}/shared/{memoryId}/edit` |
| 편집 화면 저장/취소 | ⚙ 저장 · → `/rooms/{id}` |

---

## 6. 포스터

```
/poster ──[이 디자인으로]──▶ /poster/select ──[다음: 시안]──▶ /poster/view ──[주문하기]──▶ /poster/order ──▶ 토스결제
   └──[내 취향으로]──▶ /poster/custom ──[이 배경으로 결정]──▶ /poster/select
```

| 화면 | 버튼 | 이동 |
|---|---|---|
| `/poster` | 이 디자인으로 만들기 | → `/poster/select` |
| `/poster` | 내 취향으로 만들기 | → `/poster/custom` |
| `/poster` | ← 인생 연혁으로 | → `/life-timeline` |
| `/poster` | 주문하기(저장된 포스터) | → `/shop/{poster.id}/order` |
| `/poster/custom` | ← 디자인 고르기로 | → `/poster` |
| `/poster/custom` | 이 배경으로 결정 | → `/poster/select` |
| `/poster/custom` | 토큰 충전하기 | → `/account/tokens` (부족 시) |
| `/poster/select` | ← 템플릿 다시 고르기 | → `/poster` |
| `/poster/select` | 다음: 시안 보기 | → `/poster/view` |
| `/poster/view` | ← 다시 고르기 | → `/poster/select` |
| `/poster/view` | ← 템플릿 바꾸기 | → `/poster` |
| `/poster/view` | 이 포스터 주문하기(상·하) | → `/poster/order` |
| `/poster/order` | ← 포스터로 돌아가기 | → `/poster/view` |
| `/poster/order` | 무통장입금 선택 → 주문하고 입금 안내 받기 | → `/account/orders/{orderId}` (입금 안내) |
| `/poster/order` | 카드결제 선택 → 결제하기 | 토스결제(테스트) → 성공 `/shop/order/success` · 실패 `/shop/order/fail` |

---

## 7. 상점 · 결제 · 계정 · 관리자

### 상점 `/shop`
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/shop` | ← 인생 연혁으로 / 상품 카드 | → `/life-timeline` · `/shop/{productId}` |
| `/shop/[id]` | ← 상점으로 / 주문하기 | → `/shop` · `/shop/{id}/order` |
| `/shop/[id]/order` | (poster 상품) | → `/poster` 로 리다이렉트 |
| `/shop/[id]/order` | 무통장입금 선택 → 주문하고 입금 안내 받기 | → `/account/orders/{orderId}` (입금 안내) |
| `/shop/[id]/order` | 카드결제 선택 → 결제하기 | 토스결제(테스트) → 성공 `/shop/order/success` · 실패 `/shop/order/fail` |
| `/shop/order/success` | 내 주문 보기 / 인생 연혁으로 | → `/account/orders` · `/life-timeline` |
| `/shop/order/fail` | 상점으로 돌아가기 | → `/shop` |

### 토큰 충전 `/billing`
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/billing` | ← 인생 연혁으로 | → `/life-timeline` |
| `/billing` | 패키지 충전 | 토스결제 → 성공 `/billing/success` · 실패 `/billing/fail` |
| `/billing/success` | 인생 연혁으로 / 충전 화면으로 | → `/life-timeline` · `/billing` |
| `/billing/fail` | 다시 시도하기 | → `/billing` |

### 계정 `/account/*`
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/account/profile` | ← 인생 연혁으로 | → `/life-timeline` |
| `/account/settings` | ← 인생 연혁으로 | → `/life-timeline` |
| `/account/settings` | 토큰 화면 열기 | → `/account/tokens` |
| `/account/settings` | 개인정보 처리방침 보기 | → `/privacy` (새 창) |
| `/account/settings` | 회원 탈퇴 안내 보기 | → `/account/delete` |
| `/account/tokens` | ← 설정으로 / 충전하러 가기 | → `/account/settings` · `/billing` |
| `/account/orders` | ← 인생 연혁으로 / 환불 요청 | → `/life-timeline` · ⚙ 환불요청 |
| `/account/orders/[orderId]` | 주문 상세(무통장 입금 안내) · 내 주문 전체 보기 / 인생 연혁으로 | → `/account/orders` · `/life-timeline` |
| `/account/delete` | ← 돌아가기 / 회원 탈퇴 | → `/billing` · ⚙ 탈퇴 → `/login` |

### 관리자 `/admin/orders` (ADMIN_EMAILS 화이트리스트)
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/admin/orders` | 주문 항목 클릭 | → `/admin/orders/{orderId}` |
| `/admin/orders/[id]` | ← 목록 | → `/admin/orders` |
| `/admin/orders/[id]` | 입금 확인(무통장)/발주/배송중/배송완료/취소/송장저장/환불 | ⚙ 상태 변경 (페이지 전환 없음) |

---

## 8. 외부 링크 모음 (새 탭으로 나가는 곳)

| 용도 | URL 패턴 | 위치 |
|---|---|---|
| 시대 사건 검색 | `https://www.google.com/search?q={사건명}` | `/era` |
| 시대 음악 듣기 | `https://www.youtube.com/results?search_query={검색어}` | `/era` |
| 장소 보기 (네이버) | `https://map.naver.com/p/search/{장소명}` | 연혁 장소 칩 |
| 장소 보기 (구글) | `https://maps.google.com/?q={lat,lng 또는 장소명}` | 연혁 장소 칩 |
| 고객센터 문의 | `mailto:{CS 이메일}` | `/help` |
| AI 비서 검색 출처 | 기사 원문 URL | AI 비서 모달 |
| 결제창 | 토스페이먼츠 결제 위젯 | `/billing`, `/poster/order`, `/shop/[id]/order` |

> 결제·소셜로그인은 외부 서비스(토스페이먼츠·카카오·네이버·구글)로 잠시 이동했다가 콜백 경로(`/billing/success` 등)로 돌아옵니다.

---

## 9. 결제 흐름 정리

| 시작 | 결제창 | 성공 시 | 실패 시 |
|---|---|---|---|
| 토큰 충전 `/billing` | 토스페이먼츠 | `/billing/success` | `/billing/fail` |
| 포스터 주문 `/poster/order` | 토스페이먼츠 | `/shop/order/success` | `/shop/order/fail` |
| 실물 상품 `/shop/[id]/order` | 토스페이먼츠 | `/shop/order/success` | `/shop/order/fail` |

> 현재 포스터 실결제는 `POSTER_PAYMENT_LIVE_ENABLED` 플래그로 기본 OFF(테스트 모드).

---

## 참고 — 자동 리다이렉트(버튼 아님)

| 경로 | 리다이렉트 |
|---|---|
| `/timemachine` | → `/life-timeline` |
| `/timemachine/[year]/[month]` | → `/life-timeline` (월 화면 비활성, 코드 보존) |
| 로그인 필요한 모든 화면 | 비로그인 시 → `/login` |
| 동의 필요 화면 | 미동의 시 → `/consent` |
