# v3 → 포스터 브릿지

> 상태: 구현 완료 (2026-10-24) · 코드: `lib/poster/v3-bridge.ts` · 회귀: `db/test-v3-poster-bridge.ts`

## 문제

포스터 파이프라인(P1 후보 → P2 선택 → P3 문장 → P4 합성 → 주문 스냅샷)은 `UserMemory(createdVia="life_event")` 행만 읽는다.
v3 트랙 가입자의 인생 사건은 `LifeEvent`·`Episode` 에 있고 life_event 행이 없어서, 신규 V3 가입자는 `/poster` 에서 "연혁에 사건을 몇 개 적으면…" 빈 화면에 막힌다(막다른 길).

## 확정 설계

| 항목 | 결정 |
|---|---|
| 파일 | `lib/poster/v3-bridge.ts` |
| 태그 | `createdVia="v3_bridge"` |
| 동기화 | 고정 id upsert. id = `` `v3_${lifeEventId}` `` (구간 행은 `` `v3p_${episodeId}` ``). 원천(LifeEvent·Episode)에서 사라지거나 대상에서 빠진 것만 삭제. clear-and-rebuild 폐기(편집 override·연결 보존 위해) |
| 시점 | 온디맨드. `loadPosterEditor`·`buildPosterSnapshot` 2곳에서만 실행 |
| 대상 | CONFIRMED/CORRECTED 만, year null 제외(placeholder 연도 금지), BIRTH 행 생성 |
| 행 구성 | LifeEvent 당 1행, Episode 본문 병합(구간 이야기 `isPeriod=true` 는 제외). 인물 마커 미사용 |
| 구간 이야기 (2026-10-24 변경) | 구간 Episode 마다 별도 행 — 제목 = Episode 제목, 본문 = Episode 본문(실질 내용 있는 것만). 정렬 연도 = 앵커 사건 연도, 포스터 "연도 표시"를 켜도 연도 미표시. 기본 memo 후보(node 선택 허용). 앵커가 대상에서 빠지면 같이 제외. 편집 차단·가드·가족 룸 제외·탈퇴 집계 제외는 v3_bridge 규칙 그대로 |
| 본문 없는 사건(Episode 기준) | node 고정. P1 후보 단계 강제 + `savePosterSelections` 서버 거부 |
| 편집 | v3_bridge 행은 `updatePosterEventText` 차단, "원본 채팅에서 고쳐주세요" 안내 |
| 소유권 가드 | 4곳 화이트리스트에 v3_bridge 추가 |
| 무수정 | `getLifeEvents`·`getBirthYear` |
| 게이트 | `/poster` 는 findFirst 2회(life_event 행 존재 OR v3 확정 사건 연도 있음 존재). `/poster/order` 는 selections id 기준 count 1회로 유령 방어 |
| 삭제 시 | 브릿지 행 삭제 경로에서 연결된 사진 Storage 파일도 기존 삭제 유틸로 정리 |

### 구현 메모 (설계 → 코드 대응)

- 소유권 가드 4곳: `savePosterSelections` · `previewPosterSentence` · `savePosterOverrides` · `/poster/order` 게이트(`hasLiveSelections`). 공용 상수 `POSTER_EVENT_CREATED_VIA = ["life_event", "v3_bridge"]`. (미리보기는 2026-10-24 후속부터 시안과 같은 `loadEntries` — 본인 life_event·브릿지 행만 — 로 가드)
- `getLifeEvents` 를 고치지 않으므로, 동기화 함수(`syncV3Bridge`)가 현재 브릿지 행을 돌려주고 두 실행 지점이 life_event 와 합쳐 쓴다.
- 동기화는 바뀐 행만 쓴다(정상 상태에서는 읽기 쿼리 4회 — LifeEvent·Episode·Episode 의 메모리 제목·기존 브릿지 행, 쓰기 0회. 2026-10-24 픽스처 실측: 2·3회째 동기화 SELECT 4·행 버전(xmin) 변화 0). 삭제는 DB 먼저, 사진 파일 정리는 그 뒤 `removeStorageObjects` 로(실패해도 포스터 화면은 막지 않고 로그만).
- 구간 행의 "연도 미표시"는 주문 스냅샷(`buildPosterSnapshot`)에서 노드 연도를 `null` 로 두는 방식. 합성(`PosterCompose`)·인쇄(`print-export`)가 null 연도를 이미 빈 칸으로 그려 렌더러는 무수정. 시대 대사건 배치는 이 노드의 상자는 피하되 연도 보간에서만 뺀다. 사용자가 편집에서 연도를 직접 적으면(yearOverride) 그 값은 보인다.
- 테스트에서 실제 코드를 부르도록 `savePosterSelections`·`updatePosterEventText` 본체를 userId 인자 함수로 `lib/poster/selections.ts` 에 옮기고, 서버 액션은 auth + revalidate 만 감싼다(`lib/life-event-query.ts` 와 같은 패턴).

### 알려진 한계

