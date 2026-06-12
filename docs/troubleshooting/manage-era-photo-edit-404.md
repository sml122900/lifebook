# manage 수정 링크 404 — era·photo 행이 life_event 전용 편집 화면으로

2026-06-13. 부모님 테스트 중 발견.

## 문제상황

`/life-timeline/manage`에서 직접 입력한 인생 이벤트 수정은 정상인데,
"그 시절 둘러보기"(/era)에서 담은 시대 사건의 [수정]을 누르면
`/life-timeline/[id]/edit`가 **404**. 직접 입력 이벤트와 똑같이 생긴
행인데 한쪽만 깨졌다.

## 시도한 것들

1. **manage 목록 구성 추적** — `manage/page.tsx`가 `getLifeEvents`를 그대로
   `.map`하며 **kind 구분 없이** 모든 행에 `/[id]/edit` 수정 링크 +
   DeleteButton을 단다. `getLifeEvents`는 life_event·era_event·**photo**를
   모두 반환(시간축은 셋 다 보여줘야 하므로).
2. **데이터 모델 확인** — era 담은 사건은 별도 모델이 아니라 같은
   `UserMemory` 행(`createdVia="era_event"`, `monthEventId` FK,
   `category=null`, content=본인 회상). 즉 일반 이벤트와 **같은 테이블·같은
   ID 네임스페이스** → manage가 `e.kind`로 구분 가능.
3. **edit 경로 필터 확인** — `getLifeEventById`가
   `where: { createdVia: CREATED_VIA_LIFE_EVENT }` → era_event id면 null →
   edit 페이지 `notFound()` → 404. (era_event는 `category=null`이라
   `category === null` 방어 체크에도 걸림.)
4. **결함 범위 확장 발견** — 같은 필터를 쓰는 `deleteLifeEvent`도 life_event
   만 지움 → era 행 **삭제도** count=0 에러. 그리고 **photo 독립 메모리 행**도
   같은 이유로 manage에서 수정/삭제 모두 깨짐(사용자는 era만 발견).
5. **편집면 부정합 확인** — 설령 라우팅을 고쳐도 EventForm은 life_event
   전용(카테고리·장소·인물·기간) → era_event(이 필드 0)를 EventForm으로
   보내는 것 자체가 부정합. era 회상 편집의 자연스러운 면은 `/era` 인라인
   `EraMemoryEditor`인데 per-id 딥링크가 없다.

## 최종 해결법

A안(era 행 → /era 분기 + focus 파라미터 + 삭제 분리)은 변경 3곳 + EraView
신규 구현을 요구하면서도 결국 목록 페이지에 착지. **B안 채택** —
`manage/page.tsx` 한 곳에서 `e.kind` 분기(백엔드 0):

- `life_event`: 현행 수정 링크 + DeleteButton 유지
- `era_event`: "그 시절 둘러보기"(`/era`) secondary 버튼 + "빼기는 연혁에서"
  보조 안내
- `photo`: "사진 화면 열기"(`/photos`) secondary 버튼 안내
- 행 자체는 목록에 유지(제목·날짜 보임)

검증: 3종 행 분기 매핑 실측(life_event→수정+삭제 / era_event→/era 안내 /
photo→/photos 안내). tsc 0.

## 이력서 소재 한 줄

폴리모픽 디스크리미네이터(`createdVia`) 테이블에서 한 목록이 세 종류 행을
구분 없이 같은 편집 라우트로 링크해 두 종류가 404 나던 결함을, 읽기 헬퍼가
이미 노출하던 `kind`로 UI 분기해 백엔드 0줄·1파일로 해결 — "같은 테이블,
다른 편집면"을 라우팅이 아니라 표시 분기로 흡수.
