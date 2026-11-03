# 라이프북 — 버튼·링크 이동 지도 (Navigation Map)

> 서비스의 모든 버튼/링크가 **어디로 이동하는지** 한눈에 보는 문서.
> 작성: 2026-06-26 · 최신화: 2026-11-03(My Life 시기 패널 "나온 곳" — 이름만 남은 옛 장소 [여기로 가기] → 그 이야기 우회 삭제, 이야기 장소는 늘 장소 노드) · 2026-11-03(인물 확인 화면 `/story-review/confirm` 삭제 → 주소로 오면 `/my-life` · My Life "정리할 것" 카드·이야기/사람 패널 [확인하러 가기]·인터뷰 요약 인물 확인 카드 삭제) · 2026-11-03(옛 온보딩 화면 4개 삭제 → 주소로 오면 `/enter` · `/story-review` 보존 본문 삭제 — 리다이렉트만) · 2026-11-02(Q69 후속 — 목록 보기 "그때의 나" 별도 묶음 제거, 시기 아래 꼬리표로만) · 2026-11-02(Q69 — `/story-review` → `/my-life?view=list` redirect(본문 archived 보존 → 2026-11-03 삭제), 그 화면의 카드(정리할 것·오늘의 인터뷰·더 들어볼까요?)는 My Life 목록 보기 + 지도 [이야기 거리] 시트로, 이야기 패널 [이야기 고치기], 사이드 패널 "내 이야기" 삭제, 인터뷰·인물 확인·V3 가드의 `/story-review` → `/my-life`) · 2026-11-02(My Life 차례 보기 진행 중 선택 줄 [다음 연결]·[처음으로] · 시기 패널 "나온 곳" = 이야기에 나온 곳 포함 [여기로 가기]) · 2026-11-02([연결된 곳 차례로 보기(N)] 머리 줄 → 노드 패널 안) · 2026-11-02(My Life 3단계 E2E 후속 2 — 지도 가장자리 버튼 → 도구줄 이동 줄 [시간 줄기][인물록][장소록]·머리 줄 [연결된 곳 차례로 보기(N)], 옮긴 직후 [되돌리기]) · 2026-11-02(My Life 개편 3단계 — 지도에서 직접 만들기·넣기·빼기·되돌리기·옮기기·지우기: 머리 줄 [+ 만들기], 인물록·장소록 [+ 사람][+ 모임]/[+ 장소][+ 묶음], 장소 묶음 영역, 패널 [이야기 추가] → [말로 이야기하기] `/chat-v3?gapEventId=&gapType=episode`·[직접 쓰기], 사람 패널 [인물록에서 지우기] → `/people/[id]`) · 2026-11-02(`/onboarding-episode-chat/[eventId]` 닫음 → `/chat-v3?gapEventId=<eventId>&gapType=episode` — 앱 안 진입로 0, 시기 이름을 제목으로 넣던 마지막 옛 저장 경로) · 2026-11-01(My Life 개편 2단계 — `/enter` V3 설정 완료 → `/my-life`(Q68), `/chat-v3` 설정 뒤 자유 대화 + 제안 카드(대화창 확인 카드·종료 시 확인 화면 이동 제거, 종료 → `/my-life`), 만든 뒤 [My Life 에서 보기] → `/my-life?focus=`, My Life [이야기 나누기], 오늘의 인터뷰 마무리 카드 · My Life 개편 1단계 — 인물록·장소록·간선 선택·[찾기]·가장자리 버튼·전체 보기 탭 = 확대·패널 [여기로 가기] · My Life 자유 이동 캔버스 — 끌기·지점 확대·키보드 화살표, 목차 버튼 제거 · My Life 2b-3a — 새 화면 `/my-life`(마인드맵, 보기 전용), 사이드 패널 [My Life](V3)·`/story-review` [My Life 로 보기] 진입 · 노드 그래프 2b-2 — 이야기에 나온 인물 확인 `/story-review/confirm`, `/chat-v3` 종료 시 대기 있으면 그리로 · 같은 날 E2E 후속 — `/chat-v3` 이야기 저장 직후 대화창 확인 카드 · 종료 문구 문장 전체 일치 — 온보딩 이야기 대화 종료 문구 → `/onboarding-episode?after=`) · 2026-10-30(proxy 동의 버전 검사 — 이전 버전 동의자 전 화면 → `/consent`, `/lab` proxy 404) · 2026-10-25(오늘의 인터뷰 `/interview` + `/story-review` 진입 카드, 같은 날 허용 목록 게이트 제거 — V3 전원) · 코드 기준 정리.
> 표기: `→ /경로` 내부 이동, `↗ https://…` 외부 새 탭, `⚙ 액션` 서버액션(페이지 전환 없음/새로고침).

