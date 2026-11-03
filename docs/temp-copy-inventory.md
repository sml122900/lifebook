# 임시 문구 목록 (2026-11-02)

> 갱신 2026-11-03(개정 공지 — `lib/policy-notice-copy.ts` 4키, 아래 "개정 공지") · 2026-11-03(이야기 상세·글 고치기·이전 판·인물 글 — `lib/my-life-copy.ts` `body` 60키, 아래 "2b-3c 추가" · `hideBody` 삭제) · 2026-11-03(가입 전 동의 화면 `/join` 신설 — `lib/join-copy.ts` 13키, 아래 "가입 전 동의" · 동의 항목 문구는 확정된 /consent 문구를 같이 씀) · 2026-11-03(인물 확인 화면 삭제와 함께 `lib/node-confirm-copy.ts` 32키 전부 — 확인 화면·My Life "정리할 것" 카드·인터뷰 요약 카드 — 와 My Life 확인 대기 표시 4키 삭제, 설계 §15.6) · 2026-11-02(안 쓰는 키 7개 삭제 · 카드 오류 문구 6개를 `lib/free-chat-copy.ts` 로 옮김 반영) · 2026-11-02 My Life 개편 3단계(장소 묶음 7키 + 직접 만들기 `edit` 블록 103키 — 아래 "3단계 추가", 전부 임시) · 2026-11-02 3단계 E2E 후속(`edit.cannotUndo` 1키 — 104키) · 3단계 E2E 후속 2(`edit.deletedName`·`edit.deletePlaceGroups` — 106키, 지도 이동 줄 이름 `moveBarLabel`) · 3단계 최종 E2E(차례 보기 `tourLine`·`tourNext`·`tourBack`·`tourBackLabel` + 시기 패널 `inStory` — 5키) · 제안 카드 시기 미지정(`centerUnset`·`centerPick` — 2키) · 2026-11-03 옛 `/story-review` 본문 삭제와 함께 `storyReviewEntry`·`selfStoriesTitle` 삭제 · Q69 `/story-review` 합치기(My Life 11키 — 아래 "Q69 추가", 정리할 것·오늘의 인터뷰 문구의 보이는 곳 → My Life · Q69 후속에 그때의 나 묶음 제목은 화면에서 빠짐). 앱에 남은 `[임시 — 성민 확정 필요]` 문구 전부. **문구는 고치지 않았다** — 확정 문구는 성민이 준다. 확정되면 각 문구 파일만 고친다(로직 파일에 문구 하드코딩 없음).
> 뽑은 방법: 문구 파일 3개(2026-11-03 인물 확인 문구 파일 삭제 전엔 4개)의 키를 TypeScript 구문 트리로 읽고, 그 키를 쓰는 곳(import 별칭·`const C = …` 대입 별칭 — 대입은 그 함수 안만 — 의 `별칭.키`)을 `app/`·`lib/`·`components/` 전체에서 찾았다. 줄 번호는 이 문서를 쓴 시점(커밋 기준) 값이다.

## 요약

| 파일 | 임시 문구 | 화면에 안 나오는 키(쓰는 곳 없음) | 보이는 곳 |
|---|---|---|---|
| `lib/free-chat-copy.ts` | 62 (전부 — 카드 오류 6개는 2026-11-02 `lib/node-proposal.ts` 에서 옮겨 옴 · 시기 미지정 2개 `centerUnset`·`centerPick` 2026-11-02 추가) | 0 | `/chat-v3` 대화창 · 제안 카드(`/chat-v3`·`/interview` 마무리) |
| `lib/my-life-copy.ts` | 200 (78 + 3단계 115 + Q69 11 − 확인 대기 표시 4(2026-11-03 삭제 — `pendingTag`·`goConfirm`·`pendingNote`·`draftNote`) · 확정 4개 — 메뉴 이름 "My Life"·화면 제목 "My Life"·[인물 간선 끄기]·[장소 간선 끄기] — 제외) | 0 (`storyReviewEntry` 는 2026-11-03 옛 `/story-review` 본문과 함께 삭제) | `/my-life`(지도·목록·패널·만들기 시트) · 사이드 패널 메뉴 · `/story-review` |
| `lib/interview/copy.ts` | 42 (전부 — `selfStoriesTitle` 2026-11-03 삭제) | 0 | `/interview` · My Life "오늘의 인터뷰" 카드(Q69 전 `/story-review`) |
| `lib/join-copy.ts` | 13 (전부 — 2026-11-03 신설) | 0 | `/join`(가입 전 동의 — 제목·안내·가입 방법 버튼) |
| `lib/interview/question-pool.ts` | 문항 8개(18줄 — 구조 예시 5 + "관계별 나" 3) | — | `/interview` 질문·이야기 제목 |
| 그 밖 | 1 | — | 아래 "그 밖" |

