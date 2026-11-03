# 노드 그래프 + 자아 메뉴 — 설계

- 상태: **설계 확정(§7 결정 2026-10-30) · 1단계(데이터 층) 완료 2026-10-30 · 2a("관계별 나" 가설 검증 경로) 완료 2026-10-31** — 결과는 §6 "1단계 구현 결과"·"2a 구현 결과". **2b(노드 보기·상세·블로그 편집·인물 확인·정합 점검·장소형 인물→Place) 설계 2026-10-31** — §6 "2b 설계", 결정 §7.2(Q20~Q31, 2026-11-01 결정). **2b-1(정합 점검)·2b-2(인물 확인) 완료 2026-11-01** — §6 "2b-1·2b-2 구현 결과". 2b-3(노드 보기·상세) 이후는 도그푸딩 1주 뒤 착수. **2b-3 재정의 2026-11-01 — 노드 보기 → 새 메뉴 "My Life" 마인드맵 `/my-life`**(§6 2b.1 — 결정 §7.3 Q36~Q50 2026-11-01). **2b-3a(My Life 보기 전용) 완료 2026-11-01** — §6 "2b-3a 구현 결과". 자아 메뉴 테이블은 3단계 마이그.
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
- **평문 동기화**: 저장 함수 1곳이 `doc` → `plainText`(문단·소제목을 빈 줄로 이음, 사진은 캡션만 — 2b 설계에서 캡션 제외로 변경 제안, Q27)를 만들고, **이야기 노드는 같은 트랜잭션에서 `Episode.content`·브릿지 `UserMemory.content` 를 그 평문으로 갱신**한다(기존 `updateEpisodeContent` 경로). 그래서 포스터 브릿지·lab 원천·다듬기·story-review 는 무수정.
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

공통: 본문 18px 이상·버튼 56px 이상·기존 토큰만(`docs/design-system.md`), 390px 가로 스크롤 0, 상태는 색만으로 구분하지 않고 글자 꼬리표를 같이 붙인다. 그래프 라이브러리는 쓰지 않는다(카드·CSS 로 표현). — My Life 마인드맵(2026-11-01)도 추천안은 라이브러리 0(확대·축소 직접 구현, §6 2b.1 의 2 · Q42).

### 4.1 노드 보기 — "물방울처럼 포함, 데이터는 연결"

- 세로 시간축(기존 연혁 패턴) 위에 **중심노드 = 큰 둥근 카드(물방울)**, 그 안에 소속 사건(이야기) 물방울, 인물·장소·그룹은 작은 칩으로 **연결된 모든 물방울 안에 각각 표시**(같은 인물이 고교·첫 직장 물방울에 동시에 보임 — 저장은 연결 1건씩).
- 칩을 누르면 그 인물·장소가 들어 있는 물방울 전부를 강조하고 나머지를 흐리게(필터). 다시 누르면 해제. → 2b 설계(2b.1)에서 "흐리게" 대신 "숨김 + 안내 띠"로 변경(대비 기준).
- 원형 대신 모서리가 큰 카드로 그린다 — 원 안 글자는 줄바꿈·확대에 약해 시니어 가독성이 떨어진다.
- PROPOSED 연결은 점선 칩 + [문구 필요: 확인 전 표시]. 확인 카드로 바로 이동.
- 진입 경로·이름·`/story-review` 와의 관계는 §7 Q3.
- → **2026-11-01 이 보기는 My Life 마인드맵(§6 2b.1)으로 대체**: 세로 줄기 + 양옆 가지, 모서리 큰 카드 대신 물방울(Q29 를 이 화면에 한해 뒤집음), 칩 필터는 Q49 로 다시 묻는다.

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
| 정리 확인 카드·인물 확인 화면(2b.3) | 맞아요 · 아니에요 · 고칠게요 · 모두 맞아요 · 정리할 것 N개 · 이미 등록된 분 · 확인 마치기 · 인터뷰 요약 — 확인할 분 N명 (2b-2 — 임시 문구로 들어감, `lib/node-confirm-copy.ts` `CONFIRM_COPY` 전부) |
| ~~노드 보기(2b.1)~~ → My Life(2b.1, 2026-11-01 — 2b-3a 임시 문구로 들어감, `lib/my-life-copy.ts` `MY_LIFE_COPY`) | 메뉴 이름 "My Life"(성민 확정) · My Life 메뉴 설명(사이드 패널 hint) · My Life 로 보기(`/story-review` 상단) · 지도 목록 이름(aria-label) · 버튼 이름 형식(종류 + 이름 + 수) · 전체 보기 · 크게 보기 · 작게 보기 · 목록으로 보기 · 지도로 보기 · 배율 알림 · 지금 보는 곳 · 가지 N개 펼치기 · 가지 접기 · 모두 펼치기 · N년 뒤 · 연도 모름 · 그때의 나 · 모임 · 외 N · 확인 전 · 다른 시기에도 있어요 · 닫기 · 뒤로 · 이야기 추가 · 말로 이야기하기 · 인물 넣기 · 장소 넣기 · 이름 찾기 · 새로 만들기 · 넣었어요 알림 · 본문 보기 · 다른 시절로 옮기기 · 지금 여기 · 옮길까요 확인 · 옮기기 · 확인하러 가기 · 인물록에서 보기 · 지도에서 보기 · My Life 빈 상태 · 이야기 나누기(빈 상태) · 되돌리기(Q50 채택 시) |
| 노드 상세·편집(2b.2) | 고치기 · 문단 추가 · 소제목 추가 · 사진 넣기 · 지워진 사진 자리 · 저장 안 한 글 안내 · 빈 글 저장 안내 · 다른 곳에서 먼저 고쳐졌어요 · 사진·소제목이 있는 글 고치기 안내(`/story-review` 카드) |
| `/people` 장소 탭(2b.5) | 예전 방식 장소 |
| 인터뷰 | 관계별 나 질문 틀 · 그 시절의 나 일반 질문 (2a — 예시 3개 임시 문구로 들어감, `SELF_QUESTION_POOL`) |
| `/story-review` | 그때의 나 묶음 제목 (2a — 임시 문구, `INTERVIEW_COPY.selfStoriesTitle`) |
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

#### 2a 구현 결과 — "관계별 나" 가설 검증 경로 (2026-10-31)

2단계 중 인터뷰 SELF 출처(§3.2)·`/story-review` "그때의 나" 표시·Q9 를 먼저 했다(성민 요청). 마이그 0.

- **Q9 선행 수정**: `updateEpisodeContent` 가 본문이 실제로 바뀌면 브릿지 메모리의 다듬기 3필드(`refinedText`·`refinedAt`·`displayRefined`)를 초기화(같은 본문이면 유지 — `saveMemoryContent` 와 같은 정책). 다듬기 본체 `refineMemorySpelling`(`/api/memory/[id]/refine`)은 `createdVia=life_event` 행만 — 다른 행은 모델 호출·차감 전에 not_found(→ 404). 회귀 `test-node-graph` ⑧.
- **문항 형식**: 질문 풀 파일에 `SELF_QUESTION_POOL`(`lib/interview/question-pool.ts`) — 대상 시기 `anchor`(중심노드 유형) + 관계 대상 `relation`(일반 범주 `{ kind: "category", label }` / 그 사건에 연결된 실제 인물·그룹마다 1문항 `{ kind: "linked" }`). 자리표시 `{who}`·`{who:과/와}` + 기존 학교 명칭 `{elemSchool}`. 예시 3개(고교 + 연결 인물·그룹 / 국민·초등학교 + 선생님 / 첫 직장 + 가족) 전부 `[임시 — 성민 확정 필요]`.
- **설계와 달라진 점**:
  - §3.2 는 대상을 "(중심, 연결 인물·그룹) 쌍"으로만 잡았지만, 요청대로 **질문 풀 문항(틀)** 으로 두고 범주형("선생님" 등 연결 없는 상대)도 같은 형식에 넣었다. 그래서 문항 키에 질문 id 가 붙는다: `self:<questionId>:<eventId>` · `…:person:<personId>` · `…:group:<groupId>`.
  - 대상 시기 = 그 유형의 **순서상 첫 확정 사건**(풀 질문과 같은 기준). 두 번째 직장 등에는 "첫 직장" 문구가 맞지 않아서다(§1.3 라벨 기반 문장은 2단계 나머지).
  - 연결 인물 = `PersonLifeEvent` 의 확정 인물(`subjectType=person`·`isDraft=false`), 연결 그룹 = `NodeLink(LIFE_EVENT→PERSON_GROUP, CONFIRMED)`. 그룹을 만드는 화면은 아직 없다(데이터가 생기면 바로 대상).
- **계획**: 6문항 중 최대 1개(Q10), 기본 순서 5번째 자리(연도·갭·풀·갭·관계별 나·풀). 후보가 없으면 그 자리를 건너뛰어 기존 계획과 같다(회귀로 확인). 재노출: 답함 = 영구 제외(풀과 같음), 건너뜀 7·30·영구.
- **저장**: `finishEpisodeChatCore` 에 `kind` 인자(기본 STORY — 기존 호출 무변) → `Episode(kind=SELF, lifeEventId=대상 사건)`. 대상 인물 칸(`Episode.personId`)은 비우고(Q5 — 그 칸은 person_episode 갭·대기 대화용), 관계 대상이 실제 인물·그룹이면 `saveNodeLink(EPISODE→PERSON|PERSON_GROUP, CONFIRMED)` — 질문이 상대를 정했으므로 확인 없이 확정, `source` 는 기본값(USER). 연결 실패는 로그만(이야기는 남음).
- **갭·배지**: SELF 이야기는 이야기 갭(1단계 STORY 필터)을 채우지 않고, `LifeEvent.hasEpisode`("이야기 있음" 배지 + `/chat-v3` 심화 대화 대상 판정)도 켜지 않는다 — `createEpisodeBridge` 는 STORY 일 때만 켜고, `deleteEpisode` 재계산도 STORY 만 센다.
- **`/story-review`**: 일반 이야기("들려주신 이야기")와 별도 묶음으로 "그때의 나"(제목 `INTERVIEW_COPY.selfStoriesTitle`, 임시) — 카드는 기존 `EpisodeCard`(고치기·지우기) 그대로. 1단계에서 이월한 "SELF 미표시"는 이 별도 묶음으로 대체. 헤드리스 390px 실측(픽스처 계정, 운영 빌드): 가로 스크롤 0·버튼 최소 56px·글씨 최소 18px — 기본·그때의 나 고치기·지우기 확인창·인터뷰 관계별 나 문항 화면.
- **포스터 브릿지**: SELF 제외 유지 — 실제 인터뷰로 저장한 SELF 가 본문·구간 행에 안 들어감(`test-interview` ⑩) + 1단계 `test-node-graph` ⑥.
- **회귀**: `test-interview` 70 → 91항목(⑩ 관계별 나 — 출제·SELF 저장·연결·갭·배지 미충족·브릿지 제외·별도 묶음·순수 함수), `test-node-graph` 35 → 39항목(⑧ Q9). 세트는 16종 그대로.
- **2단계 남은 것**: 노드 보기·상세·블로그 편집(§4.1·§4.2), `Place` 재사용, 정리 제안 확인 카드(§3.1·Q6), `db/reconcile-node-links.ts`, 라벨 기반 문장(§1.3), `docs/navigation-map.md`(새 화면 생길 때), 문구 확정(관계별 나 질문 틀·묶음 제목 포함), test30 E2E. → 라벨 기반 문장을 뺀 전부를 아래 "2b 설계"로 설계.

### 2b 설계 — 노드 화면·직접 작성·인물 확인 (2026-10-31, 설계만 — 구현 전)

2단계 중 2a 를 뺀 나머지다. 이 절은 설계만이고 코드 변경은 0. 결정이 필요한 것은 §7.2(Q20~Q31)에 모았다.

**전제(코드 확인 2026-10-31)**

- **마이그 0 으로 된다.** 필요한 칸이 1단계에 다 있다: `NodeBody`(doc·plainText·version·memoryId), `NodeLink.status`(PROPOSED/CONFIRMED)·`source`, `Person.isDraft`, `Place`, `Photo.caption`.
- **새 화면은 전부 `/story-review/` 아래**(Q3 병행). (2026-11-01 — My Life 는 최상위 `/my-life`, 이야기 상세는 `/my-life/story/[id]` — Q36. 인물 확인 `/story-review/confirm` 은 그대로.) 장소 상세만 공용 `/people/` 아래(2b.5). 로그인은 기존 proxy 가 이미 막고, V3 확인은 각 페이지가 `/story-review` 처럼 `getOnboardingTrack` 으로 한다 → `proxy.ts` 무접촉.
- 범위 밖: 라벨 기반 문장(§1.3 — 두 번째 중심을 만드는 화면이 2b 에 없음), 그룹을 만드는 화면, 정리 제안 확장(장소·그룹·다른 시기 — §3.1 2번. 2b 는 인물만), 자아 메뉴(3단계).

#### 2b.1 My Life 마인드맵 — `/my-life` (2b-3 재정의, 2026-11-01 설계 — 구현 전)

결정(성민, 2026-11-01): 새 메뉴 **"My Life"**(성민 문구 그대로). 이 화면은 마인드맵 하나만 두고 확대·축소·이동으로 탐색한다. 가운데 세로 줄기에 중심 사건(`LifeEvent`)이 시기 순으로 꿰어지고, 중심마다 양옆으로 이야기·그때의 나·인물·장소·모임(그룹) 노드가 뻗는다. 이야기 노드 안에는 그 이야기에 연결된 인물·장소가 작은 물방울로 보인다(데이터는 `NodeLink`·기존 연결 그대로). 노드 모양은 물방울(Q29 를 이 화면에 한해 뒤집음). 노드를 누르면 아래에서 패널이 올라온다 — 중심 [이야기 추가][인물 넣기][장소 넣기], 이야기 [본문 보기][인물 넣기][장소 넣기]. 넣기 = 기존 목록에서 고르기 + 새로 만들기, 드래그 연결 없음, 연결 생성은 `saveNodeLink` 만(이 조건과 저장 위치 규칙이 부딪히는 곳은 Q44). `/story-review` 목록형은 그대로 둔다(두 보기 공존).

이 절은 설계만이고 코드 변경 0. 결정이 필요한 것은 §7.3(Q36~Q50), 화면 문구는 `[문구 필요: …]`.

**이전 2b.1(노드 보기 `/story-review/nodes`, 2026-10-31)과의 관계**

- 대체: 경로 `/story-review/nodes`, 카드 중첩 배치(A 목록형·B 시각형 비교 — Q20), `?focus=` 인물 필터(→ Q49), Q29 기본 라운딩.
- 이어받음: 데이터 읽기 쿼리 수 고정, 포함 규칙(추가 소속 이야기는 두 중심에 각각, 한 물방울 안 중복 제거), PROPOSED = 점선 + 글자 꼬리표, 누르는 곳 겹침 금지, 접기(Q20 의 "접힘 기본"은 띠 접기로), A 목록형(→ [목록으로 보기]), 마이그 0·`proxy.ts` 무접촉.

**전제(코드·운영 확인 2026-11-01)**

- **마이그 0.** 필요한 칸이 1단계에 다 있다.
- **운영 규모**(개수만, 실고객 2명 제외 — 확정 중심이 1개 이상인 사용자 18명): 확정 중심 최대 11·중앙 8 · 이야기(STORY) 최대 23·중앙 4 · SELF 0 · 중심↔인물(`PersonLifeEvent`) 최대 11·중앙 2 · `Place` 최대 14·중앙 0 · `NodeLink` 확정 2행. 지도 노드 근사(중심 + 이야기 + 중심↔인물) **최대 36·중앙 16**. **연도 없는 확정 중심이 16개**(첫 직장·결혼 골격은 연도 없이 확정되기도 한다)라 그 위치 규칙이 필요하다.
- **이야기에는 제목 칸이 없다.** `/story-review` 이야기 카드의 제목은 브릿지 메모리 `title`(= 저장 때 중심 이름)이라 한 중심 안의 이야기가 모두 같은 제목이다 → 지도의 이야기 노드 글자는 본문 앞부분(Q46).
- **저장 위치 규칙(§1.5)상 중심 → 인물은 `PersonLifeEvent`, 이야기 → 장소는 `MemoryPlace`(브릿지 메모리)** 이고, `saveNodeLink` 의 `ALLOWED_PAIRS` 에 두 쌍이 없다. "연결 생성은 saveNodeLink 만"과 충돌 → Q44.
- 새 경로 `/my-life` 는 proxy 공개 목록 밖이라 로그인·동의 게이트를 그대로 탄다 → `proxy.ts` 무접촉. V3 확인은 페이지가 `/story-review` 처럼 `getOnboardingTrack`(V2 직접 진입 → `/enter`).
- `app/layout.tsx` viewport 에 확대 금지가 없다(브라우저 확대 허용 — WCAG 1.4.4 유지). 지도 영역만 두 손가락 제스처를 직접 받는다(아래 2).
- [이야기 추가]에 쓸 딥링크가 이미 있다: `/chat-v3?gapEventId=<중심>&gapType=episode` → `startEpisodeStage`(갭 카드와 같은 경로). `/chat-v3` 를 클라이언트 이동으로 떠나면 딥링크 소비 표식이 지워지므로(`ChatV3Client` P13-1) 같은 중심에서 여러 번 눌러도 매번 새로 시작한다.

##### 1. 배치 알고리즘

**데이터 — `lib/my-life.ts` `getMyLifeData(userId)`**(읽기 전용, auth 없는 순수 모듈 — 회귀가 같은 함수를 부른다). Prisma 호출 7회로 고정(include 의 관계 단계마다 SQL 이 나뉘어도 수는 기록 양과 무관 — N+1 없음):

1. 확정 중심(CONFIRMED·CORRECTED, `sequenceOrder`·`id` 순 — `/story-review`·갭·인터뷰와 같은 기준) + 소속 이야기(id·kind·personId·content·브릿지 `memoryId`·`MemoryPlace`(placeId·placeName)) — include 1회
2. `PersonLifeEvent`(중심 ↔ 인물)
3. 사용자 `NodeLink` 전체(지금 운영 2행, 사용자당 수십~수백 행 예상)
4. 위에서 모인 id 로 `Person`·`PersonGroup`(+구성원)·`Place` — 3회

**포함 규칙**