---

## 0. 전체 흐름 한눈에

```
(비로그인) /  ──[무료로 시작하기]──▶ /login ──[소셜/이메일 로그인]──▶ /enter (분기)
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
              동의 미완료                  V3 트랙(신규 가입)              V2 트랙(기존 사용자)
                    ▼                             ▼                             ▼
                /consent          skeleton 완성+확인대기 0건?          신규(온보딩 X) / 기존 이벤트 有
                                    ├─ Yes → /my-life                    ├─ /onboarding-chat
                                    └─ No  → /start ▶ /chat-v3            └─ /life-timeline (메인)

/life-timeline (v2 메인) ─ 사이드패널/카드 버튼으로 모든 기능 진입
   ├─ 기록: /life-record · /life-timeline/add · /life-timeline/free-record · /life-timeline/companion
   ├─ 둘러보기: /era · /people · /photos · /rooms
   ├─ 포스터: /poster ▶ /poster/select ▶ /poster/view ▶ /poster/order ▶ (토스결제)
   ├─ 계정/결제: /account/* · /billing · /shop
   └─ [새 방식으로 이야기해보기] 배너 → 확인 모달 → ⚙ onboardingTrack=V3 → /start

/my-life (v3 메인, Q68) ──[이야기 나누기]──▶ /chat-v3 (설정 뒤 자유 대화 → 제안 카드 [만들기]) ──[My Life 에서 보기]──▶ /my-life?focus=<이야기>
                                                   └ 그만할래요 ──▶ (카드 정한 뒤) /my-life
/my-life 목록 보기·지도 [이야기 거리] ── [이야기하기] 갭 카드 ──▶ /chat-v3(?gapEventId=…) (주제로 자유 대화 시작)
/story-review ──▶ /my-life?view=list (Q69 — 합침, 옛 링크·북마크만)
/story-review/confirm ──▶ /my-life (2026-11-03 인물 확인 화면 삭제 — 옛 링크·북마크만)
```

---

## 1. 전역 공통 UI (모든 화면 상·하·옆)

### 헤더 — `app/layout.tsx`
| 버튼/라벨 | 이동 | 조건 |
|---|---|---|
| Lifebook (로고) | → `/` | 항상 |
| 로그인 | → `/login` | 비로그인일 때만 |

### 사이드 패널 — `app/timemachine/SidePanel.tsx` (로그인 시에만 표시)

**상단 고정 영역** (프로필·잔액·빠른 접근)
| 항목 | 이동 | 조건 |
|---|---|---|
| 토큰 화면 열기 (잔액 카드 옆) | → `/account/tokens` | |
| 새 가족 소식 | → `/life-timeline` | 새 소식 있을 때만 |
| 오늘 토큰 받기 (출석 미니) | ⚙ 출석 체크 | 오늘 안 받았을 때 |

**메뉴 — 성격별 5그룹** (4-A, 2026-07-01). 항목은 `MenuGroup` 헤더로 묶임.
"📖 내 이야기" 첫 두 항목은 `onboardingTrack` 에 따라 갈린다(v3 P17) — 나머지 그룹은 트랙 무관 공용.
| 그룹 | 메뉴 | 이동 | 조건 |
|---|---|---|---|
| 📖 내 이야기 | 이야기 나누기 | → `/chat-v3` | V3 트랙 |
| | My Life | → `/my-life` | V3 트랙 (prefetch 끔) |
| 📖 내 이야기 | 내 인생 연혁 | → `/life-timeline` | V2 트랙 |
| | 이야기 나누기 | → `/life-timeline/companion` | V2 트랙 |
| | 인물록 | → `/people` | 공용 |
| | 내 사진 | → `/photos` | 공용 |
| | 그 시절 둘러보기 | → `/era` | 공용 |
| 👨‍👩‍👧 함께 보기 | 가족 룸 | → `/rooms` | 공용 |
| 🎁 만들기·상점 | 포스터 만들기 | → `/poster` | 공용 |
| | 상품 구매 | → `/shop` | 공용 |
| ⚙️ 내 계정 | 회원정보 | → `/account/profile` | 공용 |
| | 설정 | → `/account/settings` | 공용 |
| 🆘 도움 | 고객센터 | → `/help` | 공용 |
| | 둘러보기 다시 보기 | ⚙ 코치마크 재시작 (다른 페이지면 → `/life-timeline?tour=main`) | 공용 |

