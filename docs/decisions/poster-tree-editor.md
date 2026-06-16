# 결정 — 인생 나무 포스터: 3계층 엔진 + 템플릿 피커 + 편집 트릴로지

## Problem

사용자가 적은 연혁(`life_event`)을 **실물 포스터(느티나무 등 한 그루 나무)**로 만들어 파는 출력물 서비스(Phase 10)가 필요했다. 제약이 까다로웠다:

1. **디자인 동결** — 디자이너의 v0.1 마스터 SVG를 7월까지 비주얼 판단 없이 그대로 "스킨"으로 쓴다. 폰트 크기·색·레이아웃을 코드가 건드리지 않는다.
2. **종 교체형** — 7월에 나무 종(템플릿)을 계속 더한다. 종마다 렌더 엔진을 새로 짜면 안 된다.
3. **시니어 접근성** — 큰 글씨·큰 터치(56px)·단순 동선. 기본은 아무것도 안 해도 자동으로 그려지는 경로.
4. **검증된 렌더를 인터랙션이 깨면 안 됨** — 데모 임박. 편집 기능을 더하다가 이미 동작하는 포스터를 망가뜨리는 회귀가 가장 큰 리스크.
5. **마이그 0** — 출력물은 휘발성 미리보기로 시작. DB 스키마 변경 없이.

핵심 질문: 종마다 다른 SVG를 어떻게 한 엔진으로 렌더하고, 그 위에 편집(빼기·크기·위치·메모)을 **검증된 렌더를 건드리지 않고** 얹을 것인가?

## Action

### 1) 3계층 엔진 (T1) — 경계가 전부

특정 종(느티나무) 지식을 한 곳(매니페스트)에 가두고 나머지는 무지하게 만들었다.

- **Layer 1 매핑 (`lib/poster/mapping.ts`)** — `life_event[] → Placement`. template-agnostic. 챕터/슬롯 "개수"만 매니페스트에서 받고 특정 SVG 좌표는 모른다. 나이대 군집으로 브랜치 수(3~5) 추정, 가중치 휴리스틱으로 대표(꽃·열매)·standout(새) 배정.
- **Layer 2 렌더러 (`lib/poster/render.ts`)** — `(매니페스트, placement, raw SVG) → SVG 문자열`. 느티나무 리터럴 0 — `idMap` 규칙으로 삽입점을 찾아 **id 기준 문자열 치환**만 한다.
- **Layer 3 UI (`app/poster/`)** — RSC가 렌더 + 클라(`PosterInteractive`)가 인터랙션.

원칙: **SVG가 원본·진실**. 트리를 코드(JSX)로 재구성하지 않는다(손 변환 금지). 종 추가 = 새 SVG + 매니페스트 1개. **엔진 무수정.**

### 2) 템플릿 피커 (자유도 #1) — 느티나무 + 인생 강물

- `page.tsx`가 매니페스트 *리스트*를 map으로 각각 렌더 → 피커가 active만 표시(스왑).
- **river 챕터 메타포명 보존**: river는 챕터가 고정 메타포명(상류~하구)이라 클러스터 라벨로 덮으면 안 됨. render.ts 무수정 유지를 위해 `idMap.chapter`를 **존재하지 않는 id(sentinel)**로 매핑 → 치환 no-op. `significanceVariants`는 zelkova 것 재사용(슬롯 구조 동일).
- **계약은 grep으로 검증** — 디자이너 "100% 동일" 클레임을 믿지 않고 매번 grep. river는 폴더 위치·title/footer id 누락 2건이 실제로 발견돼 태깅(비주얼 불변)으로 보강.

### 3) sephirot — 블록 (자산만 보존)

3번째 종 sephirot은 슬롯 DOM이 zelkova/river와 **근본적으로 다름**(중첩 `<g>`·장식 `<use href="#node">`·음수 로컬좌표·group `transform` 포지셔닝). render.ts의 변형 주입(비탐욕 단일 `</g>` 매칭 + 양수 앵커 정규식 + 절대 `use x/y`)과 비호환 → 매니페스트 미생성·피커 미합류. 자산만 커밋, **flat 구조 재작업 후 합류**.

### 4) 편집 트릴로지 (클라·휘발성) — 인프라 위에 쌓기

세 슬라이스가 한 포인터/transform 인프라를 공유한다.

| 슬라이스 | 무엇을 | 핵심 |
|---|---|---|
| ① 위치 이동 | 사건을 끌어 자유 위치 | 포인터 이벤트(터치+마우스 통합 + `setPointerCapture`), `getScreenCTM().inverse()`로 화면 px→viewBox 매핑(반응형 스케일 자동 보정), 슬롯+두 라벨에 인라인 `transform="translate"` |
| ② 크기 | 사건 연속 스케일(0.5~2.0) | ① transform 확장 — `translate(dx,dy)·translate(cx,cy) scale(s) translate(-cx,-cy)` 중심 기준. 56px ±스테퍼(핸들 대신 시니어 폴백). 기존 S/M/L(의미 변형)과 공존 |
| ③ 메모 | 포스터에 한마디 자유 배치 | viewBox 자유 좌표(템플릿 무관·전환 유지). **별도 effect**가 `<g id="poster-memos">` 오버레이에 렌더(슬롯 effect와 격리). 드래그는 `dragRef.kind` 분기로 ① 인프라 재사용 — 슬롯 경로 무수정 |

