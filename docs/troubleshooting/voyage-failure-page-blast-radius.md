# 트러블슈팅 — 외부 부가 기능(Voyage) 실패가 핵심 페이지 전체를 500으로 무너뜨림

## 문제 상황

Phase 6에서 음악 트리거를 위해 Voyage AI embedding API를 도입했다. 사용자 프로필을 임베딩 → pgvector cosine similarity로 음악 추천. `/timeline` 페이지의 서버 컴포넌트가 `getMusicTriggersForUser`를 호출하는 구조.

검토 5/6에서 다음을 확인:

```ts
// app/timeline/page.tsx (변경 전)
let triggers: TriggerCandidate[] = [];
if (birthYear && session?.user?.id) {
  // ...
  triggers = await getMusicTriggersForUser(...);  // ← throw 시 page까지 propagate
}
```

`getMusicTriggersForUser` 내부에서 `embedOne` → `fetch(VOYAGE_ENDPOINT)`가 실패(네트워크 drop, key 만료, rate limit, Voyage 측 outage)하면 throw가 page까지 올라가 **`/timeline` 전체 500**. 음악 추천은 부가 기능인데 이 실패로 사용자가 **앵커 이벤트 + 자신의 추억 + 가족 룸 링크까지 모두 못 보게 됨**. 외부 부가 기능의 실패가 핵심 페이지를 마비.

검증을 위해 `VOYAGE_API_KEY=""`로 임시 변경하고 `/timeline` 접근 → 500 페이지 + 영어 stack trace. 사용자 입장에서 "어, 서비스 죽었네"로 보임.

## 시도한 것들

1. **page에서 try/catch** — 가능하지만 `/timeline` page 자체에 try/catch를 두면 catch한 결과를 UI에 어떻게 surface할지 매번 if 분기. 같은 패턴이 향후 다른 외부 API에도 반복 — anti-pattern.

2. **getMusicTriggersForUser 안에서 throw → page에서 catch** — 호출자 책임 분산. 호출하는 모든 page가 보일러플레이트 필요.

3. **Result type 패턴** (`{ ok: true, data } | { ok: false, error }`) — Rust/Go 스타일. TypeScript에선 자연스럽지만 호출자 전부 union narrowing 필요. 단일 호출처라 과한 형식.

4. **빈 배열 반환** — 간단하지만 호출자가 "실패해서 빈 배열인가, 추천할 게 없어 빈 배열인가" 구분 불가. UI에서 안내 배너 표시 못 함.

## 최종 해결법

**helper 자체에 try/catch + 결과에 `failed: boolean` 플래그 동봉**. throw가 helper 밖으로 새지 않도록 격리하되 호출자가 실패 여부는 알 수 있게:

```ts
// lib/triggers.ts
export type TriggersResult = {
  triggers: TriggerCandidate[];
  failed: boolean;
};

export async function getMusicTriggersForUser(...): Promise<TriggersResult> {
  try {
    // ... embedOne, $queryRawUnsafe ...
    return { triggers, failed: false };
  } catch (err) {
    console.error("[triggers] retrieval failed:", err);
    return { triggers: [], failed: true };
  }
}
```

호출자(timeline page):

```ts
const result = await getMusicTriggersForUser(...);
const triggers = result.triggers;
const triggersFailed = result.failed;

// 페이지 헤더에:
{triggersFailed && (
  <div className="mt-5 rounded-md border-2 border-amber-200 bg-amber-50 p-4">
    <p>음악 추천을 지금은 가져올 수 없어요. 잠시 후 새로고침 해주세요.
       나머지 기능은 평소처럼 사용하실 수 있어요.</p>
  </div>
)}
```

핵심 효과:
- 앵커 / 내 사건 / 공동 추억 등 다른 데이터는 같은 페이지에서 정상 fetch + 렌더
- 음악 추천 영역만 비고, 작은 amber 배너로 부드럽게 안내
- 시니어 친화 — "당신 잘못 아니에요" 톤
- raw error는 server log(`[triggers] retrieval failed:`)에만, UI 미노출

검증 (`db/test-trigger-failure.ts`):

```ts
process.env.VOYAGE_API_KEY = "";  // throw 강제
const result = await getMusicTriggersForUser(...);
// result = { triggers: [], failed: true }
// throw 없이 정상 반환
```

## 핵심 학습

**Blast radius를 의식한 외부 API 호출 패턴**:

1. 외부 호출은 helper 한 곳에 격리
2. helper 내부에서 try/catch
3. 반환 타입에 실패 신호 포함 (boolean flag 또는 result union)
4. raw error는 server log만, 사용자 UI는 generic 메시지

같은 패턴을 다른 외부 API에도 적용 가능: Toss `confirmTossPayment` (이미 catch + FailureScreen으로 처리), Claude `chat` (memory-chat.ts의 try/catch + fallback questions/title), MusicBrainz (이번엔 dev script만이라 미적용).

또 일반화하면: **"이 기능이 실패해도 다른 기능이 살아남는가?"를 호출 지점마다 의식하기**. 페이지 server component에서 await하는 모든 외부 호출에 적용.

## 이력서 소재 한 줄

코드 검토 중 "외부 부가 기능 실패가 핵심 페이지 전체 500을 일으키는" blast radius 문제 발견 → helper 내부 try/catch + `{ data, failed }` 결과 타입 + 시니어 친화 안내 배너로 격리. Voyage 키를 강제로 비워 시뮬한 검증 스크립트로 throw가 호출자에 새지 않음 확인.
