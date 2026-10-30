# 노드 그래프 + 자아 메뉴 — 설계

- 상태: **설계 확정(§7 결정 2026-10-30) · 1단계(데이터 층) 완료 2026-10-30** — 결과는 §6 "1단계 구현 결과". 2단계(노드 화면·직접 작성) 대기. 자아 메뉴 테이블은 3단계 마이그.
- 작성: 2026-10-30 · Claude Code (성민 요청). 직전 조사(같은 날, 노드 구조 사전 조사) 후속.
- 결정(성민, 제안: 리뷰 채팅): 중간안 — 기존 테이블(`LifeEvent`·`Episode`·`Person`)을 원본으로 두고 id 보존 + 범용 연결 테이블 1개. 중심노드 같은 유형 여러 개·끝 연도, 사건노드 자체 연도·여러 인물/장소, 장소 독립 개체(MemoryPlace 이관·중복 병합), 인물 그룹, "그때의 나" = 이야기(Episode)의 한 종류, 자아 메뉴 = 별도 해석 층(근거 인용 필수·사용자 승인·진단/성격유형 꼬리표 금지), 노드별 블로그식 직접 작성(사진 본문 삽입, 기존 평문 그대로 읽힘), 포스터 무기한 연기(깨지지만 않게).
- 화면 문구는 새로 쓰지 않는다. 자리는 `[문구 필요: 위치]` 로 적고 §4.5 에 모았다.
- 운영 수치는 2026-10-30 운영 DB 집계(count·groupBy 만, 실고객 `sml122900` 계정 2개 제외). 표본이 작다(이야기 86건, V3 사용자 3명).

## 0. 요약

- **원본은 그대로, 연결만 새로.** `LifeEvent`(중심·직접 추가 사건)·`Episode`(이야기·그때의 나)·`Person`(인물)은 id 그대로 원본으로 남는다. 새 테이블은 `Place`·`PersonGroup`(+구성원)·`NodeLink`(범용 다대다)·`NodeBody`(블로그 본문) 네 묶음이 1단계, `SelfAspect`(+근거·실행 기록)는 3단계. 기존 테이블은 컬럼 추가만(§1.3).
- **한 쌍은 한 곳에만 저장**한다. 이미 있는 연결(인물↔중심 `PersonLifeEvent`, 이야기의 대상 인물 `Episode.personId`, 이야기의 장소 `MemoryPlace`)은 그 자리에 두고, 새로 생기는 쌍만 `NodeLink` 에 둔다(§1.5).
- **연결 정리는 DB 트리거**로 한다. 이야기는 앱 코드가 아니라 cascade(브릿지 메모리·중심 삭제)로도 지워지기 때문에, 앱 코드 정리만으로는 고아 연결이 남는다(§1.6).
- **본문 평문은 계속 단일 출처로 유지**한다. 블로그 본문(블록 JSON)을 저장하면 평문을 같이 갱신해 포스터·lab·다듬기·가족 룸은 지금처럼 평문만 읽는다(§1.8).
- **자아 메뉴는 lab R3(자기 모델) 설계를 거의 그대로** 가져온다 — 근거 인용 검증(`locateQuote`)·카드 검색·통합 실행기·"확정은 사용자만" 규칙. 바뀌는 것은 근거 원본(카드 → 이야기 인용)과 운영 키·원가 기록(§2).
- 비용(추정): 이야기 정리 제안 1회 ≈ $0.009(기존 인물 추출 1회를 대체하면 순증 ≈ $0.003), 자아 제안 1회 ≈ $0.03, 사용자당 첫 자아 메뉴 ≈ $0.1~0.3(§3.3).
- **처리방침 개정이 3단계의 선행 조건**이다. 자아 추천은 일반적 의미의 프로파일링에 해당한다고 보는 게 안전하고, 현 방침 1항(민감정보)·2항(이용 목적)·3항(국외 이전 — 임베딩 업체 Voyage AI 미기재)과 맞춰야 한다(§5).
- 단계: 1단계 데이터 층(화면 변화 0, 기존 기능 무손상) → 2단계 노드 화면·직접 작성 → 3단계 자아 메뉴(§6).

---

## 1. 데이터 모델

### 1.1 원칙

1. **원본 유지·id 보존** — `LifeEvent`·`Episode`·`Person` 행과 id 를 옮기지 않는다. 포스터 브릿지 id(`v3_<lifeEventId>`·`v3p_<episodeId>`)·인터뷰 문항 키(`gap:episode:<lifeEventId>` 등)·lab 원장(`MemorySourceUnit.sourceId`)이 전부 이 id 에 걸려 있다.
2. **한 쌍 = 한 저장 위치.** 같은 연결을 두 곳에 쓰지 않는다(§1.5 표가 단일 기준).
3. **추가만 하는 마이그레이션** — 1단계 마이그는 테이블·nullable 컬럼·트리거 추가뿐. 기존 컬럼 삭제·이름 변경 없음.
4. **평문 본문 유지** — `Episode.content`·브릿지 `UserMemory.content` 는 계속 평문 단일 출처. 리치 본문은 그 위의 표현 층.
5. **새 테이블은 전부 `userId` FK `onDelete: Cascade`** — 탈퇴(`deleteAccountTx`)가 손대지 않아도 정리된다(CLAUDE.md 탈퇴 결정 2026-09-01 패턴).

### 1.2 노드 4종 + 해석 층 — 저장 위치

| 구분 | 저장 위치 | 비고 |
|---|---|---|
| 중심노드 | `LifeEvent`(type ≠ CUSTOM) | 같은 유형 여러 개 허용(§1.3), 끝 연도 추가 |
| 사건노드 | `Episode`(kind=STORY) · `LifeEvent`(CUSTOM) | 이야기는 반드시 중심 하나에 소속(`lifeEventId`), 다른 중심에도 걸칠 수 있음(`NodeLink`) |
| 그때의 나(원재료) | `Episode`(kind=SELF) | 중심에 소속 + 인물·그룹 연결. 사건노드와 같은 테이블·같은 저장 경로 |
| 인물노드 | `Person`(subjectType=person) | 그룹은 `PersonGroup` 신설 |
| 장소노드 | `Place` 신설 | `MemoryPlace` 34건을 이관(§1.7) |
| 자아 메뉴(해석 층) | `SelfAspect` 신설(3단계 마이그) | 원재료가 아니라 해석. 근거는 이야기 인용 |

### 1.3 기존 테이블 변경(컬럼 추가만)

| 테이블 | 추가 | 의미·규칙 |
|---|---|---|
| `LifeEvent` | `endYear Int?` | 중심의 끝 연도. null 이면 지금처럼 "다음 골격 연도 직전"으로 추정(lab `period.ts`·`gap-detector` 의 time_gap). 정정 칸은 두지 않는다(Q2) |
| `Episode` | `kind EpisodeKind @default(STORY)` (STORY·SELF) | 기존 86건은 기본값 STORY. `isPeriod`(구간 이야기)와 독립 |
| `Episode` | `year Int?` · `endYear Int?` | 이야기 자체 연도. null = 지금처럼 중심 연도 상속 |
| `MemoryPlace` | `placeId String?` → `Place` (SetNull) | 이관·병합 결과. v2 화면은 이 컬럼을 몰라도 그대로 동작 |