| 자리 | 들어가는 것 |
|---|---|
| 줄기 | 확정 중심(UNCONFIRMED·SKIPPED 와 그 이야기는 빠짐) |
| 중심 C 의 왼쪽 가지 | 이야기(STORY) + 그때의 나(SELF). 주 소속(`Episode.lifeEventId = C`) + 추가 소속(`NodeLink(LIFE_EVENT C → EPISODE)`). 추가 소속 이야기는 두 중심에 각각 보이고 꼬리표 [문구 필요: 다른 시기에도 있어요] |
| 이야기 안 작은 물방울 | 대상 인물(`Episode.personId`) ∪ `NodeLink(EPISODE→PERSON)` ∪ `NodeLink(EPISODE→PERSON_GROUP)` ∪ 브릿지 `MemoryPlace`(`placeId` 가 있으면 `Place` 이름, 없으면 `placeName`) |
| 중심 C 의 오른쪽 가지 | `PersonLifeEvent(C)` 인물 ∪ `NodeLink(C→PERSON_GROUP)` ∪ `NodeLink(C→PLACE)` 중 **C 의 이야기 안에 이미 작은 물방울로 보이는 것은 뺀다**(Q38). "한 물방울 안 중복 제거"(이전 2b.1)를 "중심 띠 하나 = 물방울 하나"로 적용한 것 — 2b-2 [맞아요]가 이야기 인물마다 `PersonLifeEvent` 를 만들기 때문에, 이 규칙이 없으면 이야기에 나온 분이 거의 다 두 번 보인다 |
| 상태 | CONFIRMED 만 정식. PROPOSED(이야기→인물 확인 대기)는 작은 물방울 점선 테두리 + 꼬리표 [문구 필요: 확인 전]. 초안 인물(`isDraft`)은 PROPOSED 로만 보인다 |
| 빠지는 것 | 남의 노드(쿼리가 `userId` 로 한정), 장소형 인물(`subjectType=location` — 운영 0, 2b-5 정리 대상) |

**배치 — `lib/my-life-layout.ts` `layoutMyLife(data, { folded })`**: 순수 함수(DB·DOM·LLM 0). 출력 = 노드마다 `{ id, kind, x, y, w, h }` + 이음선 + 띠(중심 1개 단위) + 세계 크기. 포스터 `compose-layout` 처럼 순수 함수로 두어 회귀가 겹침을 직접 검사한다.

- **글자 폭을 재지 않는다.** 노드 크기는 종류와 작은 물방울 수로만 정하고, 글자는 CSS 줄 수 제한(넘치면 …)으로 맞춘다. 그래서 서버·클라이언트가 같은 결과를 내고, 휴대폰 글꼴 크기 설정이 바뀌어도 노드끼리 겹치지 않는다(넘친 글자는 잘리고, 전체는 패널·목록 보기에서 보인다).
- 작은 물방울만 이름 글자 수로 폭을 **추정**해(한글·한자 18px, 그 밖 10px, + 좌우 여백 22) 한 줄에 들어가는 만큼 담고 최대 2줄, 나머지는 [문구 필요: 외 N]. 추정보다 실제가 넓으면 그 물방울만 말줄임 — 줄 수는 추정값으로 고정이라 높이는 안 바뀐다.

세계 좌표(배율 1 = CSS px):

```
세계 폭 342 (= 390 − 좌우 여백 24×2)
┌──────── 163 ────────┐  16  ┌──────── 163 ────────┐
│ 왼쪽 열: 이야기·그때의 나 │ 줄기 │ 오른쪽 열: 사람·모임·장소 │
└─────────────────────┘ x=171 └─────────────────────┘
```

띠 하나(중심 1개):

```
                │ ← 줄기 4px(그 중심 연대의 decade-strip 색)
         ╭──────┴──────╮
         │    1977      │ ← 중심 물방울 248×120(타원), 줄기 위 가운데
         │ 대학교 입학  │
         ╰──────┬──────╯
 ╭─────────────╮│╭─────────────╮
 │ 고등학교 때 ●├┼┤● 박영수    │ ← 가지: 각 열 위에서부터 12px 간격으로 쌓기
 │ 김민수라는…  ││╰─────────────╯   (●=꼭지, 줄기 쪽을 향함)
 │ (김민수)(경주)││╭─────────────╮
 ╰─────────────╯│┤● 경주       │
 ╭─────────────╮│╰─────────────╯
 │ 수학여행…   ●┤
 ╰─────────────╯│
                │ ← 띠 사이 32px
```

- 띠 높이 = 중심 120 + 16 + max(왼쪽 열 높이, 오른쪽 열 높이) + 32. **띠는 위에서 아래로 쌓기만, 열 안의 노드도 세로로 쌓기만** 하므로 겹침은 "그린 뒤 검사해 밀기"가 아니라 구성으로 생기지 않는다. 회귀는 출력 사각형끼리 교차 0 을 검사한다.
- 이음선: 줄기(x=171)에서 가지 노드 꼭지까지 수평선. SVG 한 장으로 노드 뒤에 깔고 `aria-hidden`.

**양옆 배치 규칙 비교**(예: 중심 1개에 이야기 4개(각 ≈120)·사람 2명(각 64))

| 기준 | ① 종류별 좌우 고정 — 왼쪽 이야기·그때의 나 / 오른쪽 사람·모임·장소 | ② 좌우 번갈아 — 가지 순서대로 왼·오 |
|---|---|---|
| 찾기 | 항상 같은 쪽 — "이야기는 왼쪽"을 한 번 익히면 끝 | 종류가 양쪽에 섞여 띠마다 새로 훑음 |
| 띠 높이(예) | 왼 516 / 오 140 → 띠 ≈ 684 | 왼 328 / 오 328 → 띠 ≈ 496(약 27% 짧음) |
| 읽는 순서(눈·스크린리더) | 띠마다 "중심 → 이야기들 → 사람·장소" 한 가지 | 눈은 지그재그, 목록 순서와 어긋남 |
| 오른쪽 가지의 뜻 | "이야기 밖에서 그 시절에 있던 사람·곳"(위 중복 제거와 맞물림) | 없음 |

추천 ①. 길어지는 것은 접기로 다룬다(Q37).

**띠 간격 — 연도 비례 대신 내용 높이**: y 를 연도에 비례시키면(1년 = n px) 이야기가 몰린 해는 겹치고 빈 10년은 빈 화면이 된다. → 내용 높이로 쌓고, 앞 띠와 연도 차가 10년 이상이면 줄기 위에 작은 표지 [문구 필요: N년 뒤](18px, 높이 40)를 넣는다(Q39).

**연도 없는 중심**: 자리는 `sequenceOrder` 그대로 — 골격(첫 직장·결혼)은 생성 때 인생 순서 자리에 있고, 연도 없이 만든 직접 추가 사건은 맨 뒤(기존 사용자 결정 "시기 미상 섹션 대신 맨 뒤" — `lib/open-chat-promote.ts` `createCustomLifeEvent`). `/story-review`·갭·인터뷰와 같은 순서라 화면끼리 순서가 같다. 연도 자리에 [문구 필요: 연도 모름], 줄기 색은 `ink-faint`. 앞뒤 연도로 추정한 숫자는 보여 주지 않는다(틀린 연도보다 빈칸 — Q33 과 같은 원칙)(Q40).

**접기(Q20 이어받음)**

- 띠마다 접고 펼친다. 접힌 띠 = 중심 물방울 + 줄기 위 알약 버튼 [문구 필요: 가지 N개 펼치기](56px) — 띠 높이 = 중심 120 + 8 + 56 + 32. 펼친 띠에는 지도 위 버튼을 두지 않고 중심 패널의 [문구 필요: 가지 접기]로 접는다(띠마다 64px·Tab 한 번씩 늘어나는 것을 피함).
- 기본: 지도 노드(중심 + 가지, 작은 물방울 제외) 합계가 60 이하면 전부 펼침 — 운영 최대 36 이라 지금은 전원 펼침. 넘으면 전부 접힘 + 도구줄 위 [문구 필요: 모두 펼치기]. 60 은 성능 실측(아래 2)으로 다시 잡는다(Q41).
- 접힘 상태는 같은 탭 안에서만 기억(`sessionStorage`, 서버 칸 0). 접거나 펼치면 배치를 다시 계산하고(순수 함수라 가볍다), 누른 띠가 화면에서 같은 자리에 남도록 스크롤을 맞춘다.

##### 2. 렌더링·확대축소

**그리는 방식**

| 기준 | SVG 전체 | Canvas | **HTML 노드 + SVG 이음선(추천)** |
|---|---|---|---|
| 글자 | 자동 줄바꿈 없음(tspan 직접 계산) | 직접 그림 — 선명도·글꼴 확대 직접 | CSS 줄바꿈·`line-clamp`·Pretendard 그대로 |
| 누르기·키보드·스크린리더 | `<g tabindex role="button">` 흉내 — 보조기기마다 편차 | DOM 이 없어 대체 DOM 을 따로 만들어야 함 | 진짜 `<button>`·목록 구조 |
| 물방울 모양 | path 로 정확 | 정확 | CSS `border-radius`(아래 4) |
| 노드 수백 개 | 좋음 | 가장 좋음(수천 개) | 충분(노드당 요소 몇 개) |
| 이음선 | 좋음 | 좋음 | SVG 한 장(뒤에 깔고 `aria-hidden`) |

운영 최대 36 노드라 Canvas 의 이점(수천 개)이 필요 없고 접근성 비용이 가장 크다. → HTML 노드 + SVG 이음선.

**확대·축소·이동 — 후보 실측**(2026-11-01. 프로젝트 밖 임시 폴더에 설치 → esbuild 번들(react·react-dom 제외, minify) → gzip -9. 저장소 `package.json` 무변):

| 후보 | 버전·라이선스 | min | gzip | 성격 | 이 화면에 |
|---|---|---|---|---|---|
| react-zoom-pan-pinch | 4.2.0 · MIT | 47.8KB | 14.5KB | React 감싸개, transform 이동. `zoomIn`·`zoomOut`·`centerView`·`zoomToElement`·`limitToBounds` 제공 | 기능은 딱 맞다. 다만 transform 이동이라 Tab 포커스 때 브라우저 자동 스크롤과 따로 놀아, 포커스마다 `zoomToElement` 를 직접 불러야 한다 |
| @use-gesture/react | 10.3.1 · MIT | 28.5KB | 8.9KB | 제스처 인식만 | 변환 계산·버튼·경계는 직접 |
| d3-zoom (+d3-selection) | 3.0.0 | 48.1KB | 16.2KB | 명령형(DOM 직접) | React 상태와 이중 관리 |
| panzoom | 9.4.4 · MIT | 17.8KB | 7.1KB | 바닐라·명령형(의존 3개) | 위와 같음 |
| @xyflow/react(React Flow) | 12.12.0 | 179.9KB | 59.4KB | 노드 편집기 전체 | 과함 — 중심 기능이 이번에 안 하는 드래그 연결 |
| 직접 구현(네이티브 스크롤 + 배율) | — | 0 | 0(코드 ≈150줄 추정) | 이동 = 브라우저 스크롤, 확대 = 배율 값 | 아래 |

**추천: 직접 구현 — "이동은 브라우저 스크롤, 확대는 배율"**(새 의존성 0 — PWA 서비스워커를 수제로 둔 것과 같은 판단)(Q42).

- 구조: 지도 영역 = 세로로 꽉 찬 스크롤 상자(`overflow: auto`, 높이 = 화면 − 머리 − 도구줄) → 안에 크기 상자(세계 폭×배율, 세계 높이×배율) → 그 안에 세계(`transform: scale(배율)`, 기준점 왼쪽 위).
- 이동: 한 손가락 끌기·휠·키보드 화살표·PageDown 이 전부 브라우저 기본 스크롤(관성·스크롤 막대 포함). 기본 배율에서 세계 폭이 화면 폭에 맞으므로 **기본 상태에선 세로 스크롤만** 있다 — 어르신에겐 보통 페이지와 같다.
- 확대: [+]·[−](1.25배씩), 두 손가락 오므리기(손가락 2개일 때만 `touchmove`(passive:false)에서 `preventDefault` 하고 거리 비율로 배율 — 한 손가락 스크롤은 브라우저 그대로, iOS 는 `gesturestart` 도 막음), 데스크톱 Ctrl+휠·트랙패드 오므리기(`wheel` + `ctrlKey`). 확대 중심점이 화면에서 제자리에 남도록 스크롤 위치를 같이 고친다. 제스처 동안은 transform 만 바꾸고 손을 뗄 때 크기 상자를 고친다(제스처 중 레이아웃 계산 회피).
- 포커스 이동을 브라우저 자동 스크롤이 그대로 따라간다 — transform 이동 라이브러리의 약점이 없다.
- 위험: iOS Safari 오므리기·두 번 탭 확대와의 충돌. → 2b-3a 첫 작업으로 실기기 시험(iPhone 1·저가 Android 1). 막히면 react-zoom-pan-pinch 로 바꾼다(14.5KB, `/my-life` 경로 묶음에만 들어감).

**배율 범위**: 기본 1.0 · 최대 2.0 · 최소 = [전체 보기] 배율(세계 전체가 화면에 들어오는 값, 하한 0.15). 스크롤 상자가 경계라 세계가 화면 밖으로 날아가지 않는다.

**노드 수 상한 — 실측 기준**(2b-3a 완료 기준에 포함. 측정 스크립트는 기존 390px 하네스처럼 미커밋)

- 픽스처: 지도 노드 N = 50·100·200·400·800(중심 = N/10, 나머지 이야기·사람·장소, 이야기마다 작은 물방울 0~3, 모두 펼침).
- 환경: 운영 빌드, 헤드리스 Chromium 390×844·DPR 3, CPU 4배 감속(모바일 중급 기기 흉내) + 실기기 2대 눈 확인.
- 측정과 통과선:
  1. 첫 표시(이동 시작 → 지도 `data-ready`): ≤ 2.5초
  2. [+]/[−] 누름 → 다음 그림: ≤ 200ms(INP "좋음" 기준)
  3. 2초 스크롤·확대 스크립트의 프레임 간격 p95: ≤ 33ms(30fps)
  4. DOM 요소 수·JS 힙: 기록만
- 상한 = 1~3 을 모두 지키는 가장 큰 N. 접기 기본 기준(60)은 상한의 절반으로 맞추고, 상한을 넘는 사용자는 처음부터 [목록으로 보기]로 연다.

##### 3. 접근성(필수)

**기본 배율 — 390px 정의**: 배율 1 = CSS px. 세계 폭 342 + 좌우 여백 24 = 390 → 가로 스크롤 0. 글씨 최소 18px(작은 물방울 포함, 중심 이름 22px). 누르는 곳 최소 56×56 — 가지 노드 높이 64·이야기 노드 88 이상·펼치기 버튼·도구줄. **작은 물방울은 누르는 곳이 아니다**(이야기 노드 전체가 누르는 곳 — 56px 칩을 이야기 안에 넣으면 390 화면이 칩으로 덮인다는 이전 2b.1 판단 유지, 버튼 안 버튼도 피함). 폭 360(갤럭시)은 여백 9px 로 맞고, 358 미만(구형 320)은 기본 배율에서 가로 이동이 생긴다(드묾 — 수용). 데스크톱(지도 영역 폭 ≥ 600)은 기본 배율 = min(1.5, 영역 폭 / 390) — 배치는 같고 글씨만 커진다.

**도구줄**(지도 아래 고정, 엄지가 닿는 곳, 각 56×56·18px): [문구 필요: 전체 보기] · [+] · [−] · [문구 필요: 목록으로 보기]. [+]·[−] 버튼 이름 [문구 필요: 크게 보기]·[문구 필요: 작게 보기]. 배율이 바뀌면 `aria-live="polite"` 로 [문구 필요: 배율 알림 — 지금 N%].

**길 잃음 방지**

1. 지도 위 고정 띠 [문구 필요: 지금 보는 곳 — 1977 대학교 입학] — 화면 가운데에 가장 가까운 중심, 스크롤이 멈출 때 갱신(`IntersectionObserver`).
2. [전체 보기]는 항상 같은 자리. **전체 보기 상태(배율 < 0.6)에서는 가지 노드를 누를 수 없게 하고**(너무 작다) 중심 이름만 화면 기준 18px 이상으로 덮어 그려(배율 반비례 크기의 버튼, 높이 56) 누르면 그 띠로 배율 1 이동 — 목차처럼 쓴다(Q43).
3. 처음 들어오면 배율 1, 맨 위(출생). 같은 탭에서 돌아오면(이야기 상세 → 뒤로 등) 마지막 위치·배율(`sessionStorage`).
4. 스크롤 상자가 경계 — 세계가 화면 밖으로 사라지지 않는다.

**키보드**: 노드는 전부 `<button>`. Tab 순서 = 문서 순서 = 시기 순 — 띠마다 중심 → (접힌 띠면) 펼치기 버튼 → 왼쪽 가지(위→아래) → 오른쪽 가지. 포커스가 가면 스크롤 상자가 그 노드를 화면 안으로 가져온다(브라우저 기본). Enter·Space = 패널 열기, Esc = 패널 닫고 원래 노드로 포커스. 지도 안에 포커스가 있을 때만 `+`·`-`·`0`(전체 보기)·`1`(기본 배율) — 한 글자 단축키는 포커스가 있을 때만 동작해야 한다(WCAG 2.1.4). 포커스 표시는 기존 `focus-visible:ring-4 ring-brand ring-offset-2` — ring 은 box-shadow 라 물방울 모양을 그대로 따른다.

**스크린리더·목록 대체**

- 지도 DOM 자체를 목록 구조로 만든다: `<ol aria-label="[문구 필요: 지도 목록 이름]">` 안에 중심마다 `<li>`(중심 버튼 + `<ul>` 이야기 묶음 + `<ul>` 사람·장소 묶음). 위치만 CSS 절대 좌표다. 그래서 스크린리더는 시기 순 목록으로 읽는다. 이음선 SVG·꼭지 장식은 `aria-hidden`.
- 버튼 이름 = 종류 + 이름 + 수(예: "1977년 대학교 입학, 이야기 3, 사람 2" / "사람, 김민수" / "이야기, 고등학교 때 김민수라는…, 함께 나온 분 김민수") — 색·아이콘 없이도 종류가 들린다. 정확한 형식은 [문구 필요: 버튼 이름 형식].
- **[목록으로 보기]** = 같은 컴포넌트를 절대 좌표·배율 없이 일반 흐름으로 그린 들여쓴 목록(이전 2b.1 A 목록형 모양). 글자 200% 확대·화면 돋보기 사용자, 지도에서 길 잃은 사람용. 패널·넣기는 같다. URL `?view=list`(뒤로 가기로 지도 복귀), 도구줄 버튼은 [문구 필요: 지도로 보기]로 바뀐다.

**움직임 줄이기**: `prefers-reduced-motion` 이면 패널 올라오기·[전체 보기]·띠 이동 애니메이션 없이 바로.

**완료 기준 측정**(390 헤드리스, 픽스처): 기본 배율에서 가로 스크롤 0 · 화면 안 글자 최소 18px · 누르는 곳 최소 56px(작은 물방울은 버튼이 아님을 같이 확인) · primary 화면당 0~1개 · Tab 으로 모든 노드 도달 · Enter → 패널 · Esc → 포커스 복귀 · 목록 보기 · 목록 보기 글자 200% 에서 가로 스크롤 0.

##### 4. 물방울 모양·색

**모양 — CSS `border-radius`(SVG path 아님)**

- 노드 = `<button>` 자체에 비대칭 `border-radius`. 세 모서리는 크게, 부모 쪽 위 모서리 하나만 작게 해 꼭지가 줄기를 향한다. 글자를 돌리지 않는다(45° 돌린 진짜 물방울은 글자도 돌아가 탈락).