**하단**: 로그아웃 ⚙ → `/`

> 토큰 진입로는 상단 "토큰 화면 열기" 버튼 + 설정 페이지 토큰 카드 2곳으로 통일(4-B-3, 메뉴 중복 항목 제거). 포스터 진입로는 만들기·상점 그룹에 추가(4-B-2).

### 플로팅 AI 비서 위젯 — `AssistantWidget` / `AssistantModal` (로그인 시, 우측 하단, 모든 화면)
둥근 버튼 → 모달. 모달 첫 화면 = 허브 3버튼(`AssistantPanel` `selecting` 모드). 사이드 "이야기 나누기"와 같은 companion 으로 가나, 위젯은 *어디서든 빠른 접근* 목적이라 둘 다 유지.
| 버튼/항목 | 이동·동작 |
|---|---|
| AI 비서와 대화 (둥근 버튼) | 모달 열기 |
| └ 💬 이야기 나누기 | → `/life-timeline/companion` (V2) · → `/chat-v3` (V3, P20-2a — `AssistantModal` 이 v2 `AssistantPanel` 의 하드코딩 경로를 가로챔) (모달 닫고 이동) |
| └ 🕰️ 그 시절 떠올리기 | 그 시절 갈래: 목록에서 고르기(무료) / AI에게 물어보기(토큰). 사이드 "그 시절 둘러보기"(/era)와 라벨 구분(4-B-4) |
| └ ❓ 사용법 물어보기 | 사용법 안내 챗 (무료, Haiku) |
| └ 내 타임라인에 추가 | → `/life-timeline/add` |
| └ 충전하러 가기 | → `/billing` (토큰 부족 시) |
| └ 검색 결과 출처 | ↗ 외부 기사 URL (`target=_blank`) |

### 푸터 — `app/components/Footer.tsx`
사업자 정보(상호·대표자·사업자번호·주소·CS·통신판매업)는 텍스트 표시.
| 버튼 | 이동 |
|---|---|
| 환불정책 | → `/refund` |
| 이용약관 | → `/terms` |

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
| 이용약관 (푸터) | → `/terms` |

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
| `/enter` | 비로그인 → `/login` · 동의 버전 < 현재(`CURRENT_CONSENT_VERSION`) → `/consent`(재동의) · **V3 트랙**: skeleton 완성+확인대기(UNCONFIRMED) 0건 → `/my-life`(My Life 개편 2단계 Q68 — 이전 `/story-review`), 아니면 → `/start` · **V2 트랙**: 이벤트≥1 또는 기존기록 → `/life-timeline` · 신규(V2) → `/onboarding-chat` |
| `/consent` | 비로그인 → `/login` · 이미 최신 동의 → 세션 갱신 후 `/enter`(client `router.replace` — 쿠키가 오래돼 proxy 가 보낸 경우 루프 방지) · "개인정보 처리방침 자세히 보기" → `/privacy`(새 창) · "이용약관 자세히 보기" → `/terms`(새 창) · 시작하기 → `/enter` |
| `/start` | V2 트랙으로 직접 진입 시 → `/enter` (자동 전환 없음) |
| `/chat-v3` | V2 트랙으로 직접 진입 시 → `/enter` |
| `/story-review` | → `/my-life?view=list` (Q69 — My Life 목록 보기로 합침. 옛 본문은 2026-11-03 삭제, 리다이렉트만) |
| `/story-review/confirm` | → `/my-life` (2026-11-03 인물 확인 화면 삭제 — 확인 대기 0·만드는 경로 0, `next.config.ts` redirects) |
| `/my-life` | 비로그인 → `/login` · V2 트랙으로 직접 진입 시 → `/enter` |
| `/interview` | 비로그인 → `/login` · V2 트랙 → `/enter` · 동의 버전 < 현재 → `/consent` · 골격 미완성·확인대기 있음 → `/chat-v3` |
| `/onboarding-chat` (v2 파이프라인) | V3 트랙으로 직접 진입 시 → `/enter` |
| `/life-timeline` (P20-2b) | V3 트랙으로 직접 진입 시 → `/my-life`(Q69 전엔 `/story-review`) |
| `/life-timeline/companion` (P20-2b) | V3 트랙으로 직접 진입 시 → `/my-life`(Q69 전엔 `/story-review`) |