**같은 유형 여러 개(Q1 — 이름으로 구분).** 스키마·DB 에 유형별 유니크가 없다 — 운영 DB 카탈로그 확인(2026-10-30): `LifeEvent` 인덱스는 기본 키·`(userId, sequenceOrder)` 일반 인덱스뿐, 제약은 기본 키·사용자 FK 뿐, 트리거 0. 그래서 **제약 제거 SQL 은 필요 없다**. 운영에서 같은 사용자·같은 골격 유형 2개 이상 = 0건. 막는 것은 코드의 "유형당 1개" 가정이고, 두 번째 중심을 만드는 화면·AI 정리는 2단계부터라 1단계에서는 아래 표의 "1단계" 항목만 고친다.

| 위치 | 가정 | 바꿀 것 | 시점 |
|---|---|---|---|
| `lib/interview/plan.ts:59·140` `confirmedEventByType`·`firstByType`(`Map<LifeEventType, string>`, 먼저 나온 1개) | 유형 → 사건 1개 | 유형 → 사건 목록, 질문 풀 문항은 사건별로 후보화 | 1단계 |
| `lib/interview/session.ts:70` `resolveTarget` `findFirst({ type: q.anchor })` | 유형으로 사건 1개 조회 | 계획 때 고정한 사건 id 로 조회 | 1단계 |
| `lib/lab/context.ts:56` `skeleton.find(type === "BIRTH")` | 출생 1개 | 그대로(출생은 1개 고정 — Q1) | — |
| `lib/lab/context.ts:63~` 시기 앵커 `anchors[stage]`(단계당 1개, 먼저 나온 것) | 시기당 1개 | 두 번째 직장 등은 앵커에 안 들어감 → 단계당 목록 또는 끝 연도 반영 | 3단계(lab 승격 때) |
| `lib/gap-detector.ts` time_gap | 연도순 정렬 | 영향 없음(여러 개여도 정렬로 처리) | — |
| 골격 생성 `app/actions/onboarding.ts` `generateSkeleton` | 유형당 1개 생성 | 그대로. 두 번째부터는 사용자·AI 정리로 추가 | — |
| 유형 기반 문장 `lib/episode-opening.ts`(FIRST_JOB = "처음 일하셨을 때…")·`buildPersonAskPrompt`·`gap-detector` 문장 | 유형 이름 그대로 | 두 번째 직장에 "처음" 문장이 나가지 않게 라벨 기반으로 | 2단계(두 번째 중심을 만들 수 있게 될 때) |
| `lib/poster/v3-bridge.ts` `CATEGORY_BY_TYPE`·`lib/lab/period.ts` 유형→단계 표 | 유형 → 값 | 영향 없음(같은 유형은 같은 값) | — |

### 1.4 새 테이블

```
Place               id, userId(→User Cascade), name, address?, lat?, lng?, source?("naver"|"google"),
                    memo?, createdAt, updatedAt                       @@index([userId])
                    — 이름 유니크 없음("우리 집"·"할머니 댁"처럼 동명 다른 곳이 있다)

PersonGroup         id, userId(Cascade), name, memo?, createdAt, updatedAt   @@index([userId])
PersonGroupMember   id, groupId(→PersonGroup Cascade), personId(→Person Cascade), userId, createdAt
                    @@unique([groupId, personId])

NodeLink            id, userId(Cascade), fromType NodeType, fromId, toType NodeType, toId,
                    role String @default(""), status LinkStatus @default(CONFIRMED)  -- PROPOSED|CONFIRMED
                    source String @default("USER")  -- USER|AI|MIGRATION, createdAt, confirmedAt?
                    @@unique([fromType, fromId, toType, toId, role])  @@index([toType, toId])  @@index([userId])
                    CHECK NodeLink_direction_check(방향 규칙, 마이그 SQL 에만)
enum NodeType       LIFE_EVENT EPISODE PERSON_GROUP PERSON PLACE   -- 선언 순서 = 방향 순위. SELF_ASPECT 는 3단계에 추가

NodeBody            id, userId(Cascade), nodeType NodeType, nodeId, doc Json, plainText Text,
                    memoryId?(→UserMemory, 사진 첨부용 브릿지), version Int, updatedAt
                    @@unique([nodeType, nodeId])

── 아래는 3단계 마이그레이션(1단계 제외) ──
SelfAspect          id, userId(Cascade), name, description, yearFrom?, yearTo?,
                    lifeEventId?(→LifeEvent SetNull, 주 시기), status SelfAspectStatus,
                    origin String(AI|USER), userEdited Boolean, needsRecheck Boolean,
                    nameEmbedding vector(1024)?, runId?, decidedAt?, createdAt, updatedAt
                    @@index([userId, status])
enum SelfAspectStatus PROPOSED CONFIRMED REJECTED USER_WRITTEN   -- 화면: AI 제안/확정/거절/사용자 작성
SelfAspectEvidence  id, aspectId(→SelfAspect Cascade), episodeId(→Episode Cascade),
                    quoteField(content|rawTranscript), quote, quoteStart, quoteEnd,
                    cardId?(→MemoryCard SetNull), createdAt
                    @@unique([aspectId, episodeId, quoteStart])
SelfAspectRun       id, userId(Cascade), status RUNNING|DONE|FAILED, watermark, model,
                    inputTokens, outputTokens, cacheRead?, costMicroUsd,
                    proposed, blocked, error?, startedAt, finishedAt?
```

- **방향 규칙(`NodeLink`, 확정)**: 노드 종류 순위 **`LIFE_EVENT` > `EPISODE` > `PERSON_GROUP` > `PERSON` > `PLACE`**(3단계에 `SELF_ASPECT` 를 맨 위에 추가 예정)에서 상위가 `from`. 같은 종류끼리는 **id 사전순(바이트 순)으로 앞선 쪽이 `from`**, 자기 자신과의 연결은 거부. 그래서 A→B 와 B→A 는 같은 행이 된다.
  - 생성은 `lib/node-graph.ts` 의 저장 함수 **하나로만**: 방향 정규화 → 양 끝 존재·같은 소유자 확인(다른 사용자 노드면 거부) → upsert(유니크 충돌은 같은 행으로 합침).
  - DB 방어선: `CHECK NodeLink_direction_check` — Postgres enum 비교는 선언 순서를 따르므로 `"fromType" < "toType"`(= from 이 상위) 또는 같은 종류이면 `"fromId" COLLATE "C" < "toId" COLLATE "C"`. DB 기본 정렬(en_US.UTF-8) 대신 바이트 순으로 비교해 JS 문자열 비교와 같게 한다. 그래서 `NodeType` 은 **선언 순서 = 순위**로 두고, 값을 추가할 때는 `ALTER TYPE … ADD VALUE … BEFORE/AFTER` 로 순위 자리에 넣고 lib 순위표도 같이 고친다.
- **`role`**: 같은 두 노드 사이 의미 구분용(예: 장소 `AT`=그곳에서 / `FROM`=그곳 출신). null 대신 `""`(일반 연결) 기본값 — Postgres 유니크는 null 끼리 다르게 봐 중복을 못 막는다. 1단계는 `""` 만(Q4).
- **`status`**: AI 정리 결과는 PROPOSED 로 들어가고 사용자가 확인하면 CONFIRMED(§3.1). 노드 화면은 PROPOSED 를 흐리게(점선) 보여 주거나 숨긴다.
- **`SelfAspectEvidence` 는 `NodeLink` 가 아니라 전용 테이블** — 인용 위치(시작·끝)가 필요하고, 이야기가 지워지면 FK cascade 로 근거가 같이 지워져야 해서 타입 있는 FK 가 맞다.
- **`cardId` 는 보조** — 카드는 재추출로 id 가 바뀔 수 있다(lab §12 "재추출로 카드 id 가 바뀌면 답변 기록이 비워짐"). 근거의 원본은 `episodeId + quote 위치 + 인용 문자열 스냅샷`.

