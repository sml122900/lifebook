# 임시 문구 목록 (2026-11-02)

> 갱신 2026-11-04(충돌 3키·말로 적기 7키 확정 — 말로 적기 4키 새 문구 · `lib/my-life-copy.ts` 임시 수를 구문 트리로 다시 셈 = 202) · 2026-11-04(충돌 보존 — `body.errConflict` 새 문구·`reloadLoseAsk`·`historyUnsaved` 임시 3 + `errConflictOnly` = 옛 확정 문구) · 2026-11-04(이야기 상세 `body` 60키 + `editBody` "글 고치기" 확정 — 9키 새 문구 · `lib/voice-copy.ts` 신설 = 말로 적기 칸 7키 코드에서 옮김, 임시) · 2026-11-04(`samePlaceQuestion` 조사 없는 문장 "같은 곳인가요? (이미 있는 장소: {이름})" — 조사 import 삭제·설명 줄 추가로 이 표 줄 번호 다시 맞춤) · 2026-11-04(자유 대화 72키 전부 확정 — 남은 54키 확정·5키 새 문구) · 2026-11-04(자유 대화 대화 중 8키 확정 — replyEmpty "다시 말씀해 주세요" 띄어쓰기) · 2026-11-04(자유 대화 들어옴 10키 확정 — setupDone·confirmAlready·topicGone·inputPlaceholder 새 문구) · 2026-11-04(문구 판단 기준 — 대상 = 모든 성인, "어려움" 표시 기준 변경·자유 대화 표시 다시 정리) · 2026-11-04(자유 대화 `lib/free-chat-copy.ts` 72키 — `declineFailed` 신설·화면 코드 문구 9키 옮김(빈 답·오류 3·입력칸 안내 2·마무리 말 3), 문구는 그대로) · 2026-11-04(개정 공지 띠 버튼 문서별 — 처리방침 보기·약관 보기, /terms 맨 위 줄 신설(약관 쪽 글 임시)) · 2026-11-04(개정 공지 `lib/policy-notice-copy.ts` 4키 확정 — 임시에서 빠짐) · 2026-11-04(가입 화면 `lib/join-copy.ts` 13키 확정 — 임시에서 빠짐 · 서비스 이름 화면 표기 "Lifebook"·"Google" 통일, 법적 표기 "라이프북" 유지) · 2026-11-03(개정 공지 — `lib/policy-notice-copy.ts` 4키, 아래 "개정 공지") · 2026-11-03(이야기 상세·글 고치기·이전 판·인물 글 — `lib/my-life-copy.ts` `body` 60키, 아래 "2b-3c 추가" · `hideBody` 삭제) · 2026-11-03(가입 전 동의 화면 `/join` 신설 — `lib/join-copy.ts` 13키, 아래 "가입 전 동의" · 동의 항목 문구는 확정된 /consent 문구를 같이 씀) · 2026-11-03(인물 확인 화면 삭제와 함께 `lib/node-confirm-copy.ts` 32키 전부 — 확인 화면·My Life "정리할 것" 카드·인터뷰 요약 카드 — 와 My Life 확인 대기 표시 4키 삭제, 설계 §15.6) · 2026-11-02(안 쓰는 키 7개 삭제 · 카드 오류 문구 6개를 `lib/free-chat-copy.ts` 로 옮김 반영) · 2026-11-02 My Life 개편 3단계(장소 묶음 7키 + 직접 만들기 `edit` 블록 103키 — 아래 "3단계 추가", 전부 임시) · 2026-11-02 3단계 E2E 후속(`edit.cannotUndo` 1키 — 104키) · 3단계 E2E 후속 2(`edit.deletedName`·`edit.deletePlaceGroups` — 106키, 지도 이동 줄 이름 `moveBarLabel`) · 3단계 최종 E2E(차례 보기 `tourLine`·`tourNext`·`tourBack`·`tourBackLabel` + 시기 패널 `inStory` — 5키) · 제안 카드 시기 미지정(`centerUnset`·`centerPick` — 2키) · 2026-11-03 옛 `/story-review` 본문 삭제와 함께 `storyReviewEntry`·`selfStoriesTitle` 삭제 · Q69 `/story-review` 합치기(My Life 11키 — 아래 "Q69 추가", 정리할 것·오늘의 인터뷰 문구의 보이는 곳 → My Life · Q69 후속에 그때의 나 묶음 제목은 화면에서 빠짐). 앱에 남은 `[임시 — 성민 확정 필요]` 문구 전부. **문구는 고치지 않았다** — 확정 문구는 성민이 준다. 확정되면 각 문구 파일만 고친다(로직 파일에 문구 하드코딩 없음).
> 뽑은 방법: 문구 파일 3개(2026-11-03 인물 확인 문구 파일 삭제 전엔 4개)의 키를 TypeScript 구문 트리로 읽고, 그 키를 쓰는 곳(import 별칭·`const C = …` 대입 별칭 — 대입은 그 함수 안만 — 의 `별칭.키`)을 `app/`·`lib/`·`components/` 전체에서 찾았다. 줄 번호는 이 문서를 쓴 시점(커밋 기준) 값이다.

**문구 판단 기준(2026-11-04 성민 — CLAUDE.md "문구 판단 기준")**: 대상은 어르신에서 출발했지만 청년을 포함한 모든 성인. "어려움" 표시 = 성인 누구나 바로 알아듣기 어려운 말(모호한 표현·개발 용어·키 조합 등). "카드"·"My Life"(영문 메뉴 이름)는 그대로 쓰며 표시 대상이 아니다. 접근성 기준(글자 크기·터치 영역 등)은 그대로.

## 요약

| 파일 | 임시 문구 | 화면에 안 나오는 키(쓰는 곳 없음) | 보이는 곳 |
|---|---|---|---|
| `lib/free-chat-copy.ts` | 0 (72키 2026-11-04 전부 확정 — 그 전 54: 72키 중 들어옴 10키·대화 중 8키 2026-11-04 확정 · 2026-11-04 `declineFailed` 신설 + 화면 코드에서 9키 옮김 — 그 전 62: 전부 — 카드 오류 6개는 2026-11-02 `lib/node-proposal.ts` 에서 옮겨 옴 · 시기 미지정 2개 `centerUnset`·`centerPick` 2026-11-02 추가) | 0 | `/chat-v3` 대화창 · 제안 카드(`/chat-v3`·`/interview` 마무리) |
| `lib/my-life-copy.ts` | 202 (2026-11-04 구문 트리로 다시 셈 — 키 270 = 확정 68(메뉴 4·`editBody`·`body` 63) + 임시 202. 바로 앞 표기 201(충돌 3키 포함)·198 은 둘 다 실제보다 4개 적게 셈 · 충돌 3키는 같은 날 확정 · 그 전: 2026-11-04 충돌 보존 임시 3 — `body.errConflict`(새 문구)·`reloadLoseAsk`·`historyUnsaved` · 그 전 198: 2026-11-04 `body` 60키·`editBody` 확정 — 그 전 259: 2026-11-03 2b-3c `body` 60 추가·`hideBody` 삭제 — 아래 "2b-3c 추가" · 그 전 200 = 78 + 3단계 115 + Q69 11 − 확인 대기 표시 4(2026-11-03 삭제 — `pendingTag`·`goConfirm`·`pendingNote`·`draftNote`) · 확정 4개 — 메뉴 이름 "My Life"·화면 제목 "My Life"·[인물 간선 끄기]·[장소 간선 끄기] — 제외) | 0 (`storyReviewEntry` 는 2026-11-03 옛 `/story-review` 본문과 함께 삭제) | `/my-life`(지도·목록·패널·만들기 시트) · 사이드 패널 메뉴 · `/story-review` |
| `lib/interview/copy.ts` | 42 (전부 — `selfStoriesTitle` 2026-11-03 삭제) | 0 | `/interview` · My Life "오늘의 인터뷰" 카드(Q69 전 `/story-review`) |
| `lib/join-copy.ts` | 0 (13키 2026-11-04 전부 확정) | 0 | `/join`(가입 전 동의 — 제목·안내·가입 방법 버튼) |
| `lib/policy-notice-copy.ts` | 0 (4키 2026-11-04 전부 확정) | 0(개정 등록이 있을 때만 보임 — 지금 0) | 로그인한 화면 헤더 아래 띠 · /privacy 맨 위 |
| `lib/voice-copy.ts` | 0 (7키 2026-11-04 전부 확정 — 같은 날 코드에서 옮김) | 0 | 말로 적기 칸을 쓰는 화면 전부(아래 표) |
| `lib/interview/question-pool.ts` | 문항 8개(18줄 — 구조 예시 5 + "관계별 나" 3) | — | `/interview` 질문·이야기 제목 |
| 그 밖 | 1 | — | 아래 "그 밖" |