| 종류 | 크기(배율 1) | `border-radius` | 안쪽 여백(가로·세로) |
|---|---|---|---|
| 중심 | 248×120 | `50%`(타원, 꼭지 없음 — 줄기의 매듭) | 36 · 14 |
| 왼쪽 가지(이야기·그때의 나) | 163 × (88 + 40×작은 물방울 줄 수, 최대 2줄) | `32px 6px 32px 32px`(오른쪽 위 꼭지) | 20 · 12 |
| 오른쪽 가지(사람·모임·장소) | 163×64 | `6px 32px 32px 32px`(왼쪽 위 꼭지) | 20 · 12 |
| 작은 물방울(이야기 안) | 높이 36 · 폭은 이름 길이(추정, 위 1) | `18px 18px 18px 4px` | 11 · 0 |

- SVG path 대안: 모양은 더 정확하지만 글자 영역·포커스 링·누르는 영역을 path 와 따로 맞춰야 하고 확대 때 둘이 따로 논다. 꼭지 장식 하나면 CSS 로 충분하다.
- §4.1 의 "원 안 글자는 줄바꿈·확대에 약하다" 우려: 타원은 글자가 짧은 중심(연도 + 이름 2줄)에만 쓰고, 글자가 긴 이야기 노드는 큰 라운딩 사각 + 꼭지로 둬 글자 폭을 지킨다. 넘친 글자는 패널·목록 보기에서 전부 보인다.
- 누르는 영역 = 버튼 사각 상자 전체(둥근 모서리 바깥 귀퉁이도 눌린다 — 누르는 곳이 넓어지는 쪽이라 문제없음).
- **크기 위계 중심 > 이야기 > 사람·장소**는 넓이·테두리 굵기·글자 굵기로 낸다. 글자 크기는 18px 아래로 내리지 않는다(중심 이름 22px 굵게 + 연도 18px · 이야기 18px · 사람·장소 18px). 테두리 중심 3px · 가지 2px · 작은 물방울 2px.

**색**(기존 토큰·확장 의미색 안에서. 대비는 WCAG 상대휘도 공식 계산 2026-11-01, Tailwind v4 기본 팔레트 oklch → sRGB 환산). 글자는 전부 `ink` — 모든 바탕에서 14:1 이상. 종류 구분은 테두리색 + 아이콘 + 버튼 이름(색만으로 구분하지 않는다). 테두리는 바탕(`canvas`) 대비 3:1 이상(WCAG 1.4.11 비텍스트).

| 종류 | 바탕(ink 대비) | 테두리(canvas 대비) | 아이콘(lucide, `aria-hidden`) | 근거 |
|---|---|---|---|---|
| 중심 | `banner` #fff8e8 (14.3) | `action` #8a5f1a 3px (5.3) | 없음(연도·이름이 표지) | 브랜드 골드 계열 = 줄기의 주인 |
| 이야기 | `surface` #fffdf8 (14.9) | `ink-soft` #5c534a (7.0) | `BookOpen` | 본문 계열 |
| 그때의 나 | `surface` (14.9) | `sage` #6b8c5a (3.6) + 글자 꼬리표 [문구 필요: 그때의 나] | 없음(꼬리표가 표지 — 사람 아이콘과 헷갈리지 않게) | `sage` 는 정의만 있고 미사용인 예약색 — 이번이 첫 사용 |
| 사람·모임 | `surface` (14.9) | `emerald-700` #007a55 (5.0) | `UserRound` · 모임 `Users` + 꼬리표 [문구 필요: 모임] | 인물 연결됨 = emerald(`PeopleConnectModal`) |
| 장소 | `surface` (14.9) | `sky-700` #0069a8 (5.5) | `MapPin` | sky = 정보·안내 의미색 — 위치 정보로 확장 |
| 작은 물방울 | 종류의 50 틴트: `emerald-50` #ecfdf5 (14.4) · `sky-50` #f0f9ff (14.2) | 종류의 700 색 | 없음(공간이 좁아 이름만) | 가지와 같은 색 짝 |
| PROPOSED | 위와 같음 | 같은 색 **점선**(점선은 PROPOSED 전용) + 꼬리표 [문구 필요: 확인 전] | — | 이전 2b.1 규칙 |

- 꼬리표 글자(그때의 나·모임·확인 전·다른 시기에도 있어요)는 `ink-soft` — `surface` 대비 7.4.

- 연대 틴트(`decade-*`)는 텍스트 바탕 금지 규칙대로 쓰지 않는다. 줄기 4px 만 `decade-strip-*`(스트립 허용).
- 구현 커밋에서 `docs/design-system.md` 에 두 줄을 더한다: ① 물방울 라운딩 예외(My Life 한정 — §5 "과한 라운딩 늘리지 않음"의 예외) ② `sage` 의 첫 용도(그때의 나). 색 배정은 Q45.

##### 5. 패널·추가 흐름

**패널 공통**(아래에서 올라오는 패널 — 끌어 올리기·내리기 제스처 없음, 버튼으로만)

- `role="dialog"` · `aria-modal` · `aria-labelledby`=패널 제목. 열리면 제목에 포커스, Esc·[문구 필요: 닫기](56px)·바깥 누르기로 닫히고, 닫히면 연 노드로 포커스가 돌아간다. 최대 높이 75dvh, 안에서 스크롤. 바깥은 반투명 막(패널이 덮는 동안만 지도 대비가 낮아짐 — 볼 정보는 패널에 있음).
- 한 패널 안에서 단계를 바꾼다: [기본] → [고르기 목록] → [새로 만들기 입력] → [확인]. 위에 [문구 필요: 뒤로](56px). 단계마다 primary 1개.
- 서버 액션 뒤 `router.refresh()` 를 해도 지도 위치·배율·접힘은 유지(완료 기준 항목). 넣은 뒤 패널 안에 [문구 필요: 넣었어요 알림].

**노드별 패널**

| 노드 | 보이는 것 | 버튼 | 단계 |
|---|---|---|---|
| 중심 | 이름·기간(year~endYear / [연도 모름])·이야기 수·사람 수 | [문구 필요: 이야기 추가] · [문구 필요: 인물 넣기] · [문구 필요: 장소 넣기] · (펼친 띠에 가지가 있으면) [가지 접기] | 2b-3a 는 정보 + [가지 접기], 넣기 버튼은 2b-3b |
| 이야기·그때의 나 | 시기, 본문 앞 3줄, 함께 나온 분·장소 이름 | [문구 필요: 본문 보기] · [인물 넣기] · [장소 넣기] · [문구 필요: 다른 시절로 옮기기] · (확인 대기가 있으면) [문구 필요: 확인하러 가기] → `/story-review/confirm#<episodeId>` | [본문 보기]: 2b-3a·b 는 패널 안에서 평문 전체를 펼침, 2b-3c 부터 → `/my-life/story/[id]`. 넣기·옮기기는 2b-3b |
| 사람 | 이름·관계·만난 해 | [문구 필요: 인물록에서 보기] → `/people/[id]` | 2b-3a |
| 장소 | 이름·주소 | [문구 필요: 지도에서 보기] ↗ 네이버/구글(기존 `PlacePreview` 링크 규칙) | 2b-3a(장소 상세는 2b-5) |
| 모임 | 이름·구성원 | 없음(모임을 만드는 화면이 아직 없음 — 2b 범위 밖) | 2b-3a |

**넣기 흐름(2b-3b) — 기존 함수 재사용, 새 저장 경로 0**

| 버튼 | 고르기 목록 | 새로 만들기 | 저장 |
|---|---|---|---|
| 중심 [이야기 추가] | — | [문구 필요: 말로 이야기하기] → `/chat-v3?gapEventId=<중심>&gapType=episode` | 기존 대화 저장(`finishEpisodeChatCore`). 대화 없이 직접 쓰기는 2b-3c(Q47) |
| 중심 [인물 넣기] | 확정 인물(`subjectType=person`·`isDraft=false`) 중 이 중심에 아직 없는 분. 10명이 넘으면 위에 [문구 필요: 이름 찾기] 칸 | [문구 필요: 새로 만들기] → 이름(50)·관계(30) → `createPerson`. 같은 이름 확정 인물이 있으면 2b-2 후속과 같은 되묻기([같은 분이에요]/[다른 분이에요]) | `linkPersonToLifeEvent`(`PersonLifeEvent`, 멱등) — Q44 |
| 중심 [장소 넣기] | 사용자 `Place` 중 이 중심에 없는 곳 | `PlaceSearchInput`(네이버/구글) 결과 → 같은 사용자·같은 이름(공백 정규화)·같은 주소 `Place` 가 있으면 재사용, 없으면 생성(2b.5 `resolvePlaceIds` 를 이 단계로 당김) | `saveNodeLink(LIFE_EVENT→PLACE, CONFIRMED, USER)` |
| 이야기 [인물 넣기] | 확정 인물 중 이 이야기에 아직 없는 분(대상 인물 제외) | 위와 같음 | `saveNodeLink(EPISODE→PERSON, CONFIRMED, USER)` + 주 소속 중심에 `PersonLifeEvent` upsert — 2b-2 [맞아요]와 같은 결과라 확정 인물만 보는 기존 화면·갭에 바로 반영 |
| 이야기 [장소 넣기] | 사용자 `Place` | 위와 같음 | 브릿지 메모리에 `MemoryPlace` 1행 추가(`placeId` + 이름·주소·좌표 복사). 기존 `saveEpisodePlaces` 는 전부 지우고 다시 쓰는 함수라, 같은 파일에 소유 가드가 같은 "1행 추가" 내부 함수를 둔다 — Q44 |

- **Q44 결정(2026-11-01) 반영**: 위 "저장" 열의 `linkPersonToLifeEvent`·`MemoryPlace` 1행 추가는 화면·액션이 부르지 않고 **`saveNodeLink` 가 안에서 한다**(유일한 입구 — 방향 정규화·양 끝 소유 확인이 한 곳, NodeLink 에 같은 쌍을 또 두지 않음). 2b-3a 에 먼저 구현(`ROUTED_PAIRS` — 아래 "2b-3a 구현 결과"). 화면·액션은 모든 넣기에서 `saveNodeLink` 만 부른다.
- 공통: 노드·대상 모두 본인 것(`saveNodeLink` 가 확인). 이미 있으면 조용히 통과(멱등). 고르기 목록·입력 칸은 56px·18px.
- ~~빼기(연결 지우기)는 이번 요구에 없다.~~ → **Q50 결정(2026-11-01)**: 넣은 직후 같은 패널의 [되돌리기] + 패널의 연결 노드마다 [빼기](확인창). 빼기는 연결만 끊는다(노드 삭제 아님). `removeNodeLink` 도 같은 원칙 — 입구 하나, 쌍에 따라 기존 칸(`PersonLifeEvent`·`MemoryPlace`)으로 넘김. 구현은 2b-3b.

**시기 불일치 — 옮기기를 이 패널에(Q32~Q34)**

- Q34 결정("2b-3 이야기 상세에 '다른 시절로 옮기기'")을 **이야기 패널 버튼**으로 옮긴다 — 상세 화면(2b-3c)보다 패널(2b-3b)이 먼저 생긴다. 2b-3c 상세에도 같은 버튼.
- 흐름: [다른 시절로 옮기기] → 다른 확정 중심 목록(줄기 순서, 행마다 연도·이름, 56px. 지금 중심은 [문구 필요: 지금 여기] 표시로 누를 수 없음) → 확인 [문구 필요: ‘<본문 앞부분>’ 이야기를 <연도 이름>으로 옮길까요?] [문구 필요: 옮기기](primary) / [취소] → 패널 닫고 지도가 그 띠로 스크롤, 옮긴 노드 2초 강조(움직임 줄이기면 강조만).
- 저장 `lib/episode-move.ts` `moveEpisodeToLifeEvent(userId, episodeId, targetLifeEventId)`(auth 없는 순수 모듈 + 액션 래퍼), 트랜잭션 1개:
  1. 소유·상태 확인 — 이야기의 중심·대상 중심 모두 본인, 대상은 CONFIRMED·CORRECTED. 같은 중심이면 아무것도 안 함.
  2. `Episode.lifeEventId` = 대상. 대상과의 추가 소속 `NodeLink(LIFE_EVENT→EPISODE)` 가 있으면 지운다(이제 주 소속 — 한 쌍 = 한 곳). 옛 중심과의 추가 소속은 만들지 않는다.
  3. 브릿지 `UserMemory` 의 연도·제목(`createEpisodeBridge` 가 중심에서 채운 값 — `resolveMemoryYear`·label)을 대상 중심 기준으로.
  4. 두 중심의 `hasEpisode` 다시 계산(STORY 만 — `deleteEpisode` 재계산과 같은 규칙).
  5. 이 이야기의 확정 인물(대상 인물 + `NodeLink` 확정): 대상 중심에 `PersonLifeEvent` upsert. 옛 중심의 `PersonLifeEvent` 는 지우지 않는다 — 출처 칸이 없어 직접 넣은 연결과 구별할 수 없다(Q48). 만난 해 규칙 3(인물이 이 이야기로만 이어져 있고 만난 해 = 옛 중심 연도면 새 중심 연도로).
  6. 확인 대기(PROPOSED) 연결은 이야기에 붙어 있어 그대로 따라간다.
- 착수 때 확인할 영향: 포스터 브릿지 `v3_<lifeEventId>` 행이 온디맨드 upsert 에서 옛 중심 본문을 빼고 새 중심에 합치는지(`test-v3-poster-bridge` 항목 추가) · 포스터 P3 저장 문장(원본 해시가 바뀌면 기존 재생성·주문 거부 경로) · 인터뷰 갭 키 `gap:episode:<lifeEventId>`(옛 중심의 이야기가 0이 되면 갭이 다시 열림 — 맞는 동작).
- Q32(대화 첫 본인 턴 직후 한 번 묻기)·Q33(출생 중심 + 비가족 만난 해 비움)·Q35(기존 데이터 dry-run)는 대화 쪽 변경이라 지도와 독립 → 2b-3d(아래 7).

##### 6. 메뉴 진입·navigation-map

- 경로 `/my-life`(새 최상위). 이야기 상세는 2b-3c 에 `/my-life/story/[id]`(+`/edit`) — 2b.2 의 `/story-review/nodes/…` 경로를 이 아래로 옮긴다(Q36).
- **사이드 패널**(`app/timemachine/SidePanel.tsx`) "📖 내 이야기" 묶음의 V3 분기, [내 이야기](`/story-review`) 바로 아래: `MenuItem href="/my-life" label="My Life" hint=[문구 필요: My Life 메뉴 설명] prefetch={false}`(P22-2 — 완전 동적 화면은 배경 prefetch 끔). V2 분기엔 넣지 않는다.
- **`/story-review`**: 머리(제목·부제) 바로 아래 secondary [문구 필요: My Life 로 보기] → `/my-life`(이전 2b.1 [노드 보기 진입] 자리). primary 는 맨 아래 "계속 이야기하기" 그대로.
- `/my-life` 빈 상태(확정 중심 0): [문구 필요: My Life 빈 상태] + [문구 필요: 이야기 나누기] → `/chat-v3`(primary).
- 바꾸지 않는 곳: `/chat-v3` 종료·오늘의 인터뷰 요약 이동(지금처럼 `/story-review` 계열), 랜딩·헤더.

**navigation-map 반영 계획**(화면이 생기는 단계의 같은 커밋 — CLAUDE.md 규칙 7)

| 단계 | 문서 위치 | 더할 내용 |
|---|---|---|
| 2b-3a | 머리 "최신화" · §0 흐름도 | `/story-review ──[My Life 로 보기]──▶ /my-life` |
| 2b-3a | §1 사이드 패널 표 | `\| \| My Life \| → /my-life \| V3 트랙 \|` |
| 2b-3a | §2 분기·동의 표 | `/my-life` — 비로그인 → `/login` · V2 트랙 직접 진입 → `/enter` |
| 2b-3a | §2 v3 통합 채팅 표 | `/story-review` [My Life 로 보기] → `/my-life` |
| 2b-3a | 새 절 "My Life `/my-life`" | 도구줄 4개(⚙ 화면 안) · 노드 누르기(패널, 전환 없음) · 띠 접기·모두 펼치기 · 전체 보기 상태 중심 이름(그 띠로, 전환 없음) · 목록으로 보기(`?view=list`) · 패널 [인물록에서 보기] → `/people/[id]` · [지도에서 보기] ↗ 네이버/구글 · [확인하러 가기] → `/story-review/confirm#<episodeId>` · 빈 상태 → `/chat-v3` |
| 2b-3b | 같은 절 | [이야기 추가]·[말로 이야기하기] → `/chat-v3?gapEventId=…&gapType=episode` · 인물·장소 넣기 ⚙ · 다른 시절로 옮기기 ⚙ |
| 2b-3c | 같은 절 + 상세 절 | [본문 보기] → `/my-life/story/[id]` · 상세·편집 화면 표 |

##### 7. 구현 단계·완료 기준·회귀

| 단계 | 내용 | 완료 기준 | 회귀 |
|---|---|---|---|
| **2b-3a 보기 전용** ✅ 2026-11-01 | `getMyLifeData`·`layoutMyLife`·`/my-life`(지도·도구줄·띠 접기·지금 보는 곳·전체 보기 목차·목록 보기)·패널(정보와 외부 이동만)·메뉴 진입 2곳·navigation-map. 첫 작업 = iOS·Android 실기기 확대 시험(Q42) | 쿼리 수 고정(기록 양 2배 픽스처에서도 같은 수) · 포함 규칙(추가 소속 두 중심·오른쪽 가지 중복 제거·PROPOSED 점선·미확정 중심 제외·남의 노드 0) · 배치(픽스처 0·1·운영 최대 규모·800 노드·연도 없는 중심·접힘에서 사각형 교차 0·세계 안·같은 입력 같은 출력) · 노드 수 상한 N 실측 기록 · 390 실측(위 3 목록) · 실기기 2대 이동·확대·패널 | 17종 + 신규 `test-my-life`(LLM 0 — 데이터·배치 함수) → **18종** |
| **2b-3b 추가 기능** | 패널 넣기 5종 · `Place` 찾기-또는-만들기 · 다른 시절로 옮기기 | 넣기마다 DB 상태(연결 1행·멱등·남의 노드 거부·확정 인물만 목록·같은 이름 되묻기) · 고른 장소 재사용 시 `Place` 수 무변 · 옮기기(주 소속·브릿지 연도/제목·두 중심 `hasEpisode`·추가 소속 정리·`PersonLifeEvent`·만난 해 규칙 3·대기 연결 따라감) · 포스터 브릿지 행 이동 · 액션 뒤 지도 위치 유지 · 390 실측(고르기 목록·입력·확인 단계) | 18종(`test-my-life` 항목 추가 · `test-v3-poster-bridge` 옮기기 항목 · `test-node-confirm` 되묻기 함수 재사용 확인) |
| **2b-3c 이야기 상세·블로그 편집** | 2b.2 + 2b-4 를 `/my-life/story/[id]` 로 — 패널 [본문 보기] 연결 · 인물 본문(Q21) · 직접 쓰기 새 이야기(Q47) | 2b.6 의 2b-4 기준 그대로 + 패널 → 상세 → 뒤로 시 지도 위치 복귀 | 18종 + `test-node-body` → **19종**(Q30) |
| **2b-3d 시기 불일치 감지(대화)** | Q32 첫 본인 턴 직후 한 번 묻기 · Q33 만난 해 비움 · Q35 운영 dry-run 개수 보고 | §6 "시기 불일치" 절 그대로 | `test-p14`·`test-person-mode` 항목 |