### 1.5 쌍별 저장 위치(단일 기준)

| 쌍(from → to) | 저장 위치 | 상태 |
|---|---|---|
| 중심 → 이야기(주 소속) | `Episode.lifeEventId` | 기존(FK Cascade) |
| 중심 → 이야기(추가 소속, 여러 시기에 걸친 이야기) | `NodeLink(LIFE_EVENT→EPISODE)` | 신규 |
| 중심·직접 추가 사건 → 인물 | `PersonLifeEvent` | 기존(42건) |
| 이야기 → 대상 인물(1명) | `Episode.personId` | 기존(36건) — person_episode 갭·대기 대화가 이 값을 쓴다 |
| 이야기 → 함께 나온 인물(여러 명) | `NodeLink(EPISODE→PERSON)` | 신규(§7 Q5) |
| 이야기 → 장소 | `MemoryPlace`(브릿지 메모리) + `placeId` | 기존 확장 |
| 중심 → 장소 / 인물 → 장소 | `NodeLink(LIFE_EVENT→PLACE)` / `(PERSON→PLACE)` | 신규 |
| 그룹 → 인물 | `PersonGroupMember` | 신규(FK) |
| 중심·이야기 → 그룹 | `NodeLink(LIFE_EVENT|EPISODE→PERSON_GROUP)` | 신규 |
| 자아 → 중심·인물·그룹·장소 | `NodeLink(SELF_ASPECT→*)` | 3단계 |
| 자아 → 근거 이야기 | `SelfAspectEvidence` | 3단계(FK) |
| 노드 → 블로그 본문 | `NodeBody(nodeType,nodeId)` | 신규(이야기는 §1.8 동기화 규칙) |

### 1.6 무결성 — 삭제 시 연결 정리

`NodeLink`·`NodeBody` 는 여러 테이블을 가리키는 다형 연결이라 FK 를 걸 수 없다(lab `MemoryCard` 와 같은 처지). 정리 방법:

1. **노드 삭제 → DB 트리거.** `LifeEvent`·`Episode`·`PersonGroup`·`Person`·`Place` 각각에(1단계 5개, `SelfAspect` 는 3단계에 추가) `AFTER DELETE` 트리거를 두고 `NodeLink` 의 양쪽 끝(`fromType/fromId`, `toType/toId`)과 `NodeBody(nodeType,nodeId)` 를 지운다. **앱 코드 정리로는 안 되는 이유**: 이야기는 `deleteEpisode` 가 브릿지 `UserMemory` 를 지우면 cascade 로 지워지고(`lib/episode.ts:93`), 직접 추가 사건(CUSTOM)을 지우면 그 이야기들도 cascade 로 지워진다 — 앱은 cascade 로 지워진 행을 모른다. Prisma 는 트리거를 표현하지 못하므로 마이그 SQL 에만 두고 schema 주석에 적는다(era_event partial unique 와 같은 처리).
2. **탈퇴 → `userId` FK Cascade.** 새 테이블 전부. `deleteAccountTx` 무수정, `db/test-withdrawal.ts` 에 시나리오 추가(새 테이블 행을 만든 뒤 탈퇴 → 0행).
3. **쓰기 → 저장 함수 1곳.** `lib/node-graph.ts` 의 저장 함수 하나가 방향 정규화(§1.4)·두 끝 존재·같은 소유자·허용 쌍(§1.5)을 검사하고 upsert 한다(역방향 요청·재요청은 같은 행으로 합쳐짐). 다른 경로의 `nodeLink.create` 는 쓰지 않는다.
4. **`NodeBody` 의 사진.** 본문 사진은 `NodeBody.memoryId` 브릿지 `UserMemory`(createdVia `node_body`)에 붙인다 — 사진 업로드·GPS 제거·signed URL 파이프라인을 그대로 쓰기 위해서. 노드가 지워지면 트리거가 `NodeBody` 와 브릿지 메모리를 지우고(사진 DB 행은 cascade), Storage 파일은 `db/reconcile-storage.ts` 확장(현존 계정의 미참조 파일까지)이 정리한다. 이야기 노드는 새 브릿지 없이 기존 이야기 브릿지 메모리를 쓴다.
5. **정합 점검 스크립트** — `db/reconcile-node-links.ts`(기본 dry-run): 끝이 없는 연결·소유자 불일치 연결 수를 센다. 트리거가 있으면 0 이어야 한다.
6. **가족 룸** — `node_body` 브릿지 메모리를 `listRoomMemories` 제외 목록에 추가(현재 photo·episode·v3_bridge 제외, `lib/rooms.ts:163`). 자아 메뉴는 비공개 고정(§7 Q15).

### 1.7 장소 이관 — `MemoryPlace` 34건

운영 집계: `MemoryPlace` 34행(이야기 브릿지 17·v2 사건 12·사진 5), 좌표 있는 행 0, 사용자별 고유 장소명 20개, **같은 이름이 2곳 이상 메모리에 있는 묶음 6개(20행)**. `Person(subjectType=location)` 0건.

- 병합 키: (사용자, 공백 정규화한 장소명). 좌표가 전부 없어 이름만 비교된다. 주소가 다르면 병합하지 않고 후보로만 표시.
- 결과: `Place` 20행 — 묶음 6개(20행 → 6곳) + 단독 14곳. 각 `MemoryPlace.placeId` 를 채운다(행은 지우지 않음 — v2 화면 무수정).
- 절차: `db/migrate-places.ts` 기본 dry-run(묶음별 개수만 출력, 장소명 원문 미출력) → 성민 확인 → `--apply`. 멱등(이미 `placeId` 가 있으면 건너뜀).
- 이후 쓰기: 장소 선택 UI 가 고른 `Place` 를 재사용하고 `MemoryPlace` 에 `placeId` 를 같이 쓴다. 새 이름이면 `Place` 를 만든다.
- 남는 것: `LifeProfile.residencePlaces/schoolPlaces`(JSON, 소비처 없음)는 이관하지 않는다(§7 Q7). `Person` location 생성 경로는 2단계에서 `Place` 로 돌린다(§7 Q7).

### 1.8 블로그 본문(리치 텍스트)

- **형식**: 블록 배열 JSON — `{ v: 1, blocks: [{ type: "paragraph", text }, { type: "photo", photoId, caption? }, { type: "heading", text }] }`. 굵게·목록 같은 글자 서식은 1차 범위 밖(시니어 편집 단순화·에디터 라이브러리 의존 0 — 현재 저장소에 리치 텍스트 라이브러리 없음)(§7 Q8).
- **평문 동기화**: 저장 함수 1곳이 `doc` → `plainText`(문단·소제목을 빈 줄로 이음, 사진은 캡션만)를 만들고, **이야기 노드는 같은 트랜잭션에서 `Episode.content`·브릿지 `UserMemory.content` 를 그 평문으로 갱신**한다(기존 `updateEpisodeContent` 경로). 그래서 포스터 브릿지·lab 원천·다듬기·story-review 는 무수정.
- **기존 평문 그대로 읽힘**: `NodeBody` 가 없으면 `content` 를 빈 줄 기준 문단으로 나눠 보여 준다(이관 없음). 처음 편집해 저장할 때 `NodeBody` 가 생긴다.
- **사진 블록**: `photoId` 는 그 노드의 브릿지 메모리에 붙은 `Photo` 만 허용(소유 검사). 사진이 지워지면 블록은 "사진이 지워졌어요" 자리표시로 보이고 다음 저장 때 빠진다. [문구 필요: 지워진 사진 자리]
- **알려진 결함 주의**: `updateEpisodeContent` 가 다듬기 3필드를 초기화하지 않는 운영 결함(CLAUDE.md 2026-09-30)이 블로그 저장에서도 그대로 재현된다. 2단계 전에 함께 고칠지 §7 Q9.

