# 오늘의 인터뷰 — 설계 + 1차 구현

- 상태: **1차 구현 완료(2026-10-25)** — 실제 구현과 설계의 차이는 §15. 결정은 §12(전부 결정됨, 결정 로그 참조), 화면 문구는 `lib/interview/copy.ts`(임시).
- 작성: 2026-10-24 · Claude Code (성민 요청)
- 목적: 도그푸딩(창업자 본인, 10/9 예정 → 지연) 동안 매일 5~7문항씩 짧게 답하며 인생 기록을 쌓는다. 장기적으로는 전 연령 사용자의 재방문 루프.
- 화면 문구는 이 문서에서 새로 쓰지 않는다. 문구가 들어갈 자리는 `[문구 필요: 위치]` 로 적고 §13 에 모았다(카피는 성민 결정).

## 0. 요약

- 세션 = (사용자, KST 날짜) 하루 1개, 기본 6문항(5~7). 출처 4종(갭 이야기·연도 묻기·이어가기·취향/일상 풀)을 정해진 순서로 섞는다(§2).
- **답 저장은 전부 기존 경로**다. 이야기형 문항은 `finishEpisodeChat` → Episode(+브릿지 UserMemory)·인물 추출, 연도는 LifeEvent 의 연도 컬럼. 새로 필요한 것은 연도만 쓰는 얇은 액션 1개와, 기존 액션 2개의 선택 인자(기본값이면 동작 무변)다(§6.1).
- **진행 기록(중복 방지·재진입·도그푸딩 집계)은 스키마 변경 없이** 기존 `OnboardingChatMessage` 에 `sessionId` 접두 규칙(`interview:<날짜>:<문항키>`)으로 남기는 안(M안)을 추천한다. 대신 `/chat-v3` 로그 조회에서 이 접두를 빼는 1줄 수정이 반드시 같이 가야 한다. 판정이 흔들리면 테이블 1개 안(T안, SQL 초안 첨부)으로 옮긴다(§6.2).
- 진입은 `/story-review` 상단 카드 → 새 페이지 `/interview`. `proxy.ts` 는 무수정(로그인·동의 게이트가 자동 적용)(§7).
- 비용(추정): 세션당 Sonnet 15~16회, 약 $0.10(≈135원). 최악 약 $0.24(§9). 단, 지금은 `/chat-v3` 계열 AI 사용량이 DB 에 안 남아 실측이 안 된다(§9.3).

---

## 1. 현행 파악

### 1.1 `/chat-v3` 흐름

- `app/chat-v3/page.tsx` — 로그인·V3 트랙 가드 후 `ChatV3Client` 렌더. `?gapEventId=&gapType=confirm|episode|period|person|person_episode[&gapPersonId=]` 딥링크(`/story-review` 갭 카드에서 옴).
- `ChatV3Client.tsx` 내부 단계 6종(UI 에 안 보임): `profile_year` → `profile_region` → `confirm`(골격 확인질문) → `open`(자유 대화 + 갭 칩 3장) ↔ `episode`(심화 대화) ↔ `person`(그 시절 사람).
- `init()` 분기 순서(`ChatV3Client.tsx:1130`): 로그 복원(최근 100턴) → 딥링크가 대기 대화와 같은 대상이면 이어받기 → 딥링크(새로고침으로 소비된 딥링크는 무시) → 대기 대화(`ChatV3PendingContext`) 이어받기 → 프로필 없으면 생년 질문 → 확인질문 루프(끝나 있으면 `open`).
- 피로도 상한 `MAX_SESSION_QUESTIONS = 12`(`:86`)는 **신상+확인질문에만** 걸린다. 에피소드·자유 대화는 상한 없음.
- `sessionId` 는 브라우저 방문 1회 = 클라 생성 uuid(`:262`). 표시·로직에는 쓰지 않는 순수 메타데이터(스키마 주석).

### 1.2 갭 대화(P1~P23)가 질문을 고르는 방식

- 계산은 `lib/gap-detector.ts` `detectGaps()`(`:73`, 읽기 전용). 갭 6종과 우선순위(낮을수록 먼저):

| 우선 | 타입 | 조건 | 묻는 엔진 |
|---|---|---|---|
| 1 | `needs_review` | UNCONFIRMED + needsReview | 확인질문(Sonnet 생성) |
| 2 | `unconfirmed` | UNCONFIRMED | 확인질문 |
| 3 | `person_episode` | 대화로 연결된 인물인데 그 사람과의 실질 Episode 없음 | 인물 에피소드 |
| 4 | `person` | 확정 사건에 연결 인물 0 + `personAsked=false` | 인물 질문 |
| 5 | `time_gap` | 확정·연도 있는 사건 사이(또는 마지막→올해) ≥ 10년 + 그 앵커에 실질 구간 이야기 없음 | 에피소드 엔진(period) |
| 6 | `episode` | 확정 사건에 실질 Episode 없음 | 에피소드 엔진 |

- "실질"은 `isSubstantiveEpisodeContent()`(`lib/episode-text.ts:109`) — 안내문·빈 내용 Episode 는 해소로 안 친다(P16-1).
- 화면에 몇 장 보일지는 `pickTopGaps(gaps, 3)`(`:294`) — 타입별 1장 먼저, 남으면 우선순위 순(P7-8, 한 타입이 다른 타입을 가리는 문제 대응).
- 질문 문구: 확인질문만 Sonnet 이 생성하고, 에피소드 오프닝(`buildEpisodeOpeningPrompt`, `ChatV3Client.tsx:202`)·인물 질문(`buildPersonAskPrompt`, `:228`)·구간 질문(`timeGapPrompt`)은 **결정적 템플릿**이다.
- **연도 없는 확정 사건을 묻는 갭은 없다.** 골격의 `FIRST_JOB`·`MARRIAGE` 는 처음부터 `year=null` 이라 "네" 로 확정되면 연도 없이 남고, 자유 대화 승격 CUSTOM 사건도 연도를 못 뽑으면 null 이다. 포스터 브릿지는 연도 없는 사건을 통째로 건너뛴다(`lib/poster/v3-bridge.ts:72`). 그래서 이 출처는 새로 만든다.

### 1.3 저장 구조

| 테이블 | 역할 | 메모 |
|---|---|---|
| `OnboardingChatMessage` | `/chat-v3` 대화 로그, 턴당 1행 | `sessionId` 자유 문자열, `@@index([userId, createdAt])`. 조회는 `listRecentChatMessages`(`app/actions/chat-v3-log.ts:51`) 최근 100개, 세션 무관 시간순 |
| `LifeEvent` | 골격·CUSTOM 사건 | `status`, `year`/`correctedYear`/`correctedLabel`, `unclearCount`/`needsReview`, `hasEpisode`(배지용), `personAsked` |
| `Episode` | 사건 1건의 이야기(N개 가능) | `content`(요약)·`rawTranscript`·`isPeriod`·`personId`, `memoryId` 로 UserMemory(`createdVia="episode"`) 1:1 브릿지 — 사진·장소 재사용용 |
| `ChatV3PendingContext` | 미완료 episode/person 대화(사용자당 1행) | 행이 있으면 "이어받을 대화 있음". 이전 턴은 저장 안 함 — 마지막 질문 하나만 이어받는다(P7-7) |
| `PersonLifeEvent` | 인물 ↔ 사건 | person 갭 판정 |