- 화면 코드가 안 부르던 My Life 키 7개(`listBranches`·`groupTag`·`alsoElsewhere`·`personName`·`groupName`·`placeName`·`noPlaceGroup`)는 2026-11-02 삭제(성민 지시) — 지금 목록에 쓰는 곳 없는 키 0. (`noPlaceGroup` 은 3단계 장소 묶음 "묶음 없는 곳"으로 다시 씀.)
- `lib/free-chat.ts` 80~97줄의 쓰임은 앱 안내문 판정(`isAppNotice` — 구간 대화에서 안내문을 빼는 목록)이라 "보이는 곳"에 안 적었다. 이 문구를 바꾸면 판정도 저절로 따라간다.
- 문구가 아닌 임시(참고): `lib/characters.ts` 말동무 캐릭터 그림(임시 도형 Lottie), `lib/constants/education-labels.ts` 국민학교/초등학교 명칭 기준(학제 연혁 받기 전 임시 규칙).

### `lib/free-chat-copy.ts` (`FREE_CHAT_COPY`)

**72키 전부 확정(2026-11-04 성민)** — 임시 목록에서 빠짐(아래는 확정 문구 기록). 마지막 확정에서 바뀐 문구: `separatePlace` "다른 곳이에요" · `needSummary` "내용을 적어 주세요." · `needNewCenterLabel` "새 시기 이름을 적어 주세요." · `created` "…My Life에 남겼어요." · `viewOnMap` "My Life에서 보기"(띄어쓰기). `cancelEdit` "고치기 그만"은 그대로 — 누르면 고친 값은 그대로 두고 보기 화면으로 돌아감(원래대로 되돌리지 않음).