---

## 2. lab 재사용

### 2.1 구성요소별

| lab 구성요소 | 자아 추천에서 | 바꿀 것 |
|---|---|---|
| `sources.ts` 원천 어댑터(7종) | 그대로 — EPISODE 어댑터가 STORY·SELF 이야기를 모두 읽는다 | `kind`·자체 연도(`Episode.year ?? 중심`)·`NodeLink` 인물·장소를 메타·해시에 반영. `EXTRACTOR_VERSION` 올림 → 전체 재추출 1회 |
| `extract.ts` `locateQuote`(인용이 원문 연속 부분문자열인지 + 대화 원문은 `[본인]` 발화만) | **그대로** — 자아 근거 인용 검증의 핵심 | 없음 |
| `MemoryCard`(kind EVENT·FACT·PREFERENCE·FEELING·ROUTINE·RELATION, 인물·시기 메타) | 근거 후보 색인으로 그대로(운영 카드 204장 중 RELATION 27·FEELING 15) | 없음. 근거 원본은 카드가 아니라 이야기 인용(§1.4) |
| `search.ts`(벡터+키워드 RRF, 조회 시점 원본 생존 확인 `aliveSourceKeys`) | 그대로 — 시기·인물별 근거 카드 끌어오기 | 없음(사용자당 수백 장이라 벡터 인덱스 불필요) |
| `period.ts`·`context.ts`(시기 해석) | 그대로 | 중심 `endYear` 가 있으면 추정(`STAGE_DURATION`) 대신 실제 값 |
| `agent.ts` 도구 루프·`submit_answer` 강제 | 구조만 참고 — 자아 추천은 질의응답이 아니라 **통합 실행기**(R3 설계, 아래) | `list_hypotheses`(지금은 빈 목록)를 `SelfAspect` 조회로 연결 |
| `answer.ts` 검증기(주장마다 인용 카드 필수, 불일치 주장은 버림) | 원리 그대로 — 제안마다 근거 인용 1개 이상, 검증 실패한 제안은 저장 안 함 | 검증 대상이 카드 id → 이야기 인용 위치 |
| `judge.ts`(주장 근거 판정, 보조 지표) | 도그푸딩 평가에만 | 운영 경로에는 넣지 않음(원가) |
| `usage.ts` 원가 계산·월 예산 가드 | 계산식 그대로 | 운영 원가는 `SelfAspectRun` 에 기록(LabUsage 는 연구용 유지) |
| R3 자기 모델 설계(`phase/기억에이전트_R1-R4_기획.md` §4, 미구현) | **`SelfAspect` 로 대체해 채택** — "확정·거절은 사용자만", 거절 유사 재제안 차단(임베딩 코사인 ≥0.88), 민감정보 가설 금지, 주어는 화자만, 신뢰도 숫자 없음, 사용자당 실행 1건, 새 카드 0장이면 LLM 0회 | 도메인(LIKE·STRENGTH…) 대신 **시기 × 관계** 축. 상태 6종 → 4종(§7 Q16) |

### 2.2 진단·성격유형 꼬리표 금지

- 프롬프트 금지 + **코드 필터**(R3 규칙 7 "프롬프트 + 코드 키워드 필터" 와 같은 2중). 필터 대상 예: 진단명(우울증·불안장애·ADHD·치매 등 `-증`·`-장애`), 성격유형(MBTI 4글자, 애니어그램 n유형, 혈액형 성격, 내향형·외향형 같은 유형 단정), 건강·종교·정치·성적 지향. 걸리면 그 제안은 저장하지 않고 `SelfAspectRun.blocked` 로 센다. 목록 확정은 §7 Q17.
- 이름·설명은 근거 이야기에 나온 장면·행동 기반 서술만("선생님 앞에서는 말수가 적던 나" 류). 평가·점수·등급 금지.
- 주어는 본인만. 인물·그룹은 "누구와 있을 때"의 맥락으로만 연결하고, 타인에 대한 평가 문장은 만들지 않는다.

### 2.3 운영 승격 시 격리(LAB_*) 해제 범위

| 항목 | 지금(lab) | 자아 메뉴 운영 경로 |
|---|---|---|
| 접근 | `LAB_ALLOWED_USER_IDS` + proxy·화면·액션 3중 게이트 | 새 운영 경로(로그인·동의 사용자 본인만). **`/lab` 연구실 자체 격리는 그대로 유지** |
| 대상 | 본인 + `lab_persona_*` | 본인만(페르소나 대상 선택 없음) |
| LLM 키 | `LAB_ANTHROPIC_API_KEY` 전용(`lib/lab/llm.ts` 는 운영 키로 대체 금지) | 운영 키(`lib/ai.ts` `chat` + `trackAiUsage`). 추출기·통합기에 호출자를 주입(`agent.ts` 에 이미 `ModelCaller` 타입이 있음) — lab 래퍼는 그대로 |
| 원가 | `LabUsage` + `LAB_MONTHLY_BUDGET_USD`(기본 $30) | `SelfAspectRun` 에 실행별 기록. 전역 예산 가드·사용자 토큰 차감 여부는 §7 Q12 |
| 임베딩 | Voyage AI(`voyage-3.5`, `VOYAGE_API_KEY`) | **처리방침 국외 이전 목록에 Voyage AI 없음**(§5) → 처리방침 v1.2 국외 이전에 추가(Q14 결정, 3단계 전 개정) |
| 색인 데이터 | `MemorySourceUnit`·`MemoryCard` = 허용 대상 3명만(카드 12·54·138장) | 운영 전원 색인 백필(사용자당 원본 수 × ≈$0.007) |
| lab 운영 전환 과제(§12) | 미착수 | 해당분만: 카드 인물 id 생존 확인, 카드 교체 시 인용 이전(→ 근거 원본을 이야기 인용으로 둬서 회피), 기록 간 연도 대조(골격 연도 ≠ 이야기 연도 모순 후보) |

---

## 3. AI 흐름

### 3.1 채팅 → 노드·연결 자동 정리(사용자 확인 포함)

현행: 이야기 대화 종료(`finishEpisodeChatCore`) → 요약(Sonnet) → `Episode` 저장 → `savePeopleMentionedInEpisode`(Sonnet, 이름 있는 인물을 **확인 없이** 저장 + `PersonLifeEvent` 연결).

제안:

1. 저장은 지금 그대로(이야기 본문이 먼저, 정리는 best-effort — 실패해도 이야기는 남음).
2. 인물 추출 호출을 **정리 제안 호출 1회로 확장** — 인물(기존 `normalizeName`·`isRelationCompatible` 매칭 재사용)·장소(이름 정규화 매칭)·그룹("고등학교 친구들")·걸치는 다른 시기·이야기 자체 연도·"그때의 나" 성격 여부.
3. 결과는 `NodeLink(status=PROPOSED, source=AI)`·새 `Place`/`PersonGroup`(확인 전 표시 플래그)로 저장.
4. 확인 카드: 이야기 저장 직후 화면 또는 `/story-review` "정리할 것 N개". 버튼 [문구 필요: 맞아요] / [문구 필요: 아니에요] / [문구 필요: 고칠게요]. 확인 = CONFIRMED, 거절 = 연결 삭제(+같은 제안 재생성 방지 기록).
5. 기존 "인물 자동 저장"을 이 확인 흐름으로 바꿀지는 §7 Q6(바꾸면 person 갭 판정·인물 화면 집계가 PROPOSED 를 어떻게 셀지 같이 정해야 함).

