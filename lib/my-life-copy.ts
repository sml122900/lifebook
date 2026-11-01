// My Life 화면 문구 — 메뉴 이름 "My Life" 만 성민 확정 문구, 나머지는 전부
// [임시 — 성민 확정 필요]. 설계 docs/phase/node-graph-self.md §4.5 "My Life" 행.
// 클라이언트에서도 쓰는 순수 모듈.

export const MY_LIFE_COPY = {
  // 확정(성민 2026-11-01)
  menuLabel: "My Life",
  pageTitle: "My Life",

  // ── 아래는 전부 [임시 — 성민 확정 필요] ──
  menuHint: "내 인생을 한 장의 지도로",
  storyReviewEntry: "My Life 로 보기",
  mapListLabel: "My Life — 시기 순서",
  mapRegionLabel: "My Life 지도",
  listStories: "이야기",
  listBranches: "사람·모임·장소",
  nowViewing: (where: string) => `지금 보는 곳: ${where}`,
  nowViewingNone: "지금 보는 곳: 처음",
  fitAll: "전체 보기",
  zoomIn: "크게 보기",
  zoomOut: "작게 보기",
  zoomAnnounce: (percent: number) => `지금 ${percent}%`,
  toList: "목록으로 보기",
  toMap: "지도로 보기",
  unfold: (n: number) => `가지 ${n}개 펼치기`,
  fold: "가지 접기",
  unfoldAll: "모두 펼치기",
  yearsLater: (n: number) => `${n}년 뒤`,
  yearUnknown: "연도 모름",
  selfTag: "그때의 나",
  groupTag: "모임",
  kindPerson: "사람",
  kindPlace: "장소",
  pendingTag: "확인 전",
  alsoElsewhere: "다른 시기에도 있어요",
  alsoElsewhereShort: "여러 시기", // 이야기 노드 꼬리표(폭 135px 안)
  close: "닫기",
  readBody: "본문 보기",
  hideBody: "본문 접기",
  goConfirm: "확인하러 가기",
  pendingNote: "이 이야기에 아직 확인하지 않은 분이 있어요.",
  openPerson: "인물록에서 보기",
  openMap: "지도에서 보기",
  emptyTitle: "아직 지도에 담을 이야기가 없어요",
  emptyDesc: "이야기를 나누면 인생의 시기들이 여기에 하나씩 생겨요.",
  emptyCta: "이야기 나누기",
  // 패널 소제목·글자
  panelStories: (n: number) => `이야기 ${n}`,
  panelPeople: (n: number) => `사람 ${n}`,
  panelPlaces: (n: number) => `장소 ${n}`,
  panelWithPeople: "함께 나온 분",
  panelWithPlaces: "나온 곳",
  panelAlsoIn: "같이 보이는 시기",
  panelMembers: "모임 사람들",
  panelRelation: "관계",
  panelMetYear: "만난 해",
  panelAddress: "주소",
  // 버튼 이름(화면 낭독용) — 종류 + 이름 + 수
  eventName: (yearText: string, label: string, stories: number, others: number) =>
    `${yearText} ${label}, 이야기 ${stories}, 사람·장소 ${others}`,
  storyName: (lead: string, withNames: string[]) =>
    withNames.length > 0 ? `이야기, ${lead}, 함께: ${withNames.join(", ")}` : `이야기, ${lead}`,
  selfName: (lead: string, withNames: string[]) =>
    withNames.length > 0 ? `그때의 나, ${lead}, 함께: ${withNames.join(", ")}` : `그때의 나, ${lead}`,
  personName: (name: string) => `사람, ${name}`,
  groupName: (name: string) => `모임, ${name}`,
  placeName: (name: string) => `장소, ${name}`,
  overviewJump: (where: string) => `${where} — 가까이 보기`,
};