- 순서: 2b-3a → 2b-3b → 2b-3c. 2b-3d 는 지도와 독립이라 아무 때나(2b-3b 옮기기와 같이 하면 만난 해 규칙을 한 번에 본다). 2b-3b 가 `Place` 찾기-또는-만들기를 먼저 만들면 2b-5 에는 장소 탭·말동무 승인·`PlacesEditor` 재사용만 남는다.
- 공통: 마이그 0 · `proxy.ts` 무접촉 · 새 의존성 0(Q42 가 라이브러리로 정해지면 1) · 화면이 생기는 단계마다 navigation-map 같은 커밋 · 빌드 전 dev 종료 · 픽스처만(test30·실고객 접촉 0).
- 2b.6 표의 2b-3·2b-4 행은 이 표로 대체한다.

##### 8. 결정 질문·문구

- 결정 질문: §7.3(Q36~Q50).
- 문구 자리: §4.5 "My Life" 행에 모았다.

#### 2b.2 노드 상세 — `/story-review/nodes/[종류]/[id]`

> **2026-11-03 구현(2b-3c)** — `/my-life/story/[id]`(+`/edit`·`/history`)·`/my-life/person/[id]/edit`, 이전 판 보관(Q23 재결정). 설계와 다른 점·검증은 `docs/phase/my-life-restructure.md` §19.

> **2026-11-01 갱신(2b-3 재정의)**: 경로는 `/my-life/story/[id]`(+`/edit`)로 옮긴다(Q36). 진입은 My Life 이야기 패널 [본문 보기](2b-3c). 중심·인물·모임은 지도 패널이 상세를 대신하므로 2b-3c 의 새 상세 페이지는 이야기만 — 인물 본문(Q21) 편집 자리는 2b-3c 착수 때 정한다. 아래 본문 표시 규칙·블로그 편집·저장 함수는 그대로.

종류 슬러그: `event`(중심) · `story`(이야기 — STORY·SELF 둘 다) · `person` · `group`. 장소는 공용 `/people/places/[id]`(2b.5 — 장소 탭이 V2 와 같이 쓰는 화면이라). 남의 노드·없는 노드는 `notFound()`.

| 종류 | 보이는 것 | 편집(2b) |
|---|---|---|
| 중심 | 이름·기간(year~endYear, 끝 연도가 없으면 시작만), 소속 이야기 목록, "그때의 나" 묶음(인물·그룹별 — SELF 이야기의 `NodeLink` 상대 기준, 범주형 문항 답은 "그 밖" 묶음), 사람·그룹·장소 칩 | 없음(Q21) |
| 이야기 | 제목·시기(`Episode.year ?? 중심 연도`)·소속 시기 칩(주 소속 + 추가 소속), 본문(아래 규칙), 본문에 넣지 않은 사진(브릿지 메모리 사진) 묶음, 사람·그룹·장소 칩, [문구 필요: 고치기] | **블로그 편집** |
| 인물 | 이름·관계·메모(문단), 나온 시기(`PersonLifeEvent`), 나온 이야기(`Episode.personId` + `NodeLink`), 속한 그룹 | 정보 고치기 = 기존 `/people/[id]/edit` 링크(공용 화면) + **블로그 편집**(Q21 결정 2026-11-01 — 아래 "이야기 외 노드" 참고) |
| 그룹 | 이름·메모, 구성원, 연결된 시기·이야기 | 없음 |

**본문 표시 규칙 — 기존 평문은 그대로**

1. `NodeBody` 가 없으면 `Episode.content` 를 빈 줄 기준 문단으로 나눠 보여 준다(이관 없음 — §1.8).
2. `NodeBody` 가 있어도 **`NodeBody.plainText === Episode.content` 일 때만** 블록 문서로 그린다. 다르면(다른 경로로 본문이 고쳐짐) 평문 문단으로 보여 주고, 문서는 다음 저장 때 덮어쓴다. **평문이 언제나 진실**이고 문서는 평문과 맞을 때만 쓰는 표현 층이라, 낡은 문서가 화면에 나오는 일이 없다.
3. `/story-review` 이야기 카드의 [고치기](평문 textarea)는 그대로 두되, 2번 조건을 만족하는 문서가 있는 이야기는 textarea 대신 상세 편집 링크를 보여 준다 [문구 필요: 사진·소제목이 있는 글 고치기 안내]. 평문 고치기로 소제목·사진 위치가 조용히 사라지는 것을 막는다(`getStoryReviewData` 가 `hasRichBody` 를 같이 돌려줌, 쿼리 +1).

**블로그 편집 — `/story-review/nodes/story/[id]/edit`**(Q8: 블록만·에디터 라이브러리 0·저장 버튼)

- 블록 3종(§1.8): 문단 = 기존 `VoiceTextarea`(음성 입력 재사용), 소제목 = 한 줄 입력, 사진 = 썸네일 + 캡션 입력.
- 블록 사이 버튼: [문구 필요: 문단 추가] · [문구 필요: 소제목 추가] · [문구 필요: 사진 넣기]. 블록마다 [위로]·[아래로]·[빼기](56px, 드래그 없음 — §4.2). 390px 에서 세 버튼이 한 줄(각 약 100px).
- 사진 넣기: ① 이 이야기에 이미 있는 사진(브릿지 메모리 사진)에서 고르기 ② 새로 올리기 = 기존 `/api/photos`(memoryId = 브릿지 메모리 — `attachPhotoToMemory` 가 이미 `episode` 행을 허용), 클라이언트 GPS 제거(`lib/photo-exif.ts`)·용량 제한 그대로. 올리기는 저장 전에 일어나지만 사진은 브릿지 메모리에 붙어 남는다(본문에 안 넣어도 상세의 "사진" 묶음에 보임 — 고아 아님).
- [빼기]는 본문에서만 뺀다. 사진 삭제가 아니다(어르신 사진 보존 — `movePhotoToMemory` 빼기와 같은 원칙). 사진 삭제는 기존 사진 화면에서.
- [저장](이 화면의 primary)·[취소]. 저장 안 한 변경이 있을 때 화면 안 [뒤로]를 누르면 화면 안 안내 [문구 필요: 저장 안 한 글 안내](브라우저 기본 확인창은 쓰지 않음).

**저장 함수 — `lib/node-body.ts` `saveEpisodeBody(userId, episodeId, doc, baseVersion)`**(auth 없는 순수 모듈 + `app/actions/node-body.ts` 래퍼 — `lib/account-deletion.ts` 처럼 회귀가 같은 함수를 부르게)

1. 문서 검사: `v === 1`, 블록 종류 3개만, 상한(블록 60개·문단 3,000자·소제목 40자·캡션 100자 — 제안값, Q22), 빈 문단 제거.
2. 사진 소유: 사진 블록의 `photoId` 는 `Photo(userId 일치, memoryId = 이 이야기의 브릿지 메모리)` 만. 다른 메모리·남의 사진이면 거부. 없는 사진(지워짐) 블록은 **거부하지 않고 뺀다**(§1.8 "다음 저장 때 빠진다").
3. 평문 = 문단·소제목을 빈 줄로 이음. **사진 캡션은 평문에 넣지 않는다**(§1.8 에서 바꿈 — Q27). 캡션은 `Photo.caption` 한 곳에 저장한다. 그래야 포스터 P3·lab·다듬기 원문에 "졸업식 날" 같은 사진 설명이 이야기 문장 사이에 끼지 않는다. 평문이 비면 거부 [문구 필요: 빈 글 저장 안내](이야기를 지우려면 기존 지우기로).
4. 트랜잭션 1개:
   - `NodeBody` 생성(baseVersion 0 — 유니크 충돌이면 충돌) 또는 `updateMany({ id, version: baseVersion })` 로 version+1(count 0 이면 충돌).
   - `Episode.content`·브릿지 `UserMemory.content` 갱신. Q9 규칙(본문이 실제로 바뀌면 다듬기 3필드 초기화)은 `updateEpisodeContent` 와 **같은 내부 함수**를 쓴다(트랜잭션 클라이언트를 받게 추출, 동작 무변).
   - 캡션이 바뀐 사진의 `Photo.caption`.
5. 충돌이면 저장하지 않고 [문구 필요: 다른 곳에서 먼저 고쳐졌어요 — 다시 불러오기].

- **버전 = 저장 횟수 겸 동시 편집 충돌 검사**(`NodeBody.version`). 문서 형식 버전은 doc 안의 `v`. **이전 판 보관(되돌리기)은 하지 않는다** — 필요하면 별도 테이블 + 마이그(Q23).
- 영향: 포스터 브릿지·lab·다듬기·`/story-review` 는 평문만 읽어 무수정(§1.8). 포스터 P3 저장 문장은 원본 해시가 바뀌면 지금 `EpisodeCard` 고치기 때와 같은 기존 처리(재생성·주문 거부)를 탄다. 가족 룸은 `episode` 브릿지가 이미 제외 목록이라 노출 0.
- 이야기 외 노드 본문: **인물은 2b 에서 만든다**(Q21 결정 2026-11-01 — 성민). 중심·그룹·장소는 다음 단계. 인물 본문은 `node_body` 브릿지 메모리(사진용), `attachPhotoToMemory` 허용 확장, `listRoomMemories` 제외 추가(§1.6-6)가 같이 필요하고, 평문은 `NodeBody.plainText` 한 곳(인물에는 이야기처럼 동기화할 원본 본문 칸이 없다 — 기존 `Person.memo` 는 그대로). 세부는 2b-4 착수 때 이 절에 적는다.

#### 2b.3 인물 확인 단계(Q6) — 추출 인물 PROPOSED → CONFIRMED

**바꾸는 경로는 하나**: 이야기 대화 마무리의 인물 추출 `savePeopleMentionedInEpisode`(`lib/person-chat.ts`). `finishEpisodeChatCore` 를 거치는 대화 — `/chat-v3` 의 이야기·구간·인물 이야기 대화, 오늘의 인터뷰 이야기·관계별 나 — 가 전부 이 함수를 탄다. 지금은 이름 있는 후보를 **확인 없이** `Person(isDraft=false)` + `PersonLifeEvent` 로 저장한다.

바꾸지 않는 경로(이미 사람이 확인하거나, 직접 물은 답):
- 인물 모드 답(`submitPersonAnswer`) — "그 시절 가까이 지낸 분?"에 직접 답한 것이고, 바로 그 인물과의 이야기 대화로 이어져 확인을 끼우면 흐름이 끊긴다(Q24).
- 채팅 온보딩 인물(채팅으로 하나씩 확인 후 저장).
- 말동무 초안(`isDraft` + `/life-timeline/manage` 초안 검토).
- `/people` 직접 등록.

**새 저장 규칙**(LLM 호출 수 무변 — 같은 추출 1회)

- `finishEpisodeChatCore` 가 방금 저장한 `episodeId` 를 넘긴다(인자 1개 추가).
- 후보마다 대상 인물 찾기:
  1. 확정 인물(`isDraft=false`) 중 이름(공백 무시) 같고 관계 호환(`isRelationCompatible`) → 그 인물.
  2. 없으면 확인 대기 초안(아래 정의) 중 같은 조건 → 그 초안. 두 이야기에 같은 새 이름이 나와도 초안은 1명.
  3. 없으면 `Person(isDraft=true, metYear)` 새로.
- **확인 대기 초안의 정의** = `Person(isDraft=true, companionSessionId=null)` 이고 그 인물로 가는 `NodeLink(EPISODE→PERSON, PROPOSED)` 가 1개 이상. 새 칸 없이(Q6 결정) 기존 칸으로 표현한다. 말동무 초안은 `companionSessionId` 가 있어 섞이지 않고, 초안 검토 화면(`DraftReview` 는 `companionSessionId: { not: null }` 만 읽음)에도 안 나온다.
- 연결: `saveNodeLink(EPISODE→PERSON, status PROPOSED, source AI)`. 이미 CONFIRMED 연결이면 그대로 둔다(`saveNodeLink` 는 내리지 않음 — 2a 관계별 나의 확정 연결과 겹쳐도 안전). 대상이 이 이야기의 대상 인물(`Episode.personId`)이면 건너뛴다(한 쌍 = 한 곳, Q5).
- **`PersonLifeEvent` 는 확인 때 만든다.** 확인 전에는 중심과의 연결이 없으므로, 확정 인물만 보던 기존 필터 — `/story-review` 타임라인 인물 칩·person_episode 갭·인터뷰 관계별 나 후보·말동무·lab·`/people` — 가 코드 수정 없이 초안을 숨긴다.

**확인 화면 — `/story-review/confirm`**

- 이야기별 묶음: "‘<이야기 제목>’에 나온 분" 아래 인물 행(이름·관계, 기존 확정 인물과 맞춰졌으면 꼬리표 [문구 필요: 이미 등록된 분]). 행마다 [문구 필요: 맞아요]·[문구 필요: 아니에요]·[문구 필요: 고칠게요](390px 에선 세로 3개, 각 56px). 화면 위 [문구 필요: 모두 맞아요](대기 전부 — Q31).
- 맞아요(트랜잭션 1개): 초안이면 `isDraft=false` · 연결 CONFIRMED(`saveNodeLink` 확정 올림) · `PersonLifeEvent(인물, 이야기의 주 소속 중심)` 추가(기존 `linkPersonToLifeEvent`, 멱등).
- 아니에요: 그 연결만 삭제. 인물이 초안이고 남은 연결(다른 PROPOSED·`PersonLifeEvent`·`Episode.personId`·`PersonEvent`·그룹 구성원)이 0 이면 초안 인물도 삭제. 확정 인물은 지우지 않는다.
- 고칠게요: 이름(50자)·관계(30자)를 고쳐서 맞아요.
  - 고친 이름이 다른 확정 인물과 맞으면(위 1번 기준) 그 인물에 연결하고 초안은 삭제.
  - 기존 확정 인물로 잘못 맞춰진 행을 고치면 새 인물을 만들어 연결하고 원래 연결은 지운다(기존 인물 정보는 안 바꿈).
- 다시 제안 방지 기록은 두지 않는다. 추출은 이야기마다 저장 때 1회라 같은 이야기에서 다시 제안될 일이 없고, 다른 이야기에 같은 이름이 나오면 다시 묻는 게 맞다.
- 처리는 연결 id 목록을 받는 액션 1개(`app/actions/node-confirm.ts` → `lib/node-confirm.ts`). 이미 처리된 id 는 건너뛴다(두 번 눌러도 안전).

**흐름 — 대화 종료 시 일괄 확인**

- `/chat-v3` 대화 종료(`finishSession` — 지금은 `/story-review` 로 감): 대기 ≥1 이면 `/story-review/confirm` 으로, 0 이면 지금처럼 `/story-review`. 확인 화면의 [문구 필요: 확인 마치기] → `/story-review`(Q25).
- **Q25 갱신(2026-11-01, E2E 후속)**: 위 이동은 세션 전체가 끝날 때만이라(이야기 하나가 끝나면 같은 채팅의 자유 대화로 돌아감) 운영 E2E 에서 확인 화면이 안 나왔다. 이야기 저장 직후 대기 ≥1 이면 `/chat-v3` 대화창에 카드 [이야기에 나온 분 N명 확인하기] → `/story-review/confirm`(대화는 계속). 세션 종료 때 이동은 유지.
- 오늘의 인터뷰 종료 요약: 대기 ≥1 이면 요약 안에 카드 [문구 필요: 인터뷰 요약 — 확인할 분 N명] + 버튼 → `/story-review/confirm`.
- `/story-review` 상단(인터뷰 카드 위): 대기 ≥1 이면 카드 [문구 필요: 정리할 것 N개] — 종료 경로를 안 거친 경우(창 닫기 등)를 보완.
- 노드 보기의 PROPOSED 칩 → `/story-review/confirm#<episodeId>`. (2026-11-01 — My Life 에서는 작은 물방울이 버튼이 아니라, 이야기 패널의 [확인하러 가기]가 이 링크.)
- 대기 수 = `NodeLink.count({ userId, status: PROPOSED, fromType: EPISODE, toType: PERSON })` 1쿼리(`@@index([userId])`).

**알려진 영향**

- person 갭("그 시절 가까이 지낸 분 있으세요?")은 `PersonLifeEvent` 가 0명이면 뜨므로, 확인 대기 중인 중심에도 뜰 수 있다. 확인하면 사라진다(Q26).
- 2b 이전에 자동 저장된 인물은 확정 그대로 둔다(소급 없음).
- 회귀 수정: `test-person-mode` P12-2 시나리오(지금은 새 인물 이순자 = 확정 + `PersonLifeEvent` 를 기대) → 초안 + PROPOSED + `PersonLifeEvent` 없음으로 바꾸고, 확인 후 확정 + `PersonLifeEvent` 생성 검사를 더한다. `test-p14`(`saveOrLinkPerson` 직접 — 인물 모드 경로)는 무변.

#### 2b.4 연결 정합 점검 — `db/reconcile-node-links.ts`

- 형식은 `db/reconcile-storage.ts` 와 같다: **기본 dry-run, 개수만 출력**(이름·id·본문 출력 없음), `--apply` 일 때만 아래 "정리" 칸이 ○ 인 항목을 지운다. `User` 가 0명으로 읽히면 `--apply` 거부(잘못된 DB 연결 방어).
- 점검 본체는 `lib/node-graph-reconcile.ts` `countNodeGraphIssues({ userId? })` 순수 함수다. 스크립트(전체 사용자)와 `test-node-graph`(픽스처 사용자 한정)가 같은 함수를 부른다.

| # | 점검 | 기대 | 정리(--apply) |
|---|---|---|---|
| 1 | 끝이 없는 연결 — `NodeLink` from/to 가 가리키는 노드 없음(종류 5개별) | 0(트리거) | ○ 삭제 |
| 2 | 소유자 불일치 — 연결 `userId` ≠ 양 끝 노드 주인(이야기는 소속 중심의 주인) | 0(`saveNodeLink`) | ✕ 보고만(원인 조사 대상) |
| 3 | 방향 위반·허용 안 된 쌍(§1.5·`ALLOWED_PAIRS` 밖) | 0(CHECK·저장 함수) | ✕ |
| 4 | 한 쌍 두 곳 — `LIFE_EVENT→EPISODE` 가 주 소속과 같음 / `EPISODE→PERSON` 이 `Episode.personId` 와 같음 | 0 | ✕ |
| 5 | 본문 정합 — `NodeBody` 노드 없음 / 본문 `userId` ≠ 노드 주인 / `memoryId` 가 남의 메모리 | 0 | 노드 없음만 ○ |
| 6 | 낡은 본문 — 이야기 `NodeBody.plainText ≠ Episode.content`(2b.2 규칙상 평문으로 표시 중) | 보고만 | ✕ |
| 7 | 본문 사진 블록이 없는 사진을 가리킴 | 보고만 | ✕(다음 저장 때 빠짐) |
| 8 | 고아 초안 — `Person(isDraft, companionSessionId null)` 인데 PROPOSED 연결 0·다른 연결 0 | 0 | ○ 삭제 |
| 9 | 확인 대기 연결 수·가장 오래된 대기 일수 | 지표 | ✕ |
| 10 | 장소형 인물 `Person(subjectType=location)` 수(2b.5) | 지표 | ✕ |