비용: 정리 제안 1회 Sonnet ≈ 입력 1.5k·출력 0.3k 토큰 ≈ $0.009(이야기 대화 원문 평균 187자 — 운영 집계). 기존 인물 추출 1회를 대체하므로 순증 ≈ $0.003.

### 3.2 오늘의 인터뷰 — "관계별 나" 출처 추가

- 새 출처 `SELF`: 대상 = (확정 중심 C, C 에 연결된 인물 P 또는 그룹 G) 중 `Episode(kind=SELF)` 가 아직 없는 쌍. 문항 키 `self:<lifeEventId>:person:<personId>` · `self:<lifeEventId>:group:<groupId>`(기존 키 규칙과 같은 접두 방식).
- 재노출: 기존 규칙 재사용(건너뜀 1회 7일·2회 30일·3회 영구, 답함 = 다시 안 물음).
- 질문: [문구 필요: 관계별 나 질문 — 시기·상대를 넣는 틀]. 인물이 없는 시기는 [문구 필요: 그 시절의 나 일반 질문](풀 문항으로).
- 답 저장: `finishEpisodeChatCore` 에 `kind` 인자 추가(기본 STORY — 기존 호출 무변) → `Episode(kind=SELF, lifeEventId=C)` + `NodeLink(EPISODE→PERSON|PERSON_GROUP, CONFIRMED)`(질문이 이미 상대를 정했으므로 확인 불필요).
- 계획 비율: 6문항 중 SELF 최대 1개 제안(§7 Q10). 채우는 순서는 기존(POOL → GAP → YEAR) 앞에 SELF 를 끼울지 같이 결정.
- **기존 갭과의 충돌 방지**: `gap-detector` 의 episode·person_episode 갭은 "실질 이야기 존재"로 해소되는데, SELF 이야기가 이 갭을 해소하면 "이야기"를 영영 안 묻게 된다 → 갭 판정은 `kind=STORY` 만 센다(1단계 필터).

### 3.3 자아 추천 — 생성 시점·비용

- **시점**: 기본은 사용자가 자아 메뉴에서 [문구 필요: 제안 받아 보기]를 누를 때만. 자동 배치(새 카드 30장 누적마다)는 동의 + 성민 결정 후(§7 Q11). 사용자당 실행 중 1건(`updateMany` 선점, R3 규칙).
- **파이프라인**: ① 원본 동기화(바뀐 원본만 카드 추출) → ② 통합 실행(워터마크 이후 새 카드 30장 + 기존 자아 항목 목록 → Sonnet tool 스키마: 새 제안·기존 항목 지지/반대) → ③ 코드 검증(인용 위치 `locateQuote`·금지 꼬리표·거절 유사 재제안·민감 차단) → ④ `SelfAspect(PROPOSED)` + `SelfAspectEvidence` 저장 → ⑤ `SelfAspectRun` 기록.
- **근거 소멸**: 이야기 삭제 → 근거 cascade 삭제 → 근거 0개가 된 PROPOSED 는 숨김(다음 실행에서 정리), CONFIRMED·USER_WRITTEN 은 상태 유지 + `needsRecheck=true`(R3 규칙 4).

비용 추정(lab 운영 실측 원장 기반, Sonnet $3/$15 per MTok — `lib/lab/usage.ts`):

| 단계 | 근거 | 1회 | 사용자당 |
|---|---|---|---|
| 카드 추출 | EXTRACT 105회 $0.76 | ≈ $0.007 / 원본 | 이야기 중앙 7·최대 23개(운영) → 첫 색인 ≈ $0.05~0.16 (골격·인물 규칙 카드는 LLM 0) |
| 임베딩 | EMBED 609회 $0.0013 | 무시 가능 | — |
| 통합(자아 제안) | 입력 ≈ 5k(시스템 1.5k + 카드 30장 + 기존 항목)·출력 ≈ 0.8k 가정 | ≈ $0.027(프롬프트 캐시 시 ↓) | 카드 12~138장 → 첫 실행 1~5회 ≈ $0.03~0.14, 이후 카드 30장마다 ≈ $0.03 |
| (선택) 근거 판정 | JUDGE 289회 $1.86 | ≈ $0.0065 / 제안 | 도그푸딩 평가만 |

→ 사용자당 첫 자아 메뉴 ≈ **$0.1~0.3(약 130~400원)**, 이후 활동량에 따라 월 $0.03~0.1. 표본 3명 기준이라 3단계 도그푸딩에서 `SelfAspectRun` 실측으로 다시 잡는다.

---

## 4. 화면

공통: 본문 18px 이상·버튼 56px 이상·기존 토큰만(`docs/design-system.md`), 390px 가로 스크롤 0, 상태는 색만으로 구분하지 않고 글자 꼬리표를 같이 붙인다. 그래프 라이브러리는 쓰지 않는다(카드·CSS 로 표현).

### 4.1 노드 보기 — "물방울처럼 포함, 데이터는 연결"

- 세로 시간축(기존 연혁 패턴) 위에 **중심노드 = 큰 둥근 카드(물방울)**, 그 안에 소속 사건(이야기) 물방울, 인물·장소·그룹은 작은 칩으로 **연결된 모든 물방울 안에 각각 표시**(같은 인물이 고교·첫 직장 물방울에 동시에 보임 — 저장은 연결 1건씩).
- 칩을 누르면 그 인물·장소가 들어 있는 물방울 전부를 강조하고 나머지를 흐리게(필터). 다시 누르면 해제.
- 원형 대신 모서리가 큰 카드로 그린다 — 원 안 글자는 줄바꿈·확대에 약해 시니어 가독성이 떨어진다.
- PROPOSED 연결은 점선 칩 + [문구 필요: 확인 전 표시]. 확인 카드로 바로 이동.
- 진입 경로·이름·`/story-review` 와의 관계는 §7 Q3.

### 4.2 노드 상세 — 블로그식

- 머리: 제목, 시기(시작~끝), [문구 필요: 고치기].
- 본문: 블록(문단·사진·소제목) 그대로 렌더. `NodeBody` 가 없으면 평문을 문단으로(§1.8).
- 연결: 인물·그룹·장소·다른 시기 칩(누르면 그 노드 상세).
- 중심노드 상세에는 소속 이야기 목록 + "그때의 나" 묶음(인물·그룹별).
- 편집: 블록마다 텍스트 칸, 블록 사이 [문구 필요: 사진 넣기]·[문구 필요: 문단 추가], 순서 바꾸기는 드래그 대신 위·아래 버튼(56px). 사진은 기존 업로드 파이프라인(GPS 제거·용량 제한) 재사용. 저장 버튼 명시형(자동 저장 여부 §7 Q8).

### 4.3 자아 메뉴

- 목록: 카드(이름·시기·상태 꼬리표·관련 인물 칩). 상태별 묶음(확정 / AI 제안 / 사용자 작성, 거절은 접힘). [문구 필요: 직접 쓰기], [문구 필요: 제안 받아 보기](§3.3).
- 상세: 설명, **근거 이야기 인용 목록**(각 인용 → 원본 이야기로 이동, 인용 부분 강조), 관련 시기·인물·그룹·장소, 버튼 [문구 필요: 맞아요(확정)] / [문구 필요: 아니에요(거절)] / [문구 필요: 고쳐 쓸게요].
- AI 제안에는 [문구 필요: AI가 기록을 보고 정리해 본 것] 표시를 상시. 확정 전에는 다른 화면·가족 공유에 쓰지 않는다.
- `needsRecheck` 항목: [문구 필요: 근거가 된 이야기가 지워졌어요 — 그대로 둘까요?].