- 화면 코드가 안 부르던 My Life 키 7개(`listBranches`·`groupTag`·`alsoElsewhere`·`personName`·`groupName`·`placeName`·`noPlaceGroup`)는 2026-11-02 삭제(성민 지시) — 지금 목록에 쓰는 곳 없는 키 0. (`noPlaceGroup` 은 3단계 장소 묶음 "묶음 없는 곳"으로 다시 씀.)
- `lib/free-chat.ts` 80~97줄의 쓰임은 앱 안내문 판정(`isAppNotice` — 구간 대화에서 안내문을 빼는 목록)이라 "보이는 곳"에 안 적었다. 이 문구를 바꾸면 판정도 저절로 따라간다.
- 문구가 아닌 임시(참고): `lib/characters.ts` 말동무 캐릭터 그림(임시 도형 Lottie), `lib/constants/education-labels.ts` 국민학교/초등학교 명칭 기준(학제 연혁 받기 전 임시 규칙).

### `lib/free-chat-copy.ts` (`FREE_CHAT_COPY`)

| 키 | 줄 | 현재 문구 | 보이는 곳 | 코드 위치 |
|---|---|---|---|---|
| `greeting` | 8 | "편하게 아무 이야기나 들려주세요. 떠오르는 대로 말씀하시면 돼요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:423, lib/free-chat.ts:84 |
| `setupDone` | 9 | "기본 칸은 다 채웠어요. 이제 편하게 이야기 나눠요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:275, lib/free-chat.ts:85 |
| `resume` | 10 | "아까 하시던 이야기, 이어서 들려주세요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:423, app/chat-v3/ChatV3Client.tsx:447, lib/free-chat.ts:86 |
| `staleNotice` | 11 | "지난번에 나누던 이야기를 남겨 둘까요?" | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:417, lib/free-chat.ts:87 |
| `chipsTitle` | 12 | "이런 이야기는 어떠세요?" | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:732 |
| `saveNow` | 13 | "지금 이야기 남기기" | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:758 |
| `proposing` | 14 | "이야기를 정리하고 있어요…" | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:485 |
| `budgetPaused` | 15 | "오늘은 이야기 친구가 쉬는 시간이에요. 내일 다시 이야기 나눠요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:449, app/chat-v3/ChatV3Client.tsx:465, app/chat-v3/ChatV3Client.tsx:492, lib/free-chat.ts:88 |
| `topicGone` | 16 | "그 이야기는 지금 들을 수 없나봐요. 다른 이야기도 편하게 해 주세요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:451, lib/free-chat.ts:89 |
| `cardFirst` | 17 | "먼저 위 카드를 정해 주세요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:445, lib/free-chat.ts:90 |
| `confirmApplied` | 18 | "네, 반영했어요. 다른 이야기도 편하게 해 주세요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:294, lib/free-chat.ts:91 |
| `confirmAlready` | 19 | "그 이야기는 이미 확인했나봐요. 다른 이야기도 편하게 해 주세요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:309, lib/free-chat.ts:92 |
| `exitAfterCard` | 20 | "카드를 정하시면 오늘은 여기까지 할게요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:630, app/chat-v3/ChatV3Client.tsx:635, lib/free-chat.ts:93 |
| `cardTitle` | 23 | "이 이야기를 남길까요?" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:166, app/components/ProposalCard.tsx:167 |
| `fieldTitle` | 24 | "제목" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:172, app/components/ProposalCard.tsx:276 |
| `titlePlaceholder` | 25 | "비워 두면 내용 첫 문장이 제목이 돼요" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:281 |
| `fieldCenter` | 26 | "시기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:176, app/components/ProposalCard.tsx:287, app/components/ProposalCard.tsx:294 |
| `fieldPeople` | 27 | "사람" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:180, app/components/ProposalCard.tsx:339 |
| `fieldPlaces` | 28 | "장소" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:220, app/components/ProposalCard.tsx:383 |
| `fieldSummary` | 29 | "내용" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:260, app/components/ProposalCard.tsx:419, app/components/ProposalCard.tsx:420 |
| `existingPerson` | 30 | "이미 계신 분" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:188 |
| `newTag` | 31 | "새로" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:188, app/components/ProposalCard.tsx:228 |
| `existingPlace` | 32 | "이미 있는 곳" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:228 |
| `newCenter` | 33 | `` (label: string, year: number \| null) => `${year ? `${year} ` : ""}${label} (새 시기)` `` | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:162 |
| `centerText` | 34 | `` (label: string, year: number \| null) => `${year ? `${year} ` : ""}${label}` `` | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:160, app/components/ProposalCard.tsx:306 |
| `centerUnset` | 36 | "아직 못 정했어요 — [고치기]에서 골라 주세요" | 제안 카드 시기 줄 — 시기 미지정 카드(시기 id·이름이 안 맞음, 2026-11-02 추가) | app/components/ProposalCard.tsx:164 |
| `centerPick` | 37 | "시기 고르기" | 제안 카드 [고치기] 시기 고르기 첫 칸 — 시기 미지정 카드(2026-11-02 추가) | app/components/ProposalCard.tsx:313 |
| `none` | 35 | "없음" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:182, app/components/ProposalCard.tsx:223 |
| `showMore` | 36 | "내용 더 보기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:268 |
| `showLess` | 37 | "내용 접기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:268 |
| `create` | 38 | "만들기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:438 |
| `edit` | 39 | "고치기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:448 |
| `decline` | 40 | "안 만들기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:451 |
| `cancelEdit` | 41 | "고치기 그만" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:448 |
| `remove` | 42 | "빼기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:373, app/components/ProposalCard.tsx:409 |
| `addPerson` | 43 | "사람 더하기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:378 |
| `addPlace` | 44 | "장소 더하기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:414 |
| `newCenterOption` | 45 | "새 시기 만들기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:309 |
| `newCenterLabel` | 46 | "새 시기 이름" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:315, app/components/ProposalCard.tsx:316 |
| `newCenterYear` | 47 | "연도 (모르면 비워 두세요)" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:323, app/components/ProposalCard.tsx:324 |
| `personName` | 48 | "이름" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:344, app/components/ProposalCard.tsx:345 |
| `personRelation` | 49 | "관계 (예: 친구)" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:359, app/components/ProposalCard.tsx:360 |
| `placeName` | 50 | "장소 이름" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:388, app/components/ProposalCard.tsx:389 |
| `sameNameQuestion` | 51 | `` (name: string, relation: string \| null) => `이미 계신 ${name}${relation ? `(${relation})` : ""} 님과 같은 분인가요?` `` | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:194 |
| `same` | 53 | "같은 분이에요" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:201 |
| `different` | 54 | "다른 분이에요" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:211 |
| `answerAskFirst` | 55 | "같은 분인지 먼저 골라 주세요." | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:112, app/components/ProposalCard.tsx:130 |
| `samePlaceQuestion` | 56 | `` (name: string) => `이미 있는 장소 ${name}${withJosa(name, "과/와")} 같은 곳인가요?` `` | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:234 |
| `samePlace` | 57 | "같은 곳이에요" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:241 |
| `separatePlace` | 58 | "따로 만들기" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:251 |
| `answerPlaceAskFirst` | 59 | "같은 곳인지 먼저 골라 주세요." | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:112, app/components/ProposalCard.tsx:130 |
| `createFailed` | 60 | "남기지 못했어요. 다시 해 주세요." | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:132, app/components/ProposalCard.tsx:137, app/components/ProposalCard.tsx:150 |
| `needSummary` | 62 | "내용이 필요해요." | 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:431 |
| `needCenter` | 63 | "시기를 골라 주세요." | 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:437 |
| `centerNotFound` | 64 | "그 시기를 찾지 못했어요." | 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:443 |
| `needNewCenterLabel` | 65 | "새 시기 이름이 필요해요." | 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:447 |
| `repickSamePerson` | 66 | "같은 분을 다시 골라 주세요." | 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:474 |
| `repickSamePlace` | 67 | "같은 곳을 다시 골라 주세요." | 제안 카드 아래 빨간 글씨(서버가 돌려줌 — /chat-v3·/interview) | lib/node-proposal.ts:504 |
| `created` | 68 | `` (title: string) => `'${title}' 이야기를 My Life 에 남겼어요.` `` | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:510, lib/free-chat.ts:96 |
| `viewOnMap` | 69 | "My Life 에서 보기" | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:695 |
| `declined` | 70 | "네, 남기지 않을게요." | /chat-v3 대화창 | app/chat-v3/ChatV3Client.tsx:528, lib/free-chat.ts:94 |
| `saving` | 71 | "남기는 중이에요…" | 제안 카드(/chat-v3 · /interview 마무리) | app/components/ProposalCard.tsx:433 |

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
| `editBody` | 50 | "이야기 고치기" | 이야기 패널 | app/my-life/MyLifeView.tsx:2094 |
| `bodyLabel` | 51 | "이야기 내용" | 이야기 패널 본문 칸(화면 낭독) | app/my-life/MyLifeView.tsx:2100 |
| `saveBody` | 52 | "저장" | 이야기 패널 고치기 | app/my-life/MyLifeView.tsx:2117 |
| `savingBody` | 53 | "저장 중…" | 이야기 패널 고치기 | app/my-life/MyLifeView.tsx:2117 |
| `editBodyFailed` | 54 | "고치지 못했어요." | 이야기 패널 고치기 오류(서버 문구가 없을 때) | app/my-life/MyLifeView.tsx:2061 |
| `editBodyRetry` | 55 | "처리 중 문제가 있었어요. 화면을 새로고침할게요." | 이야기 패널 고치기 — 응답 실패 | app/my-life/MyLifeView.tsx:2070 |