| 키 | 줄 | 현재 문구 | 보이는 곳 | 코드 위치 |
|---|---|---|---|---|
| `greeting` | 8 | "편하게 아무 이야기나 들려주세요. 떠오르는 대로 말씀하시면 돼요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:423, lib/free-chat.ts:84 |
| `setupDone` | 9 | "이제 준비가 끝났어요. 떠오르는 이야기를 편하게 들려주세요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:275, lib/free-chat.ts:85 |
| `resume` | 10 | "아까 하시던 이야기, 이어서 들려주세요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:423, app/chat-v3/ChatV3Client.tsx:447, lib/free-chat.ts:86 |
| `staleNotice` | 11 | "지난번에 나누던 이야기를 남겨 둘까요?" | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:417, lib/free-chat.ts:87 |
| `chipsTitle` | 12 | "이런 이야기는 어떠세요?" | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:732 |
| `saveNow` | 13 | "지금 이야기 남기기" | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:758 |
| `proposing` | 14 | "이야기를 정리하고 있어요…" | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:485 |
| `budgetPaused` | 15 | "오늘은 이야기 친구가 쉬는 시간이에요. 내일 다시 이야기 나눠요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:449, app/chat-v3/ChatV3Client.tsx:465, app/chat-v3/ChatV3Client.tsx:492, lib/free-chat.ts:88 |
| `topicGone` | 16 | "그 이야기 거리는 지금 없어요. 다른 이야기를 들려주세요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:451, lib/free-chat.ts:89 |
| `cardFirst` | 17 | "먼저 위 카드를 정해 주세요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:445, lib/free-chat.ts:90 |
| `confirmApplied` | 18 | "네, 반영했어요. 다른 이야기도 편하게 해 주세요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:294, lib/free-chat.ts:91 |
| `confirmAlready` | 19 | "그 이야기는 이미 확인했어요. 다른 이야기도 들려주세요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:309, lib/free-chat.ts:92 |
| `exitAfterCard` | 20 | "카드를 정하시면 오늘은 여기까지 할게요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:630, app/chat-v3/ChatV3Client.tsx:635, lib/free-chat.ts:93 |
| `cardTitle` | 23 | "이 이야기를 남길까요?" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:166, app/components/ProposalCard.tsx:167 |
| `fieldTitle` | 24 | "제목" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:172, app/components/ProposalCard.tsx:276 |
| `titlePlaceholder` | 25 | "비워 두면 내용 첫 문장이 제목이 돼요" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:281 |
| `fieldCenter` | 26 | "시기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:176, app/components/ProposalCard.tsx:287, app/components/ProposalCard.tsx:294 |
| `fieldPeople` | 27 | "사람" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:180, app/components/ProposalCard.tsx:339 |
| `fieldPlaces` | 28 | "장소" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:220, app/components/ProposalCard.tsx:383 |
| `fieldSummary` | 29 | "내용" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:260, app/components/ProposalCard.tsx:419, app/components/ProposalCard.tsx:420 |
| `existingPerson` | 30 | "이미 계신 분" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:188 |
| `newTag` | 31 | "새로" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:188, app/components/ProposalCard.tsx:228 |
| `existingPlace` | 32 | "이미 있는 곳" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:228 |
| `newCenter` | 33 | "" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:162 |
| `centerText` | 34 | "" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:160, app/components/ProposalCard.tsx:306 |
| `centerUnset` | 36 | "아직 못 정했어요 — [고치기]에서 골라 주세요" | **확정(2026-11-04)** · 제안 카드 시기 줄 — 시기 미지정 카드(시기 id·이름이 안 맞음, 2026-11-02 추가) | app/components/ProposalCard.tsx:164 |
| `centerPick` | 37 | "시기 고르기" | **확정(2026-11-04)** · 제안 카드 [고치기] 시기 고르기 첫 칸 — 시기 미지정 카드(2026-11-02 추가) | app/components/ProposalCard.tsx:313 |
| `none` | 38 | "없음" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:182, app/components/ProposalCard.tsx:223 |
| `showMore` | 39 | "내용 더 보기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:268 |
| `showLess` | 40 | "내용 접기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:268 |
| `create` | 41 | "만들기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:438 |
| `edit` | 42 | "고치기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:448 |
| `decline` | 43 | "안 만들기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:451 |
| `cancelEdit` | 44 | "고치기 그만" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:448 |
| `remove` | 45 | "빼기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:373, app/components/ProposalCard.tsx:409 |
| `addPerson` | 46 | "사람 더하기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:378 |
| `addPlace` | 47 | "장소 더하기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:414 |
| `newCenterOption` | 48 | "새 시기 만들기" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:309 |
| `newCenterLabel` | 49 | "새 시기 이름" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:315, app/components/ProposalCard.tsx:316 |
| `newCenterYear` | 50 | "연도 (모르면 비워 두세요)" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:323, app/components/ProposalCard.tsx:324 |
| `personName` | 51 | "이름" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:344, app/components/ProposalCard.tsx:345 |
| `personRelation` | 52 | "관계 (예: 친구)" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:359, app/components/ProposalCard.tsx:360 |
| `placeName` | 53 | "장소 이름" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:388, app/components/ProposalCard.tsx:389 |
| `sameNameQuestion` | 54 | `` (name: string, relation: string \| null) => `이미 계신 ${name}${relation ? `(${relation})` : ""} 님과 같은 분인가요?` `` | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:194 |
| `same` | 56 | "같은 분이에요" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:201 |
| `different` | 57 | "다른 분이에요" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:211 |
| `answerAskFirst` | 58 | "같은 분인지 먼저 골라 주세요." | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:112, app/components/ProposalCard.tsx:130 |
| `samePlaceQuestion` | 60 | `` (name: string) => `같은 곳인가요? (이미 있는 장소: ${name})` `` | **확정(2026-11-04 — 조사 없는 문장으로 바꿈, 영문·숫자 끝 이름도 맞게)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:234 |
| `samePlace` | 61 | "같은 곳이에요" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:241 |
| `separatePlace` | 62 | "다른 곳이에요" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:251 |
| `answerPlaceAskFirst` | 63 | "같은 곳인지 먼저 골라 주세요." | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:112, app/components/ProposalCard.tsx:130 |
| `createFailed` | 64 | "남기지 못했어요. 다시 해 주세요." | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:132, app/components/ProposalCard.tsx:137, app/components/ProposalCard.tsx:150 |
| `needSummary` | 66 | "내용을 적어 주세요." | **확정(2026-11-04)** · 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:431 |
| `needCenter` | 67 | "시기를 골라 주세요." | **확정(2026-11-04)** · 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:437 |
| `centerNotFound` | 68 | "그 시기를 찾지 못했어요." | **확정(2026-11-04)** · 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:443 |
| `needNewCenterLabel` | 69 | "새 시기 이름을 적어 주세요." | **확정(2026-11-04)** · 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:447 |
| `repickSamePerson` | 70 | "같은 분을 다시 골라 주세요." | **확정(2026-11-04)** · 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:474 |
| `repickSamePlace` | 71 | "같은 곳을 다시 골라 주세요." | **확정(2026-11-04)** · 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:504 |
| `created` | 72 | "'{제목}' 이야기를 My Life에 남겼어요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:510, lib/free-chat.ts:96 |
| `viewOnMap` | 73 | "My Life에서 보기" | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:695 |
| `declined` | 74 | "네, 남기지 않을게요." | **확정(2026-11-04)** · /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:528, lib/free-chat.ts:94 |
| `saving` | 75 | "남기는 중이에요…" | **확정(2026-11-04)** · 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:433 |
| `declineFailed` | 77 | "처리하지 못했어요. 다시 해 주세요." | **확정(2026-11-04)** · 제안 카드 — [안 만들기] 실패(2026-11-04 신설, 전엔 `createFailed`) | app/components/ProposalCard.tsx(decline) |
| `replyEmpty` | 80 | "잠시 문제가 있었어요. 다시 말씀해 주세요." | **확정(2026-11-04)** · /chat-v3 대화창 — 답이 비어 왔을 때(2026-11-04 화면 코드에서 옮김) | app/chat-v3/ChatV3Client.tsx(submitFree) |
| `loadFailed` | 81 | "이야기를 불러오지 못했어요." | **확정(2026-11-04)** · /chat-v3 오류 화면 — 자유 대화 들어오기 실패(옮김) | app/chat-v3/ChatV3Client.tsx(enterFree) |
| `topicFailed` | 82 | "이야기를 준비하지 못했어요." | **확정(2026-11-04)** · /chat-v3 오류 화면 — 주제로 시작 실패(옮김) | app/chat-v3/ChatV3Client.tsx(startTopic) |
| `replyFailed` | 83 | "답변을 처리하지 못했어요." | **확정(2026-11-04)** · /chat-v3 오류 화면 — 자유 대화 답 처리 실패(옮김) | app/chat-v3/ChatV3Client.tsx(submitFree) |
| `inputPlaceholder` | 84 | "하고 싶은 이야기를 적어 주세요" | **확정(2026-11-04)** · /chat-v3 입력칸 안내(옮김) | app/chat-v3/ChatV3Client.tsx |
| `inputNewlineHint` | 85 | "(Shift+Enter 줄바꿈)" | **확정(2026-11-04)** · 입력칸 안내 뒤 — 키보드 있는 기기(마우스·트랙패드가 주 입력)에서만(옮김) | app/chat-v3/ChatV3Client.tsx(useHasKeyboard) |
| `endCapped` | 87 | "오늘은 여기까지 여쭤볼게요. 나머지는 다음에 이어서 여쭤볼게요." | **확정(2026-11-04)** · /chat-v3 마무리 말 — 질문 상한(설정 단계)(옮김) | app/chat-v3/ChatV3Client.tsx(finishSession) |
| `endSaved` | 88 | "네, 들려주신 이야기는 잘 담아뒀어요. 오늘은 여기까지 할게요. 다음에 오시면 이어서 여쭤볼게요." | **확정(2026-11-04)** · /chat-v3 마무리 말 — 이야기를 남기고 그만(옮김) | app/chat-v3/ChatV3Client.tsx(finishSession) |
| `endPlain` | 89 | "네, 오늘은 여기까지 할게요. 다음에 오시면 이어서 여쭤볼게요." | **확정(2026-11-04)** · /chat-v3 마무리 말 — 그냥 그만(옮김) | app/chat-v3/ChatV3Client.tsx(finishSession) |

### `lib/my-life-copy.ts` (`MY_LIFE_COPY`)