- 에피소드 대화는 턴마다 DB 에 쓰지 않는다. 클라가 history 를 들고 있다가 끝날 때 `finishEpisodeChat`(`app/actions/episode.ts:149`)이 한 번에 요약·저장한다: Sonnet 요약(안내문이면 1회 재시도, 그래도 안 되면 본인 발화 원문) → `createEpisodeBridge` 트랜잭션 → `savePeopleMentionedInEpisode`(Sonnet 1회, best-effort).
- 후속 질문 상한 `MAX_FOLLOWUPS = 2`(`episode.ts:37`, 클라 `EPISODE_MAX_FOLLOWUPS` 와 값 동기화 필요).
- 가족 룸: `listRoomMemories` 가 `photo`·`episode`·`v3_bridge` 를 제외(`lib/rooms.ts:154~`) — Episode 는 지금 가족 룸에 안 나간다(솔로=비공개 유지).

### 1.4 기존 상태값 (인터뷰가 건드리면 안 되는 의미 포함)

| 값 | 의미 | 인터뷰와의 관계 |
|---|---|---|
| `LifeEvent.status = UNCONFIRMED` | 시스템 추정값, 아직 확인 안 함 | 인터뷰 대상 아님(확인질문은 `/chat-v3` 몫) |
| `CONFIRMED` / `CORRECTED` | 확인됨 / 값이 정정됨 | 인터뷰 대상. 모든 읽기는 `correctedYear ?? year` |
| `SKIPPED` | **"이 시기 넘어가기" = 해당 없음**(예: 대학 안 감). optional 사건만 | ⚠️ 인터뷰의 "건너뛰기"(=오늘 이 질문 안 함)와 전혀 다르다. 인터뷰는 이 값을 **절대 쓰지 않는다.** SKIPPED 시기를 대상으로 한 풀 질문도 안 묻는다 |
| `unclearCount` / `needsReview` | 확인질문 UNCLEAR 반복 → 재질문 중단 | 인터뷰가 갱신하지 않는다 |
| `personAsked` | person 갭을 이미 물어봄(저장·거절 무관) | 2차에서 person 출처 쓸 때 그대로 따른다 |
| `hasEpisode` | story-review 배지용 | 판정에 쓰지 않는다(갭은 실질 Episode 기준) |
| `Episode.isPeriod` | 앵커 "이후" 구간 이야기 | `finishEpisodeChat` 이 `topicOverride` 유무로 추론(`episode.ts:235`) — §6.1 수정 필요 이유 |
| `ChatV3PendingContext` 행 존재 | 미완료 대화 | 2차 "이어가기" 출처의 원천 |
| `User.skippedLifeCategories` | v2 `/life-record` 카테고리 건너뜀 | v2 전용, 무관 |

### 1.5 재사용 가능한 코드

| 코드 | 재사용 방식 |
|---|---|
| `detectGaps` / `pickTopGaps` | 그대로(갭 이야기 후보) |
| `getPeriodPromptForEvent`·`timeGapPrompt` | 그대로(구간 질문 문구) |
| `continueEpisodeChat` / `finishEpisodeChat` | 선택 인자 추가 후 재사용(§6.1) |
| `buildEpisodeOpeningPrompt`·`buildPersonAskPrompt` | 클라 파일 안 비공개 함수 → `lib/` 순수 모듈로 옮겨 공유(동작 무변 리팩터) |
| `isEpisodeDoneIntent`·`stripEpisodeDoneSignal`·`isExitIntent`·`isSubstantiveEpisodeContent` | 그대로(`lib/episode-text.ts`) |
| `saveChatMessage` | 그대로(인터뷰 턴도 같은 테이블, §6.2 M안) |
| `getConfirmedLifeEvent` | 그대로(대상 사건 재검증) |
| `VoiceTextarea` | 그대로(Web Speech API, 무료 — 서버 STT 아님) |
| `Button size="lg"`(56px)·`CharacterStage` | 그대로 |

### 1.6 test30(도그푸딩 계정) 기준 지금 고를 수 있는 것 — 읽기 집계

`detectGaps` + LifeEvent 집계, 2026-10-24: episode 갭 7 · person 갭 5 · person_episode 갭 2 · time_gap 0 · 연도 없는 확정 사건 2(`FIRST_JOB`, `MARRIAGE`) · 대기 대화 없음. 확정 8건(전부 CONFIRMED). → 첫날 기본 구성(§2) 6문항을 채우는 데 문제없다.

---

## 2. 세션 구성 (요구 1)

### 2.1 정의

- 세션 = (userId, KST 날짜). 하루 1세션. 기본 **6문항**(최소 5·최대 7, Q2).
- 진입 조건 = V3 트랙 + 골격 완료 + UNCONFIRMED 0건(= `/enter` 가 `/story-review` 로 보내는 조건과 같다). 아니면 `/chat-v3` 로 보낸다(확인질문이 먼저).

### 2.2 출처와 문항 키

문항 키(`itemKey`)는 날짜를 넘어 같은 질문을 알아보는 영구 식별자다.

| 출처 | 후보 | itemKey | 1차/2차 |
|---|---|---|---|
| 갭 이야기 | `detectGaps` 중 `episode`·`time_gap` | `gap:episode:<eventId>` · `gap:period:<eventId>` | 1차 |
| 연도 묻기 | 확정(CONFIRMED/CORRECTED) + `correctedYear ?? year` 가 null | `gap:year:<eventId>` | 1차 |
| 취향·일상 | 질문 풀(§5), 대상 시기 사건이 확정인 것만 | `pool:<poolId>` | 1차(대상 시기 있는 것만) |
| 이어가기 | `ChatV3PendingContext`(`/chat-v3` 에서 이탈한 대화) | `resume:<eventId>[:<personId>]` | 2차 |
| (인물) | `person_episode`·`person` 갭 | `gap:person_episode:<eventId>:<personId>` 등 | 2차(Q11) |

제외: `unconfirmed`·`needs_review`(확인질문은 `/chat-v3`), SKIPPED 사건, `needsReview` 사건.

### 2.3 섞는 비율과 순서 (제안)

깊은 질문(이야기형) 사이에 가벼운 질문(연도)을 끼워 피로를 줄이고, 첫 문항은 가장 쉬운 것으로 시작한다.

| 자리 | 출처 | 비고 |
|---|---|---|
| 1 | 이어가기 (있을 때만, 최대 1) | 2차. 기억이 남아 있을 때 마무리하는 게 가치가 크다 |
| 2 | 연도 | 한 마디로 끝나는 워밍업 |
| 3 | 갭 이야기 | |
| 4 | 취향·일상 | |
| 5 | 갭 이야기 | 3번과 다른 사건·가능하면 다른 생애 단계 |
| 6 | 취향·일상 | 4번과 다른 분류 |
| (7) | 연도 | 7문항 설정일 때만 |

- 한도: 이어가기 ≤1, 연도 ≤2, 갭 이야기 ≤3, 취향 ≤3.
- 빈 자리 채움 순서: 취향 → 갭 이야기 → 연도. 다 채워도 5개 미만이면 있는 만큼만. 0개면 `[문구 필요: 오늘 여쭤볼 게 없음 안내]`.
- 출처 내부 우선순위:
  - 갭 이야기: `detectGaps` 기존 우선순위(`time_gap` 5 → `episode` 6) 그대로, 같은 세션에 같은 사건 두 번 금지.
  - 연도: `sequenceOrder` 순(인생 순서). CUSTOM 도 포함.
  - 취향: 풀 파일의 `order` 순, 같은 분류 연속 금지.
- 계산 시점: 세션 시작(또는 같은 날 재진입) 때 1회 계산해 클라가 보관한다. 문항마다 다시 계산하지 않는다(`detectGaps` 는 무겁다 — P20).