### 온보딩 (v2)
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/onboarding-chat` | 진행/넘어가기·인물 정리 완료·나중에 | 최종 → `/life-timeline` |
| `/onboarding` (레거시, archive 스텁) | — | → `/onboarding-chat` 로 redirect (본문 `_OnboardingPageArchived` 보존) |
| `/onboarding-v2` · `/onboarding-confirm` · `/onboarding-episode` · `/onboarding-episode-chat/[eventId]` (2026-11-03 삭제 — 앱 안 진입 링크 0, 코드·전용 액션 삭제) | — | → `/enter`(`next.config.ts` redirects — 트랙·동의에 맞는 첫 화면) |

### v3 통합 채팅 — `/start` · `/chat-v3` (v3 P17 — `/story-review` 는 Q69 에 `/my-life` 로 합침, 인물 확인 `/story-review/confirm` 은 2026-11-03 삭제)
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/start` | 시작하기 | → `/chat-v3` |
| `/chat-v3` | 설정(신상·골격 확인) 끝 | ⚙ 같은 화면에서 자유 대화로(전환 없음 — 이전엔 `/story-review` 로 이동) |
| `/chat-v3` 자유 대화 | 갭 칩(구간에 아직 이야기 없을 때) · [지금 이야기 남기기](이야기 1턴 이상·카드 없을 때) | ⚙ 주제로 새 구간 / 제안 카드(전환 없음) |
| `/chat-v3` 제안 카드 | [만들기] · [고치기]([고치기 그만]) · [안 만들기] · 같은 이름 확정 인물이 있으면 그 행에 [같은 분이에요 / 다른 분이에요] | ⚙ 저장·구간 정리(전환 없음, 대화 계속) |
| `/chat-v3` | 만든 직후 [My Life 에서 보기] | → `/my-life?focus=st:<중심>:<이야기>`(그 이야기로 이동·선택) |
| `/chat-v3` | 대화 종료(질문 상한·그만할래요 — 남길 이야기가 있으면 카드를 정한 뒤) | → `/my-life`(신상 단계 종료는 이동 없음) |
| `/life-timeline` (V2) | [새 방식으로 이야기해보기] 배너 → 확인 모달 [예, 새 방식으로] | ⚙ `onboardingTrack=V3` → `/start` |