#### 2b-3c 추가(2026-11-03 — 이야기 상세·블로그식 글 고치기·이전 판·인물 글, `MY_LIFE_COPY.body` 60키 전부 `[임시 — 성민 확정 필요]`)

| 묶음 | 키 | 보이는 곳 |
|---|---|---|
| 상세(8) | `backToMap` "My Life 로 돌아가기" · `edit` "글 고치기" · `history(n)` "이전 판 n개" · `photosTitle` "이 이야기의 사진" · `peopleTitle` "함께 나온 분" · `placesTitle` "나온 곳" · `photoGone` "사진이 지워졌어요" · `richNote` "소제목이나 사진이 있는 글이라 글 고치기 화면에서 고쳐요."(이야기 패널) | `/my-life/story/[id]` · 이야기 패널 |
| 인물 글(4) | `personWrite` "이 분 이야기 쓰기" · `personEdit` "이 분 이야기 고치기" · `personTitle(name)` "○○ — 이야기" · `personIntro` | 사람 패널 · `/my-life/person/[id]/edit` |
| 편집(35) | `editTitle` · `paragraphLabel(n)` "문단 n" · `headingLabel(n)` · `photoLabel(n)` · `captionLabel` · `addParagraph` "문단 추가" · `addHeading` "소제목 추가" · `addPhoto` "사진 넣기" · `up` "위로" · `down` "아래로" · `remove` "빼기" · `removeNote` · `pickTitle` · `pickNone` · `upload` "새 사진 올리기" · `uploadHint` · `uploading` · `uploadFailed` · `uploadTooBig` · `uploadHeic` · `uploadGps` · `pickClose` · `emptyDoc` · `save` · `saving` · `cancel` · `unsaved` · `unsavedLeave` · `unsavedStay` · `errEmpty` · `errTooLong` · `errConflict` · `reload` "다시 불러오기" · `errBadPhoto` · `errFailed` | `…/story/[id]/edit` · `…/person/[id]/edit`(app/my-life/_body/BodyEditor.tsx) |
| 이전 판(13) | `historyTitle` "이전 판" · `historyIntro` · `historyEmpty` · `historyWhen(when)` "○에 바뀌기 전 글" · `historyChars(n)` "n자" · `historyShow` "보기" · `historyHide` "접기" · `historyPhoto` "(사진)" · `restore` "이 판으로 되돌리기" · `restoreAsk` · `restoreYes` "되돌리기" · `restoreNo` "그대로 두기" · `restoring` | `…/history`(app/my-life/_body/RevisionList.tsx·HistoryPage.tsx) |