---

## 3. 중복 방지 (요구 2)

| 경우 | 규칙(제안) | 근거 데이터 |
|---|---|---|
| 같은 날 같은 문항 | 금지 | 오늘 기록의 itemKey |
| 답한 갭 이야기 | 실질 Episode 가 생기면 갭이 사라져 자연히 제외 | `detectGaps` |
| 답했지만 실질 아님(너무 짧아 안내문 판정 등) | 갭이 남는다 → 7일 뒤 재노출 | 기록의 마지막 제시일 |
| 답한 연도 | 연도가 채워지면 자연히 제외 | LifeEvent |
| 연도 "모름" | 14일 뒤 1회 더, 또 모르면 영구 제외(Q5) | 기록(답은 있는데 연도는 그대로 null) |
| 답한 풀 질문 | 영구 제외 | 기록 |
| 건너뛴 질문 | 1회째 7일 · 2회째 30일 뒤 재노출 · 3회째 영구 제외(Q4) | 기록의 건너뜀 횟수·날짜 |
| 중간 이탈(질문은 봤고 답 없음) | 건너뜀으로 **안 셈**. 같은 날 재진입이면 그 문항부터, 다음 날엔 일반 후보로 | 기록 |
| `/chat-v3` 에서 같은 갭을 채움 | 자연히 제외(데이터 기준이라 화면 무관) | `detectGaps` |

- 1차는 단순화: 건너뛴 질문은 일괄 7일 제외, "모름"도 7일 제외. 단계별 재노출·영구 제외는 2차.
- 존엄 원칙: 여러 번 건너뛴 질문을 계속 내밀지 않는다(재촉 금지). 끊김·연속일 압박 표현 금지(출석 정책 계승).

---

## 4. 세션 흐름 (요구 3)

```
[시작 화면] ──시작──▶ [문항 화면] ──(반복 N회)──▶ [종료 요약] ──▶ /story-review
     │                    │  ├ 답하기 → (이야기형) 후속 질문 ≤Q3회 → 저장 → 다음 문항
     │                    │  ├ 이 이야기는 여기까지 → 지금까지 답으로 저장 → 다음 문항
     │                    │  ├ 건너뛰기 → 다음 문항 (LifeEvent 무변)
     │                    │  └ 오늘은 그만 → [중단 화면] (같은 날 다시 오면 이 문항부터)
     └ 오늘 이미 끝냄 → [오늘 완료 화면]
```

- **시작 화면**: 오늘 문항 수, `[문구 필요: 시작 화면 제목]` `[문구 필요: 시작 화면 설명 — 문항 수·짧게 답해도 됨]` `[문구 필요: 시작 버튼]`.
- **문항 화면**(한 화면 한 질문): 진행 `n / N`, 질문, 답 입력(`VoiceTextarea`), 버튼 `[문구 필요: 답 보내기]` `[문구 필요: 건너뛰기]` `[문구 필요: 오늘은 그만]`.
  - 연도형: 답 → 파싱(§6.1) → 성공 `[문구 필요: 연도 반영 확인]` → 다음. 실패하면 1회만 다시 묻고(`[문구 필요: 연도 재질문]`), 그래도 안 되면 "모름"으로 기록하고 다음.
  - 이야기형(갭·풀·이어가기): 답 → 후속 질문(같은 카드에서 질문만 바뀜) → 저장 → 다음. 후속 질문이 떠 있는 동안 `[문구 필요: 이 이야기는 여기까지]` 버튼이 보인다 = 짧게 끝내기. 종료 의사 발화("그만할래요" 등)는 기존 `isEpisodeDoneIntent`·`isExitIntent` 로 처리.
  - 저장 중·후속 질문 생성 중: `[문구 필요: 저장 중 안내]` `[문구 필요: 생각 중 안내]`.
  - 저장 실패: 답을 잃지 않게 다시 시도 버튼 `[문구 필요: 저장 실패 안내·다시 시도]`. 실패 문항은 "답함"으로 안 친다.
- **종료 요약**: 답한 수·건너뛴 수, 이번에 담긴 이야기 목록(사건 이름·주제만 — 본문 노출 여부는 Q12), 연도를 채운 사건, `[문구 필요: 종료 요약 제목]` `[문구 필요: 다음 날 안내]` `[문구 필요: 지금까지 이야기 보기 버튼]`(→ `/story-review`).
- **오늘 완료 화면**(같은 날 다시 들어옴): `[문구 필요: 오늘은 끝났어요 안내]` + `/story-review`·`/chat-v3` 링크. 같은 날 추가 세션은 Q7.
- **재진입**:
  - 같은 날 미완료 → 오늘 기록으로 답한·건너뛴 문항을 빼고 남은 자리를 다시 계산해 이어간다. 이야기형 문항 도중 이탈이면 그 문항을 처음 질문부터 다시 보여준다(이전 턴은 클라 메모리라 사라짐 — `/chat-v3` P7-7 과 같은 정책, 저장은 문항 단위라 앞 문항 답은 안전). `[문구 필요: 이어하기 안내]`.
  - 다음 날 → 새 세션.
- 저장 단위 = 문항. 세션 전체를 끝까지 해야 저장되는 구조가 아니다.

---

## 5. 질문 풀 (요구 4)

- 파일: `lib/interview/question-pool.ts` — 순수 데이터(prisma import 금지, 클라·서버 공용). 코드와 분리해 성민이 문항만 고치면 되게 한다.
- 필드:

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | 영구 식별자. 한 번 쓰면 바꾸지 않는다(바꾸면 새 질문으로 취급돼 다시 묻는다). 문구만 고칠 땐 id 유지 |
| `text` | string | 화면에 보이는 질문 |
| `topic` | string | 저장될 이야기의 제목(`/story-review` "들려주신 이야기" 카드 제목) |
| `category` | `"taste" \| "daily"` | 취향 / 일상. 같은 분류 연속 금지에 쓴다 |
| `anchor` | `LifeEventType \| null` | 대상 시기. 이 유형의 사건이 확정일 때만 묻고, 답은 그 사건의 Episode 로 저장. **1차는 필수**(null 은 2차·Q6) |
| `followUp` | boolean | 후속 질문 허용 여부. false 면 첫 답으로 바로 저장 |
| `order` | number | 기본 출제 순서 |
| `enabled` | boolean | 끄면 출제 안 함(문구 다듬는 중 등) |
| `note` | string? | 작성 메모(화면에 안 나감) |

- 예시 5개(구조 예시 — 문항은 성민이 작성, 아래 `text`·`topic` 은 자리표시):