| 키 | 줄 | 현재 문구 | 보이는 곳 | 코드 위치 |
|---|---|---|---|---|
| `menuHint` | 13 | "내 인생을 한 장의 지도로" | 사이드 패널 메뉴 | app/timemachine/SidePanel.tsx:274 |
| `mapListLabel` | 15 | "My Life — 시기 순서" | /my-life | app/my-life/MyLifeView.tsx:937, app/my-life/MyLifeView.tsx:1189 |
| `mapRegionLabel` | 16 | "My Life 지도" | /my-life | app/my-life/MyLifeView.tsx:764 |
| `listStories` | 17 | "이야기" | /my-life | app/my-life/MyLifeView.tsx:972, app/my-life/MyLifeView.tsx:1204 |
| `nowViewing` | 18 | `` (where: string) => `지금 보는 곳: ${where}` `` | /my-life | app/my-life/MyLifeView.tsx:679, app/my-life/MyLifeView.tsx:681 |
| `nowViewingNone` | 19 | "지금 보는 곳: 처음" | /my-life | app/my-life/MyLifeView.tsx:682 |
| `fitAll` | 20 | "전체 보기" | /my-life | app/my-life/MyLifeView.tsx:823 |
| `zoomIn` | 21 | "크게 보기" | /my-life | app/my-life/MyLifeView.tsx:813 |
| `zoomOut` | 22 | "작게 보기" | /my-life | app/my-life/MyLifeView.tsx:800 |
| `zoomAnnounce` | 23 | `` (percent: number) => `지금 ${percent}%` `` | /my-life | app/my-life/MyLifeView.tsx:574, app/my-life/MyLifeView.tsx:625, app/my-life/MyLifeView.tsx:804, app/my-life/MyLifeView.tsx:817 |
| `toList` | 24 | "목록으로 보기" | /my-life | app/my-life/MyLifeView.tsx:698 |
| `chatEntry` | 25 | "이야기 나누기" | /my-life | app/my-life/MyLifeView.tsx:691, app/my-life/MyLifeView.tsx:706, app/my-life/MyLifeView.tsx:1187 |
| `toMap` | 26 | "지도로 보기" | /my-life | app/my-life/MyLifeView.tsx:1181 |
| `unfold` | 27 | `` (n: number) => `가지 ${n}개 펼치기` `` | /my-life | app/my-life/MyLifeView.tsx:968, app/my-life/MyLifeView.tsx:1429 |
| `fold` | 28 | "가지 접기" | /my-life | app/my-life/MyLifeView.tsx:1429 |
| `unfoldAll` | 29 | "모두 펼치기" | /my-life | app/my-life/MyLifeView.tsx:731 |
| `yearsLater` | 30 | `` (n: number) => `${n}년 뒤` `` | /my-life | app/my-life/MyLifeView.tsx:932 |
| `yearUnknown` | 31 | "연도 모름" | /my-life | app/my-life/MyLifeView.tsx:79, app/my-life/MyLifeView.tsx:84, app/my-life/MyLifeView.tsx:681 |
| `selfTag` | 32 | "그때의 나" | /my-life | app/my-life/MyLifeView.tsx:1102, app/my-life/MyLifeView.tsx:1585 |
| `kindPerson` | 33 | "사람" | /my-life | app/my-life/MyLifeView.tsx:1316, app/my-life/MyLifeView.tsx:1450 |
| `kindPlace` | 34 | "장소" | /my-life | app/my-life/MyLifeView.tsx:1317, app/my-life/MyLifeView.tsx:1513 |
| `alsoElsewhereShort` | 36 | "여러 시기" | /my-life | app/my-life/MyLifeView.tsx:1104 |
| `close` | 37 | "닫기" | /my-life | app/my-life/MyLifeView.tsx:322, app/my-life/MyLifeView.tsx:1368 |
| `readBody` | 38 | "본문 보기" | /my-life 이야기 패널 → 이야기 상세 링크(2026-11-03 — 패널 안 펼침·`hideBody` "본문 접기" 삭제) | app/my-life/MyLifeView.tsx(StoryPanel) |
| `openPerson` | 42 | "인물록에서 보기" | /my-life | app/my-life/MyLifeView.tsx:1499 |
| `openMap` | 43 | "지도에서 보기" | /my-life | app/my-life/MyLifeView.tsx:1543 |
| `emptyTitle` | 44 | "아직 지도에 담을 이야기가 없어요" | /my-life | app/my-life/page.tsx:33 |
| `emptyDesc` | 45 | "이야기를 나누면 인생의 시기들이 여기에 하나씩 생겨요." | /my-life | app/my-life/page.tsx:34 |
| `emptyCta` | 46 | "이야기 나누기" | /my-life | app/my-life/page.tsx:34 |
| `panelStories` | 48 | `` (n: number) => `이야기 ${n}` `` | /my-life | app/my-life/MyLifeView.tsx:1425 |
| `panelPeople` | 49 | `` (n: number) => `사람 ${n}` `` | /my-life | app/my-life/MyLifeView.tsx:1425 |
| `panelPlaces` | 50 | `` (n: number) => `장소 ${n}` `` | /my-life | app/my-life/MyLifeView.tsx:1425 |
| `panelWithPeople` | 51 | "함께 나온 분" | /my-life | app/my-life/MyLifeView.tsx:1597 |
| `panelWithPlaces` | 52 | "나온 곳" | /my-life | app/my-life/MyLifeView.tsx:1610 |
| `panelAlsoIn` | 53 | "같이 보이는 시기" | /my-life | app/my-life/MyLifeView.tsx:1620 |
| `panelMembers` | 54 | "모임 사람들" | /my-life | app/my-life/MyLifeView.tsx:1562 |
| `panelRelation` | 55 | "관계" | /my-life | app/my-life/MyLifeView.tsx:1456 |
| `panelMetYear` | 56 | "만난 해" | /my-life | app/my-life/MyLifeView.tsx:1461 |
| `panelAddress` | 57 | "주소" | /my-life | app/my-life/MyLifeView.tsx:1519 |
| `eventName` | 59 | `` (yearText: string, label: string, stories: number, others: number) => `${yearText} ${label}, 이야기 ${stories}, 사람·장소 ${others}` `` | /my-life | app/my-life/MyLifeView.tsx:85 |
| `storyName` | 61 | `` (lead: string, withNames: string[]) => withNames.length > 0 ? `이야기, ${lead}, 함께: ${withNames.join(", ")}` : `이야기, ${lead}` `` | /my-life | app/my-life/MyLifeView.tsx:90 |
| `selfName` | 63 | `` (lead: string, withNames: string[]) => withNames.length > 0 ? `그때의 나, ${lead}, 함께: ${withNames.join(", ")}` : `그때의 나, ${lead}` `` | /my-life | app/my-life/MyLifeView.tsx:90 |
| `edgePersonOn` | 66 | "인물 간선 켜기" | /my-life | app/my-life/MyLifeView.tsx:719 |
| `edgePlaceOn` | 67 | "장소 간선 켜기" | /my-life | app/my-life/MyLifeView.tsx:722 |
| `peopleTitle` | 68 | "인물록" | /my-life | app/my-life/MyLifeView.tsx:679, app/my-life/MyLifeView.tsx:991, app/my-life/MyLifeView.tsx:1041, app/my-life/MyLifeView.tsx:1240 |
| `placesTitle` | 69 | "장소록" | /my-life | app/my-life/MyLifeView.tsx:679, app/my-life/MyLifeView.tsx:1071, app/my-life/MyLifeView.tsx:1074, app/my-life/MyLifeView.tsx:1282, app/my-life/MyLifeView.tsx:1284 |
| `noGroup` | 70 | "모임 없는 분" | /my-life | app/my-life/MyLifeView.tsx:1033, app/my-life/MyLifeView.tsx:1268, app/my-life/MyLifeView.tsx:1269 |
| `otherGroups` | 71 | `` (n: number) => `+${n}` `` | /my-life | app/my-life/MyLifeView.tsx:1060 |
| `otherGroupsLong` | 72 | `` (n: number) => `다른 모임 ${n}개` `` | /my-life | app/my-life/MyLifeView.tsx:1258 |
| `groupChipShown` | 73 | "✓" | /my-life | app/my-life/MyLifeView.tsx:1009 |
| `groupEmpty` | 74 | "아직 아무도 없어요" | /my-life | app/my-life/MyLifeView.tsx:1038, app/my-life/MyLifeView.tsx:1249, app/my-life/MyLifeView.tsx:1559 |
| `selectedLine` | 75 | `` (name: string, n: number) => `선택 — ${name} · 연결 ${n}` `` | /my-life | app/my-life/MyLifeView.tsx:712 |
| `clearSelection` | 76 | "선택 풀기" | /my-life | app/my-life/MyLifeView.tsx:714 |
| `find` | 77 | "찾기" | /my-life | app/my-life/MyLifeView.tsx:695, app/my-life/MyLifeView.tsx:1178 |
| `findTitle` | 78 | "기록 찾기" | /my-life | app/my-life/MyLifeView.tsx:1332, app/my-life/MyLifeView.tsx:1340 |
| `findPlaceholder` | 79 | "이름이나 이야기 속 낱말" | /my-life | app/my-life/MyLifeView.tsx:1339 |
| `findNone` | 80 | "찾는 기록이 없어요" | /my-life | app/my-life/MyLifeView.tsx:1345 |
| `findCount` | 81 | `` (n: number) => `${n}개 찾았어요` `` | /my-life | app/my-life/MyLifeView.tsx:1345 |
| `kindEvent` | 82 | "시기" | /my-life | app/my-life/MyLifeView.tsx:1314 |
| `kindStory` | 83 | "이야기" | /my-life | app/my-life/MyLifeView.tsx:1315 |
| `kindGroup` | 84 | "모임" | /my-life | app/my-life/MyLifeView.tsx:1318, app/my-life/MyLifeView.tsx:1554 |
| `toPeople` | 85 | "인물록" | /my-life | app/my-life/MyLifeView.tsx:847 |
| `toPlaces` | 86 | "장소록" | /my-life | app/my-life/MyLifeView.tsx:848 |
| `toTimeline` | 87 | "시간 줄기" | /my-life | app/my-life/MyLifeView.tsx:849 |
| `toRelated` | 88 | `` (n: number) => `연결된 곳 차례로 보기(${n})` `` | /my-life | app/my-life/MyLifeView.tsx:846 |
| `panelStoriesWith` | 89 | "나온 이야기" | /my-life | app/my-life/MyLifeView.tsx:1479, app/my-life/MyLifeView.tsx:1524 |
| `panelEventsWith` | 90 | "그 시기" | /my-life | app/my-life/MyLifeView.tsx:1489, app/my-life/MyLifeView.tsx:1534 |
| `panelGroups` | 91 | "모임" | /my-life | app/my-life/MyLifeView.tsx:1466 |
| `goThere` | 92 | "여기로 가기" | /my-life | app/my-life/MyLifeView.tsx:1384 |
| `personName2` | 94 | `` (name: string, groups: string[], stories: number) => `사람, ${name}${groups.length ? `, 모임 ${groups.join("·")}` : ""}, 이야기 ${stories}` `` | /my-life | app/my-life/MyLifeView.tsx:1053 |
| `placeName2` | 96 | `` (name: string, stories: number) => `장소, ${name}, 이야기 ${stories}` `` | /my-life | app/my-life/MyLifeView.tsx:1084 |
| `groupLabelName` | 97 | `` (name: string, n: number) => `모임, ${name}, ${n}명` `` | /my-life | app/my-life/MyLifeView.tsx:1022 |
| `groupChipName` | 98 | `` (name: string, shown: boolean) => (shown ? `모임 ${name}, 지도에 보이는 중` : `모임 ${name}, 지도에 보이기`) `` | /my-life | app/my-life/MyLifeView.tsx:1004 |