### My Life `/my-life` (V3 — `docs/phase/my-life-restructure.md` 1단계 지도 · 3단계 직접 만들기 · 처음 설계 `docs/phase/node-graph-self.md` §6 2b.1)
마인드맵 하나 — 가운데 줄기에 확정 중심, 왼쪽 이야기·그때의 나, 지도 오른쪽에 **인물록**(모임 = 겹치는 둥근 영역, 모임 없는 분 격자)·**장소록**(장소 묶음 = 같은 모양의 영역, 묶음 없는 곳 격자 — 3단계). 이야기·중심 → 사람·장소는 선택했을 때만 선(간선)으로. 문구는 `lib/my-life-copy.ts`(메뉴 이름 "My Life"·[인물 간선 끄기]·[장소 간선 끄기] 외 임시).
| 화면 | 버튼 | 이동 |
|---|---|---|
| 지도(자유 이동 캔버스) | 끌기 = 이동(상하좌우) · 두 손가락 벌리기·휠·빈 곳 더블탭 = 그 지점 확대 · 도구줄 [−]·[+](화면 가운데 기준)·[전체 보기] · 키보드(지도에 포커스) 화살표 = 이동·`+`·`-`·`0` = 처음 화면 | ⚙ 화면 안(전환 없음, 지도 화면에선 페이지 스크롤 잠금) |
| 지도 | 노드(중심·이야기·그때의 나·사람·모임 이름·장소) 누르기 | ⚙ 선택(간선 표시) + 아래 패널 열기(반 높이, 전환 없음). 패널을 닫아도 선택 유지 |
| 지도(전체 보기 배율 0.6 미만) | 노드 누르기 | ⚙ 그 노드로 확대 이동(배율 1, 패널 안 열림) |
| 지도 — 선택 중 머리 줄 | [선택 풀기] · 빈 곳 탭 · Esc | ⚙ 선택 해제(간선 사라짐) |
| 지도 — 선택 중 머리 줄 | [인물 간선 끄기 / 켜기] · [장소 간선 끄기 / 켜기] | ⚙ 그 종류 간선 숨김(같은 탭 안 기억) |
| 지도 아래 도구줄 이동 줄(늘 보임 — 2026-11-02 지도 가장자리에서 옮김) | [시간 줄기] · [인물록] · [장소록](지금 보는 곳 표시) | ⚙ 그 영역으로 이동(전환 없음) |
| 노드 패널(연결 있는 노드 — 2026-11-02 지도 가장자리 → 머리 줄 → 패널 안으로 옮김) | [연결된 곳 차례로 보기(N)] | ⚙ 패널을 닫고 첫 연결 노드로 이동(전환 없음) — 차례 보기 시작 |
| 지도 — 차례 보기 중 선택 줄("연결 n/N · 이름") | [다음 연결] · 마지막 다음 [처음으로] | ⚙ 다음 연결 노드로 이동 / 고른 노드로 돌아가고 차례 보기 끝(버튼 사라짐). 다른 노드 탭·선택 풀기·간선 끄기로도 끝(전환 없음) |
| 시기 패널 — "함께 나온 분"·"나온 곳"(머리 수와 같은 목록 — 이야기에서만 나온 분·곳 포함) | 줄의 [여기로 가기] | ⚙ 그 사람·장소 노드로 이동·선택 (전환 없음 — 이름만 남은 옛 장소를 그 이야기로 보내던 우회는 2026-11-03 삭제, 이야기 장소는 늘 장소 노드). [빼기]는 시기에 바로 이은 것만 |
| 이야기 패널 — 다른 시절로 옮긴 직후 알림 | [되돌리기] | ⚙ 원래 시기로 되돌리고 그 이야기 패널(전환 없음) |
| 지도 — 인물록(모임 4개 이상) | 모임 칩 [합창부 ✓][등산회] | ⚙ 영역에 보일 모임 3개 바꾸기(전환 없음) |
| 지도 | 접힌 띠 [가지 N개 펼치기] · 위 [모두 펼치기](접힌 띠 있을 때) | ⚙ 화면 안(전환 없음) |
| 지도·목록 보기 | [찾기] → 시트(글자 입력·결과 목록) → 결과 누르기 | ⚙ 시트 닫힘 → 접힌 띠면 펼치고 그 노드로 이동·선택(목록 보기는 그 항목으로 스크롤) |
| 지도·목록 보기 | [이야기 나누기](390 은 머리 아래 꽉 찬 버튼, 넓은 화면은 머리 줄 안) | → `/chat-v3` |
| `/my-life?focus=<노드 키>` | (채팅에서 만든 직후 진입) | ⚙ 그 노드의 띠를 펼치고 이동·선택 |
| 지도 | [목록으로 보기] | → `/my-life?view=list`(같은 화면 — 오늘의 인터뷰 카드 + 시기 순 목록(그때의 나 = 시기 아래 꼬리표) + 더 들어볼까요? + 인물록(모임별 묶음·모임 없는 분) + 장소록, 뒤로 가기로 지도) |
| 목록 보기 맨 위 · 지도 [이야기 거리] 시트 | 오늘의 인터뷰 카드 [시작하기 / 이어서 하기 / 오늘 답 보기] (항상 표시) | → `/interview` |
| 목록 보기 시간 줄기 아래 · 지도 [이야기 거리] 시트 | 갭 카드 "더 들어볼까요?" [이야기하기 / 이어서 이야기하기(진행 중)] (최대 3) | → `/chat-v3?gapEventId=…&gapType=…` |
| 지도 — 노드 안 골랐을 때 "지금 보는 곳" 줄 | [이야기 거리] → 아래 시트 · [닫기] | ⚙ 시트 열기·닫기(전환 없음) |
| 목록 보기 | [지도로 보기] | → `/my-life` |
| 패널(중심) | [가지 접기 / 가지 N개 펼치기] (지도에서만) · [닫기] | ⚙ 화면 안 |
| 패널(중심·사람·장소·모임) | 목록 행(나온 이야기·그 시기·함께 나온 분·나온 곳·구성원) [여기로 가기] | ⚙ 패널 닫고 그 노드로 이동·선택(전환 없음) |
| 패널(이야기) | [본문 보기 / 본문 접기] · [닫기] | ⚙ 패널 안 펼침 |
| 패널(이야기·그때의 나) | [이야기 고치기] → 본문 칸 [저장] / [취소] (Q69 — `/story-review` 이야기 카드에서 옮김) | ⚙ 본문 저장(다듬은 글 초기화) → 패널 그대로·지도 다시 읽기 |
| 패널(사람) | [인물록에서 보기] | → `/people/[id]` |
| 패널(장소) | [지도에서 보기] | ↗ `https://map.naver.com/p/search/…`(네이버 장소) · `https://maps.google.com/?q=…`(그 밖) |
| 빈 상태(확정 중심 0) | [이야기 나누기] | → `/chat-v3` |
| 지도·목록 보기 머리 | [+ 만들기](390 은 [이야기 나누기] 옆, 넓은 화면은 머리 줄 안) → 시트: 종류 7개(시기·이야기·그때의 나·사람·장소·모임·장소 묶음) → 입력 → [만들기] | ⚙ 저장 → 시트 닫힘 → 지도가 새 노드로 이동·선택 + 패널(맨 위 [되돌리기] — 다음 동작 전까지) |
| 지도 — 인물록·장소록 제목 아래 | [+ 사람]·[+ 모임] / [+ 장소]·[+ 묶음] (목록 보기는 각 절 제목 아래) | ⚙ 그 종류 입력 시트(종류 고르기 건너뜀) |
| 만들기 — 사람 | 같은 이름 확정 인물이 있으면 [같은 분이에요](후보마다) / [다른 분이에요] | ⚙ 같은 분 = 새로 안 만듦(그분) / 다른 분 = 새로 |
| 만들기 — 장소 | [이름만 적기] / [지도에서 찾기](네이버·구글 검색 — 기존 장소 검색) | ⚙ 화면 안 |
| 패널(중심) | [이야기 추가] → [말로 이야기하기] | → `/chat-v3?gapEventId=<중심>&gapType=episode` |
| 패널(중심) | [이야기 추가] → [직접 쓰기 — 이야기 / 그때의 나] | ⚙ 패널 안 입력 → 저장 → 새 이야기로 이동·선택 + [되돌리기] |
| 패널(중심·이야기·사람·장소·모임·장소 묶음) | [인물 넣기]·[장소 넣기]·[모임 넣기]·[모임에 넣기]·[묶음에 넣기]·[사람 넣기] → 고르기 목록(10개 넘으면 이름 찾기) · [새로 만들기] | ⚙ 넣기 → 패널 기본 단계 + "넣었어요 [되돌리기]"(다음 동작 전까지 — 새로 생긴 연결만 지움) |
| 패널 — 이어진 것 행 | [여기로 가기] · [빼기] → 패널 안 확인 [뺄게요] / [뒤로] | ⚙ 그 노드로 이동 / 연결만 끊음(노드 그대로). 이야기의 대상 인물·주 소속 시기는 [빼기] 없음 |
| 패널(이야기·그때의 나) | [다른 시절로 옮기기] → 시기 목록(지금 시기는 "지금 여기", 못 누름) → 확인 [옮기기] / [뒤로] | ⚙ 옮김 → 지도가 옮긴 자리로 이동·선택 |
| 패널(직접 추가 시기·이야기·장소·모임·장소 묶음) | [이 노드 지우기] → 패널 안 확인(이어진 이야기·사람·장소 수, 시기면 함께 지워질 이야기 수, 가족 댓글·반응 수) [지우기] / [뒤로] | ⚙ 지움 → 패널 닫힘·선택 풀림. 처음 정한 시기(골격)는 버튼 없음 |
| 패널(사람 — 확정) | [인물록에서 지우기]("사람은 인물록에서 지울 수 있어요") | → `/people/[id]`(기존 삭제 확인) |
| 패널 — 넣기·만들기·옮기기 단계 | [뒤로] · [취소] · [닫기] | ⚙ 앞 단계 / 패널 닫기 |