```ts
// lib/interview/question-pool.ts (예시 — 구현 시 생성)
import type { LifeEventType } from "@/lib/generated/prisma/enums";

export type InterviewPoolQuestion = {
  id: string;
  text: string;
  topic: string;
  category: "taste" | "daily";
  anchor: LifeEventType | null;
  followUp: boolean;
  order: number;
  enabled: boolean;
  note?: string;
};

export const QUESTION_POOL: InterviewPoolQuestion[] = [
  {
    id: "elem-play",
    text: "[문구 필요: 질문 — 국민학교 다닐 때 즐겨 하던 놀이]",
    topic: "[문구 필요: 제목 — 국민학교 시절 놀이]",
    category: "daily",
    anchor: "ELEM_SCHOOL",
    followUp: true,
    order: 10,
    enabled: true,
  },
  {
    id: "middle-lunchbox",
    text: "[문구 필요: 질문 — 중학교 때 도시락 반찬]",
    topic: "[문구 필요: 제목 — 중학교 도시락]",
    category: "daily",
    anchor: "MIDDLE_SCHOOL",
    followUp: false,
    order: 20,
    enabled: true,
  },
  {
    id: "high-song",
    text: "[문구 필요: 질문 — 고등학교 때 즐겨 듣던 노래]",
    topic: "[문구 필요: 제목 — 고등학교 시절 노래]",
    category: "taste",
    anchor: "HIGH_SCHOOL",
    followUp: true,
    order: 30,
    enabled: true,
  },
  {
    id: "firstjob-payday",
    text: "[문구 필요: 질문 — 첫 월급으로 한 일]",
    topic: "[문구 필요: 제목 — 첫 월급]",
    category: "daily",
    anchor: "FIRST_JOB",
    followUp: true,
    order: 40,
    enabled: true,
  },
  {
    id: "favorite-food",
    text: "[문구 필요: 질문 — 지금 제일 좋아하는 음식]",
    topic: "[문구 필요: 제목 — 좋아하는 음식]",
    category: "taste",
    anchor: null, // 대상 시기 없음 — 1차에서는 출제 안 됨(Q6 결정 후 2차)
    followUp: false,
    order: 50,
    enabled: false,
  },
];
```

---

## 6. 저장 (요구 5)

### 6.1 답 저장 — 기존 경로 재사용

| 출처 | 저장 경로 | 필요한 변경 |
|---|---|---|
| 갭 이야기(`episode`) | `continueEpisodeChat` → `finishEpisodeChat(eventId, transcript)` → Episode + 브릿지 UserMemory + 인물 추출 | 없음 |
| 갭 이야기(`time_gap`) | 위와 같고 `topicOverride={label:"<앵커> 이후", year}` → `isPeriod=true` | 없음 |
| 취향·일상(`anchor` 있음) | 위와 같고 대상 = 그 유형의 확정 사건. 제목은 풀의 `topic` | **선택 인자 1개**: 지금은 `topicOverride` 를 넘기면 무조건 `isPeriod=true`(`episode.ts:235`)라, 제목만 바꾸고 구간 이야기는 아니라고 명시할 인자가 필요하다(기본값 = 기존 추론, 기존 호출 무변). 넘기지 않으면 후속 질문 모델이 사건 이름("국민학교 입학")만 보고 엉뚱한 쪽으로 묻는다(history 에서 오프닝 질문이 빠지므로) |
| 이야기형 공통(후속 질문 수) | — | **선택 인자 1개**: `continueEpisodeChat` 에 `maxFollowUps`(기본 2 = 기존). 인터뷰는 Q3 값 |
| 연도 묻기 | 새 얇은 서버 액션(예: `saveLifeEventYear(eventId, answer)`): ① 정규식(4자리 연도·"85년") → ② 실패 시 Sonnet 파싱(출생연도로 "스물다섯 살 때" 같은 나이 표현 환산) → ③ **확정 사건이고 연도가 null 일 때만** `year` 기록, `status`·`correctedYear`·`unclearCount` 무변 | **신규 1개**(Q10) |
| 이어가기(2차) | 이야기형과 같고, 저장 성공 후에만 `ChatV3PendingContext` 정리 | 없음 |
| 취향·일상(`anchor` 없음, 2차) | Q6 결정 | 결정에 따름 |

- 연도에 기존 `submitConfirmAnswer` 를 쓰지 않는 이유: 확인 분류기라 "기억 안 나요"·"결혼은 했지" 류 답에 `SKIPPED`(=해당 없음)·`UNCLEAR`(→ `unclearCount`·`needsReview`) 를 쓸 수 있고, 연도 정정 시 뒤 사건 연도 전파 로직이 붙어 있다. 인터뷰 답이 골격 상태를 바꾸면 안 된다.
- 연도를 채우면 그 사건이 포스터 브릿지에 들어간다(연도 없는 사건은 브릿지에서 빠짐, `v3-bridge.ts:72`) — 연도 묻기는 포스터 막다른 길 해소에도 직접 기여한다.
- 저장 위치가 전부 기존 테이블이라 탈퇴(`deleteAccountTx`, Cascade)·가족 룸 제외(`episode`)·포스터 브릿지가 추가 작업 없이 그대로 적용된다.

### 6.2 진행 기록 — 중복 방지·재진입·도그푸딩용

답 자체가 아니라 "어떤 문항을 언제 냈고, 답했는지·건너뛰었는지"를 남길 곳이 필요하다. 기존 테이블 중 깔끔히 담을 곳은 없어서 두 안을 비교한다.

> **결정(Q1, 2026-10-25): T안 채택** — 채팅 로그 테이블과 섞지 않는다. 아래 M안은 검토 기록으로 남긴다.

**M안(검토안, 스키마 0)** — `OnboardingChatMessage` 를 그대로 쓰고 `sessionId` 에 규칙을 둔다.

- `interview:<YYYY-MM-DD>:_start` — 시작 화면 진입 시 봇 메시지 1행(화면에 보인 문구 그대로).
- `interview:<YYYY-MM-DD>:<itemKey>` — 그 문항의 질문(봇)·답(사용자)·후속 질문/답 전부.
- `interview:<YYYY-MM-DD>:_end` — 종료 요약 진입 시 봇 메시지 1행.
- 메시지 본문에는 숨은 표식을 넣지 않는다(본문 = 화면에 보인 그대로).
- 판정(전부 사용자별 조회 1~2회):
  - 답함 = 그 문항 세션에 사용자 메시지 ≥1.
  - 건너뜀 = 사용자 메시지 0 이고, 같은 날 그 뒤에 다른 문항이 시작됐거나 `_end` 가 있음.
  - 중간 이탈 = 사용자 메시지 0 이고, 그 날의 마지막 문항이며 `_end` 없음.
  - 연도 "모름" = 연도 문항에 답은 있는데 사건 연도가 여전히 null.
  - 세션 완료 = 그 날 `_end` 존재. "오늘은 그만"은 `_end` 를 쓰지 않는다.
- **같이 가야 하는 수정(필수)**: `listRecentChatMessages` 에서 `sessionId` 가 `interview:` 로 시작하는 행 제외(1줄). 안 하면 `/chat-v3` 가 인터뷰 턴을 자기 대화로 렌더하고, 재진입 판단(`endsWithPendingBotTurn`)·마무리 멘트 순환(`nextClosingIndexFromLog`)·대기 대화 앵커(`lastNonResumeAssistantText`)가 인터뷰 질문을 보고 오작동한다.
- 현재 `OnboardingChatMessage` 를 읽는 곳은 `chat-v3-log.ts`(저장·조회)와 `db/dogfood-report.ts` 뿐이다(+ 탈퇴 Cascade, 점검 스크립트). dogfood-report 도 같은 때 접두로 나눈다(§10).
- 인터뷰는 `ChatV3PendingContext` 를 **쓰지 않는다**(읽기·저장 후 정리만, 2차). 쓰면 `/chat-v3` 재진입이 자기 로그의 엉뚱한 마지막 질문을 앵커로 이어받는다.
- 약점: 판정이 추론이다. 답 메시지 저장이 이탈로 유실되면(P4-4 와 같은 경로) 그 문항이 "건너뜀"으로 보일 수 있다. 문항↔Episode 직접 연결이 없어 "이 문항으로 저장된 Episode"는 같은 날·같은 사건으로 근사한다.