#### 3단계 추가(2026-11-02 — 지도에서 직접 만들기, 전부 `[임시 — 성민 확정 필요]`)

위 표의 `app/my-life/MyLifeView.tsx` 줄 번호는 3단계 전 값이다(3단계에서 패널이 `app/my-life/EditUI.tsx` 로 나뉘며 바뀜).

| 묶음 | 키 | 보이는 곳 |
|---|---|---|
| 장소 묶음(7) | `kindPlaceGroup` "장소 묶음" · `noPlaceGroup` "묶음 없는 곳" · `panelPlaceMembers` "묶음 안 장소" · `panelPlaceGroups` "장소 묶음" · `placeGroupEmpty` "아직 넣은 곳이 없어요" · `placeGroupLabelName`·`placeGroupChipName`(낭독용) | 장소록 영역·칩·목록 보기·패널·찾기 종류 |
| `edit` 만들기 시트(20) | `create` "만들기" · `createTitle` "무엇을 만들까요?" · `kinds` 7(시기·이야기·그때의 나·사람·장소·모임·장소 묶음) · `kindHints` 7 · `regionAdd*` 4(사람·모임·장소·묶음) · `regionAddName` | 머리 줄·인물록/장소록 제목 아래·시트 |
| `edit` 입력(23) | `fieldName`·`fieldYear`·`fieldEndYear`·`fieldPeriod`·`fieldTitle`·`fieldBody`·`fieldSelfBody`·`fieldRelation`·`fieldGroups`·`fieldPeople`·`fieldSelfPeople`·`fieldPlaces`·`fieldMembers`·`fieldPlaceMembers`·`placeByName`·`placeBySearch`·`save`·`saving`·`cancel`·`back`·`sameNameQuestion`·`samePerson`·`differentPerson` | 만들기 시트·패널 [새로 만들기]·[직접 쓰기] |
| `edit` 알림(5) | `created`·`reused`·`linked`·`alreadyLinked`·`undo` "되돌리기"·`undone` | 패널 맨 위 알림 |
| `edit` 패널 버튼·단계(29) | `addStory`·`talkStory`·`writeStory`·`addPerson`·`addPlace`·`addGroup`·`addToGroup`·`addToPlaceGroup`·`addMember`·`pickTitle`·`pickNone`·`pickSearch`·`pickNew`·`moveStory`·`moveTitle`·`hereNow`·`moveConfirm`·`moveDo`·`moved`·`remove`·`removeConfirm`·`removeDo` "뺄게요"·`removed`·`subjectNote`·`deleteNode` "이 노드 지우기"·`deleteTitle`·`deleteLinked`·`deleteNoLinks`·`linkStories`·`linkPeople`·`linkPlaces`·`deleteStoriesToo`·`deleteFamily`·`deleteIrreversible`·`deleteDo`·`deleted`·`deleteSkeletonNote`·`personDeleteNote`·`personDeleteLink` | 노드 패널 |
| 3단계 E2E 후속 2(3) | `edit.deletedName` "○○을 지웠어요."(지운 뒤 지도 머리 줄·목록 위) · `edit.deletePlaceGroups` "장소 묶음 N개에서도 빠져요."(장소 지우기 확인창) · `moveBarLabel` "지도에서 가기"(도구줄 이동 줄 이름, 화면 낭독용) | /my-life |
| 3단계 최종 E2E(5 — 2026-11-02) | `tourLine` "연결 n/N · 이름"(차례 보기 중 선택 줄) · `tourNext` "다음 연결" · `tourBack` "처음으로" · `tourBackLabel` "처음 노드로 돌아가기 — 이름"(화면 낭독용) · `inStory` "‘제목’ 이야기에 나와요"(시기 패널 — 이야기에서만 나온 분·곳의 아래 줄) | /my-life |
| `edit` 오류(15) | `notFound`·`alreadyPrimary`·`cannotLink`·`cannotUnlink`·`cannotUndo` "되돌리지 못했어요. 다시 해 주세요."(빼기 되돌리기 실패 — 3단계 E2E 후속 2026-11-02)·`cannotRemovePrimary`·`cannotRemoveSubject`·`needName`·`tooLong`·`badYear`·`badEndYear`·`needBody`·`pickPeriod`·`repickSame`·`failed` | 시트·패널 오류 줄(`lib/my-life-edit.ts` 가 돌려줌) |

#### Q69 추가(2026-11-02 — `/story-review` 를 My Life 로 합치기, 전부 `[임시 — 성민 확정 필요]`)

갭 카드·이야기 고치기 글자는 옮기기 전 `/story-review` 화면 문구 그대로(그 화면은 문구 파일 없이 코드에 적혀 있었다).