### `lib/join-copy.ts` (`JOIN_COPY`) — 가입 전 동의(2026-11-03)

| 키 | 현재 문구 | 보이는 곳 |
|---|---|---|
| `title` | "가입하기 전에" | /join 제목 |
| `desc` | "라이프북을 쓰시려면 아래 세 가지에 동의해 주세요. 동의하신 뒤 가입 방법을 고르시면 바로 이어서 가입돼요." | /join 안내 |
| `bounced` | `` (method) => `처음 오셨네요. 동의해 주시면 ${method}로 바로 이어서 가입돼요.` `` | /join?provider= — 로그인 화면 소셜 버튼으로 왔는데 아직 계정이 없을 때 · 동의 없이 /signup 에 왔을 때 |
| `consentError` | "필수 항목 세 가지에 모두 동의해 주세요." | /join?error=consent(서버가 동의 누락을 거부했을 때) |
| `methodsTitle` | "가입 방법 고르기" | /join 소제목 |
| `methodName` | 카카오 · 네이버 · 구글 · 이메일 | `bounced` 안 |
| `kakao`·`naver`·`google`·`email` | "카카오로 가입하기" · "네이버로 가입하기" · "Google로 가입하기" · "이메일로 가입하기" | /join 가입 버튼 |
| `needAll` | "위 세 가지에 모두 동의하시면 가입 버튼을 누를 수 있어요." | /join(동의 전) |
| `pending` | "이어서 가는 중…" | /join 가입 버튼(제출 중) |
| `toLogin` | "이미 가입하셨나요? 로그인하기" | /join 아래 링크 |