### 4.4 접근성 점검 기준(단계별 완료 기준에 포함)

- 헤드리스 390px 실측: 가로 스크롤 없음, 버튼 최소 56px, 글씨 최소 18px(기존 측정 하네스 재사용).
- 칩·필터는 키보드 포커스 가능, 강조 상태는 `aria-pressed`.

### 4.5 문구 자리 모음

| 위치 | 자리 |
|---|---|
| 정리 확인 카드 | 맞아요 · 아니에요 · 고칠게요 · 정리할 것 N개 |
| 노드 보기 | 확인 전 표시 · 필터 해제 안내 |
| 노드 상세·편집 | 고치기 · 사진 넣기 · 문단 추가 · 지워진 사진 자리 |
| 인터뷰 | 관계별 나 질문 틀 · 그 시절의 나 일반 질문 |
| 자아 메뉴 | 메뉴 이름(§7 Q18) · 직접 쓰기 · 제안 받아 보기 · AI 정리 표시 · 맞아요/아니에요/고쳐 쓸게요 · 근거 소멸 재확인 |
| 동의 | 자아 정리 선택 동의 문구(§5) |

---

## 5. 처리방침 영향

> ⚠️ 법률 자문 아님 — 개정 문안은 변호사 검토 필수(CLAUDE.md 법적 원칙).

### 5.1 자아 추천은 프로파일링인가

- 개인정보 보호법에는 "프로파일링" 정의가 따로 없고, 가까운 규정은 **자동화된 결정**(제37조의2 — 완전히 자동화된 시스템으로 개인정보를 처리해 이뤄지는 결정이 정보주체의 권리·의무에 중대한 영향을 미치는 경우 거부·설명 요구권)이다. 자아 추천은 사용자 확정 전의 제안이고 권리·의무에 영향을 주는 결정이 아니라 여기에 해당하지 않을 가능성이 높다.
- 그러나 일반적 의미(예: GDPR 제4조 4호 — 개인의 성격·행동·관심 같은 개인적 측면을 평가·분석하는 자동 처리)로는 **프로파일링에 해당한다고 보고 고지·동의를 설계하는 것이 안전**하다. 이유: 기록에서 "그때의 나"라는 개인적 측면을 AI 가 분석해 문장으로 만든다.

### 5.2 현 방침(v1.1, 2026-10-24 시행)과 충돌·공백

| 현 방침 문장(인용) | 위치 | 영향 |
|---|---|---|
| "회원님이 회상에 자발적으로 민감정보를 적으시더라도, 이를 프로파일링이나 광고에 사용하지 않습니다." | 1항 민감정보 | **직접 충돌 위험.** 자아 추천이 민감정보가 담긴 이야기를 근거로 쓰면 위반. → 민감 근거 제외 필터(§2.2) 필수. 문장은 유지 가능하나 "프로파일링" 표현을 자아 정리와 구분해 다시 써야 함 |
| "회원 식별·인증, 인생 연혁 작성·보관, AI 회상 보조와 문장 다듬기, 인생 포스터 문장 및 배경 이미지 생성, 장소 검색과 지도 표시, 가족 공유 기능 제공, 결제·정산, 문의 응대 및 서비스 개선을 위해 이용합니다." | 2항 이용 목적 | **공백.** 기록 분석을 통한 자아 정리 제안 목적 없음 → 추가 |
| Anthropic 이전 목적 "AI 회상 보조·문장 다듬기·인생 기록 정리·포스터 문장 생성" | 3항 국외 이전 | "인생 기록 정리"에 포함된다고 보기엔 해석 다툼 소지 → "기록을 바탕으로 한 자아 정리 제안" 명시 |
| (임베딩 업체 기재 없음) | 3항 국외 이전 | **공백.** lab 은 기억 카드를 Voyage AI(미국)로 임베딩한다. 지금은 허용 계정(본인·가상 페르소나)만이지만, 운영 승격 전 v1.2 에 이전 대상으로 추가(Q14 결정) |
| 수집 항목 "나. 서비스 이용 중 입력·생성" (직접 입력 기록·AI 대화 내용·사진…, "AI가 대화 내용에서 정리한 취향 키워드") | 1항 | **공백.** AI 가 만든 자아 정리 결과(확정·거절 기록 포함)라는 파생 정보 항목 추가 |
| "개인 프로필을 분석한 맞춤형 광고를 하지 않습니다." | 0항 약속 | 충돌 없음(광고 아님). 단 "프로필 분석" 자체는 하게 되므로 2항에서 목적을 분명히 해 오해를 막는다 |
| "회원님은 언제든지 본인 개인정보의 열람·정정·삭제·처리정지 및 동의 …" | 7항 권리 | 자아 정리 끄기(처리정지)·결과 삭제 방법 안내 추가 |

### 5.3 개정 필요 항목과 동의

- 처리방침 v1.2: 1항(수집 — 파생 정보)·1항 민감정보 문장 재작성·2항(이용 목적)·3항(국외 이전 목적, 임베딩 업체)·7항(끄기·삭제). 10항 규칙대로 시행 전 서비스 내 공지.
- 동의: **자아 정리는 선택 기능 → 기능을 처음 켤 때 별도 선택 동의**(Q13 결정). 동의 기록 칸은 3단계 마이그에 넣는다. 필수 동의 버전(`CURRENT_CONSENT_VERSION`)을 올리면 2026-10-30 부터 proxy 가 전원을 `/consent` 로 보내므로, 선택 동의로 두면 기존 사용자 흐름을 막지 않는다. 다만 3항 국외 이전 내용이 바뀌면(임베딩 업체 추가) 필수 동의 재수집이 필요할 수 있다 — 변호사 검토 항목.
- 노드 그래프·블로그 본문(1·2단계)은 사용자가 직접 입력·확인하는 기록이라 현 방침 범위 안. AI 정리 제안(§3.1)은 기존 "AI 회상 보조·인생 기록 정리" 목적 안으로 본다(검토 항목에 포함).

---

## 6. 단계 분할

### 1단계 — 데이터 층(화면 변화 0, 기존 기능 무손상)