| 키 | 줄 | 현재 문구 | 보이는 곳 | 코드 위치 |
|---|---|---|---|---|
| `suggest` | 45 | "이야기 거리" | 지도 보기 "지금 보는 곳" 줄 버튼 · 시트 제목 | app/my-life/MyLifeView.tsx:1020, app/my-life/MyLifeView.tsx:518 |
| `gapsTitle` | 46 | "더 들어볼까요?" | 목록 보기 시간 줄기 아래 · [이야기 거리] 시트 | app/my-life/Suggestions.tsx:58 |
| `gapInProgress` | 47 | "진행 중" | 갭 카드(지금 자유 대화 주제와 같을 때) | app/my-life/Suggestions.tsx:64 |
| `gapStart` | 48 | "이야기하기" | 갭 카드 버튼 | app/my-life/Suggestions.tsx:67 |
| `gapContinue` | 49 | "이어서 이야기하기" | 갭 카드 버튼(진행 중) | app/my-life/Suggestions.tsx:67 |
| `editBody` | 46 | "글 고치기" | **확정(2026-11-04 — 옛 "이야기 고치기")** · 이야기 패널 버튼 두 가지가 같이 씀: 소제목·사진이 든 글 = 글 고치기 화면으로 · 그 밖 = 패널 안에서 바로 고치기 | app/my-life/MyLifeView.tsx:2059, app/my-life/MyLifeView.tsx:2064 |
| `bodyLabel` | 51 | "이야기 내용" | 이야기 패널 본문 칸(화면 낭독) | app/my-life/MyLifeView.tsx:2100 |
| `saveBody` | 52 | "저장" | 이야기 패널 고치기 | app/my-life/MyLifeView.tsx:2117 |
| `savingBody` | 53 | "저장 중…" | 이야기 패널 고치기 | app/my-life/MyLifeView.tsx:2117 |
| `editBodyFailed` | 54 | "고치지 못했어요." | 이야기 패널 고치기 오류(서버 문구가 없을 때) | app/my-life/MyLifeView.tsx:2061 |
| `editBodyRetry` | 55 | "처리 중 문제가 있었어요. 화면을 새로고침할게요." | 이야기 패널 고치기 — 응답 실패 | app/my-life/MyLifeView.tsx:2070 |

#### 2b-3c 추가(2026-11-03 — 이야기 상세·블로그식 글 고치기·이전 판·인물 글, `MY_LIFE_COPY.body`) — **60키 전부 확정(2026-11-04 성민)**

확정에서 바뀐 문구 9: `backToMap` "My Life로 돌아가기" · `placesTitle` "이야기에 나온 곳" · `richNote` "소제목이나 사진이 있는 글은 [글 고치기]에서 고칠 수 있어요." · `uploadHeic` "아이폰 사진(HEIC)은 아직 올릴 수 없어요. 아이폰 설정 > 카메라 > 포맷에서 '높은 호환성'으로 바꾼 뒤 다시 올려 주세요." · `uploadGps` "사진 속 위치 정보를 지우고 올리는데, 이 사진은 지우지 못해 올리지 않았어요. 다른 사진으로 해 주세요." · `errEmpty` "글이 비어 있어요. 이야기를 지우려면 My Life에서 [이 노드 지우기]를 눌러 주세요."([이 노드 지우기] = 이야기 패널의 실제 버튼 이름) · `errConflict` "다른 창이나 기기에서 먼저 고쳤어요. 다시 불러온 뒤 고쳐 주세요." · `historyWhen(when)` "○까지의 글" (+ 같은 패널의 `editBody` "글 고치기" — 위 Q69 표). 나머지 51키는 지금 문구 그대로 확정. 같은 날 `uploadHint`·`removeNote` 글자 16 → 18px.

**그 뒤 충돌 보존(2026-11-04 — 설계 §19.4) 3키 — 같은 날 지금 문구로 확정**: `errConflict` "다른 창이나 기기에서 먼저 고쳤어요. 고치던 글은 이전 판에 남겨 뒀어요. 다시 불러온 뒤 고쳐 주세요."(고치던 글을 판으로 남긴 충돌 — 글 고치기 화면·패널) · `reloadLoseAsk` "고치던 글이 사라져요. 그래도 다시 불러올까요?"(못 남긴 충돌 뒤 [다시 불러오기] 확인 — 버튼 `reload`·`unsavedStay`) · `historyUnsaved(when)` "○ 저장되지 않은 글"(이전 판 머리 줄). 새 키 `errConflictOnly` = 확정한 옛 `errConflict` 문구 "다른 창이나 기기에서 먼저 고쳤어요. 다시 불러온 뒤 고쳐 주세요."(못 남긴 충돌·이전 판 되돌리기 충돌 — 임시 아님).

| 묶음 | 키 | 보이는 곳 |
|---|---|---|
| 상세(8) | `backToMap` "My Life로 돌아가기" · `edit` "글 고치기" · `history(n)` "이전 판 n개" · `photosTitle` "이 이야기의 사진" · `peopleTitle` "함께 나온 분" · `placesTitle` "이야기에 나온 곳" · `photoGone` "사진이 지워졌어요" · `richNote` "소제목이나 사진이 있는 글은 [글 고치기]에서 고칠 수 있어요."(이야기 패널) | `/my-life/story/[id]` · 이야기 패널 |
| 인물 글(4) | `personWrite` "이 분 이야기 쓰기" · `personEdit` "이 분 이야기 고치기" · `personTitle(name)` "○○ — 이야기" · `personIntro` | 사람 패널 · `/my-life/person/[id]/edit` |
| 편집(35) | `editTitle` · `paragraphLabel(n)` "문단 n" · `headingLabel(n)` · `photoLabel(n)` · `captionLabel` · `addParagraph` "문단 추가" · `addHeading` "소제목 추가" · `addPhoto` "사진 넣기" · `up` "위로" · `down` "아래로" · `remove` "빼기" · `removeNote` · `pickTitle` · `pickNone` · `upload` "새 사진 올리기" · `uploadHint` · `uploading` · `uploadFailed` · `uploadTooBig` · `uploadHeic` · `uploadGps` · `pickClose` · `emptyDoc` · `save` · `saving` · `cancel` · `unsaved` · `unsavedLeave` · `unsavedStay` · `errEmpty` · `errTooLong` · `errConflict` · `reload` "다시 불러오기" · `errBadPhoto` · `errFailed` | `…/story/[id]/edit` · `…/person/[id]/edit`(app/my-life/_body/BodyEditor.tsx) |
| 이전 판(13) | `historyTitle` "이전 판" · `historyIntro` · `historyEmpty` · `historyWhen(when)` "○까지의 글" · `historyChars(n)` "n자" · `historyShow` "보기" · `historyHide` "접기" · `historyPhoto` "(사진)" · `restore` "이 판으로 되돌리기" · `restoreAsk` · `restoreYes` "되돌리기" · `restoreNo` "그대로 두기" · `restoring` | `…/history`(app/my-life/_body/RevisionList.tsx·HistoryPage.tsx) |

### `lib/join-copy.ts` (`JOIN_COPY`) — 가입 전 동의 — **13키 전부 확정(2026-11-04 성민)**

임시 목록에서 빠짐(아래는 확정 문구 기록). 서비스 이름 화면 표기 = "Lifebook", 구글 = "Google"(같은 날 결정 — 법적 표기의 "라이프북"은 유지).

| 키 | 확정 문구 | 보이는 곳 |
|---|---|---|
| `title` | "가입하기 전에" | /join 제목 |
| `desc` | "Lifebook을 쓰시려면 아래 세 가지에 동의해 주세요. 동의하신 뒤 가입 방법을 고르시면 바로 이어서 가입돼요." | /join 안내 |
| `bounced` | `` (method) => `처음 오셨네요. 아래에서 동의하신 뒤 ${method} 버튼을 한 번 더 눌러 주세요.` `` | /join?provider= — 로그인 화면 소셜 버튼으로 왔는데 아직 계정이 없을 때 · 동의 없이 /signup(?provider=email) |
| `consentError` | "필수 항목 세 가지에 모두 동의해 주세요." | /join?error=consent — 가입 방법 칸의 안내 자리(`needAll` 대신, 둘이 같이 안 뜸) |
| `methodsTitle` | "가입 방법 고르기" | /join 소제목 |
| `methodName` | 카카오 · 네이버 · Google · 이메일 | `bounced` 안 |
| `kakao`·`naver`·`google`·`email` | "카카오로 가입하기" · "네이버로 가입하기" · "Google로 가입하기" · "이메일로 가입하기" | /join 가입 버튼 |
| `needAll` | "위 세 가지에 모두 동의하시면 가입 버튼을 누를 수 있어요." | /join(동의 전) |
| `pending` | "가입 화면으로 넘어가는 중…" | /join 가입 버튼(제출 중) |
| `toLogin` | "이미 가입하셨나요? 로그인하기" | /join 아래 링크 |