- `getBirthYear` 무수정이라 v3 전용 사용자의 시대 대사건 기준 연도는 "선택한 노드 중 가장 이른 연도"로 잡힌다(출생 노드를 고르면 출생 연도).
- 저장 후 Episode 가 지워져 본문이 없어진 사건이 이미 memo 로 저장돼 있으면, 다음에 `/poster/select` 를 열 때 node 로 바꿔 보여 주지만 그전 `/poster/view` 에서는 memo 로 그려질 수 있다.
- ~~탈퇴 안내 화면의 "기록 N개" 숫자(`app/account/delete/page.tsx`)에 브릿지 행도 포함된다.~~ → 2026-10-24 후속에서 v3_bridge 제외.

## 포스터 AI 문장 고정 (2026-10-24)

계기: `/poster/select` 를 열 때마다 P1 후보 분류를, `/poster/view` 를 열 때마다·주문할 때마다 P3 문장을 AI 로 새로 만들어 요지·추천·포스터 문장이 매번 바뀌었다. 주문 파일 문장이 사용자가 마지막으로 본 시안과 다를 수 있었다. 코드: `lib/poster/ai-cache.ts`·`lib/poster/snapshot.ts`.

| 항목 | 결정 |
|---|---|
| P3 저장 | `Poster.selections` 항목마다 `generatedText`(노드=라벨·메모=문장)·`sourceHash`·`generatedAt`. 스키마 변경 0(JSON) |
| P3 원본 해시 | 문장 AI 입력 전부 — 제목·본문·연도 + 유형(node/memo) + 템플릿 |
| `/poster/view` | 해시가 맞는 항목은 저장 문장, 없거나 안 맞는 항목만 한 번에 생성해 저장 |
| 주문 | `createPendingPosterOrder` 는 AI 를 부르지 않고 저장 문장만 쓴다(`buildOrderSnapshot`). 저장 문장이 없거나 해시가 안 맞으면 거부 — "포스터 내용이 바뀌었어요. 시안을 다시 확인해 주세요." |
| 직접 고친 문구 | `override.textOverride` 가 최우선(렌더러가 그 문구를 그림, 기존 동작). 그런 항목은 원본이 바뀌어도 주문 통과 |
| P1 저장 | `Poster.design.candidateCache` = `{ inputHash, generatedAt, candidates }`. 입력(행 id·제목·본문·연도·카테고리) 해시가 같으면 AI 호출 0 |
| 실패 결과 | AI 호출 실패·응답 해석 실패로 기본값이 나온 결과는 저장하지 않는다(다음 로드에 다시 시도). P3 는 항목 단위 — 응답에서 빠지거나 필드가 비어 기본값이 들어간 항목만 저장하지 않고 다음 로드에 그 항목만 다시 만든다(후속) |
| 선택 화면 미리보기 (후속) | 지금 고른 유형(노드/메모)의 문장. 같은 항목의 저장 문장(selections → 미리보기 보관함 순)이 원본 해시와 맞으면 그대로(AI 0), 없거나 안 맞으면 만들어 저장 — 선택에 있는 항목은 selections(시안과 같은 경로), 아직 없는 항목은 `Poster.design.previewSentences` 에 보관했다가 선택 저장 때 같은 항목(eventId+유형)이면 selections 로 옮겨 붙인다 |
| 로딩 | `app/poster/select/loading.tsx` 스켈레톤 + "이 디자인으로 만들기" 누르면 disabled·"저장 중…" |

### 구현 메모

- 생성 문장은 서버만 채운다. 선택 저장(`persistPosterSelections`)·편집 저장(`persistPosterOverrides`)은 같은 항목(eventId+type)의 기존 문장을 DB 에서 잇고, 클라가 보낸 값은 쓰지 않는다.
- 편집 저장 본체를 `lib/poster/selections.ts` 로 옮겼다(선택 저장과 같은 패턴 — 서버 액션은 auth·revalidate 만).
- 새 문장 저장은 DB 의 selections 를 다시 읽어 같은 항목에만 붙인다(그사이 바뀐 선택·편집을 덮지 않게).
- `startPosterOrder` 는 실패를 throw 대신 결과값으로 돌려준다. 운영 빌드는 서버 액션이 던진 오류 메시지를 일반 문구로 가려서 안내가 화면에 안 보이기 때문.
- (후속) 미리보기 본체는 `buildPreviewSentence`(snapshot.ts). 시안·주문과 같은 `loadEntries`(getLifeEvents 의 표시 문장 + 동기화한 브릿지 행)로 입력을 만들어 해시가 시안과 같다 — 예전 미리보기는 DB 원문을 읽어 다듬은 글을 쓰는 사건에서 시안과 입력이 달랐다. 서버 액션은 `previewPosterSentence(eventId, type)`, 결과는 그 유형 문장 하나. 클라는 미리보기 유형이 지금 고른 유형과 같을 때만 보여 준다(유형을 바꾸면 다시 누름).
- (후속) 단건 `refineForPoster` 는 쓰는 곳이 없어져 삭제. `refineForPosterBatch` 는 항목별 `fromAi: boolean[]` 를 돌려준다(노드 라벨·메모 문장이 둘 다 응답에 있어야 true).
- (후속) 회귀의 항목 누락·미리보기 검사는 테스트가 전역 fetch 를 감싸 Anthropic 응답을 스텁으로 돌려준다(SDK 가 클라이언트를 처음 만들 때 fetch 를 잡아 두므로 첫 AI 호출 전에 감쌈). 실제 Sonnet 호출 수는 그대로 4회.

