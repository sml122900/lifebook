# Phase 6 — 트리거 이벤트 + RAG (음악)

> **목표**: 사용자 관심사·세대에 맞는 **음악 트리거 이벤트**를 임베딩 RAG로 찾아, 타임라인에 "이 노래 기억나세요?" 형태로 띄운다. 제품의 심장.
> **선행 조건**: Phase 5 완료(개인화 타임라인), Phase 1의 Event 모델.
> **분량**: 가장 큼. 데이터 → 임베딩 → 검색 → 표시 → 확정의 파이프라인 전체.
> **작업 방식**: 6.1부터 하나씩. 막히면 우회 말고 질문.

**확정 전략**
- 분야: **음악** (이후 영화 → 게임 순 확장)
- 데이터: **하이브리드** = MusicBrainz 메타데이터 실연동 + 연대별 큐레이션 시드
- 매칭: **임베딩 RAG (Voyage AI)** + 세대 필터
- 제시: 질문형, 사용자가 최종 확정 (정확성 부담 ↓, 확정 행위 자체가 회고 경험)

**사용자가 미리 할 일**: Voyage AI API 키 발급 → `.env`의 `VOYAGE_API_KEY`에 입력. (비용은 MVP 규모에선 미미하나 과금 모델 인지)

**핵심 원리 — 회상 절정(reminiscence bump)**: 사람은 대략 **10대 후반~20대 초반**에 들은 음악을 평생 가장 강하게 기억한다. 세대 필터의 가중치를 이 구간(birthYear+13 ~ +25 부근)에 둔다.

---

## 6.1 — 임베딩 제공자(Voyage) 셋업

**작업**
- `.env`에 `VOYAGE_API_KEY` 추가(.env.example엔 빈 값).
- `lib/embeddings.ts`: Voyage 임베딩 REST 호출 래퍼(`https://api.voyageai.com/v1/embeddings`). 다국어 모델 선택(예: voyage-3 계열).
- ⚠️ **모델 출력 차원(dimension)을 Voyage 문서에서 확인**해 상수로 둔다. (6.2 컬럼 차원과 반드시 일치)

**완료 기준**: 테스트 문자열을 임베딩하면 기대 차원의 벡터가 반환된다.

---

## 6.2 — pgvector 컬럼 확정 + 인덱스

**작업**
- `Event.embedding`을 **Voyage 모델 차원에 맞춰** 설정. (Phase 1.3에서 `vector(1536)`로 만들었다면 실제 차원으로 ALTER)
- 코사인 유사도 검색 준비(소량일 땐 정확검색 OK, 데이터 늘면 ivfflat/hnsw 인덱스 추가).

**완료 기준**: `Event.embedding` 차원이 임베딩 모델과 일치하고, 유사도 쿼리가 가능하다.

---

## 6.3 — 음악 큐레이션 시드 (트리거 콘텐츠의 척추)

**목적**: "그 시절 그 노래"의 실제 알맹이. 차트 API가 없는 공백을 메우는 핵심.

**작업**
- `docs/음악시드_초안.md`(별도 전달)을 `db/seed/musicEvents.ts`로 옮긴다.
- 각 항목: `year, title(곡), artist, description, domain="music", category="trigger", tier="suggested", region`.
- 연대별 대표곡 위주(세대별 회상 절정을 노림). 시니어 세대(7080, 발라드, 트로트)부터 최근까지 폭넓게.

**완료 기준**: 시드 파일에 연대별 음악 트리거 항목이 구조화되어 있다.

---

## 6.4 — MusicBrainz 메타데이터 실연동

**목적**: 시드를 공식 메타데이터로 보강/확장 (하이브리드의 "실연동" 축).

**작업**
- `lib/musicbrainz.ts`: MusicBrainz API로 곡/아티스트 검색 → MBID·메타데이터 보강.
- ⚠️ **에티켓 준수**: 식별 가능한 `User-Agent` 헤더 필수, **요청 1초당 1회** 레이트리밋.
- **연도 정책 (시드가 정본)**: 시드 연도를 기본 유지. MusicBrainz의 `first-release-date`는 시드보다 빠를 때만 채택 (재발매/리메이크/컴필레이션이 잡히는 케이스 대비). 매칭 실패는 시드 그대로.
- **MBID 정책 (보강용)**: 매칭되면 MBID·링크를 항상 저장. 한글 곡 한글 검색 실패는 수용 (MBID 없어도 임베딩·추천에 지장 없음).