- 실고객 데이터가 섞인 운영 전체 실행은 dry-run 개수 보고 → 성민 승인 → `--apply` 순서. 회귀는 픽스처 사용자 한정 호출로 본다(트리거 정리 후 1·5·8 = 0, 일부러 만든 끝 없는 행 1개 → 1).

#### 2b.5 장소형 인물 → `Place`(Q7)

지금 `Person(subjectType=location)` 을 새로 만드는 경로는 2개다(운영 행 0 — 2026-10-30 집계):

1. `/people` 장소 탭 "+ 새 장소 추가" → `PersonForm`(장소) → `createPerson`.
2. 말동무 저장(`app/life-timeline/companion/actions.ts` 4단계) → `Person(location, isDraft)` → `/life-timeline/manage` 초안 검토 승인(`approveAllSessionLocationsAction`·`approveLocationWithPlaceAction`).

바꾸는 것:

- **경로 1**: 장소 탭의 추가 폼이 `Place` 를 만든다(이름·메모 + 기존 `PlaceSearchInput` 결과 → address·lat·lng·source). 장소 탭 목록 = 사용자 `Place` + 옛 장소형 인물(있다면 꼬리표 [문구 필요: 예전 방식 장소]). 행을 누르면 공용 장소 상세 `/people/places/[id]`(이름·주소·메모·연결된 기록 — V2 사건의 `MemoryPlace` + V3 이야기 브릿지 `MemoryPlace` + `NodeLink`) + 고치기·지우기. 노드 보기의 장소 칩도 이 화면으로 간다.
- **경로 2**: 말동무 초안은 지금처럼 `Person(location, isDraft)` 로 두고(검토 화면 무변) **승인할 때 `Place` 로 바꾼다** — 한 트랜잭션에 `Place` 생성(이름·메모·좌표) + 초안 인물 삭제. 말동무 장소 초안에는 세션 id 말고 연결이 없어 옮길 연결이 없다. 거절은 지금처럼 삭제.
- **막는 곳**: `createPerson` 이 `subjectType=location` 새 생성을 거부한다(장소는 `Place` 경로로만). 말동무는 `prisma.person.create` 를 직접 써서 영향 없다. `PeopleConnectModal`(V2 연혁 카드 연결)은 사람·물건 + 옛 장소형 인물만 보여 준다.
- **`Place` 재사용(2단계 남은 것, Q28)**: 장소형 인물이 사라지면 V2 의 사건↔장소 연결 경로는 `PlacesEditor`(`MemoryPlace`) 하나가 된다. 그래서 같이 한다.
  - `PlacesEditor` 위에 "내가 기록한 장소"(사용자 `Place`) 고르기를 둔다. 고르면 `MemoryPlace` 에 `placeId` + 이름·주소·좌표를 복사한다(v2 평면 칸 유지).
  - 검색으로 새로 고르면 같은 사용자·같은 이름(공백 정규화)·같은 주소의 `Place` 를 찾아 쓰고, 없으면 만든다(§1.7 "이후 쓰기").
  - 쓰기 지점은 기존 `MemoryPlace` 쓰기 3곳(사건 생성·수정 트랜잭션, `updatePhotoMemoryPlaces`)에 `resolvePlaceIds` 한 함수.
- **옛 장소형 인물**(지금 0행): 정합 점검 10번이 센다. 0 이 아니게 되면 그때 이관 스크립트(`db/migrate-location-people.ts`, dry-run 기본 — `Place` 생성 + `PersonEvent` 연결을 그 메모리의 `MemoryPlace(placeId)` 로)를 따로 설계한다. 지금은 만들지 않는다.

#### 2b.6 구현 단계·완료 기준·회귀

| 단계 | 내용 | 완료 기준 | 회귀 |
|---|---|---|---|
| 2b-1 정합 점검 | `lib/node-graph-reconcile.ts` + `db/reconcile-node-links.ts` | 운영 dry-run 개수 보고(1~5·8 = 0 기대) · `test-node-graph` 에 점검 함수 항목 | 16종 |
| 2b-2 인물 확인 | 저장 규칙 변경 + `/story-review/confirm` + 진입 3곳 | 맞아요·아니에요·고칠게요·모두 맞아요 각각의 DB 상태(초안·연결·`PersonLifeEvent`) · 확인 전 기존 화면(타임라인 칩·갭·인터뷰 후보·`/people`)에 초안 미노출 · 두 이야기 같은 새 이름 → 초안 1명 · 390px 실측 · 정합 점검 8 = 0 | 16종(`test-person-mode` 수정) + 신규 `test-node-confirm`(LLM 0 — 후보를 직접 넣는 내부 함수로) |
| 2b-3 ~~노드 보기·상세~~ → **My Life**(2026-11-01 재정의) | 2b.1 의 7 표(2b-3a 보기 전용 → 2b-3b 추가 → 2b-3c 이야기 상세·블로그 편집, 2b-3d 대화 시기 감지)로 대체 | (2b.1 의 7) | 신규 회귀는 `test-node-view` 대신 `test-my-life` |
| 2b-4 블로그 편집(→ 2b-3c 로 합침, 2026-11-01) | `saveEpisodeBody` + 편집 화면 + `/story-review` 고치기 분기 | 기존 평문 이야기가 편집 없이 그대로 보임 · 저장 후 `Episode.content`·브릿지 평문 동기화·다듬기 3필드 · 캡션 평문 미포함 · 남의 사진 거부·지워진 사진 블록 빠짐 · 버전 충돌 · 낡은 본문은 평문 표시 · 390px(편집 화면 포함) | 16종 + 신규 `test-node-body` |
| 2b-5 장소 | 장소 탭 → `Place` · 말동무 승인 → `Place` · `PlacesEditor` 재사용 · 장소 상세 | 장소형 인물 신규 0 · 말동무 승인 후 `Place` 1·초안 0 · 고른 장소 재사용 시 `Place` 수 무변 · V2 장소 입력 회귀 | 16종 + `test-node-graph` 항목 + 기존 장소·사진 테스트 |

- 순서 이유: 2b-1 은 작고 나머지의 검증 도구다. 2b-2 는 노드 화면 없이 독립이고, 지금도 대화마다 확인 없는 인물이 쌓이고 있어 먼저 멈춘다. 2b-4 는 2b-3 상세에 붙는다. 2b-5 는 독립.
- 공통: 마이그 0 · 화면이 생기는 단계마다 `docs/navigation-map.md` 를 같은 커밋에서 갱신(CLAUDE.md 규칙 7) · 빌드 전 dev 종료 · 픽스처만 · `proxy.ts` 무접촉. 새 회귀 3종은 세트에 넣는다(Q30 — 16 → 19종).
- 2단계 전체 완료 기준(위 "2단계")의 test30 브라우저 E2E·문구 확정은 2b-5 뒤에 한 번에 한다.
- **착수 시점(2026-11-01 성민)**: 2b-1·2b-2 먼저 구현. 2b-3(노드 보기·상세) 이후는 도그푸딩 1주 뒤.

#### 2b-1·2b-2 구현 결과 (2026-11-01)

결정(성민, 제안: 리뷰 채팅)은 §7.2. 마이그 0 · `proxy.ts` 무접촉 · 화면 문구는 `lib/node-confirm-copy.ts`(전부 `[임시 — 성민 확정 필요]`).

**2b-1 정합 점검**

- `lib/node-graph-reconcile.ts` — `countNodeGraphIssues(scope)`(10항목, 개수만)·`applyNodeGraphCleanup(scope)`(1·5 노드 없음·8 만, 점검과 같은 조건의 DELETE 한 문장씩). 범위 = 사용자 1명 또는 제외 목록. 허용 쌍은 `lib/node-graph.ts` `ALLOWED_PAIRS`(export 로 바꿈) 하나를 같이 쓴다.
- `db/reconcile-node-links.ts` — 기본 dry-run, 실고객 계정(`sml122900`)은 점검·정리 둘 다에서 빼고 뺀 수만 표기, User 0명이면 `--apply` 거부, 점검 대상 총량(연결·본문·초안 인물 행 수) 한 줄.
- **운영 dry-run 1회(2026-11-01, 적용 안 함)**: User 32명 · 실고객 2명 제외 · 점검 대상 연결 0행·본문 0행·초안 인물 4명 → 10항목 전부 0(초안 4명은 말동무 초안 — 고아 아님). 노드 그래프 연결이 운영에 아직 한 행도 없다(2a "관계별 나" 연결도 운영 0).
- 회귀: `test-node-graph` ⑨ 8항목(일부러 만든 이상 행을 항목별로 셈 → 정리는 3종만, 정상 행·보고 전용 항목 무변, 다른 사용자 범위 0) — 39 → 47항목.

**2b-2 인물 확인**

- 저장 규칙(`lib/person-chat.ts`): `savePeopleMentionedInEpisode(userId, lifeEventId, episodeId, …)` — `finishEpisodeChatCore` 가 방금 저장한 `episodeId` 를 넘긴다. 추출 뒤 본체는 `saveProposedPeople`(LLM 0, 회귀가 후보를 직접 넣음). 대상 = 확정 인물 → 확인 대기 초안 → 새 초안(`isDraft`, `metYear` = 중심 연도) 순, 이야기의 대상 인물이면 연결 없음, 연결 = `saveNodeLink(PROPOSED, AI)`. 같은 사람 찾기는 `findCompatiblePerson` 하나로 묶어 인물 모드(`saveOrLinkPerson`)와 같이 쓴다.
- 확인(`lib/node-confirm.ts` → `app/actions/node-confirm.ts`): 결정 목록 1개를 받는 액션(행별 버튼·모두 맞아요 공용), 결정 1건 = 트랜잭션 1개, 대기가 아닌 id 는 건너뜀. `saveNodeLink` 에 트랜잭션 클라이언트 인자(`opts.db`)를 더했다(생성 경로는 여전히 이 함수 하나).
- 화면 `/story-review/confirm`: 이야기별 묶음(`id=<episodeId>` — 2b-3 칩의 `#<episodeId>` 자리), 행마다 [맞아요]·[고칠게요]·[아니에요](390px 세로 3개, 각 56px), 남은 행 2개 이상이면 위에 [모두 맞아요]. primary 는 화면당 1개 — 남은 행 2개 이상이면 [모두 맞아요], 다 확인하면 [확인 마치기].
- 진입 3곳: `/chat-v3` 종료(대기 ≥1 → 확인 화면, 수를 못 읽으면 지금처럼 `/story-review`), `/story-review` 상단 카드(인터뷰 카드 위), 오늘의 인터뷰 종료 요약 카드. 대기 수 = 1쿼리.
- **설계와 달라진 점**
  - 확인 대기 초안 = `isDraft` + `companionSessionId` 없음(설계의 "PROPOSED 연결 1개 이상" 조건은 뺌 — 연결이 0인 초안은 정합 점검 8 고아라 다시 이어져도 해가 없고, 쿼리 1회로 끝난다).
  - ~~[맞아요] 때 같은 이름·호환 관계 확정 인물로 자동 합침~~ → 같은 날 후속에서 되묻기로 바꿈(아래 "2b-2 후속").
  - `PersonLifeEvent` 는 트랜잭션 안 `upsert` 로 만든다(설계는 `linkPersonToLifeEvent` — 그 함수는 P2002 를 잡는 방식이라 트랜잭션 안에서는 쓸 수 없다. 멱등은 같음).
  - [고칠게요]로 초안 이름을 고치면 그 초안이 고친 이름으로 확정된다 — 같은 초안이 다른 이야기에도 대기 중이면 그 행은 "이미 등록된 분"으로 보인다(잘못 들은 이름은 이야기마다 같게 틀린다고 봄).
  - 처리한 행은 화면에 "확인했어요/뺐어요"로 남긴다. 액션의 `revalidatePath("/people")` 가 확인 화면을 다시 그려 처리한 행이 사라지던 것을 390px 실측에서 찾아, 처음 받은 목록을 클라이언트 상태로 고정했다.
- 회귀: `test-person-mode` P12-2 를 새 규칙으로(실제 추출 1회 → 초안·PROPOSED·`PersonLifeEvent` 없음·`/people` 미노출·대상 인물 연결 0 → 맞아요 → 확정·CONFIRMED·`PersonLifeEvent`). 신규 `test-node-confirm`(LLM 0) 36항목 — 저장 규칙·확인 전 미노출(`/people`·타임라인 칩·인물 이야기 갭·말동무 초안 검토)·묶음·맞아요·아니에요·고칠게요(초안·합침·잘못 맞춰진 확정 인물·대상 인물·잘못된 입력)·그새 생긴 확정 인물로 합침·모두 맞아요·확인 후 노출·정합 점검 0. 세트 16 → 17종(Q30 — 나머지 2종은 2b-3·2b-4 때).
- 390px 헤드리스 실측(픽스처·로컬 운영 빌드, 측정 스크립트 미커밋): `/story-review` 정리 카드·인터뷰 종료 요약 카드·확인 화면 기본·고칠게요 열림·한 행 맞아요 뒤·모두 맞아요 뒤·대기 0 빈 상태 — 전부 가로 스크롤 0·버튼 최소 56px·글씨 최소 18px·입력칸 56px/18px, 화면마다 primary 1개. 확인 뒤 DB 대기 0·초안 0·`PersonLifeEvent` 생성, `/story-review` 카드 사라짐.
- 실제 대화로 `/chat-v3` 를 끝내 확인 화면으로 가는 흐름은 브라우저로 돌려 보지 않았다(코드·빌드만) — 2단계 test30 E2E 때 같이 본다.

#### 2b-2 후속 — 동명이인 되묻기 (2026-11-01)

성민 요청: [맞아요] 때 같은 이름의 확정 인물이 있으면 자동으로 합치지 말고 그 행에서 묻는다.

- **규칙**: 초안 행 [맞아요]·모든 행 [이렇게 고칠게요]에서 이름(공백 무시)이 같은 확정 인물(`subjectType=person`)이 있으면 아무것도 바꾸지 않고 되묻는다(`DecideResult.ask` — 후보 목록). 그 행에 후보마다 [같은 분이에요] + [다른 분이에요] + [돌아가기](고칠게요에서 왔으면 입력 칸을 고치던 값으로 다시 연다).
  - 같은 분이에요(`same`) = 그 인물로 연결 CONFIRMED·`PersonLifeEvent`, 초안 삭제. 초안은 한 사람이라 **다른 이야기의 대기 연결도 그 인물로 옮긴다**(연결 id 유지 — 화면의 그 행 [맞아요]가 되묻지 않고 그대로 확정. 같은 쌍이 이미 있거나 그 이야기의 대상 인물이면 옮기지 않고 지움).
  - 다른 분이에요(`different`) = 초안을 새 인물로 확정(고칠게요에서 왔으면 고친 이름·관계로). 확정 인물로 맞춰졌던 행이면 새 인물을 만든다(원래 인물 정보는 안 바꿈).
  - 같은 분 대상이 남의 인물·초안이면 거부(invalid). [모두 맞아요]는 되묻는 행만 남기고 나머지를 처리, 되묻는 행은 다시 보내지 않는다.
- **이름만 같고 관계가 달라도 묻는다** — 판단 근거:
  1. 관계까지 맞는 확정 인물이 있으면 저장 단계에서 이미 그 인물에 연결된다("이미 등록된 분" 행). 그래서 초안 + 같은 이름 확정 인물 조합은 대부분 **관계가 안 맞아서 새 초안이 된 경우**다. 관계 호환일 때만 물으면 되묻기는 "초안 뒤에 같은 사람이 확정 인물로 생긴" 드문 경우에만 뜨고, 나머지는 말없이 같은 이름 두 명이 된다.
  2. 같은 사람의 관계 말이 시기마다 바뀐다(여자친구 → 아내, 직장 동료 → 사장님, 담임 → 은사). 추출이 붙이는 관계 말도 이야기마다 다르다. `isRelationCompatible`("여자친구", "아내") = 다른 부류.
  3. P14-2 "애매하면 병합 안 함"은 **자동** 병합의 기준(오병합 → 잘못된 존칭)이다. 여기서는 사용자가 고르므로 묻는 비용은 한 번 누르는 것뿐이고, [다른 분이에요]를 고르면 지금과 같은 결과다.
  4. `/people` 에 합치기 기능이 없다 — 말없이 생긴 중복은 어르신이 고치기 어렵다.
- [고칠게요]에도 같은 규칙을 둔 이유: 고칠게요 = 고쳐서 맞아요라 같은 자동 병합 경로였다(고친 이름이 확정 인물과 같으면 그 인물로 합쳤음). 덤으로 "이미 등록된 분" 행이 실은 다른 동명이인일 때 갈 길이 생겼다 — 이전엔 같은 이름으로 고치면 다시 같은 인물로 합쳐져 [다른 분]으로 둘 방법이 없었다.
- 저장 규칙(`saveProposedPeople`)은 그대로 — 관계까지 맞는 확정 인물은 저장 때 연결(행에 "이미 등록된 분" 꼬리표, [맞아요] = 사용자가 그 인물이 맞다고 확인). 아내처럼 이야기마다 나오는 인물을 매번 되묻지 않기 위해서다.
- **`isDraft=true` 를 만드는 경로(전수 grep, 2026-11-01)** — 앱 코드 2곳: ① 말동무 저장 `app/life-timeline/companion/actions.ts`(인물·장소·물건 3곳, 전부 `companionSessionId: sessionId` — 방금 만든/찾은 세션 id, null 불가) ② 이야기 마무리 추출 `lib/person-chat.ts` `saveProposedPeople`(세션 없음). 그 밖: `createPerson`(`validatePersonInput` 에 isDraft 없음 → 기본 false — 온보딩 채팅·인물 모드·`/people` 직접 등록), `draft-actions.ts` 갱신은 전부 `isDraft: false`, 마이그레이션 데이터 갱신 0, raw SQL INSERT 0, 회귀 픽스처(`test-node-graph` ⑨)뿐. lab 페르소나의 `isDraft: true` 는 `UserMemory` 다.
  - **판정: "초안 + 말동무 세션 없음" 조건이 다른 초안을 잘못 끌어오지 않는다.** 확인 화면 목록 자체는 초안 조건이 아니라 `NodeLink` PROPOSED 로 고른다. 초안 조건을 쓰는 곳(`findCompatiblePerson(draft=true)` 재사용·`deleteDraftIfOrphan`·정합 점검 8 고아 초안)에 말동무 초안이 섞이려면 `companionSessionId` 가 null 이 돼야 하는데, FK 가 `onDelete: SetNull` 이지만 `CompanionSession` 을 지우는 코드가 없다(탈퇴는 User cascade 로 인물도 같이 지워짐). 운영 집계(실고객 2명 제외): 초안 인물 = 말동무 세션 있음 4 · 세션 없음 0.
  - 남는 위험(코드 밖): DB 콘솔에서 `CompanionSession` 을 손으로 지우면 그 세션의 초안 인물이 세션 없는 초안이 되고, 연결이 0이면 정합 점검 `--apply` 가 고아로 지운다. 그 초안은 이미 `DraftReview`(세션 있는 초안만 표시)에서도 안 보이는 상태라 실질 고아다.