### 5) C10 빈 슬롯 토큰 누수 가드

river 빈 슬롯의 `{year}/{title}` 리터럴이 크롬에서 노출됐다. 조사 결과 server render는 빈 라벨에 `display="none"`을 정상 부여(렌더 검증: 보임 0), globals.css에 덮는 룰도 없음 → **근본 원인 미확인**(stale 배포 추정). 통합 effect에 "{" 스윕(미주입 라벨을 인라인 style로 숨김)을 **방어적 가드**로 유지. zelkova는 빈 라벨에 "{" 없어 no-op.

### 경계 불변식 (전 슬라이스 공통)

| # | 불변식 | 확인 방법 |
|---|--------|-----------|
| 1 | `render.ts`/`mapping.ts` 무수정 | 매 슬라이스 `git diff --stat` = 0 |
| 2 | 클라·휘발성 | state만, 저장 X, 마이그 0 |
| 3 | 인라인 적용(C10 패턴) | `setAttribute`/`style` — CSS·presentation 충돌 회피 |
| 4 | 통합 effect idempotent | state→DOM 전량 재계산, 재주입·전환마다 안전 |
| 5 | 어르신 auto 경로 보존 | 편집 모드 기본 OFF → 드래그/스케일/메모 전부 비활성 |
| 6 | 미리보기 전용 | 서버 SVG(인쇄/PDF)는 원본 |

## Result

- 포스터 슬라이스 11커밋(`3a0d11b` T1 엔진 → `e1fc587` 크기 → ③ 메모). 전 구간 **엔진 diff 0**, 마이그 0, tsc+build 통과.
- T3-a "setState 업데이터 안 DOM 변경이 재렌더로 지워짐" 버그를 **useEffect 후처리(post-commit)**로 일원화 → 트릴로지 전체가 같은 패턴으로 안전.
- `key={active.id}`로 템플릿 전환 시 깨끗한 remount → stale mutation 폐기.
- state persist/reset 일관: 텍스트·사건 메모·포스터 메모는 **유지**(템플릿 무관), off/size/position/scale은 전환 시 **리셋**(슬롯 구성이 다름).
- 배포 함정 픽스: `outputFileTracingIncludes`를 `templates/**/*.svg` 글롭으로 — river 런타임 fs 로드가 Vercel 번들에서 누락되던 것 차단.
- **NUL 바이트 사고 교훈**: 메모 키 separator에 U+0000이 섞여 git이 `.tsx`를 바이너리로 오인(diff/blame 깨짐). 일반 공백 교체로 해소. 이후 커밋마다 `grep -caP '\x00'` 점검 루틴화.

## 대안

- **종마다 손 JSX 변환**: 디자인 동결·종 교체형과 정면 충돌(비주얼 드리프트·엔진 종속) → 기각. SVG 문자열 id 주입 채택.
- **편집 ② 모서리 핸들 드래그**: 1.2배 밀도 포스터의 작은 점은 시니어 터치 hit-test 취약 → 패널 56px 스테퍼로 폴백(스펙 승인).
- **메모를 슬롯 effect에 통합**: mega-effect 결합도↑·충돌 위험 → 별도 effect로 격리.
- **sephirot 강행(naive 매니페스트)**: 조용히 망가진 템플릿(변형·S/M/L 死) → 기각, STOP+재작업 요청.

## 후속

- **인쇄/PDF render.ts 굽기 (#8, 주문 슬라이스)** — 클라 편집(off·변형·위치·크기·텍스트)이 서버 SVG에 0 반영. 인쇄 전 굽기 목록: ①제외 슬롯 hide ②최종 변형 emit ③위치 transform ④스케일 transform ⑤텍스트 주입 ⑥빈 슬롯 토큰 **텍스트 제거** ⑦메모 포함 여부 결정. 클라 state→주문 payload 전달 경로 신설 필요.
- **sephirot flat 재작업** — 슬롯을 `<g id="slot-cN-eM" color><use x y w h/></g>` 단일 구조(중첩 g·#node·음수좌표 제거)로 받으면 매니페스트 1개로 합류.
- **복잡도 분리** — `PosterInteractive` ~880줄. 드래그 인프라 → `usePosterDrag` 훅, SVG 적용 → `useApplyToSvg`, 컨트롤 분리(데모 후).
- **접근성** — 위치 드래그 키보드 대안 부재, 크기 readout `aria-live` 미적용(편집 모드는 선택적 고급 기능, auto 경로 무영향).
- **stale 주석 정리** — `zelkova.ts`의 "bird-s/root-text 3branch에만"(현재 3종 마스터 모두 보유), 데모 스크립트 `birdDowngraded` 죽은 경로.
- **C10 견고화** — "{" 문자열 sniffing 대신 placement의 빈 슬롯 정보를 클라로 넘겨 정확히 숨기는 방식.