### `lib/policy-notice-copy.ts` (`POLICY_NOTICE_COPY`) — 개정 공지 — **4키 전부 확정(2026-11-04 성민)**

임시 목록에서 빠짐(아래는 확정 문구 기록). 개정이 `lib/policy-notice.ts` 에 등록됐을 때만 보인다(지금 등록 0 — 첫 사용 v1.4). 띠의 요약은 등록의 `short`(11자 — 누구나 아는 말, 기술 용어 금지), 처리방침 줄의 상세는 등록의 `detail`.

| 키 | 확정 문구 | 보이는 곳 |
|---|---|---|
| `bar(n)` | 시행 전 `${short} · ${M월 D일}부터` · 시행 뒤 7일 `${short} · ${M월 D일}부터 적용` | 로그인한 화면 헤더 아래 띠(app/components/PolicyNoticeBar.tsx) |
| `more` | 문서별(등록의 문서 종류로 고름 — 2026-11-04): 처리방침 "처리방침 보기" · 약관 "약관 보기" | 띠 버튼 → /privacy#policy-notice · /terms#policy-notice |
| `close` | "닫기" | 띠 버튼 |
| `pageLine(n)` | 시행 전 `개정 안내 — 개인정보 처리방침(${판})은 ${YYYY년 M월 D일}부터 시행됩니다. ${detail}` · 시행 뒤 `…시행되었습니다. ${detail}` | /privacy 맨 위(app/privacy/page.tsx) |
| `pageLine(n)` — 약관에 쓰일 때 **[임시 — 성민 확정 필요]** | 같은 함수: `개정 안내 — 이용약관(${판})은 … 시행됩니다. ${detail}` | /terms 맨 위(app/terms/page.tsx — 2026-11-04 신설, 첫 약관 공지 전) |

### `lib/interview/copy.ts` (`INTERVIEW_COPY`)

| 키 | 줄 | 현재 문구 | 보이는 곳 | 코드 위치 |
|---|---|---|---|---|
| `cardTitle` | 9 | "오늘의 인터뷰" | My Life 목록 보기 맨 위 · 지도 [이야기 거리] 시트(Q69 전 /story-review) | app/my-life/Suggestions.tsx:44 |
| `cardBefore` | 10 | "짧은 질문 몇 가지를 여쭤볼게요." | My Life 목록 보기 맨 위 · 지도 [이야기 거리] 시트(Q69 전 /story-review) | app/my-life/Suggestions.tsx:38 |
| `cardInProgress` | 11 | `` (done: number, total: number) => `${total}개 중 ${done}개 답하셨어요.` `` | My Life 목록 보기 맨 위 · 지도 [이야기 거리] 시트(Q69 전 /story-review) | app/my-life/Suggestions.tsx:40 |
| `cardDone` | 12 | "오늘 인터뷰를 마쳤어요." | My Life 목록 보기 맨 위 · 지도 [이야기 거리] 시트(Q69 전 /story-review) | app/my-life/Suggestions.tsx:41 |
| `cardButtonStart` | 13 | "시작하기" | My Life 목록 보기 맨 위 · 지도 [이야기 거리] 시트(Q69 전 /story-review) | app/my-life/Suggestions.tsx:38 |
| `cardButtonContinue` | 14 | "이어서 하기" | My Life 목록 보기 맨 위 · 지도 [이야기 거리] 시트(Q69 전 /story-review) | app/my-life/Suggestions.tsx:40 |
| `cardButtonDone` | 15 | "오늘 답 보기" | My Life 목록 보기 맨 위 · 지도 [이야기 거리] 시트(Q69 전 /story-review) | app/my-life/Suggestions.tsx:41 |
| `startTitle` | 18 | "오늘의 인터뷰" | /interview | app/interview/InterviewClient.tsx:72 |
| `startDesc` | 19 | `` (n: number) => `오늘은 질문 ${n}개를 여쭤볼게요. 짧게 답하셔도 괜찮아요.` `` | /interview | app/interview/InterviewClient.tsx:73 |
| `startButton` | 20 | "시작할게요" | /interview | app/interview/InterviewClient.tsx:76 |
| `progress` | 23 | `` (index: number, total: number) => `${index} / ${total}` `` | /interview | app/interview/InterviewClient.tsx:324, app/interview/InterviewClient.tsx:332 |
| `resumeNotice` | 24 | "아까 하던 곳부터 이어서 여쭤볼게요." | /interview | app/interview/InterviewClient.tsx:44 |
| `answerPlaceholder` | 25 | "여기에 말씀해 주세요" | /interview | app/interview/InterviewClient.tsx:345 |
| `answerLabel` | 26 | "답" | /interview | app/interview/InterviewClient.tsx:346 |
| `send` | 27 | "답하기" | /interview | app/interview/InterviewClient.tsx:365 |
| `skip` | 28 | "이 질문은 건너뛸게요" | /interview | app/interview/InterviewClient.tsx:378 |
| `pause` | 29 | "오늘은 그만할게요" | /interview | app/interview/InterviewClient.tsx:359, app/interview/InterviewClient.tsx:382 |
| `storyEnough` | 30 | "이 이야기는 여기까지" | /interview | app/interview/InterviewClient.tsx:374 |
| `thinking` | 31 | "잠깐만요, 생각하고 있어요…" | /interview | app/interview/InterviewClient.tsx:76, app/interview/InterviewClient.tsx:351 |
| `saving` | 32 | "이야기를 담고 있어요…" | /interview | app/interview/InterviewClient.tsx:351 |
| `storySaved` | 33 | "들려주신 이야기를 담아뒀어요." | /interview | app/interview/InterviewClient.tsx:238 |
| `saveFailed` | 34 | "저장하지 못했어요. 다시 해 볼까요?" | /interview · /interview(서버가 만드는 말) | app/interview/InterviewClient.tsx:231, lib/interview/session.ts:390 |
| `retry` | 35 | "다시 하기" | /interview | app/interview/InterviewClient.tsx:356 |
| `errorGeneric` | 36 | "잠시 문제가 생겼어요. 다시 해 볼까요?" | /interview · /interview(서버가 만드는 말) | app/interview/InterviewClient.tsx:74, app/interview/InterviewClient.tsx:196, lib/interview/session.ts:331, lib/interview/session.ts:357 |
| `yearQuestion` | 39 | `` (label: string) => `${label}${withJosa(label, "은/는")} 몇 년도였어요?` `` | /interview(서버가 만드는 말) | lib/interview/session.ts:114 |
| `yearHint` | 40 | "기억나는 만큼만요. 나이로 말씀하셔도 돼요." | /interview(서버가 만드는 말) | lib/interview/session.ts:257 |
| `yearUnknownButton` | 41 | "기억이 안 나요" | /interview | app/interview/InterviewClient.tsx:369 |
| `yearSaved` | 42 | `` (label: string, year: number) => `${label}, ${year}년으로 담아뒀어요.` `` | /interview | app/interview/InterviewClient.tsx:298 |
| `yearRetry` | 43 | "죄송해요, 잘 못 알아들었어요. 몇 년도쯤이었는지 다시 말씀해 주시겠어요?" | /interview | app/interview/InterviewClient.tsx:292 |
| `yearUnknown` | 44 | "괜찮아요. 나중에 떠오르면 알려주세요." | /interview | app/interview/InterviewClient.tsx:300 |
| `pausedTitle` | 47 | "오늘은 여기까지 할게요" | /interview | app/interview/InterviewClient.tsx:137 |
| `pausedDesc` | 48 | "다음에 오시면 이어서 여쭤볼게요." | /interview | app/interview/InterviewClient.tsx:138 |
| `pausedResume` | 49 | "이어서 하기" | /interview | app/interview/InterviewClient.tsx:147 |
| `summaryTitle` | 52 | "오늘 인터뷰를 마쳤어요" | /interview | app/interview/InterviewClient.tsx:100 |
| `summaryCounts` | 53 | `` (answered: number, skipped: number) => skipped > 0 ? `${answered}개 답해주셨고, ${skipped}개는 건너뛰었어요.` : `${answered}개 답해주셨어요.` `` | /interview | app/interview/InterviewClient.tsx:101 |
| `summarySavedHeading` | 55 | "오늘 담긴 이야기" | /interview | app/interview/InterviewClient.tsx:113 |
| `summaryYearItem` | 56 | `` (label: string, year: number) => `${label} — ${year}년` `` | /interview(서버가 만드는 말) | lib/interview/session.ts:220 |
| `summaryNextDay` | 57 | "내일 또 새로운 질문을 준비해 둘게요." | /interview | app/interview/InterviewClient.tsx:123 |
| `summaryReview` | 58 | "지금까지 채운 이야기 보기" | /interview | app/interview/InterviewClient.tsx:91, app/interview/InterviewClient.tsx:125, app/interview/InterviewClient.tsx:150 |
| `summaryChat` | 59 | "더 이야기 나누기" | /interview | app/interview/InterviewClient.tsx:88, app/interview/InterviewClient.tsx:128 |
| `emptyTitle` | 62 | "오늘은 여쭤볼 질문이 없어요" | /interview | app/interview/InterviewClient.tsx:85 |
| `emptyDesc` | 63 | "하고 싶은 이야기가 있으시면 언제든 들려주세요." | /interview | app/interview/InterviewClient.tsx:86 |