- 문구(임시): `sameNameAsk`·`sameYes`·`sameYesLabel`(낭독용 — 후보 이름·관계 포함)·`sameNo`·`sameBack`, `lib/node-confirm-copy.ts`.
- 화면: 되묻는 행은 [모두 맞아요] 대상에서 빠진다(다시 보내도 또 되묻기라). 같은 초안의 다른 이야기 행이 같이 되묻는 중이었으면 한쪽 답으로 함께 풀리고 "이미 등록된 분"으로 바뀐다(서버에서 연결이 이미 옮겨짐).
- 390px 헤드리스 실측(픽스처·로컬 운영 빌드, 측정 스크립트 미커밋): 기본 · 맞아요 → 되묻기(후보 1명) · 같은 분이에요 뒤 · 모두 맞아요 → 되묻기 3행(후보 2명 포함, 긴 관계 말) · 같은 초안 다른 행 풀림 · 다 확인 — 전부 가로 스크롤 0·버튼 최소 56px(행 버튼 298×56 세로)·글씨 최소 18px·primary 0~1개. DB 확인: 대기 0·초안 0·한상철 1명(합침, 확정 연결 2)·정미숙 3명(다른 분).
- 회귀 `test-node-confirm` 36 → 45항목 — 동명이인 같은 분 → 병합(초안 뒤 생긴 확정 인물) · 다른 분 → 별도 확정(아내 vs 여자친구 — 이름만 같음) · 같은 분 = 다른 이야기 대기 연결도 옮김 · 등록된 분 행 같은 이름으로 고치기 → 다른 분 = 새 인물 · 잘못된 같은 분 대상 거부 · 모두 맞아요 중 되묻는 행(후보 2명) · 고칠게요 되물음 2건(다른 확정 인물·대상 인물).

#### E2E 후속 (2026-11-01) — 이야기 내용 유실 수정 · 대화창 확인 카드

운영 test30 E2E: 인물 질문에 "고등학교 때 김민수라는 친구랑 매일 같이 등교했어요" → 김민수와의 이야기 "네 그 정도예요" → 본문 "김민수와의 기억은 그 정도다." 로 저장, 확인 화면으로 안 감.

- **원인**
  1. 인물 질문의 답은 인물 추출(`submitPersonAnswer`)에만 쓰이고, 이어지는 이야기 대화 기록(`enterPersonEpisode`)은 오프닝부터 새로 시작했다 — 등교 내용이 기록·본문 어디에도 없었다(운영 기록: 본인 줄 1개, '등교' 없음).
  2. "네 그 정도예요"는 완곡 종료 문구가 아니라("그정도면"만 있음) 본인 발화로 기록에 들어갔다. 종료 문장 떼기는 키워드로 끝낸 경로에서만 해서, AI 가 끝내기로 판단한 경로(후속 상한 포함)에선 마무리 말이 그대로 남는다.
  3. 요약 프롬프트가 "한 문장뿐이어도 정리하라"만 있고 본인의 맞장구·마무리 말을 빼라는 규칙이 없었다. `[이 이야기의 인물]` 머리줄까지 있어 "김민수와의 기억은 그 정도다."를 지어냈다. 이 본문은 실질 이야기 판정을 통과해 김민수 인물 이야기 갭도 닫았다.
  4. 확인 화면 이동은 세션 전체 종료(`finishSession`) 때만이었다. 이야기 하나가 끝나면 자유 대화로 돌아간다.
- **수정**
  - 인물 질문 답 → 이야기 기록 첫 본인 턴: `lib/episode-text.ts` `buildPersonEpisodeTranscript(질문, 답, 오프닝)`(답의 마무리 말은 뗌) — `ChatV3Client.submitPersonTurn` → `enterPersonEpisode(…, { question, answer })`. 모델 대화 이력도 [답, 오프닝, …] 로 시작해 후속 질문이 답을 안다. 자유 대화 → 이야기 전환과 같은 방식.
  - 문장 끝 마무리 말 `EPISODE_CLOSING_SENTENCES`(그정도예요·그게다예요·그게전부예요·그뿐이에요·더는없어요·특별한건없어요 등 20개, 에요/예요 변형). **문장 전체가 마무리 말일 때만** 잡는다 — 종료 신호를 지우고 남는 게 군말(네·뭐·이제·기억나는 건·…할게요)뿐이어야 함. "한 시간 그 정도 걸었어요"·"키가 그 정도예요"는 내용.
  - `stripEpisodeDoneSignal` 도 같은 기준으로 바뀜 — 예전엔 종료 신호 낱말이 든 문장을 통째로 버려 "대학에 합격이 됐어요"("됐어요")·"회사를 그만두고 장사를 시작했어요"("그만")도 사라졌다. 대화를 끝낼지(`isEpisodeDoneIntent`)는 지금처럼 넓게(부분 일치) 본다.
  - 서버 `finishEpisodeChatCore` 가 본인 턴마다 마무리 문장을 뗀다(AI 판단 종료 경로 포함, /chat-v3·오늘의 인터뷰·온보딩 이야기 대화 공통). 남는 본인 발화가 없으면 요약 호출 없이 `{ ok: false, empty: true }`.
  - 요약 프롬프트 2차 방어: 맞장구·마무리 말은 내용 아님 · 인물 머리줄만으로 문장을 만들지 말 것 · 사람을 소개하는 답도 이야기 재료 · 내용이 하나도 없을 때만 `NO_CONTENT`(`EPISODE_SUMMARY_NO_CONTENT`). 코드는 본인 발화가 12자 이하(공백 제외)일 때만 표식을 믿고 저장 안 함 — 회귀 첫 실행에서 Sonnet 이 김민수 사례(내용 있음)에 표식을 낸 것을 보고 넣은 가드. 길면 한 번 더 요청하고, 그래도 표식이면 원문으로 저장(내용 유실 > 군말 한 줄).
  - 클라: 마무리 말뿐인 본인 턴은 본인 발화로 안 침(`hasEpisodeUserContent`), `empty` 는 "저장하지 못했어요"를 안 띄움, 저장이 안 됐으면 "잘 담아뒀어요" 류 마무리 문구 대신 "다른 이야기도 있으세요?".
- **대화창 확인 카드(Q25 갱신)**: 이야기 저장 성공 직후 `countPendingPeopleAction` → 1명 이상이면 대화 목록 끝에 카드(`border-brand bg-banner`, secondary 버튼 [이야기에 나온 분 N명 확인하기] → `/story-review/confirm`). 입력창은 그대로라 대화 계속. 다음 저장 때 수를 다시 읽는다. 문구 `chatCardDesc`·`chatCardButton` 임시.
- 회귀: `test-p14` 순수 함수 7항목(마무리 말·변형·내용 문장 보존·종료 낱말 든 내용 문장·인물 답 첫 턴) · `test-person-mode` 11(실제 Sonnet — ① 인물 답 + AI 종료 "네 그 정도예요" → 본문 "고등학교 때 김민수라는 친구와 매일 같이 등교했다." ② 마무리 말만 → 저장 안 함 ③ "네 맞아요" → NO_CONTENT 저장 안 함 ④ "한 시간 그 정도 걸었어요" 보존 ⑤ 여러 턴 모두 반영).
- 390px 실측(픽스처·로컬 운영 빌드·실제 대화 1회): 이야기 저장 직후 카드 표시 · 버튼 298×56·18px·secondary · 설명 18px · 가로 스크롤 0 · 입력창 유지 · 카드 → 확인 화면에 그 인물 행. 18px·56px 미만은 기존 요소뿐(머리 "바꾸기" 링크 14px, 부제 16px, 전송 버튼 48px).
- 운영 E2E 당시 배포 상태(추정): 02:07 KST 출생 이야기 저장 1초 뒤 인물이 **확정 + 중심 연결**로 생겼다 — 2b-2 이전 코드의 이야기 추출 동작(2b-2 는 초안 + 확인 대기 연결). E2E 는 2b-2 배포 전 코드였을 가능성이 높다(Vercel 배포 기록 확인 필요). 그래도 지적한 원인 1~4는 현재 코드에도 그대로 있었다.
- ~~남은 위험: 명시적 종료 "그만"·완곡 종료 "됐어요" 부분 일치 오탐~~ → 같은 날 수정(아래 "종료 문구 문장 전체 일치"). 오늘의 인터뷰는 `empty` 를 기존 저장 실패와 같이 다룬다(`saveFailed` 문구 — 남음).

#### 종료 문구 문장 전체 일치 (2026-11-01)

결정(성민, 제안: 리뷰 채팅): 명시적 종료·완곡 종료 문구도 마무리 말과 같은 "문장 전체 일치"로 판정한다.

- `lib/episode-text.ts` `matchClosing(문장)` 하나로 판정 — 종료·마무리 문구를 지우고 남는 게 군말(네·이제·오늘은·…할게요 등)뿐이면 종료 문장, 그 문장에 명시적 종료 문구가 있으면 `exit`, 완곡 종료·마무리 말이 있으면 `done`. `isExitIntent`·`isEpisodeDoneIntent`·`stripEpisodeDoneSignal` 셋 다 이 함수. 부분 일치 `hasAny` 는 삭제.
- 결과: "회사를 그만두고 장사를 시작했어요" → 종료 아님, "그만할래요"·"오늘은 여기까지" → 명시적 종료, "선생님이 됐어요" → 종료 아님, "됐어요" 단독 → 완곡 종료.
- 문장 나누기에 "~요"·"~죠" 뒤 띄어쓰기를 더했다 — 음성 입력·채팅은 문장부호 없이 "친구랑 놀았어요 그만할래요"로 오는 일이 많아, 그대로면 한 문장이 돼 종료를 놓친다(부분 일치일 때는 잡히던 경우).
- 같은 판정 함수: `/chat-v3`(`handleSend`·`submitEpisodeTurn`) · 오늘의 인터뷰(`InterviewClient.sendStory`) · 온보딩 이야기 대화(`/onboarding-episode-chat` — 지금까지 종료 문구 판정이 없고 AI 판단만 있었다. 이번에 같은 함수를 붙임: 종료 문장은 떼고 저장, 남는 본인 발화가 없거나 서버가 `empty` 면 저장 없이 `/onboarding-episode?after=<eventId>`).
- 회귀 `test-p14` 41 → 50항목: 예시 4개 · 명시적 종료 7개 × (단독·마침표·"네" 앞) · 완곡 종료 + 마무리 말 30개 × 같은 3가지 · 띄어 쓴 표기 · 문장부호 없는 내용 + 종료 · 종료 낱말이 든 내용 문장(여기까지 걸어왔어요·밥은 충분해요·대학에 합격이 됐어요).

#### 대화 내용과 시기 불일치 — 조사·설계 (2026-11-01, 구현 전)

운영 test30: 출생 카드 대화에서 대학교 때 이야기를 했는데 출생(1958)에 저장되고, 그 이야기에서 나온 인물의 만난 해가 1958 로 기록됐다. 운영 집계(개수만): 출생 중심 이야기 1건 — 본문·기록 모두 '대학' 포함, 대상 인물 없음 · 그 이야기 저장 1초 뒤 생긴 인물 1명(관계에 친구류 낱말, 만난 해 1958, 출생에 중심 연결) · 대학교 중심은 1977 확정으로 따로 있음.

- **원인**: 이야기의 소속 중심은 대화를 연 카드의 사건 하나로 고정(`startEpisodeStage(eventId)` → `finishEpisodeChat(eventId, …)`)이고, 대화 중 시기 표현을 보는 곳이 없다. 만난 해는 세 곳 모두 "그 이야기의 중심 연도"다 — `submitPersonAnswer`(`metYear = event.correctedYear ?? event.year`), `saveProposedPeople`(초안), `decidePeople` 고칠게요/다른 분(새 인물). 출생 중심이면 누구든 출생 연도가 된다.
- **감지 방법(제안)** — 1차는 결정적 규칙, 모델 호출 없음:
  - 본인 발화에서 시기 표현 추출: 학교 단계(국민학교·초등학교·중학교·고등학교·대학교·대학), 군대(입대·훈련소·자대·제대·전역), 직장(입사·첫 직장·회사 다닐 때), 결혼(결혼하고·신혼), 자녀(애 낳고), 나이("스무 살 때"·"열여덟"·"20대"), 연도("77년"·"1977년"). → 중심 유형 또는 연도 후보.
  - 앵커 중심의 시기 범위와 비교: 유형별 기간(출생 = 어린 시절 0~7세, 국민학교 6년, 중·고 3년, 대학 4년, 군대 3년, 결혼·직장 = 그 뒤 몇 해, CUSTOM = 연도 ±2)과 연도 후보가 겹치지 않거나, 다른 유형 낱말만 나오면 불일치.
  - 오탐 줄이기: 가족 이야기("아버지가 대학 나오셔서")처럼 주어가 본인이 아닌 문장은 이야기 시기가 아니다 — 1차는 "~때"·"~다닐 때"·"~시절"·"~에 들어가서" 처럼 시기를 가리키는 꼴만 센다. 애매하면(후보 둘 이상) 2차로 요약 호출에 시기 판정을 덧붙이는 방안(추가 호출 0)을 검토 — 1차 실측 뒤 결정.
- **감지 뒤 흐름(제안)**: 첫 본인 턴 직후, 모델 후속 질문 전에 한 번만 묻는다 — "대학교 시절 이야기인가요?" + 칩 2개 [네, 대학교 시절이에요] / [아니요, 그대로 둘게요](56px, 갭 칩과 같은 꼴). 네 → 대화 대상 중심을 그 중심으로 바꿔 계속(저장·인물 추출·만난 해 모두 새 중심), 대기 대화 컨텍스트도 새 중심으로. 아니요·무응답 → 그대로. 같은 대화에서 두 번 묻지 않음. 해당 중심이 없거나 미확정이면 묻지 않는다(CUSTOM 중심 제안은 후속).
- **이미 저장된 이야기**: 2b-3 이야기 상세에 "다른 시절로 옮기기"(주 소속 `Episode.lifeEventId` 변경 + 브릿지 `UserMemory` 연도·제목 동기화 + 옮긴 중심과의 추가 소속 `NodeLink` 가 있으면 정리 — 한 쌍 = 한 곳). 포스터 브릿지(`v3_<lifeEventId>` 온디맨드 upsert)가 옮긴 본문을 옛 중심 행에서 빼고 새 중심 행에 합치는지는 착수 때 확인.
- **만난 해 규칙 개선안**:
  1. 시기 판정이 있으면 그 시기 중심 연도, 없으면 지금처럼 이야기 중심 연도.
  2. 출생 중심 + 가족 아닌 관계(`relationGroup` 이 parent·grandparent·sibling·relative·child 가 아님) → 만난 해 비움(null). 틀린 연도보다 빈칸이 낫다. 가족이면 출생 연도 유지(태어날 때부터 앎).
  3. 이미 있는 만난 해는 덮지 않음(현행 — 첫 등록값 유지). 단 이야기를 옮길 때 그 인물이 옮긴 이야기로만 이어져 있고 만난 해 = 옛 중심 연도면 새 중심 연도로 함께 고친다.
  4. 기간 중심(학교·군대)은 시작 연도를 만난 해 근사로 둔다(현행 유지).
- **결정 질문**: Q32 묻는 시점(첫 본인 턴 직후 vs 저장 직전) · Q33 출생 중심 + 비가족 만난 해를 비울지 · Q34 저장된 이야기 옮기기 위치(2b-3 상세 vs 확인 화면) · Q35 기존 데이터 정리(출생 중심 + 비가족 + 만난 해 = 출생 연도 인물 — 착수 때 운영 dry-run 개수 보고 후 결정).
- **결정(2026-11-01 성민, 제안: 리뷰 채팅) — 추천안 채택, 구현은 2b-3**: Q32 = 첫 본인 턴 직후 한 번 · Q33 = 비움(가족은 출생 연도 유지) · Q34 = 2b-3 이야기 상세 "다른 시절로 옮기기" · Q35 = 착수 때 운영 dry-run 개수 보고 후 정리 방법 결정.

#### 2b-3a 구현 결과 — My Life 보기 전용 (2026-11-01)

결정(성민, 제안: 리뷰 채팅)은 §7.3. 마이그 0 · `proxy.ts` 무접촉 · 새 의존성 0 · 화면 문구 `lib/my-life-copy.ts`(메뉴 이름 "My Life" 외 전부 `[임시 — 성민 확정 필요]`).

**코드**

- 입구(Q44): `lib/node-graph.ts` `saveNodeLink` — `ROUTED_PAIRS`(`LIFE_EVENT>PERSON` → `PersonLifeEvent` upsert, `EPISODE>PLACE` → 이야기 브릿지 메모리 `MemoryPlace` 1행 — `placeId` + 장소 이름·주소·좌표 복사, 같은 장소면 그 행). 결과에 `store`(NODE_LINK·PERSON_LIFE_EVENT·MEMORY_PLACE). 이 두 쌍에 PROPOSED·role 요청은 `unsupported_option`(그 칸들엔 상태·역할이 없다). `ALLOWED_PAIRS`(NodeLink 에 두는 쌍)는 그대로 — 정합 점검 3번이 두 쌍의 NodeLink 행을 계속 이상 행으로 잡는다. 기존 호출(2a·2b-2)은 두 쌍을 안 써서 동작 무변.
- 데이터 `lib/my-life.ts` `getMyLifeData(userId, db?)` — 포함 규칙은 2b.1 의 1 그대로(Q38 포함). 초안 인물은 확인 대기 물방울로만, 모임 연결은 확정만.
- 배치 `lib/my-life-layout.ts` `layoutMyLife`(순수 — 클라이언트도 씀, prisma import 없음) · `countMapNodes` · `FOLD_ALL_ABOVE = 60` · `packChips`·`storyLead`·`bandAt`.
- 화면 `app/my-life/page.tsx`(V3 확인·빈 상태) · `MyLifeView.tsx`(지도·목록 보기·패널) · `loading.tsx`(P22-2 패턴). 진입: 사이드 패널 V3 [내 이야기] 아래 [My Life](`prefetch={false}`) · `/story-review` 머리 아래 secondary [My Life 로 보기].
- 문서: `docs/navigation-map.md`(§0·§1·§2·새 절) · `docs/design-system.md`(물방울 예외·`sage` 첫 용도·`sky` 장소).

**설계와 달라진 점**