**T안(대안, 테이블 1개 추가)** — 판정이 흔들리거나 집계가 더 필요해지면 옮긴다. M안 기록은 `sessionId` 를 읽어 백필 가능하다.

```prisma
// 오늘의 인터뷰 — 문항 1건 기록. 세션 = (userId, day).
model InterviewItem {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  day         String   // KST "YYYY-MM-DD"
  ordinal     Int      // 그날 몇 번째 문항(1부터)
  itemKey     String   // §2.2
  source      String   // GAP_EPISODE|GAP_PERIOD|GAP_YEAR|POOL|RESUME
  status      String   // PLANNED|ASKED|ANSWERED|SKIPPED
  answerChars Int      @default(0)
  turns       Int      @default(0)
  refId       String?  // 저장 결과(Episode.id·LifeEvent.id)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, day, ordinal])
  @@index([userId, itemKey])
}
// + User 모델에 interviewItems InterviewItem[]
```

SQL 초안 — `prisma migrate diff --from-schema prisma/schema.prisma --to-schema <위 모델을 더한 사본> --script`(스키마 파일끼리 비교, DB 미접속 — 운영 DB 와 비교할 때 나오는 기존 드리프트 3건은 섞이지 않는다):

```sql
-- CreateTable
CREATE TABLE "InterviewItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "itemKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "answerChars" INTEGER NOT NULL DEFAULT 0,
    "turns" INTEGER NOT NULL DEFAULT 0,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InterviewItem_userId_itemKey_idx" ON "InterviewItem"("userId", "itemKey");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewItem_userId_day_ordinal_key" ON "InterviewItem"("userId", "day", "ordinal");

-- AddForeignKey
ALTER TABLE "InterviewItem" ADD CONSTRAINT "InterviewItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

T안 장점: 세션 계획 고정(PLANNED 행), 상태가 명시적이라 추론 없음, 완료율 분모가 정확, 문항↔Episode 연결(`refId`). 단점: 마이그레이션 1건(순수 CREATE, 기존 테이블 무변), 대화 턴은 여전히 따로 남겨야 함(→ M안 로그와 병행하거나 턴은 안 남김).

---

## 7. 진입 (요구 6)

- 새 페이지 `/interview`(서버 `page.tsx` + 클라 `InterviewClient.tsx`).
- 버튼 위치:
  - **1차: `/story-review` 상단 카드**(헤더 바로 아래). V3 사용자가 `/enter` 로 매번 도착하는 화면이라 매일 진입 동선이 자연스럽다. 카드 상태 3종: 시작 전 `[문구 필요: 진입 카드 — 시작 전]` / 진행 중 `n / N` `[문구 필요: 진입 카드 — 진행 중]` / 오늘 완료 `[문구 필요: 진입 카드 — 오늘 완료]`. 추가 비용은 오늘 인터뷰 기록 조회 1회(`userId, createdAt` 인덱스) — 무거운 계획 계산은 `/interview` 진입 때만.
  - 2차: 사이드 패널 "📖 내 이야기" V3 분기에 항목 추가(`app/timemachine/SidePanel.tsx`).
  - `/chat-v3` 안에는 두지 않는다(대화 흐름·재진입 로직과 섞지 않음).
- `proxy.ts`: **무수정.** `PUBLIC_PATHS`(`proxy.ts:17`)에 없는 경로는 전부 비로그인 → `/login`(`:44`), 동의 미완료 → `/consent`(`:53`) 게이트를 탄다. `/interview` 는 점(.)이 없어 matcher 에도 걸린다. PG 심사 기간 proxy 무수정 방침과도 맞다.
- 페이지 서버 가드(`/chat-v3`·`/enter` 와 같은 패턴): `auth()` 없으면 `/login` → V3 아니면 `/enter` → 동의 버전 < `CURRENT_CONSENT_VERSION` 이면 `/consent`(답이 Anthropic 으로 국외이전되므로 `/enter`·companion 과 같은 재동의 검사) → 골격 미완료·UNCONFIRMED 있으면 `/chat-v3`.
- `docs/navigation-map.md` 를 같은 커밋에서 갱신(작업 규칙 7): `/story-review` 카드 `→ /interview`, 종료 요약 `→ /story-review`, 오늘 완료 화면 `→ /story-review`·`→ /chat-v3`, 리다이렉트 표에 `/interview` 3줄.

---

## 8. 접근성 (요구 7)

- 본문 18px 이상(`text-lg` 이상), 질문은 24px 이상(`text-2xl`~`text-3xl`). `ink-faint` 텍스트 금지(디자인 시스템 대비 기준).
- 터치 56px: 모든 버튼 `Button size="lg"`(56px). `md`(48px) 금지. `VoiceTextarea` 버튼은 60px 라 그대로.
- 한 화면 한 질문: 이전 문항·대화 로그를 안 보여준다. 후속 질문은 같은 카드에서 질문만 교체. 진행은 숫자 `n / N` 로(점만으로 표시하지 않음).
- 동선: 다음 행동 버튼은 화면당 primary 1개(`답 보내기`), 나머지는 secondary/tertiary.
- 시간 압박 없음: 타이머·연속일·"끊겼어요" 표현 금지. 짧은 답·건너뛰기를 실패처럼 보이게 하지 않는다.
- 음성: `VoiceTextarea`(브라우저 STT). 캐릭터를 붙이면 `characterMotionEnabled` 를 따른다.
- 390px 모바일 점검(2026-06-13 기준과 같은 방식).

---

## 9. 비용 (요구 8)

### 9.1 문항 유형별 AI 호출

모델은 전부 Sonnet(`LIFE_EVENT_CONFIRM_MODEL` 기본 `claude-sonnet-4-6`) — 기존 v3 추출·분류·에피소드 정책 그대로(전역 `aiModel` 과 무관). 단가는 프로젝트 가정값 `lib/lab/usage.ts`(Sonnet 입력 $3 / 출력 $15 per 1M 토큰)를 썼고, 토큰 수는 프롬프트 글자 수(에피소드 대화·요약 시스템 프롬프트 각 약 1,300자)로 잡은 추정이다 — 실제 단가·사용량은 확인 필요.

| 호출 | 입력(추정) | 출력(추정) | 1회 |
|---|---|---|---|
| `continueEpisodeChat`(후속 질문 1회) | ~1,600 | ~120 | ~$0.007 |
| `finishEpisodeChat` 요약(안내문이면 +1회) | ~1,400 | ~250 | ~$0.008 |
| `savePeopleMentionedInEpisode` | ~800 | ~100 | ~$0.004 |
| 연도 파싱(정규식 실패 시만) | ~400 | ~40 | ~$0.002 |

| 문항 유형 | 호출 수 | 문항당 |
|---|---|---|
| 연도 | 0~1 | $0~0.002 |
| 이야기형, 후속 0(`followUp:false`) | 2 | ~$0.012 |
| 이야기형, 후속 1(추천 Q3) | 3 | ~$0.019 |
| 이야기형, 후속 2(`/chat-v3` 현행) | 4 | ~$0.026 |

### 9.2 세션당

- 기본 6문항(연도 1 + 갭 이야기 2 + 취향 2 + 이어가기 1, 후속 1): 호출 15~16회, **약 $0.10(≈135원, 1달러=1,400원 가정)**.
- 최악(7문항 전부 이야기형, 후속 2 + 요약 재시도): 약 35회, 약 $0.24.
- 도그푸딩 30일 × 1세션 ≈ $2.9(기본) ~ $7.1(최악).
- 사용자 토큰 차감: `/chat-v3` 처럼 차감 없음을 기본으로 둔다(Q8).

### 9.3 측정의 한계

`lib/ai.ts` `chat()` 은 사용량을 DB 에 남기지 않는다(개발 모드 콘솔 로그뿐). 그래서 `db/dogfood-report.ts` 는 `/chat-v3`·인터뷰 AI 사용량을 "기록 없음"으로만 보여준다. 실측하려면 Anthropic Console 사용량을 보거나 기록을 추가해야 한다(Q9 — 이 설계에서는 추가하지 않음).

---

## 10. 도그푸딩 로그 (요구 9)

집계 스크립트 = `db/dogfood-report.ts`(2026-10-24 추가, 읽기 전용). 인터뷰 구현 1차에서 아래 지점을 기록하고 스크립트에 인터뷰 섹션을 붙인다.

| 지표 | 기록 지점(M안) | 집계 |
|---|---|---|
| 세션 수 | `_start` 봇 메시지 | `_start` 가 있는 날 수 |
| 완료율 | `_end` 봇 메시지 | `_end` 있는 날 / `_start` 있는 날 |
| 제시 문항 수(출처별) | 문항 세션의 첫 봇 메시지 | itemKey 접두(`gap:episode`·`gap:period`·`gap:year`·`pool`·`resume`)별 개수 |
| 답함·건너뜀·중간 이탈 | §6.2 판정 규칙 | 출처별 비율 |
| 문항별 답 길이 | 문항 세션의 사용자 메시지 | `SUM(LENGTH(content))`(본문은 불러오지 않음) — 평균·중앙값, 출처별 |
| 문항별 턴 수 | 같은 세션의 사용자 메시지 수 | 평균 |
| 저장 결과 | 기존 Episode·LifeEvent | 스크립트가 이미 날짜별로 셈(새 Episode·구간·연도 없는 확정 사건) |

- 같은 커밋에서 기존 "/chat-v3 세션·발화·글자" 집계가 `interview:` 접두를 빼도록 고친다(안 그러면 인터뷰 턴이 `/chat-v3` 수치에 섞인다).
- 출력 원칙은 지금 스크립트 그대로: 숫자만, 본문·이름 출력 금지, DB 쓰기 0, 실고객 계정 거부.

---

## 11. 구현 단계 분할

### 1차 — 최소 동작(도그푸딩 시작 가능)

범위: 출처 = 갭 이야기(`episode`·`time_gap`) + 연도 + 풀(`anchor` 있는 것만). 고정 순서(§2.3, 이어가기 자리는 비움). 같은 날 중복 금지 + 답한 것 자연 제외 + 건너뜀·"모름" 일괄 7일 제외. 같은 날 재진입 이어하기. `/story-review` 카드 진입.

```
1. lib/interview/question-pool.ts(예시 5개) + itemKey·날짜 순수 유틸
   → verify: 순수 함수 스크립트(키 생성·파싱 왕복)