### `lib/interview/question-pool.ts` (질문 풀 — 구조 예시 문항, 보이는 곳 = /interview 질문·이야기 제목)

| 줄 | 현재 값 |
|---|---|
| 36 | `text: "{elemSchool} 다닐 때 친구들이랑 즐겨 하던 놀이가 있으세요?",` |
| 37 | `topic: "{elemSchool} 시절 놀이",` |
| 46 | `text: "중학교 때 도시락 반찬은 주로 뭐였어요?",` |
| 47 | `topic: "중학교 도시락",` |
| 56 | `text: "고등학교 때 즐겨 듣던 노래가 있으세요?",` |
| 57 | `topic: "고등학교 시절 노래",` |
| 66 | `text: "첫 월급 받으셨을 때 뭘 하셨는지 기억나세요?",` |
| 67 | `topic: "첫 월급",` |
| 76 | `text: "요즘 제일 좋아하시는 음식은 뭐예요?",` |
| 77 | `topic: "좋아하는 음식",` |
| 117 | `text: "고등학교 다니실 때, {who:과/와} 같이 있을 때는 어떤 사람이셨어요?",` |
| 118 | `topic: "고등학교 때 {who:과/와} 있을 때의 나",` |
| 127 | `text: "{elemSchool} 다니실 때, {who} 앞에서는 어떤 아이셨어요?",` |
| 128 | `topic: "{elemSchool} 시절 {who} 앞의 나",` |
| 130 | `relation: { kind: "category", label: "선생님" },` |
| 137 | `text: "첫 직장 다니실 때, 집에서 {who}한테는 어떤 사람이셨어요?",` |
| 138 | `topic: "첫 직장 시절 {who} 곁의 나",` |
| 140 | `relation: { kind: "category", label: "가족" },` |

### `lib/voice-copy.ts` (`VOICE_COPY`) — 말로 적기(음성 받아쓰기) 칸 — **7키 전부 확정(2026-11-04 성민)**

확정에서 바뀐 문구 4: `startAria` "말로 적기"(화면 버튼 이름과 같게) · `listening` "듣고 있어요… 다 말씀하시면 [녹음 멈추기]를 누르세요." · `errPermission` "마이크가 꺼져 있어요. 브라우저 설정에서 마이크를 허용해 주세요." · `errRecording` "녹음 중 문제가 생겼어요. 다시 해 주세요." — `errStart` 는 끝이 "다시 시도해 주세요"가 아니라 그대로. 같은 문구가 옛 `/memory/[eventId]` 답 칸(`app/memory/[eventId]/AnswerForm.tsx`)에도 코드로 따로 있다(이 파일과 무관 — 고치지 않음).

2026-11-04 `app/components/VoiceTextarea.tsx` 코드에서 글자 그대로 옮김. 아이콘(🎤·■)은 글자가 아니라 코드에 둠. AI 다듬기 문구("AI 로 다듬기"·"다듬는 중…"·"다듬었어요 · …"·토큰 안내·"충전하러 가기" 등)는 `onCleanup` 을 넘기는 화면(닫힌 타임머신 달 화면 — `/timemachine/[year]/[month]` 는 `/life-timeline` 으로 redirect)에만 나와 아직 코드에 있다.

| 키 | 현재 문구 | 보이는 때 |
|---|---|---|
| `start` | "말로 적기" | 버튼(녹음 전) |
| `stop` | "녹음 멈추기" | 버튼·읽어 주기 이름(녹음 중) |
| `startAria` | "말로 적기" | 버튼 읽어 주기 이름(녹음 전) |
| `listening` | "듣고 있어요… 다 말씀하시면 [녹음 멈추기]를 누르세요." | 녹음 중 |
| `errPermission` | "마이크가 꺼져 있어요. 브라우저 설정에서 마이크를 허용해 주세요." | 마이크 권한 거부 |
| `errRecording` | "녹음 중 문제가 생겼어요. 다시 해 주세요." | 녹음 중 오류 |
| `errStart` | "녹음을 시작할 수 없어요." | 녹음 시작 실패 |

쓰는 화면(브라우저가 음성 받아쓰기를 지원할 때만 버튼이 보임): 이야기 글 고치기·사람 글 고치기(`/my-life/story/[id]/edit`·`/my-life/person/[id]/edit` — BodyEditor 문단 칸) · My Life [+ 만들기] 이야기·그때의 나 내용 칸(EditUI) · 제안 카드 [고치기] 내용 칸(`/chat-v3`·`/interview` 마무리 — ProposalCard) · `/interview` 답 칸 · `/era` 사건 회상·`/life-timeline` 시대 배경 카드·첫 사건 카드(EraMemoryEditor) · `/life-timeline/add`·`/life-timeline/[id]/edit`(EventForm) · `/life-record/[category]`(CategoryForm) · `/people/new`·`/people/[id]/edit`(PersonForm) · 타임머신 달 화면(EventItem·MonthStory·MonthV2 — redirect 로 닫혀 안 보임).

### 그 밖

| 파일 | 줄 | 현재 문구 | 보이는 곳 |
|---|---|---|---|
| `app/era/EraMemoryEditor.tsx` | 149 | "녹음 미리 듣기 (임시)" | 시대 사건 회상 입력에서 녹음한 뒤 미리 듣기 칸 — `/era` 펼친 사건 · `/life-timeline` 시대 배경 카드 · 첫 사건 카드 |