- Prisma 호출 7회 → **6회**(중심+이야기 1 · 중심↔인물 1 · NodeLink 1 · 인물·모임·장소 3).
- 이야기 노드 꼬리표는 한 줄(18px)에 하나만 — 그때의 나 > 확인 전 > 여러 시기. "다른 시기에도 있어요"는 노드 폭(글자 칸 135px)에 안 들어가 노드엔 짧은 꼬리표 `alsoElsewhereShort`("여러 시기"), 전체 문구·다른 시기 이름은 패널에.
- 작은 물방울은 글자 칸 135px 에 이름 3글자(약 80px)가 한 줄에 1개라 사실상 최대 2개 + "외 N".
- 모임 가지는 꼬리표 글자 대신 아이콘(`Users`, 사람은 `UserRound`)으로 구분 — 노드 폭이 좁아서. 버튼 이름에는 "모임".
- [목록으로 보기]·[모두 펼치기]는 도구줄이 아니라 위 머리줄. 도구줄은 오른쪽 아래 비서 버튼(64px)을 피해 왼쪽에 [−][+][전체 보기] 3개(오른쪽 여백 104px).
- "지금 보는 곳"은 `IntersectionObserver` 대신 배치 결과로 계산(`bandAt`, 스크롤 멈춘 뒤 120ms).
- 패널은 `<dialog>`(showModal — 포커스 가두기·Esc·바깥 누르기·닫으면 연 노드로 포커스). 열릴 때 포커스는 `<dialog>` 기본대로 첫 버튼(설계는 제목) — 패널 이름은 `aria-labelledby` 로 읽힌다. 올라오기 애니메이션은 넣지 않음(움직임 줄이기 분기 자체가 필요 없게).
- 펼친 띠의 [가지 접기]는 지도 대신 중심 패널(설계 1 접기 규칙대로 — 띠마다 64px·Tab 한 번씩 늘지 않게).
- 실측·회귀 중 찾아 고친 것: ① 작은 물방울 "외 N" 자리를 비우려고 줄을 지운 뒤 표지를 이름 있는 줄에 붙여 폭을 넘김(`test-my-life` 첫 실행) → 빈 줄을 "외 N" 전용 줄로 남김 ② 도구줄 아이콘 버튼의 `px-0` 이 버튼 기본 `px-6` 에 져 아이콘이 4px 로 눌림 → `px-0!` ③ 전체 보기 목차의 맨 위 이름 버튼이 화면 위로 잘림 → 위치 하한 4px ④ 키보드 `0`(전체 보기)으로 세계가 inert 가 되면 포커스가 사라져 다음 `1` 이 안 먹음 → 포커스를 지도 영역으로 옮김.

**검증**

- 회귀 **18종** 전부 exit 0(기존 17종 + 신규 `test-my-life` 38항목). `test-node-graph` 47 → 52항목(③ 입구 — 두 쌍이 기존 칸에 1행·역방향/재요청 같은 행·NodeLink 0행·PROPOSED/role 거부·남의 노드 거부). 빌드 통과.
- `test-my-life`(LLM 0): 포함 규칙(확정 중심만·순서·연도 없는 중심·추가 소속 두 중심·작은 물방울 순서와 확인 대기·입구로 넣은 장소·옛 장소 이름·SELF·Q38 가지 제외·초안·남의 데이터 0) · Prisma 호출 6 고정(기록 8건·연결 16건 늘려도 6) · 배치(실제 픽스처와 합성 노드 0·1·36·60·100·800 에서 사각형 교차 0·세계 안, 펼침·전부 접힘 둘 다 · 같은 입력 같은 출력 · 10년 간격 표지 · 연도 없는 줄기 · 접힌 띠 · 누르는 노드 56 이상) · 순수 함수.
- 화면 실측(로컬 운영 빌드 — `next start` 에 `AUTH_TRUST_HOST=true`(로컬 운영 빌드에서 Auth.js 가 localhost 를 신뢰하게, 파일 변경 없음) · 시스템 Chrome 헤드리스 · 측정 스크립트 미커밋 · 측정 픽스처 3계정은 측정 뒤 삭제):

| 화면 | 기본 배율 | 가로 스크롤 | 글씨 최소 | 누르는 곳 최소 | primary | 버튼 안 버튼 |
|---|---|---|---|---|---|---|
| 390×844 노드 36 — 지도·패널·목록·목록 글자 200% | 1 | 0 | 18px | 56×56 | 0 | 0 |
| 390×844 노드 100 — 기본(전부 접힘)·모두 펼침·패널·목록 | 1 | 0 | 18px | 56×56 | 0 | 0 |
| 1280×800(사이드 패널 열림, 지도 폭 960) 노드 36 | 1.5 | 0 | 18px(화면 기준) | 56×56 | 0 | 0 |

  키보드: Tab 으로 지도 노드 전부 도달(36/36·100/100) · Enter → 패널 · Esc → 닫히고 연 노드로 포커스 · `+`·`0`·`1` 동작. 전체 보기 상태: 세계 inert · 목차 버튼 높이 56·글씨 18 · 누르면 기본 배율. 목록 보기 `?view=list` 뒤로 가기로 지도. `/story-review` 진입 버튼 56px. 작은 물방울은 버튼 아님(이야기 버튼 안 글자).
- 노드 수 상한(설계 2 기준, 390×844·DPR 3·CPU 4배 감속, 측정 픽스처 — 노드 36·60·100):

| 노드 | 첫 표시(3회) | [+]/[−] 반응 | [전체 보기] 반응 | 2초 스크롤·확대 프레임 p95 | DOM 요소 |
|---|---|---|---|---|---|
| 36 | 1.05~1.41초 | 15~18ms | 42ms | 16.5ms | 448 |
| 60 | 1.09~1.42초 | 12~17ms | 65ms | 16.6ms | 623 |
| 100(기본 — 전부 접힘) | 1.01~1.35초 | 13~17ms | 35ms | 16.5ms | 285 |
| 100(모두 펼침) | 1.17~1.30초 | 15~20ms | 100ms | 16.7ms | 890 |

  기준(2.5초·200ms·33ms) 모두 넉넉히 통과 → 상한은 100 이상(그 위는 이번에 재지 않음). 접기 기준 60 은 그대로(운영 최대 36). 첫 표시는 운영 DB 왕복을 포함한 값.
- **못 한 것**: iOS·Android 실기기 두 손가락 오므리기(Q42 — 헤드리스에선 버튼·키보드·Ctrl+휠만 확인, 터치 오므리기는 미검증) → 성민 기기 확인 필요, 막히면 react-zoom-pan-pinch 로 교체. test30 브라우저 E2E 는 2단계 끝에서 한 번에(2b.6).

#### 2b-3a 수정 — 자유 이동 캔버스 · 노드 크기 고정 · 배치 결함 (2026-11-01)

운영 폰(Android Chrome) 실사용(성민 스크린샷): ① 중심 노드 크기·모양 불일치(큰 사각형과 작은 타원 혼재 — 1974 고등학교·결혼만 작은 타원) ② 가지 노드가 다음 중심 노드 밑에 깔려 잘림·가지 글씨 18px 미만·가지가 좌우로 뻗지 않고 줄기 옆에 붙음 ③ 확대가 화면 전체 배율일 뿐, 특정 지점 확대·자유 이동 불가.

- **원인**: ①② 는 작은 배율(< 0.6)의 "전체 보기 목차"(Q43) — 중심 이름을 큰 사각형 버튼으로 덮어 그리고, 겹치는 이름은 건너뛰어 그 중심만 작은 타원으로 남았다. 그 사각형이 다음 띠의 가지를 덮었고, 배율이 작아 가지 글씨도 18px 아래. 지도 자체(노드끼리)는 겹치지 않았다(회귀·실측 교차 0). 가지가 붙어 보인 것은 지도 폭을 390 화면에 맞춘 342(줄기 ↔ 가지 8px) 때문. ③ 은 직접 구현(Q42)이 화면 폭에 맞춘 세계라 가로 이동이 없고, Android 에서 두 손가락이 한 손가락 스크롤로 시작되면 브라우저가 이동으로 가져가 오므리기를 받지 못했다.
- **결정(성민)**: 노드 크기 고정 + 지도를 자유롭게 돌아다니는 캔버스. **Q42 교체 조건 충족 → react-zoom-pan-pinch 도입(새 의존성 1개 허용)**. Q43 목차는 폐기(중심 노드는 언제나 같은 크기·같은 물방울, 지금 보는 곳 강조는 테두리 색).

**바뀐 것**

- 의존성: `react-zoom-pan-pinch` ^4.2.0(하위 의존성 0).
- 배치(`lib/my-life-layout.ts`): 지도 = 고정 좌표 한 장, 폭 **592**(왼쪽 열 x 40~240 · 줄기 296 · 오른쪽 열 352~552 — 가지는 줄기에서 **56px**, 이음선으로 이음), 가지 폭 163 → **200**(이야기 글자 칸 172 — 작은 물방울 한 줄에 2개). 띠 간격 32 → 48, 가지 간격 12 → 16. 노드 크기·간격은 화면 크기·접힘·배율과 무관. **배치 후 겹침 검사·해소 `resolveOverlaps`** — 겹치는 쌍이 있으면 아래 노드 윗변 이하(노드·이음선·줄기·띠)를 위 노드 아래 + 12 로 내림(위아래 순서·좌우 위치 유지). 정상 배치는 해소 0회(`shifted`)여야 하고 회귀가 확인. 중심 노드는 연도 모름·접힘·가지 없음과 무관하게 전부 248×120 같은 물방울.
- 지도(`app/my-life/MyLifeView.tsx`): `TransformWrapper`/`TransformComponent`.
  - 끌기 = 이동(상하좌우 자유 — 경계 제한 없음, 대신 움직임이 멈추면 지도가 화면에 최소 120px 남도록 되돌림 `keepInView` — 지도 잃음 방지).
  - 두 손가락 벌리기·휠·트랙패드 = 그 지점 확대(휠 감도 — 라이브러리가 `step × |deltaY|` 라 0.002, 휠 한 칸 ≈ 0.24배).
  - 빈 곳 더블탭(마우스 더블클릭 포함) = 그 지점 1.6배 — 직접 판정(350ms·30px, 라이브러리 터치 더블탭은 200ms 라 끔). 노드 위는 제외(노드 탭 = 패널). 손을 뗄 때 라이브러리의 끌기 마무리가 애니메이션을 취소해 확대를 40ms 뒤로.
  - [+][−] = 화면 가운데 기준 0.25씩, [전체 보기] = 지도 전체(맞춤 배율 — 최소 배율에 자르지 않음). 배율 범위 = min(0.5, 전체 맞춤) ~ 3.
  - 처음 열 때 = 첫 중심이 위쪽 가운데(영역 위 16px), 배율 1(지도 영역 폭 768 이상은 1.25) — 중심 글씨 22px·가지 18px 이상. 같은 탭에서 돌아오면 마지막 위치·배율·접힘(`sessionStorage` `mylife:v2`) — 라이브러리의 "처음 값"은 언제나 첫 중심 위쪽 가운데로 두고 복원은 초기화 직후 이동으로 적용해, 키 `0` 은 복원 위치가 아니라 처음 화면으로 간다.
  - 탭과 끌기 구분 — 누른 자리에서 8px 넘게 움직였으면 클릭을 무시(패널 안 염).
  - 페이지 스크롤 잠금 — 지도 화면에서 `html` overflow hidden(목록 보기·다른 화면에선 원래대로), 머리·도구줄 고정. 지도 영역은 라이브러리가 `touch-action: none` 으로 브라우저 스크롤·확대를 막는다.
  - 키보드 — 라이브러리 내장(지도에 포커스): 화살표 = 80px 이동, `+`·`-` = 확대·축소, `0` = 처음 화면(이전 `0` 전체 보기·`1` 기본 배율은 없앰). Tab 으로 화면 밖 노드에 포커스가 가면 감싼 상자의 브라우저 기본 스크롤을 되돌리고 그 노드가 화면 안(여백 24)에 오게 이동.
  - 지금 보는 곳 = 화면 가운데에 가까운 띠(`bandAt`, 변환마다 다음 프레임 1회) — 그 중심 테두리 `action` → `ink`, `aria-current="location"`.
  - 전체 보기 목차(작은 배율 이름 버튼·inert)는 삭제.

**검증**(로컬 운영 빌드·`AUTH_TRUST_HOST=true`·시스템 Chrome 헤드리스·측정 픽스처 노드 36·100 — 측정 뒤 삭제, 측정 스크립트 미커밋)

- 390×844(DPR 3, 터치) — **실제 터치 이벤트**(CDP `Input.dispatchTouchEvent`, 멀티터치):

| 항목 | 결과 |
|---|---|
| 처음 화면 | 배율 1 · 첫 중심 가로 가운데(195) · 영역 위 16px · 보이는 글씨 최소 18px · 페이지 `overflow: hidden` |
| 한 손가락 끌기(이야기 노드 위에서 시작, +110·−160) | 지도 +110·−160 이동 · 패널 안 열림 · 페이지 스크롤 0·머리 위치 0 |
| 두 손가락 벌리기(손가락 간격 2.5배) | 배율 1 → 2.5 · 두 손가락 가운데 지점 어긋남 3px |
| 빈 곳 더블탭(노드와 40px 넘게 떨어진 곳) | 배율 1 → 1.6 · 지점 어긋남 0 · 패널 안 열림 |
| [+] | 화면 가운데 지점 어긋남 0 |
| [전체 보기] | 지도 전체가 영역 안(노드 36 → 배율 0.12) |
| 노드 탭 | 패널 열림(제목 = 그 중심) |
| 키보드 | 화살표 ↓·→ = 지도 −80·−80 · 화면 밖 마지막 노드로 포커스 → 화면 안, 감싼 상자 스크롤 0 |
| 다시 들어오기(새로고침) | 마지막 위치·배율 그대로(−186, −4119, 1배) · 그 뒤 키 `0` = 첫 중심 가운데·위 16px |
| 멀리 끌기(오른쪽 아래로 3회) | 멈춘 뒤 지도가 화면에 최소 120px 남음 |
| 지도 밖 버튼 | 도구줄 [−][+] 56×56 · [전체 보기] 119×56 · [목록으로 보기] 150×56 · [모두 펼치기] 134×56 · 글씨 18px · 가로 스크롤 0 |
| Tab·Enter·Esc | 지도 노드 전부 도달(36/36 · 100/100) · Enter = 패널 · Esc = 닫히고 연 노드로 포커스 · 목록 보기·글자 200% 가로 스크롤 0 |
| 노드 겹침·크기 | 노드 36 · 100(처음 = 전부 접힘 22 · 모두 펼침 100) 모두 겹침 0 · 중심 248×120 하나뿐 · 보이는 글씨 최소 18px |

- 데스크톱 1280×800(사이드 패널 열림): 처음 배율 1.25(중심 310×150·글씨 최소 22.5px) · 마우스 끌기 +150·−200 그대로 이동(지도가 영역보다 좁아도 가로 이동) · 휠 4칸 = 1.25 → 2.21, 커서 지점 어긋남 0.
- 스크린샷: `canvas-390-initial`·`after-pan`·`after-pinch`·`fitall`·`tap-panel`·`lost-guard`·`n100-initial`·`n100-expanded`·`n100-fitall`·`canvas-desktop-initial`·`after-wheel`(작업 임시 폴더 — 저장소 밖). 눈으로 확인: 중심 물방울 크기·모양 균일, 가지가 줄기에서 떨어져 좌우로 뻗음, 겹침 없음.
- 성능(390×844·DPR 3·CPU 4배 감속):

| 노드 | 첫 표시(3회) | [+]·[+]·[−]·[전체 보기] 첫 반응 | 터치 끌기 1.2초 + 두 손가락 0.8초 프레임 p95 | DOM 요소 |
|---|---|---|---|---|
| 36 | 1.04~1.24초 | 3~7ms | 8.4ms | 446 |
| 100(처음 — 전부 접힘) | 1.04~1.25초 | 3~8ms | 8.4ms | 288 |
| 100(모두 펼침) | 1.07~1.73초 | 4~7ms | 8.4ms(최대 16.7) | 880 |

  기준(2.5초·200ms·33ms) 안. 버튼 반응은 지도 변환이 처음 바뀐 프레임까지(확대 애니메이션 200ms 는 그 뒤).
- 번들: `/my-life` 첫 진입 JS(빌드 산출물 gzip -9 합) **177,065B → 190,606B(+13,541B ≈ +13.2KB)**, 스크립트 13 → 14개, 원본 609,610B → 654,827B(+45KB). 라이브러리 단독 실측(설계 2) gzip 14.5KB 에서 직접 구현 코드가 빠진 만큼.
- 회귀 18종 + 빌드 — `test-my-life` 38 → 41항목(지도 폭 592·가지 56px 떨어짐 · 중심 노드 전부 같은 크기(연도 모름·접힘 포함) · 정상 배치 해소 0회 · 일부러 겹친 배치 해소 후 교차 0·순서 유지).
- **못 한 것**: 실제 iPhone·Android 기기 확인(헤드리스 CDP 터치까지만) → 성민 운영 폰 재확인 필요.

### 3단계 — 자아 메뉴

- 선행: 처리방침 v1.2 시행(Voyage AI 국외 이전 추가 포함) + 선택 동의(§5.3).
- 마이그: `SelfAspect`·`SelfAspectEvidence`·`SelfAspectRun`, enum `SelfAspectStatus`, `NodeType` 에 `SELF_ASPECT` 추가, `SelfAspect` 삭제 트리거, 선택 동의 기록 칸(§1.4 설계 그대로).
  - ⚠️ **`SELF_ASPECT` 는 반드시 `ALTER TYPE "NodeType" ADD VALUE 'SELF_ASPECT' BEFORE 'LIFE_EVENT'` 로 넣는다.** `NodeLink_direction_check` 가 enum 선언 순서(= 방향 순위)에 의존하므로, 그냥 `ADD VALUE`(맨 뒤 추가)를 하면 자아 항목이 최하위가 되어 자아→노드 연결이 CHECK 에 막힌다. `prisma migrate diff` 가 만드는 SQL 은 순서 지정 없이 맨 뒤에 붙이므로 그 줄을 손으로 고쳐야 한다. `schema.prisma` 의 enum 도 맨 위에 쓰고, `lib/node-graph.ts` `NODE_RANK` 맨 앞에 추가, `test-node-graph` ①(DB 순서 = NODE_RANK)로 확인.
- `SelfAspect` 생성기(lab 모듈의 운영 래퍼 — 운영 키·`SelfAspectRun` 원가), 금지 꼬리표·민감 필터, 목록·상세·확정/거절/직접 쓰기(§4.3), 근거 소멸 재확인.
- **완료 기준**: 저장된 근거 인용 100% 원문 부분문자열(코드 검증, `verifyStoredQuotes` 패턴) · 금지 단어 필터 단위 테스트 · 상태 전이(확정·거절은 사용자 액션만, 모델은 PROPOSED 만 생성) 단위 테스트 · 근거 삭제 시 `needsRecheck` · 거절 유사 재제안 차단 · 가상 페르소나 평가(통과 기준은 성민 정의) · `SelfAspectRun` 원가 실측 기록 · `/lab` 격리 유지(`test-lab-gate`).
- 회귀 범위: 15종 + node 테스트 2종 + 신규 `test-self-aspect` + `test-lab-gate`.

---

## 7. 결정 질문 (Q1~Q19 2026-10-30 결정 — 7.1 · 2b Q20~Q31 2026-11-01 결정 — 7.2 · My Life Q36~Q50 2026-11-01 제기 — 7.3)

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

### 7.2 2b 결정 질문 (2026-10-31 제기 → 2026-11-01 결정)

결정(성민, 제안: 리뷰 채팅): **Q21 = 이야기 + 인물**(장소·중심은 다음 단계) · **Q23 = 이전 판 보관 안 함**(공개 전 재검토 — CLAUDE.md 열린 결정사항에 백로그) · 그 외 Q20·Q22·Q24~Q31 은 아래 추천안 채택. 2b-3(노드 보기·블로그 편집)은 도그푸딩 1주 뒤 착수.