2. lib/interview/plan.ts — 오늘 계획 계산(detectGaps·연도 후보·풀·오늘 기록, 읽기 전용)
   → verify: db/test-interview-plan.ts(전용 픽스처 계정, 생성·삭제) — 출처 혼합·한도·제외 규칙
3. 서버 액션: saveLifeEventYear(신규) / continueEpisodeChat maxFollowUps 선택 인자 /
   finishEpisodeChat isPeriod 명시 선택 인자 / buildEpisodeOpeningPrompt 등 lib 이동
   → verify: 연도 기록이 status·unclearCount 무변임을 픽스처로 확인 + 회귀 14종(v3 건드림)
4. chat-v3-log: listRecentChatMessages 에서 interview: 제외 + 인터뷰 기록 저장
   → verify: 인터뷰 기록이 있는 픽스처에서 /chat-v3 재진입 판단 무변 + 회귀 14종
5. /interview 페이지 + InterviewClient(시작·문항·요약·완료·재진입)
   → verify: test30 수동 1세션(390px 포함), 중간 이탈 후 재진입
6. /story-review 진입 카드 + docs/navigation-map.md 같은 커밋
   → verify: 카드 3상태 확인
7. db/dogfood-report.ts 인터뷰 섹션 + /chat-v3 수치 분리
   → verify: test30 실행 출력