- 마이그(추가만, `20261030000000_node_graph`): `Place`·`PersonGroup`·`PersonGroupMember`·`NodeLink`·`NodeBody`, enum `EpisodeKind`·`NodeType`(5값)·`LinkStatus`, 컬럼 `LifeEvent.endYear`·`Episode.kind/year/endYear`·`MemoryPlace.placeId`, 방향 CHECK 1개, 삭제 트리거 5개 + `NodeBody` 메모리 정리 트리거 1개. 자아 메뉴 테이블은 제외(3단계). 절차는 기존 규칙(`migrate diff` 로 SQL 생성 → SQL 승인 → `deploy`, 알려진 드리프트 4항목 제외).
- `lib/node-graph.ts`(연결 저장 함수 1개·검증), `db/migrate-places.ts`(dry-run 기본, 승인된 6묶음만 병합 적용, 실고객 계정 19행 제외 — 2026-10-30 승인), `db/reconcile-node-links.ts`.
- 같은 유형 여러 개 대응(§1.3 표), SELF 제외 필터: `gap-detector`(episode·person_episode 판정은 STORY 만)·포스터 브릿지(본문 병합·구간 행은 STORY 만)·`/story-review` 이야기 목록(2단계까지 SELF 미표시)·인터뷰 저장(기본 STORY).
- 포스터: 위 필터 1곳 외 무수정 — 이야기 자체 연도는 무시(앵커 연도 유지), 리치 본문은 평문 동기화로 영향 없음.
- **완료 기준**: 회귀 15종 exit 0 · 신규 `db/test-node-graph.ts`(연결 생성·중복 멱등·**역방향 중복 생성 시 같은 행으로 합쳐짐**·**다른 사용자 노드 연결 거부**·허용 안 된 쌍 거부·DB CHECK 가 역방향 직접 삽입 거부·**트리거 존재 확인**·**브릿지 메모리 삭제로 cascade 된 이야기의 연결이 트리거로 정리**·CUSTOM 삭제 cascade·탈퇴 후 새 테이블 0행) → 회귀 세트 16종 · `test-v3-poster-bridge` 에 SELF 이야기 제외 항목 · 장소 이관 dry-run = 34행 → 20곳(묶음 6) · `reconcile-node-links` 0건 · 빌드.
- 회귀 범위: 15종 + `test-withdrawal` 시나리오 추가 + lab 테스트(`test-lab-sync`·`test-lab-search` — 원천 해시 변경 영향 확인).

#### 1단계 구현 결과 (2026-10-30)

- 마이그 `20261030000000_node_graph` 적용(deploy 1건). 운영 카탈로그 조회로 정리 트리거 6개(활성)·`NodeLink_direction_check` 1개·`NodeType` 순서 확인. 적용 뒤 DB↔스키마 diff 는 알려진 드리프트 5문장뿐(CHECK·트리거는 Prisma 가 보지 않아 거짓 드리프트 없음).
- 장소 이관 `db/migrate-places.ts --apply`: 대상 34행 → `Place` 20곳(단독 14 + 승인 6묶음 20행), 실고객 계정 19행 제외(placeId 빈 채로), 보류 0. 재실행 dry-run = 대상 0(멱등).
- 코드: `lib/node-graph.ts`(`saveNodeLink` — 방향 정규화·허용 쌍·양 끝 소유·upsert·제안→확정만 올림), STORY 필터(`gap-detector` 3곳·포스터 브릿지·인터뷰 `resolveTarget`), 같은 유형 여러 개(`plan.ts` 유형→사건 목록·`[0]`, `plan.ts`/`session.ts` 정렬 `sequenceOrder`·`id` 로 같은 기준). 화면 변화 0.
- 회귀: 기존 15종 + 신규 `db/test-node-graph.ts`(35항목, LLM 0) = **16종**. `test-withdrawal` 시나리오 6(노드 그래프 테이블 cascade + 트리거) 추가. 세션 필터를 빼면 `test-node-graph` ⑥이 실패함을 확인(검사가 결함을 잡는지).
- 설계와 달라진 점: `db/reconcile-node-links.ts`·`/story-review` 이야기 목록의 SELF 제외는 **2단계로 이월**(1단계엔 SELF 이야기를 만드는 경로가 없고, 트리거 정리는 회귀로 확인). 포스터 브릿지의 SELF 제외 확인은 `test-v3-poster-bridge` 대신 `test-node-graph` ⑥에 넣음(픽스처 공유).

### 2단계 — 노드 화면·직접 작성

- 노드 보기(§4.1)·노드 상세·블로그 편집(§4.2, `NodeBody` + 평문 동기화 + 사진 블록), 장소 선택 UI 의 `Place` 재사용, 정리 제안 확인 카드(§3.1), 인터뷰 SELF 출처(§3.2), `/story-review` 의 "그때의 나" 표시, `docs/navigation-map.md` 갱신.
- **완료 기준**: 390px 헤드리스 실측(가로 스크롤 0·56px·18px) · 기존 평문 이야기가 편집 없이 그대로 보임 · 블로그 저장 후 `Episode.content`·브릿지 `content` 평문 동기화(포스터 브릿지·lab 원천이 평문을 읽음) · 사진 삭제 시 블록 자리표시 · test30 브라우저 E2E · 문구 자리 확정.
- 회귀 범위: 15종 + `test-node-graph` + 신규 `test-node-body`(평문 동기화·사진 소유 검사·다듬기 필드) + `test-interview`(SELF 출처·재노출·STORY 갭 무영향).

### 3단계 — 자아 메뉴

- 선행: 처리방침 v1.2 시행(Voyage AI 국외 이전 추가 포함) + 선택 동의(§5.3).
- 마이그: `SelfAspect`·`SelfAspectEvidence`·`SelfAspectRun`, enum `SelfAspectStatus`, `NodeType` 에 `SELF_ASPECT` 추가, `SelfAspect` 삭제 트리거, 선택 동의 기록 칸(§1.4 설계 그대로).
  - ⚠️ **`SELF_ASPECT` 는 반드시 `ALTER TYPE "NodeType" ADD VALUE 'SELF_ASPECT' BEFORE 'LIFE_EVENT'` 로 넣는다.** `NodeLink_direction_check` 가 enum 선언 순서(= 방향 순위)에 의존하므로, 그냥 `ADD VALUE`(맨 뒤 추가)를 하면 자아 항목이 최하위가 되어 자아→노드 연결이 CHECK 에 막힌다. `prisma migrate diff` 가 만드는 SQL 은 순서 지정 없이 맨 뒤에 붙이므로 그 줄을 손으로 고쳐야 한다. `schema.prisma` 의 enum 도 맨 위에 쓰고, `lib/node-graph.ts` `NODE_RANK` 맨 앞에 추가, `test-node-graph` ①(DB 순서 = NODE_RANK)로 확인.
- `SelfAspect` 생성기(lab 모듈의 운영 래퍼 — 운영 키·`SelfAspectRun` 원가), 금지 꼬리표·민감 필터, 목록·상세·확정/거절/직접 쓰기(§4.3), 근거 소멸 재확인.
- **완료 기준**: 저장된 근거 인용 100% 원문 부분문자열(코드 검증, `verifyStoredQuotes` 패턴) · 금지 단어 필터 단위 테스트 · 상태 전이(확정·거절은 사용자 액션만, 모델은 PROPOSED 만 생성) 단위 테스트 · 근거 삭제 시 `needsRecheck` · 거절 유사 재제안 차단 · 가상 페르소나 평가(통과 기준은 성민 정의) · `SelfAspectRun` 원가 실측 기록 · `/lab` 격리 유지(`test-lab-gate`).
- 회귀 범위: 15종 + node 테스트 2종 + 신규 `test-self-aspect` + `test-lab-gate`.

---

## 7. 결정 질문 (2026-10-30 결정 — 아래 7.1)