### 오늘의 인터뷰 `/interview` (로그인한 V3 사용자 전원 — `docs/phase/today-interview.md`)
진입은 My Life 카드뿐(목록 보기 맨 위·지도 [이야기 거리] — Q69 전엔 `/story-review` 카드, 사이드 패널 미노출 — 2차). 한 화면 한 질문, 버튼 문구는 `lib/interview/copy.ts`(임시).
| 화면 | 버튼 | 이동 |
|---|---|---|
| 시작 화면 | 시작할게요 | ⚙ 오늘 세션 생성 → 첫 문항(페이지 전환 없음) |
| 문항 | 답하기 / 기억이 안 나요(연도) / 이 이야기는 여기까지 / 이 질문은 건너뛸게요 | ⚙ 연도 저장·건너뜀 → 다음 문항 / 이야기 마무리 → 제안 카드(페이지 전환 없음) |
| 이야기 마무리 카드(My Life 개편 2단계 Q67 — 시기는 문항이 정함) | [만들기] · [고치기] · [안 만들기] · 같은 이름이면 [같은 분이에요 / 다른 분이에요] | ⚙ 저장 후 다음 문항 / 저장 안 하고 다음 문항(페이지 전환 없음) |
| 문항 | 오늘은 그만할게요 | ⚙ (답한 이야기 있으면 저장) → 중단 화면(페이지 전환 없음) |
| 중단 화면 | 이어서 하기 / 지금까지 채운 이야기 보기 | 같은 문항부터(전환 없음) / → `/my-life` |
| 종료 요약 | 지금까지 채운 이야기 보기 / 더 이야기 나누기 | → `/my-life` / → `/chat-v3` |
| 빈 계획 | 더 이야기 나누기 / 지금까지 채운 이야기 보기 | → `/chat-v3` / → `/my-life` |