```

### 2차 — 출처 혼합·중복 방지 고도화

- 이어가기 출처(`ChatV3PendingContext` 읽기·저장 후 정리).
- 건너뜀 단계별 재노출(7/30/영구)·"모름" 규칙(14일 → 영구).
- 시기 분산 고도화(같은 생애 단계 연속 회피, 오래 안 다룬 시기 우선).
- 인물 출처(`person_episode`·`person`, Q11).
- `anchor` 없는 취향 질문(Q6 결정 후).
- 사이드 패널 진입.
- 도그푸딩 2~3주 데이터로 M안 판정 정확도 점검 → 필요하면 T안 이행.

---

## 12. 결정 (2026-10-25 — Q1·Q3·Q9 성민 결정, 나머지는 설계 추천안 채택(성민 위임))

| # | 질문 | 선택지 | 추천 | 결정 |
|---|---|---|---|---|
| Q1 | 진행 기록 저장 방식 | M안(스키마 0, `sessionId` 규칙) / T안(테이블 1개) | M안으로 시작, 2~3주 뒤 점검 | **T안**(성민) |
| Q2 | 하루 기본 문항 수 | 5 / 6 / 7 | 6 | 6(추천안) |
| Q3 | 이야기형 후속 질문 수 | 0 / 1 / 2(`/chat-v3` 현행) | 1 — "짧게"가 목적, 비용도 2 대비 약 25% 적음 | **최대 2개**(성민 — `/chat-v3` 현행과 같음) |
| Q4 | 건너뛴 질문 재노출 | 7일→30일→영구 제외 / 다른 간격 / 영구 제외 | 7·30·영구 | 7·30·영구(추천안) |
| Q5 | 연도 "모름" 처리 | 14일 뒤 1회 더 → 영구 제외 / 다시 안 물음 | 14일 1회 | 14일 1회 → 영구(추천안) |
| Q6 | 대상 시기 없는 취향 질문의 저장 위치 | (a) UserMemory 새 `createdVia="interview"`(스키마 0, 단 지금 화면 어디에도 안 보여 표시 자리 필요) / (b) 자유 대화 승격처럼 CUSTOM 사건 + Episode(`/story-review` 에 보이지만 연도 없는 사건이 늘어 연도 묻기 대상이 됨) / (c) 1차처럼 대상 시기 필수 유지 | (c) 유지, 도그푸딩 보고 결정 | (c) 대상 시기 필수(추천안) |
| Q7 | 하루 세션을 끝낸 뒤 같은 날 "조금 더" 허용 | 허용 / 불가(내일) | 불가 — 자유 대화는 `/chat-v3` | 불가(추천안) |
| Q8 | 사용자 토큰 차감 | 없음(`/chat-v3` 와 동일) / 차감 | 없음 | 없음(추천안) |
| Q9 | AI 사용량 기록 추가 | 추가(새 기록 — 비용 실측 가능) / 안 함(Console 로 확인) | 도그푸딩 중엔 Console, 출시 전 재논의 | **추가**(성민 — 문항별 AI 호출 수·모델·입출력 토큰을 InterviewItem 에) |
| Q10 | 연도 기록 컬럼 | `year` 직접(원래 null 이라 보존할 원본 없음, status 무변) / `correctedYear` + status `CORRECTED`(확인질문 정정과 같은 모양) | `year` 직접 | `year` 직접(추천안) |
| Q11 | 인물 갭(`person_episode`·`person`) 포함 시점 | 1차 / 2차 / 제외 | 2차 | 2차(추천안) |
| Q12 | 종료 요약에 담긴 이야기 본문 노출 | 제목만 / 요약 본문까지 | 제목만(본문은 `/story-review`) | 제목만(추천안) |
| Q13 | `/story-review` 카드 위치 | 상단(헤더 아래) / 하단 "계속 이야기하기" 옆 | 상단 | 상단(추천안) |
| Q14 | 다음 날 안내 수단 | 화면 문구만 / 알림(푸시 없음 — 별도 작업) | 화면 문구만 | 화면 문구만(추천안) |

---

## 13. 화면 문구 자리 (카피 = 성민)

| 위치 | 자리표시 |
|---|---|
| `/story-review` 진입 카드 | `[문구 필요: 진입 카드 — 시작 전]` · `[문구 필요: 진입 카드 — 진행 중]` · `[문구 필요: 진입 카드 — 오늘 완료]` · `[문구 필요: 진입 카드 버튼]` |
| 시작 화면 | `[문구 필요: 시작 화면 제목]` · `[문구 필요: 시작 화면 설명 — 문항 수·짧게 답해도 됨]` · `[문구 필요: 시작 버튼]` |
| 문항 화면 | `[문구 필요: 답 보내기]` · `[문구 필요: 건너뛰기]` · `[문구 필요: 오늘은 그만]` · `[문구 필요: 이 이야기는 여기까지]` · `[문구 필요: 생각 중 안내]` · `[문구 필요: 저장 중 안내]` · `[문구 필요: 저장 실패 안내·다시 시도]` |
| 연도 문항 | `[문구 필요: 연도 질문 템플릿 — 사건 이름 들어감]` · `[문구 필요: 연도 반영 확인]` · `[문구 필요: 연도 재질문]` · `[문구 필요: 연도 모름 처리 멘트]` |
| 풀 문항 | 풀 파일의 `text`·`topic`(§5) |
| 이어가기(2차) | `[문구 필요: 이어가기 질문 — 지난번 사건 이름 들어감]` |
| 중단 화면 | `[문구 필요: 오늘은 그만 — 중단 안내]` · `[문구 필요: 이어하기 안내]` |
| 종료 요약 | `[문구 필요: 종료 요약 제목]` · `[문구 필요: 답한 수·건너뛴 수 표기]` · `[문구 필요: 다음 날 안내]` · `[문구 필요: 지금까지 이야기 보기 버튼]` |
| 오늘 완료 화면 | `[문구 필요: 오늘은 끝났어요 안내]` |
| 빈 계획 | `[문구 필요: 오늘 여쭤볼 게 없음 안내]` |

갭 이야기·구간 질문은 기존 결정적 템플릿(`buildEpisodeOpeningPrompt`·`timeGapPrompt`)을 그대로 쓰면 새 문구가 필요 없다 — 인터뷰용으로 바꿀지는 성민 판단.

---

## 14. 알려진 한계·위험

- ~~M안 판정은 추론이다~~ → T안 채택으로 해당 없음(상태가 InterviewItem.status 에 명시적으로 남음).
- 이야기형 문항 도중 브라우저를 닫으면 그 문항의 이전 턴은 사라지고 질문부터 다시 한다(`/chat-v3` P7-7 과 같은 정책). "오늘은 그만" 버튼·"그만할래요" 발화는 답한 만큼 저장한 뒤 멈춘다.
- ~~비용은 프롬프트 길이 기반 추정이다~~ → 인터뷰는 문항별 실사용 토큰이 기록된다(§15). 단가는 `lib/lab/usage.ts` 가정값이라 비용은 여전히 추정. `/chat-v3` 는 계속 기록 없음.
- `aiModel` 은 문항의 마지막 호출 모델 1개만 남는다. 지금 v3 호출은 모델 하나(`LIFE_EVENT_CONFIRM_MODEL`)라 문제없지만, 문항 안에서 모델을 섞게 되면 보조 테이블(호출별 1행)로 바꿔야 한다.
- 풀 질문 답은 대상 시기 사건의 일반(구간 아님) Episode 라, 포스터 브릿지가 그 사건 본문에 이어 붙인다(같은 사건의 여러 이야기를 합치는 기존 동작).
- `detectGaps` 는 무겁다(P20 기록). 세션 시작·재진입 때 1회만 부른다.
- 대상 시기 사건이 SKIPPED(해당 없음)인 풀 질문은 영영 안 나온다 — 의도된 동작(없었던 시절을 묻지 않음).
- 인터뷰 답은 `/chat-v3` 와 같은 동의 범위(국외이전 Anthropic)로 처리된다. Episode 는 가족 룸 제외(`lib/rooms.ts`) — 솔로 비공개 기본 유지.

## 15. 1차 구현 (2026-10-25)

### 파일

| 파일 | 역할 |
|---|---|
| `prisma/migrations/20261025000000_interview_item` | `InterviewItem` 1개(순수 CREATE). 운영 DB 적용 완료 |
| ~~`lib/interview/gate.ts` · `access.ts`~~ | ~~허용 목록 게이트~~ — 2026-10-25 같은 날 제거(아래 "게이트 제거"). 접근 = 로그인한 V3 사용자 전원 |
| `lib/interview/copy.ts` | 화면 문구 전부(항목마다 `// [임시 — 성민 확정 필요]`) |
| `lib/interview/question-pool.ts` | 풀 예시 5개(임시). `favorite-food` 는 대상 시기 없음이라 꺼 둠(Q6) |
| `lib/interview/keys.ts` · `plan.ts` · `year.ts` · `session.ts` | 문항 키·KST 날짜 / 계획(순수 `pickPlan`·`isEligible`·`poolCandidates`) / 연도 해석(정규식 → Sonnet) / 세션 진행 본체 |
| `app/interview/` | `page.tsx`(로그인 → V3 → 재동의 → 골격 완료) · `actions.ts`(5개, 첫 줄 `requireUserId()` — 비로그인 throw) · `InterviewClient.tsx` |
| `app/story-review/page.tsx` | 상단 진입 카드(항상 표시, 오늘 기록 1회 조회) |
| `lib/episode-chat.ts` | `continueEpisodeChat`·`finishEpisodeChat` 본체를 auth 없는 순수 모듈로 옮김(본문 무변). 액션은 auth + revalidate 래퍼. 추가: `isPeriodOverride` 선택 인자(풀 질문 = 제목만 바꾸고 구간 아님), 결과에 `episodeId` |
| `lib/episode-opening.ts` · `lib/episode-text.ts` | `buildEpisodeOpeningPrompt`·`schoolPhaseName`·`isAskingQuestion` 을 `ChatV3Client` 에서 옮겨 공유(본문 무변) |
| `lib/ai.ts` | `trackAiUsage(usage, fn)` — `AsyncLocalStorage` 로 그 안의 `chat()` 호출 수·토큰·모델을 합산. 바깥에선 동작 없음(기존 호출부 무변) |
| `db/test-interview.ts` | 회귀(픽스처 계정, 실제 Sonnet) — 회귀 세트 15번째 |
| `db/dogfood-report.ts` | "오늘의 인터뷰" 섹션(날짜별 표 + 세션·완료율·출처별 답 길이·AI 사용량·추정 비용) |

### 설계와 달라진 점