### 알려진 한계

- ~~응답 배열은 읽었지만 그중 한 항목만 빠진 경우 그 항목의 기본값(제목·본문 그대로)은 저장된다.~~ → 후속에서 항목 단위로 저장 안 함.
- ~~선택 화면의 "문장 미리보기"는 그대로 매번 새로 만든다.~~ → 후속에서 시안과 같은 저장 문장.
- 미리보기 보관함(`design.previewSentences`)은 지우지 않는다. 키가 사건·유형 단위라 사건 수 × 2 를 넘지 않고, 원본이 바뀐 문장은 해시 비교로 걸러진다.
- P1 은 한 번의 호출로 전체를 분류하므로 행 하나만 바뀌어도 전체를 다시 분류한다. 템플릿을 바꾸면 P3 문장도 전부 다시 만든다.
- 배포 전에 만든 포스터는 저장 문장이 없어서, 시안을 한 번 다시 열기 전까지는 주문이 거부된다(안내 문구 표시).
- `Poster.design` 은 이름과 달리 지금은 P1 캐시만 담는다(P5 가 별도 컬럼을 써서 비어 있던 자리).

## 결정 로그

| 날짜 | 결정 | 제안 | 결정자 |
|---|---|---|---|
| 2026-10-24 | 위 확정 설계 전체 (고정 id upsert, 온디맨드 2곳, 대상·행 구성, node 고정, 편집 차단, 가드 4곳, 게이트, 사진 정리) | Claude Code 조사(10/24) | 성민 |
| 2026-10-24 | v3_bridge 행은 가족 룸 목록(`listRoomMemories`)에서 제외 — episode 제외 결정과 일관, 가족 공유는 v3 공유 결정 때 별도 | Claude Code 조사(10/24) | 성민 |
| 2026-10-24 | "본문 없는 사건 node 고정"은 v3_bridge 행에만 적용(기존 life_event 사용자 동작 무변) | Claude Code 조사(10/24) | 성민 |
| 2026-10-24 | Episode 본문 병합은 실질 내용만(`isSubstantiveEpisodeContent`, 갭 감지기와 같은 기준). 안내문뿐이면 본문 없음 → node 고정 | Claude Code 조사(10/24) | 성민 |
| 2026-10-24 | 구간 이야기(isPeriod) 별도 행 분리 — 앵커 본문 병합에서 제외, Episode 마다 `v3p_${episodeId}` 행(제목·본문 = Episode), 정렬 연도 = 앵커·연도 미표시, 기본 memo 후보, 앵커 제외 시 같이 제외. 계기: test30 E2E 에서 "군 입대" 항목에 "군 입대 이후" 구간의 이직 이야기가 섞임 | Claude Code | 성민 |
| 2026-10-24 | 포스터 AI 문장 고정 — P3 문장을 selections 항목에 원본 해시와 저장(시안은 해시 불일치·없음만 생성, 주문은 저장 문장만·불일치면 거부, 직접 고친 문구 최우선), P1 후보는 입력 해시 캐시, 선택 화면 로딩 표시. 계기: 매 로드 재생성으로 요지·추천·문장이 바뀌고 주문 문장이 직전 시안과 다를 수 있었음 | Claude Code | 성민 |
| 2026-10-24 | 위 세부 — P1 캐시 저장 위치는 비어 있던 `Poster.design` 재사용(스키마 변경 0) / 해시는 AI 입력 전부(P3 에 연도, P1 에 카테고리 추가) / 거부 문구 "포스터 내용이 바뀌었어요. 시안을 다시 확인해 주세요." / 주문 오류는 결과값 반환(운영 오류 메시지 가림 대응) | Claude Code | 성민 |
| 2026-10-24 | 문장 고정 후속 — P3 응답에서 빠진 항목은 그 항목만 저장 안 함(다음 로드에 재생성) / 선택 화면 미리보기는 시안과 같은 저장 문장(해시 일치 시 AI 0), 생성 결과는 시안과 같은 경로(selections)에 저장하되 아직 선택에 없는 항목은 `Poster.design.previewSentences` 에 보관했다가 선택 저장 때 이어 붙임 | Claude Code | 성민 |

## 작업

- [x] 설계 문서 저장
- [x] 구현 전 확인 — cuid 형식 가정 코드 없음, 설계 불일치 1건(가족 룸 노출) → 결정 반영
- [x] 구현
- [x] 회귀 `db/test-v3-poster-bridge.ts` 15항목 + v3 회귀 세트 14종 재실행
- [x] 구간 이야기 별도 행 분리 + 회귀 5항목 추가(총 20항목)
- [x] 포스터 AI 문장 고정(P3 저장·주문 고정·P1 캐시·로딩 표시) + 회귀 6항목 추가(총 26항목)
- [x] 문장 고정 후속(응답 항목 누락 미저장·미리보기 = 시안 문장) + 회귀 3항목 추가(총 29항목)