| # | 질문 | 추천 |
|---|---|---|
| Q20 | 노드 보기 배치: A 목록형 / B 시각형 / B + 접힘(2b.1) | B 구조 + 중심 카드 접힘 기본. 하나만 고르면 A. **→ 2026-11-01 My Life 마인드맵으로 대체**(접힘은 띠 접기, A 는 [목록으로 보기]로 이어받음 — §6 2b.1) |
| Q21 | 블로그 편집 대상: 이야기(STORY·SELF)만 / 중심·인물·그룹·장소도 | 이야기만. 나머지는 보기만(인물·장소는 기존 메모), 본문은 필요가 확인되면(그때 `node_body` 브릿지·가족 룸 제외 같이) |
| Q22 | 본문 상한 | 블록 60개·문단 3,000자·소제목 40자·캡션 100자(이야기 대화 원문 평균 187자 — §3.1 운영 집계 — 보다 훨씬 넉넉한 값) |
| Q23 | 이전 판 보관(되돌리기) | 안 함 — `version` 은 충돌 검사용. 도그푸딩에서 잘못 지운 사례가 나오면 별도 테이블 |
| Q24 | 인물 모드 직접 답(`submitPersonAnswer`)도 확인 단계에 넣을지 | 안 넣음 — 직접 물은 답이고, 바로 그 인물과 대화가 이어짐 |
| Q25 | `/chat-v3` 종료 시 확인 화면으로 바로 보낼지 / `/story-review` 카드만 | 대기 ≥1 이면 바로 보냄(Q6 "대화 종료 시 일괄 확인"). **2026-11-01 갱신(성민, 제안: 리뷰 채팅)**: + 이야기 저장 직후 대기 ≥1 이면 대화창 카드(대화 계속), 세션 종료 이동은 유지 |
| Q26 | 확인 대기 중인 중심의 person 갭(2b.3) | 그대로 둠(코드 0, 확인하면 사라짐) |
| Q27 | 사진 캡션을 평문에서 뺄지(§1.8 "사진은 캡션만" 변경) | 뺌 — 캡션은 `Photo.caption` 한 곳, 이야기 평문엔 문단·소제목만 |
| Q28 | `Place` 재사용(`PlacesEditor`)을 2b-5 에 같이 할지 | 같이 — 장소형 인물을 막으면 V2 장소 연결 경로가 `PlacesEditor` 하나가 됨 |
| Q29 | 물방울 모양: 디자인 시스템 기본 `rounded-md` / 큰 라운딩 예외 | `rounded-md` + 연대 스트립(예외 안 만듦 — 디자인 시스템 "과한 라운딩 늘리지 않음"). **→ 2026-11-01 뒤집음(성민): My Life 화면에 한해 물방울 모양**(큰 라운딩 + 꼭지 — §6 2b.1 의 4). 다른 화면은 `rounded-md` 그대로 |
| Q30 | 새 회귀 3종(`test-node-confirm`·`test-node-view`·`test-node-body`) 세트 편입 | 편입(16 → 19종). 2026-11-01 — `test-node-view` 는 `test-my-life` 로 이름이 바뀜(2b-3 재정의) |
| Q31 | 확인 화면 "모두 맞아요" 범위: 화면 전체 / 이야기 묶음별 | 화면 전체 1개 + 행별 버튼(버튼 수 최소) |

### 7.3 My Life 결정 질문 (2026-11-01 제기 → 같은 날 결정)

**결정(2026-11-01 성민, 제안: 리뷰 채팅)** — Q36~Q50 은 아래 추천안 채택, 다만 다음은 성민이 직접 정했다:
- **Q44**: `saveNodeLink` 를 유일한 입구로. 중심→인물은 `PersonLifeEvent`, 이야기→장소는 `MemoryPlace` 로 함수 안에서 넘긴다(방향·소유 확인은 `saveNodeLink` 한 곳). NodeLink 중복 저장 금지. 2b-3b 에서 쓰지만 함수 변경은 2b-3a 에 함께(회귀 포함).
- **Q50**: 넣은 직후 [되돌리기] + 패널의 연결 노드마다 [빼기](확인창). 빼기는 연결만 끊음(노드 삭제 아님). `removeNodeLink` 도 같은 원칙(입구 하나, 기존 칸으로 넘김). 구현은 2b-3b.
- **Q38**: 이야기 안에 보이는 인물·장소는 같은 중심의 가지에서 뺀다(추천안).
- **Q42**: 확대·축소 직접 구현, iOS 실기기에서 막히면 react-zoom-pan-pinch 로 교체(추천안).
- **Q45**: "그때의 나" = `sage`(추천안).

성민 결정 사항(메뉴 이름 "My Life"·마인드맵 하나·줄기 + 양옆 가지·물방울·아래 패널·넣기 = 고르기 + 새로 만들기·드래그 연결 없음·`/story-review` 공존)은 전제로 두고, 설계에서 생긴 질문만 모았다. 근거는 §6 2b.1.

| # | 질문 | 추천 |
|---|---|---|
| Q36 | 경로·이야기 상세 위치 | `/my-life` 최상위 + 이야기 상세 `/my-life/story/[id]`(2b.2 경로를 옮김). `/story-review/nodes` 는 만들지 않음 |
| Q37 | 양옆 배치: ① 종류별 좌우 고정 / ② 좌우 번갈아 | ① — 왼쪽 이야기·그때의 나 / 오른쪽 사람·모임·장소. ② 가 띠를 약 27% 줄이지만 매 띠 종류를 다시 찾아야 함. 길이는 접기로 |
| Q38 | 이야기 안에 이미 보이는 인물·장소·모임을 오른쪽 가지에도 또 보일지 | 뺌(띠 하나 = 물방울 하나, 이전 2b.1 중복 제거 규칙) — 2b-2 [맞아요]가 `PersonLifeEvent` 를 만들어, 안 빼면 이야기 인물이 거의 다 두 번 보임 |
| Q39 | 띠 간격: 연도 비례 / 내용 높이 | 내용 높이로 쌓기 + 앞 띠와 10년 이상 차이면 [N년 뒤] 표지 |
| Q40 | 연도 없는 중심(운영 16개) 위치 | `sequenceOrder` 자리 그대로(골격은 인생 순서, 연도 없는 직접 추가는 맨 뒤 — 기존 결정) + [연도 모름]. 추정 연도 숫자는 안 보임 |
| Q41 | 접기 기본값 | 지도 노드 ≤ 60 전부 펼침, 넘으면 전부 접힘 + [모두 펼치기]. 60 은 상한 실측의 절반으로 조정. 접힘 상태는 탭 안 `sessionStorage` |
| Q42 | 확대·이동 구현: 직접(네이티브 스크롤 + 배율) / react-zoom-pan-pinch | 직접 구현(의존성 0, 포커스 자동 스크롤·키보드·관성 스크롤이 브라우저 기본). 2b-3a 첫날 iOS·Android 실기기 시험이 막히면 react-zoom-pan-pinch 4.2.0(gzip 14.5KB, `/my-life` 묶음에만). **→ 2026-11-01 교체(성민 — 운영 폰에서 지점 확대·자유 이동 불가): react-zoom-pan-pinch 자유 이동 캔버스**(§6 "2b-3a 수정") |
| Q43 | 전체 보기 상태(배율 < 0.6)를 목차로 쓸지 | 씀 — 가지는 못 누르고 중심 이름만 화면 기준 18px 이상 버튼, 누르면 그 띠로 배율 1. **→ 2026-11-01 폐기(성민 — 덮어 그린 사각형이 크기 불일치·가지 가림으로 보임)**: 중심 노드는 언제나 같은 물방울, 지금 보는 곳은 테두리 색 |
| Q44 | "연결 생성은 `saveNodeLink` 만" vs 저장 위치 규칙(§1.5): 중심→인물 = `PersonLifeEvent`, 이야기→장소 = `MemoryPlace` | **기존 저장 함수를 그대로 쓴다**(`linkPersonToLifeEvent`·`MemoryPlace` 1행 추가) — "새 저장 경로를 만들지 않고 쌍마다 정해진 함수 하나만"으로 읽는다. `ALLOWED_PAIRS` 에 두 쌍(LIFE_EVENT→PERSON·EPISODE→PLACE)을 더하면 한 쌍이 두 곳에 저장되고, 갭·`/people`·인터뷰 후보·포스터가 기존 칸만 읽어 새 연결을 못 본다. 대안: `saveNodeLink` 를 입구로 두고 그 두 쌍만 기존 칸으로 보냄(함수 이름 하나, 저장 위치 그대로) — 입구를 하나로 묶고 싶으면 이쪽 |
| Q45 | 종류별 색 | 중심 `action` · 이야기 `ink-soft` · 그때의 나 `sage`(예약색 첫 사용) · 사람·모임 `emerald-700` · 장소 `sky-700` 테두리(모두 canvas 대비 3:1 이상, 글자는 전부 `ink` 14:1 이상) + 구현 커밋에서 `docs/design-system.md` 에 물방울 예외·`sage` 용도 기록 |
| Q46 | 이야기 노드 글자(제목 칸 없음) | 본문 첫 문장 2줄. 제목 칸·AI 제목 생성은 안 함. 블로그 소제목이 생기면(2b-3c) 첫 소제목을 우선할지는 그때 |
| Q47 | 중심 [이야기 추가] 방식 | 2b-3b = 말로(대화 딥링크)만. 대화 없이 직접 쓰기는 2b-3c(블로그 편집기와 같이) |
| Q48 | 이야기를 옮길 때 옛 중심의 `PersonLifeEvent` | 남김 — 출처 칸이 없어 직접 넣은 연결과 구별 불가. 지울 길은 Q50 과 같이 |
| Q49 | 사람을 누르면 "이 분이 나온 곳만" 보기(이전 2b.1 필터) | 2b-3 범위 밖 — 도그푸딩 뒤. 그동안 패널 [인물록에서 보기]가 대신 |
| Q50 | 빼기(연결 지우기) — 요구 범위 밖 | 잘못 누른 것을 되돌릴 길이 없어, 최소한 "넣은 직후 같은 패널의 [되돌리기] 1개"(다음 동작 전까지)를 2b-3b 에 넣는 것을 추천. 일반 빼기는 도그푸딩 뒤 |

---

## 결정 로그

- 2026-10-30 — 설계 문서 작성(구현 전). 데이터 방식·노드 구성·자아 메뉴 원칙·포스터 연기는 성민 결정(제안: 리뷰 채팅). 같은 날 `/api/tts`·`lib/clova-tts` 삭제(설계와 별개, 별도 커밋).
- 2026-10-30 — §7 결정: Q1·Q5·Q6·Q13·Q14 성민 결정(제안: 리뷰 채팅), 나머지 **추천안 채택(성민 위임)**, Q18 문구 대기(§7.1).
- 2026-10-30 — 1단계 단계 A 수정(성민): 자아 메뉴 테이블·enum·`NodeType.SELF_ASPECT`·트리거를 3단계 마이그로 분리. `NodeLink` 방향 규칙 확정(순위 `LIFE_EVENT > EPISODE > PERSON_GROUP > PERSON > PLACE`, 같은 종류는 id 바이트 순, 저장 함수 1개 + DB CHECK). `LifeEvent` 유형 유니크 없음 확인 → 제거 SQL 불필요. 장소 이관 6묶음·실고객 19행 제외 승인.
- 2026-10-30 — 1단계 구현 완료: deploy 1건·카탈로그 확인, 장소 이관 34행→20곳(실고객 19행 제외), `saveNodeLink`·STORY 필터·같은 유형 여러 개 대응, 회귀 16종(`test-node-graph` 추가). `reconcile-node-links`·story-review SELF 제외는 2단계로 이월. 3단계 `SELF_ASPECT` 추가는 `ADD VALUE … BEFORE 'LIFE_EVENT'` 필수(CHECK 가 enum 순서에 의존) — §6 3단계에 메모.
- 2026-10-31 — 2a("관계별 나" 가설 검증 경로, 성민 요청) 완료: Q9 선행 수정(본문 정정 시 다듬기 3필드 초기화·다듬기는 life_event 행만), 인터뷰 SELF 출처(질문 풀 관계별 문항 형식 — 대상 시기 + 관계 대상, 예시 3개 임시, 6문항 중 최대 1개), 답 = `Episode(kind=SELF)` + 실제 인물·그룹이면 `saveNodeLink`, SELF 는 이야기 갭·`hasEpisode` 미충족, `/story-review` "그때의 나" 별도 묶음, 포스터 브릿지 SELF 제외 유지. 마이그 0, 회귀 16종(§6 "2a 구현 결과").
- 2026-10-31 — 2b 설계(성민 요청, 구현 전·코드 변경 0): 노드 보기 `/story-review/nodes`(390px 배치안 A·B 비교, 추천 B + 접힘), 노드 상세·블로그 편집(이야기만, 평문이 진실 — `plainText === content` 일 때만 문서 표시, 버전 = 충돌 검사), 인물 확인(이야기 마무리 추출만 PROPOSED + 초안, `PersonLifeEvent` 는 확인 때), `db/reconcile-node-links.ts`(dry-run 기본 10항목), 장소형 인물 신규 생성 → `Place`(말동무는 승인 때 변환) + `PlacesEditor` 재사용. 마이그 0, 단계 2b-1~2b-5. §1.8 과 달라진 점: 사진 캡션 평문 제외(Q27), §4.1 필터 "흐리게" → "숨김 + 안내 띠"(대비 기준). 결정 질문 Q20~Q31(§7.2).
- 2026-11-01 — §7.2 결정(성민, 제안: 리뷰 채팅): Q21 블로그 편집 대상 = 이야기 + 인물(장소·중심은 다음 단계), Q23 이전 판 보관 안 함(공개 전 재검토 — CLAUDE.md 백로그), 그 외 추천안 채택. 2b-3 은 도그푸딩 1주 뒤 착수.
- 2026-11-01 — 2b-1·2b-2 구현 완료: 정합 점검(`lib/node-graph-reconcile.ts` + `db/reconcile-node-links.ts`, 운영 dry-run 1회 10항목 전부 0 — 적용 안 함), 인물 확인(이야기 마무리 추출 → 초안 + PROPOSED, `/story-review/confirm`, 진입 3곳). 마이그 0, 회귀 17종(`test-node-confirm` 추가). 설계와 달라진 점은 §6 "2b-1·2b-2 구현 결과".
- 2026-11-01 — 2b-2 후속(성민 요청): 같은 이름의 확정 인물이 있으면 자동 병합하지 않고 그 행에서 [같은 분이에요]·[다른 분이에요]로 묻는다. 이름만 같고 관계가 달라도 묻는다(근거 §6 "2b-2 후속"), [고칠게요]에도 같은 규칙. `isDraft=true` 생성 경로 전수 grep — 확인 대기 조건 오염 없음 판정.
- 2026-11-01 — Q25 갱신(성민, 제안: 리뷰 채팅 — 조사의 A·B·C 대신): 이야기 저장 직후 확인 대기 ≥1 이면 `/chat-v3` 대화창에 확인 카드, 대화는 계속, 세션 종료 이동(`finishSession`)은 유지. 같은 날 E2E 후속으로 이야기 내용 유실 수정(인물 질문 답을 이야기 기록 첫 턴으로·문장 끝 마무리 말 떼기·요약 "내용 없음" 표식) — §6 "E2E 후속". 대화 내용과 시기 불일치는 설계만(§6 "시기 불일치").
- 2026-11-01 — 종료 문구 오탐 수정(성민, 제안: 리뷰 채팅): 명시적 종료·완곡 종료도 문장 전체 일치(`matchClosing`), /chat-v3·오늘의 인터뷰·온보딩 이야기 대화 같은 함수 — §6 "종료 문구 문장 전체 일치". Q32~Q35 추천안 채택(첫 본인 턴 직후 한 번 묻기 · 출생 중심 비가족 만난 해 비움 · 옮기기는 2b-3 이야기 상세 · 기존 데이터는 착수 때 dry-run 후), 구현은 2b-3.
- 2026-11-01 — **2b-3 재정의 — My Life 마인드맵**(성민 결정, 설계만·코드 변경 0): 노드 보기(`/story-review/nodes`, 카드 중첩)를 새 메뉴 "My Life"(`/my-life`) 마인드맵 하나로 바꿈 — 세로 줄기에 확정 중심을 시기 순으로, 양옆에 이야기·그때의 나 / 사람·모임·장소, 이야기 안에 인물·장소 작은 물방울, 노드 누르면 아래 패널(중심 [이야기 추가][인물 넣기][장소 넣기] · 이야기 [본문 보기][인물 넣기][장소 넣기]), 드래그 연결 없음, `/story-review` 공존. **Q29 를 이 화면에 한해 뒤집음 — 물방울 모양**(다른 화면은 `rounded-md` 그대로). §6 2b.1 교체(배치·렌더링·접근성·모양·패널·메뉴·단계 2b-3a~d), 2b.2 경로 `/my-life/story/[id]` 로, 2b.6 의 2b-3·2b-4 행 대체, Q32~Q34 옮기기는 이야기 패널로. 근거 실측: 확대·축소 후보 번들(react-zoom-pan-pinch gzip 14.5KB 등 — 프로젝트 밖 설치), 운영 규모(개수만 — 지도 노드 최대 36·연도 없는 확정 중심 16), 색 대비 계산. 결정 질문 Q36~Q50(§7.3).
- 2026-11-01 — §7.3 결정(성민, 제안: 리뷰 채팅): Q44 `saveNodeLink` 유일한 입구(중심→인물 `PersonLifeEvent`·이야기→장소 `MemoryPlace` 로 함수 안에서 넘김, NodeLink 중복 저장 금지), Q50 넣은 직후 [되돌리기] + 연결 노드마다 [빼기](확인창, 연결만 끊음 — `removeNodeLink` 같은 입구 원칙, 2b-3b), Q38·Q42·Q45(그때의 나 = `sage`) 추천안, 그 외 Q36~Q50 추천안 채택. 같은 날 **2b-3a(My Life 보기 전용) 구현** — `/my-life` 지도(줄기·좌우 가지·물방울·작은 물방울·띠 접기·도구줄·지금 보는 곳·전체 보기 목차·목록 보기)·정보 패널·메뉴 진입 2곳, `saveNodeLink` 입구(`ROUTED_PAIRS`), 회귀 18종(`test-my-life` 추가), 390·데스크톱·노드 36·60·100 실측 통과, iOS·Android 실기기 오므리기는 미검증 — §6 "2b-3a 구현 결과".
- 2026-11-01 — **2b-3a 수정(성민 결정, 운영 폰 피드백)**: 노드 크기 고정 + 자유 이동 캔버스 — Q42 교체 조건 충족으로 `react-zoom-pan-pinch` 도입(새 의존성 1), Q43 전체 보기 목차 폐기. 지도 폭 592·가지 줄기에서 56px·중심 노드 전부 같은 크기·배치 후 겹침 검사·해소, 끌기·지점 확대(두 손가락·휠·더블탭)·[+][−] 가운데 기준·처음 첫 중심 위쪽 가운데·페이지 스크롤 잠금·탭/끌기 8px 구분·키보드 화살표 이동·지금 보는 곳 = 테두리 색. CDP 실제 터치·데스크톱 끌기/휠 실측, 노드 36·100 성능, 번들 +13.2KB(gzip), 회귀 18종 — §6 "2b-3a 수정".