| # | 질문 | 추천 |
|---|---|---|
| Q1 | 두 번째 직장 등 같은 유형을 **같은 type 재사용(라벨로 구분)** 할지, enum 값을 추가할지. 출생은 1개 고정, 결혼은 여러 개 허용? | 같은 type 재사용(코드 변경 최소). 출생 1개 고정, 결혼 여러 개 허용. "첫 직장" 하드코딩 문장은 라벨 기반으로 점검 |
| Q2 | 중심 끝 연도에 정정 흐름(`correctedEndYear`)을 둘지 | 두지 않음 — 끝 연도는 사용자가 직접 고치는 값 하나 |
| Q3 | 노드 보기 진입 경로·이름, `/story-review` 와의 관계(대체/병행) | 1차는 병행 — `/story-review` 상단에서 진입, 안정 후 통합 검토 |
| Q4 | `NodeLink.role` 을 1단계부터 쓸지 | 1단계는 null 만, 장소 관계(그곳에서/출신) 필요가 확인되면 추가 |
| Q5 | 이야기의 인물: `Episode.personId`(대상 1명) 유지 + `NodeLink`(함께 나온 인물) 병행 vs 전부 `NodeLink` 로 통합 | 병행 — person_episode 갭·대기 대화(`ChatV3PendingContext.targetPersonId`) 무수정 |
| Q6 | 지금의 "인물 자동 저장(확인 없음)"을 PROPOSED 확인 흐름으로 바꿀지 | 2단계에서 바꿈(장소·그룹과 같은 확인 흐름으로 통일) |
| Q7 | 장소: 이름만 같으면 병합(좌표 0건) — 동명 다른 곳 위험 처리 / `Person` location 생성 경로 / `LifeProfile` 장소 JSON | 병합 묶음 6개를 dry-run 개수로 보고 성민이 확인 후 적용 · location 신규 생성은 `Place` 로 전환 · JSON 은 이관 안 함 |
| Q8 | 블로그 본문 범위: 블록(문단·사진·소제목)만 vs 글자 서식(굵게·목록) / 자동 저장 여부 | 블록만, 에디터 라이브러리 0, 저장 버튼 명시형 |
| Q9 | `updateEpisodeContent` 의 다듬기 필드 미초기화 결함(2026-09-30 발견)을 2단계 전에 고칠지 | 고침 — 블로그 저장이 같은 경로를 탄다 |
| Q10 | 인터뷰 6문항 중 "관계별 나" 비율 | 최대 1개 |
| Q11 | 자아 추천 실행: 수동 버튼만 vs 자동 배치 | 수동 버튼으로 시작, 도그푸딩 후 자동 배치 검토 |
| Q12 | 자아 추천 원가: 토큰 차감 vs 무료(운영 부담) / 전역 월 예산 가드 | 도그푸딩 동안 무료 + 전역 예산 가드, 차감은 실측 후 |
| Q13 | 동의 방식: 선택 동의(기능 켤 때) vs 필수 동의 버전 5 | 선택 동의 + 처리방침 v1.2 고지 |
| Q14 | 임베딩: Voyage AI 를 처리방침 국외 이전에 추가 vs 운영 경로는 키워드 검색만 | 변호사 검토 후 결정. 결정 전까지 운영 경로는 키워드 검색만으로 설계 가능(검색 품질 하락은 도그푸딩으로 확인) |
| Q15 | 자아 메뉴 가족 공유 | 비공개 고정(3단계), 공유는 별도 설계 |
| Q16 | 상태 4종(AI 제안·확정·거절·사용자 작성)에 "고쳐서 확정"·"예전엔 그랬어요"를 따로 둘지 | 4종 + `userEdited` 플래그. "예전엔"은 시기 축이 있어 불필요 |
| Q17 | 금지 꼬리표 목록(진단명·성격유형·혈액형·건강·종교·정치·성적 지향) 확정 | §2.2 예시로 시작, 도그푸딩 중 추가 |
| Q18 | 메뉴·기능 이름(화면 용어) | [문구 필요] — 성민 |
| Q19 | 승격 후 `/lab` 연구실 유지 여부 | 유지(격리 그대로, 연구·평가용) |

### 7.1 결정 결과 (2026-10-30)

성민 직접 결정: Q1·Q5·Q6·Q13·Q14. 나머지는 **추천안 채택(성민 위임)**. Q18 은 화면 문구라 확정 대기.

| # | 결정 |
|---|---|
| Q1 | (성민) 같은 유형 중심노드 여러 개 + 이름(label)으로 구분. 출생 1개 고정·결혼 여러 개 허용은 추천안 |
| Q2 | 추천안 — 끝 연도 정정 칸 없음 |
| Q3 | 추천안 — 노드 보기는 `/story-review` 와 병행, 상단에서 진입 |
| Q4 | 추천안 — 1단계 `role` 미사용(`""` 기본값) |
| Q5 | (성민) 대상 인물은 현행 `Episode.personId` 유지 + 함께 나온 인물은 `NodeLink` |
| Q6 | (성민) 인물 저장에 확인 단계(대화 종료 시 일괄 확인). 1단계는 데이터만(기존 `Person.isDraft` + `NodeLink.status=PROPOSED` 로 표현, 새 칸 없음), 확인 화면은 2단계 |
| Q7 | 추천안 + 성민 승인 — 장소 6묶음 병합·실고객 계정 19행 제외, location 인물 신규 생성은 2단계에 `Place` 로 전환, `LifeProfile` 장소 JSON 은 이관 안 함 |
| Q8 | 추천안 — 블록(문단·사진·소제목)만, 에디터 라이브러리 0, 저장 버튼 명시형 |
| Q9 | 추천안 — 다듬기 필드 미초기화 결함을 2단계 전에 고침 |
| Q10 | 추천안 — 인터뷰 6문항 중 "관계별 나" 최대 1개 |
| Q11 | 추천안 — 자아 추천은 수동 버튼으로 시작 |
| Q12 | 추천안 — 도그푸딩 동안 무료 + 전역 예산 가드, 차감은 실측 후 |
| Q13 | (성민) 자아 메뉴는 선택 동의 |
| Q14 | (성민) Voyage AI 를 처리방침 v1.2 국외 이전에 추가(3단계 전 개정) |
| Q15 | 추천안 — 자아 메뉴 비공개 고정 |
| Q16 | 추천안 — 상태 4종 + `userEdited` |
| Q17 | 추천안 — §2.2 예시 목록으로 시작, 도그푸딩 중 추가 |
| Q18 | 확정 대기 — 메뉴·기능 이름은 성민 문구 |
| Q19 | 추천안 — `/lab` 연구실 유지 |

---

## 결정 로그

- 2026-10-30 — 설계 문서 작성(구현 전). 데이터 방식·노드 구성·자아 메뉴 원칙·포스터 연기는 성민 결정(제안: 리뷰 채팅). 같은 날 `/api/tts`·`lib/clova-tts` 삭제(설계와 별개, 별도 커밋).
- 2026-10-30 — §7 결정: Q1·Q5·Q6·Q13·Q14 성민 결정(제안: 리뷰 채팅), 나머지 **추천안 채택(성민 위임)**, Q18 문구 대기(§7.1).
- 2026-10-30 — 1단계 단계 A 수정(성민): 자아 메뉴 테이블·enum·`NodeType.SELF_ASPECT`·트리거를 3단계 마이그로 분리. `NodeLink` 방향 규칙 확정(순위 `LIFE_EVENT > EPISODE > PERSON_GROUP > PERSON > PLACE`, 같은 종류는 id 바이트 순, 저장 함수 1개 + DB CHECK). `LifeEvent` 유형 유니크 없음 확인 → 제거 SQL 불필요. 장소 이관 6묶음·실고객 19행 제외 승인.
- 2026-10-30 — 1단계 구현 완료: deploy 1건·카탈로그 확인, 장소 이관 34행→20곳(실고객 19행 제외), `saveNodeLink`·STORY 필터·같은 유형 여러 개 대응, 회귀 16종(`test-node-graph` 추가). `reconcile-node-links`·story-review SELF 제외는 2단계로 이월. 3단계 `SELF_ASPECT` 추가는 `ADD VALUE … BEFORE 'LIFE_EVENT'` 필수(CHECK 가 enum 순서에 의존) — §6 3단계에 메모.