**완료 기준**: 시드 곡들이 MusicBrainz 메타데이터로 보강되며, 레이트리밋·User-Agent를 지키고, 연도 정책이 일관되게 적용된다.

---

## 6.5 — 트리거 이벤트 적재 + 임베딩 생성

**작업**
- 큐레이션/보강된 곡을 `Event(category="trigger")`로 적재(멱등).
- 각 곡의 임베딩 텍스트 구성(예: `"{곡} - {아티스트} ({연도}) {설명}"`) → Voyage 임베딩 → `Event.embedding` 저장.
- 배치 처리 + 레이트리밋 고려.

**완료 기준**: 트리거 이벤트가 DB에 적재되고 모든 행에 임베딩이 채워진다.

---

## 6.6 — 사용자 관심사 → RAG 검색

**목적**: 이 사용자에게 맞는 노래를 골라낸다.

**작업**
- `LifeProfile`의 `favMusic`/`interests` + birthYear로 **사용자 음악 프로필 문자열** 생성 → Voyage 임베딩(쿼리 벡터).
- pgvector 코사인 유사도로 후보 검색, **세대 필터** 적용(회상 절정 구간 가중).
- `lib/triggers.ts`의 함수: `getMusicTriggersForUser(userId) → 상위 N곡`.

**완료 기준**: 특정 사용자에 대해 그 세대·취향에 맞는 음악 트리거 N곡이 반환된다.

---

## 6.7 — 타임라인에 트리거 표시 (질문형)

**작업**
- 6.6 결과를 타임라인에 앵커와 함께 병합, 시각적으로 구분(suggested 스타일).
- 질문형 카피: "이 노래, 기억나세요?" + 곡/아티스트/연도.
- 시니어 접근성 유지.

**완료 기준**: 타임라인에 개인화된 음악 추천이 질문형으로 뜬다.

---

## 6.8 — 사용자 확정 / 거부

**작업**
- `UserEventResponse` 모델 추가(`userId, eventId, status: confirmed|dismissed, createdAt`) + 마이그레이션 + `prisma generate`.
- 확정 → 타임라인에 유지 + Phase 7에서 추억을 붙일 앵커가 됨.
- 거부 → 이후 숨김.
- ⚠️ 모든 쿼리 `userId` 스코프.

**완료 기준**: 확정/거부가 저장되고 타임라인에 반영된다.

---

## ✅ Phase 6 체크포인트

- [ ] Voyage 임베딩 래퍼 동작(차원 확인)
- [ ] Event.embedding 차원이 모델과 일치
- [ ] 음악 큐레이션 시드 적재
- [ ] MusicBrainz 실연동(User-Agent + 1req/s)으로 메타데이터 보강
- [ ] 트리거 이벤트 + 임베딩 적재 완료
- [ ] 사용자별 RAG 검색 동작(세대 필터 포함)
- [ ] 타임라인에 질문형 음악 트리거 표시
- [ ] 확정/거부 저장 + 반영(userId 스코프)
- [ ] 의미 단위 커밋 완료

---

## 커밋 가이드 (예시)
- `feat: voyage embeddings wrapper`
- `feat: set event embedding vector dimension + index`
- `feat: seed curated music trigger events`
- `feat: musicbrainz metadata enrichment`
- `feat: embed trigger events`
- `feat: rag retrieval of music triggers per user`
- `feat: render question-form music triggers on timeline`
- `feat: user confirm/dismiss for trigger events`

## 다음 단계
Phase 6 완료 후 `phase7.md`(AI 대화로 추억 채우기 — Claude API + RAG 가드). 확정된 트리거/앵커 옆에서 AI가 추억을 끌어내 UserMemory로 저장. **UserMemory 첫 쿼리는 반드시 userId 필터.**