### 법적·고객센터·초대
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/privacy` | ← 라이프북 홈으로 | → `/` |
| `/terms` | ← 라이프북 홈으로 | → `/` |
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

### 기억 연구실 `/lab/memory` (LAB_ALLOWED_USER_IDS, 연구 트랙 — `phase/기억에이전트_R1-R4_기획.md`)
진입 링크 없음(메뉴·헤더·사이드 패널 미노출, 주소 직접 입력만). 비허용 로그인 사용자는 일반 404.
| 화면 | 버튼 | 이동 |
|---|---|---|
| `/lab/memory` | 대상별 원본 변경 확인 | ⚙ 조회(원본 ↔ 색인 원장 비교, 페이지 전환 없음) |
| `/lab/memory` | 대상별 동기화 실행 | ⚙ 카드 추출·소멸 반영·임베딩(1회 LLM 20건 상한, 페이지 전환 없음) |
| `/lab/memory` | 검색 디버그 → | → `/lab/memory/search` |
| `/lab/memory` | 기억에게 물어보기 → | → `/lab/memory/ask` |
| `/lab/memory/ask` | 물어보기 | ⚙ 에이전트 질의응답(근거 인용 답 + LabAgentRun 저장, 페이지 전환 없음) |
| `/lab/memory/ask` | ← 연구실 | → `/lab/memory` |
| `/lab/memory/search` | 검색 | ⚙ 카드 검색(점수 분해·생존 확인, 페이지 전환 없음) |
| `/lab/memory/search` | ← 연구실 | → `/lab/memory` |

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
| `/timeline` | → `/life-timeline` (레거시 Phase 5 타임라인 비활성, archive 스텁 — `_TimelinePageArchived` + RAG 체인 보존) |
| `/onboarding` | → `/onboarding-chat` (레거시 위저드 온보딩 비활성, archive 스텁 — 코드 보존) |
| `/onboarding-v2` · `/onboarding-confirm` · `/onboarding-episode` · `/onboarding-episode-chat/[eventId]` | → `/enter` (2026-11-03 옛 온보딩 화면 삭제 — `next.config.ts` redirects, proxy 보다 먼저. 이전엔 `/onboarding-episode-chat` 만 `/chat-v3` 주제로 archive 스텁) |
| `/story-review/confirm` | → `/my-life` (2026-11-03 인물 확인 화면 삭제 — 확인 대기 0·만드는 경로 0, `next.config.ts` redirects) |
| `/lab`·`/lab/memory` 이하 | 허용 목록 밖 로그인 사용자 → 404 (proxy 가 없는 경로로 rewrite + 화면 `notFound()`, 리다이렉트 아님 — 존재를 드러내지 않음) |
| `/interview` | 비로그인 → `/login` · V2 → `/enter` · 재동의 필요 → `/consent` · 골격 미완성 → `/chat-v3` |
| 로그인 필요한 모든 화면 | 비로그인 시 → `/login` |
| 동의 필요 화면 | 미동의·이전 버전 동의(`consentVersion` < `CURRENT_CONSENT_VERSION`) 시 → `/consent` (proxy — 공개 경로·`/consent`·`/api/auth/*` 제외) |