- **진행 기록 = T안**(Q1). 테이블 컬럼: `day`·`ordinal`·`itemKey`·`source`·`status`(PLANNED/ANSWERED/SKIPPED/DROPPED)·`askedAt`·`doneAt`·`turns`·`answerChars`·`refId` + AI 사용량(`aiCalls`·`aiInputTokens`·`aiOutputTokens`·`aiModel`, Q9 결정). 계획은 세션 시작 때 PLANNED 로 고정 → 재진입해도 같은 순서. `DROPPED` 는 "그사이 다른 경로(`/chat-v3` 등)로 채워져 안 물음" — 건너뜀 재노출 규칙에 안 섞인다.
- ⚠️ `InterviewItem.status = "SKIPPED"` 는 "사용자가 이 질문을 건너뜀"이다. `LifeEvent.status = SKIPPED`(해당 없음)와 이름만 같고 무관하다 — 인터뷰 코드의 LifeEvent 쓰기는 연도 1곳(`data: { year }`)뿐이고 회귀가 정적 검사로 강제한다.
- 재노출 규칙(Q4·Q5)은 1차에서 바로 전부 구현했다(설계 §3 은 1차 단순화를 제안했지만, T안이면 기록에서 바로 계산돼 비용이 같음). 단 이어가기·인물 갭·시기 분산 고도화는 2차 그대로.
- 진입 카드의 "시작 전" 상태엔 문항 수를 안 보여준다(카드에서 계획을 계산하면 `/story-review` 가 무거워짐 — 문항 수는 `/interview` 시작 화면에서).
- 연도 문항에 "기억이 안 나요" 버튼을 붙였다(입력 없이 모름 처리 — 어르신 동선 단축).
- "오늘은 그만"·"그만할래요"는 그 문항에 답한 내용이 있으면 저장한 뒤 멈춘다(`/chat-v3` P12-1 과 같은 원칙 — 답을 버리지 않음).

### 게이트 제거 (2026-10-25, 성민 결정)

처음엔 `INTERVIEW_ALLOWED_USER_IDS` 허용 목록(lab 패턴 — 화면 404 + 액션 throw)으로 막았다가, 같은 날 성민 결정으로 제거했다. 근거: 실사용자가 아직 없고, 전원 대상 기능이다.
- 삭제: `lib/interview/gate.ts`·`access.ts`·`app/interview/layout.tsx`(게이트 호출만 하던 파일), `.env.example` 의 `INTERVIEW_ALLOWED_USER_IDS`.
- 남은 접근 조건: 로그인(proxy 기존 게이트) · V2 → `/enter` · 재동의 → `/consent` · 골격 미완성·확인대기 → `/chat-v3`(`page.tsx` 기존 분기). 서버 액션은 첫 줄 `requireUserId()`(auth, 비로그인 throw). 문항은 itemId + userId 로만 찾아 남의 문항은 못 건드린다.
- `/story-review` 진입 카드는 조건 없이 항상 표시(V3 전용 화면).
- `proxy.ts` 무접촉.

### 검증 (2026-10-25)

- `db/test-interview.ts` 70항목 통과(게이트 제거 후 63항목 — 게이트 판정·배선 11항목 삭제, 액션 첫 줄 5항목은 `requireUserId()` 로 교체, 정적 검사 4항목 추가: 비로그인 throw·page 분기·카드 항상 표시·게이트 잔재 0) — 접근 배선(정적 검사)·세션 생성(계획 순서·하루 1세션)·이어하기·연도(실제 Sonnet, year 만 채움)·이야기(실제 Sonnet, Episode 구간 아님·풀 제목)·DROPPED·종료 요약·진입 카드·다음 날/8일 뒤 중복 미출제·재노출 규칙·SKIPPED 값 미사용·AI 사용량 기록·픽스처 정리.
- 회귀 세트 15종 전부 exit 0, `tsc`·`eslint`·`next build` 통과.
- 화면은 브라우저로 직접 확인하지 않았다(로그인 필요) — test30 E2E 는 성민 확인 대기(게이트 제거로 env 설정 없이 바로 가능).

## 16. "관계별 나" 출처 (2026-10-31, 노드 그래프 2a)

설계: `docs/phase/node-graph-self.md` §3.2·§6 "2a 구현 결과". 요약:

- 출처 `SELF` — `lib/interview/question-pool.ts` `SELF_QUESTION_POOL`(예시 3개 임시). 문항 = 대상 시기(`anchor`, 그 유형의 첫 확정 사건 — 풀과 같은 기준) + 관계 대상(`relation`: 일반 범주 `{ kind: "category", label }` 또는 그 사건에 연결된 실제 인물·그룹마다 1문항 `{ kind: "linked" }`). 자리표시 `{who}`·`{who:과/와}` + 기존 `{elemSchool}`.
- 문항 키 `self:<questionId>:<eventId>` · `…:person:<personId>` · `…:group:<groupId>`.
- 계획: 6문항 중 최대 1개, 기본 순서의 5번째 자리(연도·갭·풀·갭·**관계별 나**·풀). 후보가 없으면 그 자리를 건너뛰어 기존 계획과 같다.
- 재노출: 답함 = 영구 제외(풀과 같음), 건너뜀 7·30·영구.
- 저장: 같은 이야기 경로(`finishEpisodeChatCore`)에 `kind=SELF` — 대상 시기 사건에 매달고, 관계 대상이 실제 인물·그룹이면 `saveNodeLink`(이야기 → 인물·그룹, 확정). 이야기 갭·"이야기 있음" 배지는 채우지 않는다.
- 문항을 낼 때 대상 사건이 확정이 아니거나 관계 대상 연결이 사라졌으면 DROPPED.
- 회귀: `db/test-interview.ts` ⑩(70 → 91항목).

## 결정 로그

| 날짜 | 결정 | 제안 | 승인 |
|---|---|---|---|
| 2026-10-24 | 설계 초안 작성(코드 0). Q1~Q14 는 미결 | Claude Code | — |
| 2026-10-25 | Q1 진행 기록 = 새 테이블 1개(채팅 로그 혼용 안 함) / Q3 후속 질문 문항당 최대 2개 / Q9 문항별 AI 호출 수·모델·입출력 토큰을 같은 테이블에 기록 | 성민(리뷰 채팅) | 성민 |
| 2026-10-25 | Q2·Q4~Q8·Q10~Q14 = 설계 추천안 채택(성민 위임) — §12 결정 열 | Claude Code | 성민(위임) |
| 2026-10-25 | 마이그 `20261025000000_interview_item` SQL 승인 → 운영 DB deploy(적용 1건) | Claude Code | 성민 |
| 2026-10-25 | 접근 게이트 = `INTERVIEW_ALLOWED_USER_IDS`(lab 패턴, proxy 무접촉) / 화면 문구 = `lib/interview/copy.ts` 임시 | 성민 | 성민 |
| 2026-10-25 | 접근 게이트 제거 — 로그인한 V3 사용자 전원 공개(근거: 실사용자 없음, 전원 대상 기능). gate·access·layout 삭제, 액션은 auth 확인으로 대체, 진입 카드 항상 표시. (중간에 요청됐던 `"*"` 전체 공개 옵션은 이 결정으로 대체돼 커밋하지 않음) | 성민 | 성민 |
| 2026-10-31 | "관계별 나" 출처 추가(노드 그래프 2a) — 질문 풀에 관계별 문항 형식(대상 시기 + 관계 대상, 예시 3개 임시), 6문항 중 최대 1개(노드 그래프 Q10), 답 = Episode(kind=SELF) + 실제 인물·그룹이면 연결(§16) | 성민 | 성민 |
