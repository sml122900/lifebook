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
| 동기화 | 고정 id upsert. id = `` `v3_${lifeEventId}` ``. 원천(LifeEvent)에서 사라지거나 대상에서 빠진 것만 삭제. clear-and-rebuild 폐기(편집 override·연결 보존 위해) |
| 시점 | 온디맨드. `loadPosterEditor`·`buildPosterSnapshot` 2곳에서만 실행 |
| 대상 | CONFIRMED/CORRECTED 만, year null 제외(placeholder 연도 금지), BIRTH 행 생성 |
| 행 구성 | LifeEvent 당 1행, Episode 본문 병합. 인물 마커 미사용 |
| 본문 없는 사건(Episode 기준) | node 고정. P1 후보 단계 강제 + `savePosterSelections` 서버 거부 |
| 편집 | v3_bridge 행은 `updatePosterEventText` 차단, "원본 채팅에서 고쳐주세요" 안내 |
| 소유권 가드 | 4곳 화이트리스트에 v3_bridge 추가 |
| 무수정 | `getLifeEvents`·`getBirthYear` |
| 게이트 | `/poster` 는 findFirst 2회(life_event 행 존재 OR v3 확정 사건 연도 있음 존재). `/poster/order` 는 selections id 기준 count 1회로 유령 방어 |
| 삭제 시 | 브릿지 행 삭제 경로에서 연결된 사진 Storage 파일도 기존 삭제 유틸로 정리 |

### 구현 메모 (설계 → 코드 대응)

- 소유권 가드 4곳: `savePosterSelections` · `previewPosterSentence` · `savePosterOverrides` · `/poster/order` 게이트(`hasLiveSelections`). 공용 상수 `POSTER_EVENT_CREATED_VIA = ["life_event", "v3_bridge"]`.
- `getLifeEvents` 를 고치지 않으므로, 동기화 함수(`syncV3Bridge`)가 현재 브릿지 행을 돌려주고 두 실행 지점이 life_event 와 합쳐 쓴다.
- 동기화는 바뀐 행만 쓴다(정상 상태에서는 읽기 쿼리 3회 — LifeEvent·Episode·기존 브릿지 행, 쓰기 0회). 삭제는 DB 먼저, 사진 파일 정리는 그 뒤 `removeStorageObjects` 로(실패해도 포스터 화면은 막지 않고 로그만).
- 테스트에서 실제 코드를 부르도록 `savePosterSelections`·`updatePosterEventText` 본체를 userId 인자 함수로 `lib/poster/selections.ts` 에 옮기고, 서버 액션은 auth + revalidate 만 감싼다(`lib/life-event-query.ts` 와 같은 패턴).

### 알려진 한계

- `getBirthYear` 무수정이라 v3 전용 사용자의 시대 대사건 기준 연도는 "선택한 노드 중 가장 이른 연도"로 잡힌다(출생 노드를 고르면 출생 연도).
- 저장 후 Episode 가 지워져 본문이 없어진 사건이 이미 memo 로 저장돼 있으면, 다음에 `/poster/select` 를 열 때 node 로 바꿔 보여 주지만 그전 `/poster/view` 에서는 memo 로 그려질 수 있다.
- 탈퇴 안내 화면의 "기록 N개" 숫자(`app/account/delete/page.tsx`)에 브릿지 행도 포함된다.

## 결정 로그

| 날짜 | 결정 | 제안 | 결정자 |
|---|---|---|---|
| 2026-10-24 | 위 확정 설계 전체 (고정 id upsert, 온디맨드 2곳, 대상·행 구성, node 고정, 편집 차단, 가드 4곳, 게이트, 사진 정리) | Claude Code 조사(10/24) | 성민 |
| 2026-10-24 | v3_bridge 행은 가족 룸 목록(`listRoomMemories`)에서 제외 — episode 제외 결정과 일관, 가족 공유는 v3 공유 결정 때 별도 | Claude Code 조사(10/24) | 성민 |
| 2026-10-24 | "본문 없는 사건 node 고정"은 v3_bridge 행에만 적용(기존 life_event 사용자 동작 무변) | Claude Code 조사(10/24) | 성민 |
| 2026-10-24 | Episode 본문 병합은 실질 내용만(`isSubstantiveEpisodeContent`, 갭 감지기와 같은 기준). 안내문뿐이면 본문 없음 → node 고정 | Claude Code 조사(10/24) | 성민 |

## 작업

- [x] 설계 문서 저장
- [x] 구현 전 확인 — cuid 형식 가정 코드 없음, 설계 불일치 1건(가족 룸 노출) → 결정 반영
- [x] 구현
- [x] 회귀 `db/test-v3-poster-bridge.ts` 15항목 + v3 회귀 세트 14종 재실행