### `lib/policy-notice-copy.ts` (`POLICY_NOTICE_COPY`) — 개정 공지(2026-11-03, 전부 `[임시 — 성민 확정 필요]`)

개정이 `lib/policy-notice.ts` 에 등록됐을 때만 보인다(지금 등록 0 — 화면에 안 나옴, 첫 사용 v1.4).

| 키 | 현재 문구 | 보이는 곳 |
|---|---|---|
| `bar(n)` | "개인정보 처리방침(v1.4)은 2026년 ○월 ○일부터 바뀌어요. (바뀌는 점)" / 시행 뒤 "…바뀌었어요." | 로그인한 화면 헤더 아래 띠(app/components/PolicyNoticeBar.tsx) |
| `more` | "자세히 보기" | 띠 버튼 |
| `close` | "닫기" | 띠 버튼 |
| `pageLine(n)` | "개정 안내 — 개인정보 처리방침(v1.4)은 2026년 ○월 ○일부터 시행됩니다. (바뀌는 점)" / 시행 뒤 "…시행되었습니다." | /privacy 맨 위(app/privacy/page.tsx) |
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

### 그 밖

| 파일 | 줄 | 현재 문구 | 보이는 곳 |
|---|---|---|---|
| `app/era/EraMemoryEditor.tsx` | 149 | "녹음 미리 듣기 (임시)" | 시대 사건 회상 입력에서 녹음한 뒤 미리 듣기 칸 — `/era` 펼친 사건 · `/life-timeline` 시대 배경 카드 · 첫 사건 카드 |
