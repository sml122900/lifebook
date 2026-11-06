// My Life 화면 문구 — 확정: 메뉴 이름 "My Life"(2026-11-01) · 지도·목록 공통·패널 이동·빈 화면·패널 정보·낭독 이름(2026-11-04)
// · 이야기 상세 body 63키·editBody(2026-11-04). 나머지(Q69·인물록·장소록·찾기·선택 줄·이동 줄·차례 보기·장소 묶음·edit)는
// 묶음 주석에 [임시 — 성민 확정 필요]. 설계 docs/phase/node-graph-self.md §4.5 "My Life" 행.
// 클라이언트에서도 쓰는 순수 모듈.

import { withJosa } from "./josa";

export const MY_LIFE_COPY = {
  // 확정(성민 2026-11-01)
  menuLabel: "My Life",
  pageTitle: "My Life",

  // ── 지도·목록 공통 — 확정(성민 2026-11-04). "지금 보는 곳" 줄·간선 끄기 토글은 우주 개편 U1 에서 뺐다(ui-space §6.2·Q114 — 지도 낭독 이름 space.regionAt 로). ──
  menuHint: "내 인생을 한 장의 지도로",
  mapListLabel: "My Life — 시기 순서",
  mapRegionLabel: "My Life 지도",
  listStories: "이야기",
  fitAll: "전체 보기",
  zoomIn: "크게 보기",
  zoomOut: "작게 보기",
  zoomAnnounce: (percent: number) => `지금 ${percent}%`,
  toList: "목록으로 보기",
  chatEntry: "이야기 나누기", // My Life 개편 2단계 — 채팅 진입
  toMap: "지도로 보기",
  unfold: (n: number) => `이야기 ${n}개 펼치기`, // 접히는 것은 시기 아래 이야기뿐(lib/my-life-layout fold count)
  fold: "이야기 접기",
  unfoldAll: "모두 펼치기",
  yearsLater: (n: number) => `${n}년 뒤`,
  yearUnknown: "연도 모름",
  selfTag: "그때의 나",
  kindPerson: "사람",
  kindPlace: "장소",
  alsoElsewhereShort: "다른 시기에도", // 이야기 노드·목록 꼬리표(폭 135px 안) — 낭독 이름(storyName)에도 붙임
  close: "닫기",
  readBody: "본문 보기", // 이야기 패널 → 이야기 상세(/my-life/story/[id], 2026-11-03 2b-3c)
  // Q69(2026-11-02) — /story-review 에서 옮긴 것. 갭 카드·이야기 고치기 글자는 옮기기 전 /story-review 문구 그대로.
  // [임시 — 성민 확정 필요](editBody 만 확정).
  suggest: "이야기 거리", // 지도 보기 [이야기 거리] 버튼·시트 제목(오늘의 인터뷰·더 들어볼까요?)
  gapsTitle: "더 들어볼까요?",
  gapInProgress: "진행 중",
  gapStart: "이야기하기",
  gapContinue: "이어서 이야기하기",
  // 확정(성민 2026-11-04) — 이야기 패널 두 버튼이 같이 씀: 소제목·사진이 든 글 = 글 고치기 화면으로, 그 밖 = 패널 안에서 바로 고치기.
  editBody: "글 고치기",
  bodyLabel: "이야기 내용",
  saveBody: "저장",
  savingBody: "저장 중…",
  editBodyFailed: "고치지 못했어요.",
  editBodyRetry: "처리 중 문제가 있었어요. 화면을 새로고침할게요.",
  // 이야기 상세·블로그식 글 고치기·이전 판(2b-3c, 2026-11-03 — lib/node-body) — 성민 확정(2026-11-04 — 60키 + 충돌 보존 3키·errConflictOnly)
  body: {
    backToMap: "My Life로 돌아가기",
    edit: "글 고치기",
    history: (n: number) => `이전 판 ${n}개`,
    photosTitle: "이 이야기의 사진",
    peopleTitle: "함께 나온 분",
    placesTitle: "이야기에 나온 곳",
    photoGone: "사진이 지워졌어요",
    richNote: "소제목이나 사진이 있는 글은 [글 고치기]에서 고칠 수 있어요.",
    // 인물 패널·인물 글
    personWrite: "이 분 이야기 쓰기",
    personEdit: "이 분 이야기 고치기",
    personTitle: (name: string) => `${name} — 이야기`,
    personIntro: "이 분과의 일, 이 분에 대해 하고 싶은 말을 자유롭게 적어 보세요.",
    // 편집
    editTitle: "글 고치기",
    paragraphLabel: (n: number) => `문단 ${n}`,
    headingLabel: (n: number) => `소제목 ${n}`,
    photoLabel: (n: number) => `사진 ${n}`,
    captionLabel: "사진 설명(적지 않아도 돼요)",
    addParagraph: "문단 추가",
    addHeading: "소제목 추가",
    addPhoto: "사진 넣기",
    up: "위로",
    down: "아래로",
    remove: "빼기",
    removeNote: "글에서만 빼요. 사진은 지워지지 않아요.",
    pickTitle: "이미 올린 사진에서 고르기",
    pickNone: "넣을 수 있는 사진이 없어요.",
    upload: "새 사진 올리기",
    uploadHint: "jpeg·png·webp, 10MB까지",
    uploading: "올리는 중…",
    uploadFailed: "사진을 올리지 못했어요. 다시 해 주세요.",
    uploadTooBig: "사진은 10MB까지 올릴 수 있어요.",
    uploadHeic: "아이폰 사진(HEIC)은 아직 올릴 수 없어요. 아이폰 설정 > 카메라 > 포맷에서 '높은 호환성'으로 바꾼 뒤 다시 올려 주세요.",
    uploadGps: "사진 속 위치 정보를 지우고 올리는데, 이 사진은 지우지 못해 올리지 않았어요. 다른 사진으로 해 주세요.",
    pickClose: "닫기",
    emptyDoc: "아직 적은 글이 없어요. 아래 [문단 추가]를 눌러 시작해 보세요.",
    save: "저장",
    saving: "저장하는 중…",
    cancel: "취소",
    unsaved: "저장하지 않은 글이 있어요. 나가면 고친 내용이 사라져요.",
    unsavedLeave: "저장 안 하고 나가기",
    unsavedStay: "계속 고치기",
    // [이 노드 지우기] = My Life 이야기 패널의 실제 버튼 이름(edit.deleteNode).
    errEmpty: "글이 비어 있어요. 이야기를 지우려면 My Life에서 [이 노드 지우기]를 눌러 주세요.",
    errTooLong: "문단은 3,000자, 소제목은 40자, 사진 설명은 200자까지 적을 수 있어요. 문단·소제목·사진은 모두 60개까지예요.",
    // 충돌(2026-11-04) — 고치던 글을 이전 판(저장되지 않은 글)으로 남긴 때.
    errConflict: "다른 창이나 기기에서 먼저 고쳤어요. 고치던 글은 이전 판에 남겨 뒀어요. 다시 불러온 뒤 고쳐 주세요.",
    // 고치던 글을 못 남긴 때(빈 글·실패)와 이전 판 되돌리기 충돌 — 2026-11-04 확정한 옛 errConflict 문구 그대로.
    errConflictOnly: "다른 창이나 기기에서 먼저 고쳤어요. 다시 불러온 뒤 고쳐 주세요.",
    reload: "다시 불러오기",
    // 고치던 글을 못 남긴 충돌 뒤 [다시 불러오기] — 다시 불러오기 전 확인(버튼 = reload·unsavedStay).
    reloadLoseAsk: "고치던 글이 사라져요. 그래도 다시 불러올까요?",
    errBadPhoto: "넣을 수 없는 사진이 있어요. 그 사진을 빼고 다시 저장해 주세요.",
    errFailed: "저장하지 못했어요. 다시 해 주세요.",
    // 이전 판
    historyTitle: "이전 판",
    historyIntro: "글을 고칠 때마다 바뀌기 전 글을 20개까지 남겨 둬요.",
    historyEmpty: "아직 이전 판이 없어요.",
    historyWhen: (when: string) => `${when}까지의 글`,
    // 충돌로 저장되지 않은 글을 남긴 판의 머리 줄(2026-11-04).
    historyUnsaved: (when: string) => `${when} 저장되지 않은 글`,
    historyChars: (n: number) => `${n}자`,
    historyShow: "보기",
    historyHide: "접기",
    historyPhoto: "(사진)",
    restore: "이 판으로 되돌리기",
    restoreAsk: "지금 글은 이전 판으로 남아 다시 되돌릴 수 있어요. 이 판으로 되돌릴까요?",
    restoreYes: "되돌리기",
    restoreNo: "그대로 두기",
    restoring: "되돌리는 중…",
  },
  // 패널 이동·빈 화면 — 확정(성민 2026-11-04)
  openPerson: "이 분 자세히 보기", // 사람 패널 → /people/[id]
  openMap: "지도 앱에서 열기", // 장소 패널 → 네이버·구글 지도 새 창(뒤 "↗" 는 화면 코드)
  emptyTitle: "아직 지도에 담을 이야기가 없어요",
  emptyDesc: "이야기를 나누면 인생의 시기들이 여기에 하나씩 생겨요.",
  emptyCta: "이야기 나누기",
  // 패널 소제목·글자 — 확정(성민 2026-11-04)
  panelStories: (n: number) => `이야기 ${n}`,
  panelPeople: (n: number) => `사람 ${n}`,
  panelPlaces: (n: number) => `장소 ${n}`,
  panelPeriodPeople: "이 시기의 분들", // 시기 패널 사람 목록 제목
  panelPeriodPlaces: "이 시기의 장소", // 시기 패널 장소 목록 제목
  panelWithPeople: "함께 나온 분", // 이야기 패널 사람 목록 제목(이야기 상세 body.peopleTitle 과 같은 글)
  panelWithPlaces: "이야기에 나온 곳", // 이야기 패널 장소 목록 제목(이야기 상세 body.placesTitle 과 같은 글)
  panelAlsoIn: (events: string) => `다른 시기에도 있어요: ${events}`, // 이야기 패널 — 추가 소속 시기들
  panelMembers: "모임 사람들",
  panelRelation: "관계",
  panelMetYear: "만난 해",
  panelAddress: "주소",
  // 버튼 이름(화면 낭독용) — 종류 + 이름 + 수 — 확정(성민 2026-11-04)
  eventName: (yearText: string, label: string, stories: number, others: number) =>
    `${yearText} ${label}, 이야기 ${stories}, 사람·장소 ${others}`,
  // tag = 화면 꼬리표(다른 시기에도)가 보이면 낭독 이름 끝에도. 그때의 나 이야기는 꼬리표가 늘 "그때의 나"라 selfName 에 이미 있음.
  storyName: (lead: string, withNames: string[], tag?: string | null) =>
    (withNames.length > 0 ? `이야기, ${lead}, 함께: ${withNames.join(", ")}` : `이야기, ${lead}`) + (tag ? `, ${tag}` : ""),
  selfName: (lead: string, withNames: string[]) =>
    withNames.length > 0 ? `그때의 나, ${lead}, 함께: ${withNames.join(", ")}` : `그때의 나, ${lead}`,
  // 인물록·장소록(My Life 개편 1단계) — [임시 — 성민 확정 필요]
  peopleTitle: "인물록",
  placesTitle: "장소록",
  noGroup: "모임 없는 분",
  otherGroups: (n: number) => `+${n}`,
  otherGroupsLong: (n: number) => `다른 모임 ${n}개`,
  groupChipShown: "✓",
  groupEmpty: "아직 아무도 없어요",
  selectedLine: (name: string, n: number) => `선택 — ${name} · 연결 ${n}`,
  clearSelection: "선택 풀기",
  find: "찾기",
  findTitle: "기록 찾기",
  findPlaceholder: "이름이나 이야기 속 낱말",
  findNone: "찾는 기록이 없어요",
  findCount: (n: number) => `${n}개 찾았어요`,
  kindEvent: "시기",
  kindStory: "이야기",
  kindGroup: "모임",
  toPeople: "인물록",
  toPlaces: "장소록",
  toTimeline: "시간 줄기",
  toRelated: (n: number) => `연결된 곳 차례로 보기(${n})`,
  // 차례 보기 진행 중 — 선택 줄(3단계 최종 E2E 2026-11-02). 진행 표시는 줄 앞(좁은 화면에서 이름이 잘려도 남게).
  tourLine: (at: number, n: number, name: string) => `연결 ${at}/${n} · ${name}`,
  tourNext: "다음 연결",
  tourBack: "처음으로", // 마지막 다음 — 고른 노드로 돌아가고 차례 보기 끝
  tourBackLabel: (name: string) => `처음 노드로 돌아가기 — ${name}`,
  inStory: (title: string) => `‘${title}’ 이야기에 나와요`, // 시기 패널 — 시기에 바로 잇지 않고 이야기에서만 나온 분·곳
  moveBarLabel: "지도에서 가기", // 도구줄 이동 줄(시간 줄기·인물록·장소록) 이름(화면 낭독용)
  panelStoriesWith: "나온 이야기",
  panelEventsWith: "그 시기",
  panelGroups: "모임",
  goThere: "여기로 가기",
  personName2: (name: string, groups: string[], stories: number) =>
    `사람, ${name}${groups.length ? `, 모임 ${groups.join("·")}` : ""}, 이야기 ${stories}`,
  placeName2: (name: string, stories: number) => `장소, ${name}, 이야기 ${stories}`,
  groupLabelName: (name: string, n: number) => `모임, ${name}, ${n}명`,
  groupChipName: (name: string, shown: boolean) => (shown ? `모임 ${name}, 지도에 보이는 중` : `모임 ${name}, 지도에 보이기`),

  // 장소 묶음(My Life 개편 3단계) — [임시 — 성민 확정 필요]
  kindPlaceGroup: "장소 묶음",
  noPlaceGroup: "묶음 없는 곳",
  panelPlaceMembers: "묶음 안 장소",
  panelPlaceGroups: "장소 묶음",
  placeGroupEmpty: "아직 넣은 곳이 없어요",
  placeGroupLabelName: (name: string, n: number) => `장소 묶음, ${name}, ${n}곳`,
  placeGroupChipName: (name: string, shown: boolean) => (shown ? `장소 묶음 ${name}, 지도에 보이는 중` : `장소 묶음 ${name}, 지도에 보이기`),

  // 지도에서 직접 만들기·넣기·빼기·옮기기·지우기(My Life 개편 3단계) — 전부 [임시 — 성민 확정 필요]
  edit: {
    create: "만들기", // 머리 줄 [+ 만들기] — 앞의 + 는 아이콘
    createTitle: "무엇을 만들까요?",
    kinds: {
      period: "시기",
      story: "이야기",
      self: "그때의 나",
      person: "사람",
      place: "장소",
      group: "모임",
      placeGroup: "장소 묶음",
    },
    kindHints: {
      period: "이사·직장처럼 인생의 한 시기",
      story: "있었던 일 하나",
      self: "그때 나는 어떤 사람이었는지",
      person: "함께한 분",
      place: "기억 속 장소",
      group: "사람 여럿을 한 모임으로",
      placeGroup: "장소 여럿을 한 묶음으로",
    },
    regionAddPerson: "사람",
    regionAddGroup: "모임",
    regionAddPlace: "장소",
    regionAddPlaceGroup: "묶음",
    regionAddName: (what: string) => `${what} 만들기`,
    fieldName: "이름",
    fieldYear: "연도 (모르면 비워 두세요)",
    fieldEndYear: "끝난 연도 (선택)",
    fieldPeriod: "어느 시기의 이야기인가요?",
    fieldTitle: "제목 (선택)",
    fieldBody: "이야기",
    fieldSelfBody: "그때의 나는 어떤 사람이었나요?",
    fieldRelation: "관계 (선택)",
    fieldGroups: "모임 (선택)",
    fieldPeople: "함께한 분 (선택)",
    fieldSelfPeople: "누구와 함께일 때의 나인가요? (선택)",
    fieldPlaces: "장소 (선택)",
    fieldMembers: "넣을 분 (선택)",
    fieldPlaceMembers: "넣을 장소 (선택)",
    placeByName: "이름만 적기",
    placeBySearch: "지도에서 찾기",
    save: "만들기",
    saving: "저장하는 중…",
    cancel: "취소",
    back: "뒤로",
    created: (what: string) => `${what}${withJosa(what, "을/를")} 만들었어요.`,
    reused: (name: string) => `이미 있는 ${name}${withJosa(name, "으로/로")} 했어요.`,
    linked: "넣었어요.",
    alreadyLinked: "이미 들어 있어요.",
    undo: "되돌리기",
    undone: "되돌렸어요.",
    sameNameQuestion: (name: string) => `이미 계신 ${name} 님과 같은 분인가요?`,
    samePerson: "같은 분이에요",
    differentPerson: "다른 분이에요",
    // 패널 버튼
    addStory: "이야기 추가",
    talkStory: "말로 이야기하기",
    writeStory: "직접 쓰기",
    addPerson: "인물 넣기",
    addPlace: "장소 넣기",
    addGroup: "모임 넣기",
    addToGroup: "모임에 넣기",
    addToPlaceGroup: "묶음에 넣기",
    addMember: "사람 넣기",
    pickTitle: (what: string) => `${what} 고르기`,
    pickNone: "넣을 수 있는 항목이 없어요.",
    pickSearch: "이름 찾기",
    pickNew: "새로 만들기",
    moveStory: "다른 시절로 옮기기",
    moveTitle: "어느 시절로 옮길까요?",
    hereNow: "지금 여기",
    moveConfirm: (lead: string, label: string) => `‘${lead}’ 이야기를 ${label}${withJosa(label, "으로/로")} 옮길까요?`,
    moveDo: "옮기기",
    moved: "옮겼어요.",
    remove: "빼기",
    removeConfirm: (name: string) => `${name}${withJosa(name, "을/를")} 여기서 뺄까요? 연결만 끊고, 지우지는 않아요.`,
    removeDo: "뺄게요",
    removed: "뺐어요.",
    subjectNote: "이 이야기의 주인공이라 뺄 수 없어요.",
    deleteNode: "이 노드 지우기",
    deleteTitle: (name: string) => `${name}${withJosa(name, "을/를")} 지울까요?`,
    // 이어진 것 중 0 이 아닌 것만(parts = linkStories·linkPeople·linkPlaces 결과).
    deleteLinked: (parts: string[]) => {
      const last = parts[parts.length - 1] ?? "";
      return `${parts.join(" · ")}${withJosa(last, "과/와")}의 연결도 사라져요.`;
    },
    deleteNoLinks: "이어진 이야기·사람·장소는 없어요.",
    linkStories: (n: number) => `이야기 ${n}개`,
    linkPeople: (n: number) => `사람 ${n}명`,
    linkPlaces: (n: number) => `장소 ${n}곳`,
    deleteStoriesToo: (n: number) => `이 시기의 이야기 ${n}개도 함께 지워져요.`,
    deleteFamily: (n: number) => `가족이 남긴 댓글·반응 ${n}개도 함께 지워져요.`,
    deleteIrreversible: "지우면 되돌릴 수 없어요.",
    deleteDo: "지우기",
    deleted: "지웠어요.",
    // 3단계 E2E 후속 2(2026-11-02) — 지운 뒤 지도 머리 줄·목록 위 알림 · 장소 지우기 확인창의 장소 묶음 수
    deletedName: (name: string) => `${name}${withJosa(name, "을/를")} 지웠어요.`,
    deletePlaceGroups: (n: number) => `장소 묶음 ${n}개에서도 빠져요.`,
    deleteSkeletonNote: "처음 정한 시기는 지울 수 없어요.",
    personDeleteNote: "사람은 인물록에서 지울 수 있어요.",
    personDeleteLink: "인물록에서 지우기",
    // 오류(lib/my-life-edit)
    notFound: "찾을 수 없어요. 화면을 닫았다가 다시 열어 주세요.",
    alreadyPrimary: "이 이야기가 이미 속한 시기예요.",
    cannotLink: "이 둘은 이을 수 없어요.",
    cannotUnlink: "빼지 못했어요. 다시 해 주세요.",
    cannotUndo: "되돌리지 못했어요. 다시 해 주세요.",
    cannotRemovePrimary: "이 이야기가 속한 시기는 뺄 수 없어요. [다른 시절로 옮기기]를 써 주세요.",
    cannotRemoveSubject: "이 이야기의 주인공이라 뺄 수 없어요.",
    needName: "이름을 적어 주세요.",
    tooLong: (n: number) => `${n}자까지 적을 수 있어요.`,
    badYear: "연도를 다시 확인해 주세요.",
    badEndYear: "끝난 연도는 시작 연도와 같거나 뒤여야 해요.",
    needBody: "이야기를 적어 주세요.",
    pickPeriod: "시기를 골라 주세요.",
    repickSame: "같은 분을 다시 골라 주세요.",
    failed: "저장하지 못했어요. 다시 해 주세요.",
  },

  // 우주 개편 U1(2026-11-05 — docs/phase/ui-space.md §1·§3) — 확정 2026-11-05(성민). 아래 space 전부 확정.
  space: {
    regionAt: (period: string) => `My Life 지도 — 지금 보는 시기: ${period}`, // "지금 보는 곳" 줄을 뺀 대신(§6.2)
    satName: (name: string, kind: "person" | "group" | "place") =>
      kind === "place" ? `${name} — 장소록에 있는 곳` : kind === "group" ? `${name} — 모임` : `${name} — 인물록에 있는 분`,
    satMore: (n: number) => `${n}개 더 — 패널에서 모두 보기`,
    // 공전(U2 — ui-space §2·§9).
    motionStop: "움직임 멈추기", // 도구줄 버튼 낭독 이름(Q112 A — 멈춤 아이콘)
    motionStart: "움직이기", // 멈춘 뒤 같은 버튼(재생 아이콘)
    motionStopped: "지도의 움직임을 멈췄어요.", // 알림(aria-live)
    motionStarted: "지도가 다시 움직여요.",
    fitAllShort: "전체", // 도구줄 [전체 보기] 줄인 글(Q112 A — 낭독 이름은 fitAll 그대로)
    goOrigin: "원래 자리로 가기", // 위성에서 연 사람·장소·모임 패널 — 인물록·장소록의 그 자리로(§2.3)
    // 끌어 넣기(U3 — ui-space §4·§9). dropped 의 을/를 = 넣은 것 이름의 받침·읽는 소리(lib/josa).
    grabHint: (name: string) => `${name} — 넣을 이야기나 시기 위에 놓으세요`, // 집었을 때 낭독(aria-live)
    dropped: (name: string, target: string) => `${target}에 ${name}${withJosa(name, "을/를")} 넣었어요.`, // 지도 위 알림(+ [되돌리기])
    dropFar: "놓을 곳이 멀어서 제자리로 돌아왔어요.",
    dropCancel: "넣지 않았어요.", // 끄는 중 두 번째 손가락·취소
    dropFailed: "넣지 못했어요. 다시 해 주세요.", // 낙관적 반영에서 궤도에 든 뒤 저장이 실패해 위성이 빠지고 튕겨 제자리(U3 후속)
    addRowShow: "넣을 것 보기", // 행성 패널 — "넣을 것" 줄 펼치기(Q116)
    addRowHide: "넣을 것 접기",
    addRowTitle: "넣을 것",
    addRowHint: "누르면 바로 넣어요. 길게 눌러 위 행성으로 끌어 올려도 돼요.",
    addRowItem: (name: string) => `${name} 넣기`, // 줄 안 버튼 낭독 이름
    // 행성 꾸미기(U4 — ui-space §5·§7.5). 꾸미기 이름 8개 — lib/space-decor.ts.
    decorate: "꾸미기", // 행성 패널 — 꾸미기 고르기 펼치기
    decorateHide: "꾸미기 접기",
    decorHint: "고르면 바로 행성에 붙어요. 하나만 달 수 있어요.",
    decorClear: "꾸미기 없애기",
    decorSet: (name: string) => `${name} 꾸미기를 달았어요.`, // 패널 알림(+ [되돌리기])
    decorCleared: "꾸미기를 없앴어요.",
    decorFailed: "꾸미지 못했어요. 다시 해 주세요.", // 낙관적 반영 — 저장이 실패해 원래대로
  },
};
