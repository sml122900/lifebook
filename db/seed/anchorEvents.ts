// 앵커(검증된 시대 사건) 시드 데이터. db/seed.ts 가 이 배열을 Event
// 테이블에 적재한다. 사실(사건명·날짜·출처)만 다루며 수동 검증됨 —
// 북극성의 "정확성 100% 보장" 원칙.
export type AnchorEventSeed = {
  year: number;
  month?: number;
  title: string;
  description: string;
  domain: string;
  region: "KR" | "GLOBAL";
  sourceName?: string;
  sourceUrl?: string;
};

// 1979–2025 를 아우르는 검증 앵커 사건들. 날짜는 공개 기록 대조로 수동
// 검증했고, 설명은 짧고 중립적으로 유지한다.
export const anchorEvents: AnchorEventSeed[] = [
  {
    year: 1979,
    month: 10,
    title: "10·26 사태 (박정희 대통령 서거)",
    description:
      "1979년 10월 26일 박정희 대통령이 중앙정보부장 김재규에게 피격되어 서거했다. 유신체제가 사실상 종결된 사건.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 1980,
    month: 5,
    title: "5·18 광주민주화운동",
    description:
      "1980년 5월 18일부터 27일까지 광주에서 신군부의 계엄 확대에 맞서 시민들이 일어난 민주화 항쟁.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 1987,
    month: 6,
    title: "6월 민주항쟁",
    description:
      "1987년 6월 전국에서 대통령 직선제 개헌을 요구하며 일어난 시민항쟁. 6·29 선언으로 직선제 개헌이 수용되었다.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 1988,
    month: 9,
    title: "서울 올림픽",
    description:
      "1988년 9월 17일부터 10월 2일까지 서울에서 열린 제24회 하계 올림픽. 한국의 국제 위상이 크게 높아진 계기.",
    domain: "sports",
    region: "KR",
  },
  {
    year: 1989,
    month: 11,
    title: "베를린 장벽 붕괴",
    description:
      "1989년 11월 9일 동독 정부의 여행 자유화 발표 직후 베를린 장벽이 무너지며 동서 냉전 종식의 상징이 되었다.",
    domain: "world",
    region: "GLOBAL",
  },
  {
    year: 1994,
    month: 10,
    title: "성수대교 붕괴",
    description:
      "1994년 10월 21일 서울 성수대교 상부 트러스가 무너져 통근 시민 32명이 숨진 대형 참사.",
    domain: "disaster",
    region: "KR",
  },
  {
    year: 1995,
    month: 6,
    title: "삼풍백화점 붕괴",
    description:
      "1995년 6월 29일 서초동 삼풍백화점이 부실 시공으로 붕괴해 502명이 숨진 한국 최악의 건물 붕괴 참사.",
    domain: "disaster",
    region: "KR",
  },
  {
    year: 1997,
    month: 7,
    title: "홍콩 반환",
    description:
      "1997년 7월 1일 영국이 155년간 통치하던 홍콩을 중국에 반환했다. '일국양제'가 공식 출범한 날.",
    domain: "world",
    region: "GLOBAL",
  },
  {
    year: 1997,
    month: 11,
    title: "IMF 외환위기 (구제금융 신청)",
    description:
      "1997년 11월 21일 한국 정부가 국제통화기금(IMF)에 구제금융을 공식 신청했다. 대량 실직과 구조조정의 시발점.",
    domain: "economy",
    region: "KR",
  },
  {
    year: 1998,
    month: 1,
    title: "금 모으기 운동",
    description:
      "1998년 1월 외환위기 극복을 위해 국민들이 자발적으로 금을 내놓은 운동. 약 350만 명이 참여해 227톤의 금을 모았다.",
    domain: "economy",
    region: "KR",
  },
  {
    year: 2001,
    month: 9,
    title: "9·11 테러",
    description:
      "2001년 9월 11일 알카에다가 납치한 여객기로 뉴욕 세계무역센터 등이 공격받아 약 3천 명이 숨진 동시다발 테러.",
    domain: "world",
    region: "GLOBAL",
  },
  {
    year: 2002,
    month: 6,
    title: "한일 월드컵 4강",
    description:
      "2002년 한일 월드컵에서 한국 대표팀이 사상 첫 4강에 진출했다. 거리응원과 '대~한민국' 함성으로 기억되는 여름.",
    domain: "sports",
    region: "KR",
  },
  {
    year: 2002,
    month: 6,
    title: "미선이·효순이 사건",
    description:
      "2002년 6월 13일 경기 양주에서 여중생 신효순·심미선 양이 미군 장갑차에 깔려 숨졌다. 이후 대규모 촛불집회로 이어졌다.",
    domain: "kr_society",
    region: "KR",
  },
  {
    year: 2002,
    month: 12,
    title: "제16대 대선 (노무현 당선)",
    description:
      "2002년 12월 19일 치러진 대통령 선거에서 새천년민주당 노무현 후보가 당선되었다.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 2003,
    month: 2,
    title: "대구 지하철 참사",
    description:
      "2003년 2월 18일 대구 도시철도 1호선 중앙로역에서 방화로 192명이 숨진 대형 참사.",
    domain: "disaster",
    region: "KR",
  },
  {
    year: 2004,
    month: 3,
    title: "노무현 대통령 탄핵소추 (5월 헌재 기각)",
    description:
      "2004년 3월 12일 국회가 노무현 대통령 탄핵소추안을 가결했고, 5월 14일 헌법재판소가 이를 기각했다.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 2008,
    month: 9,
    title: "글로벌 금융위기 (리먼 브라더스)",
    description:
      "2008년 9월 15일 미국 투자은행 리먼 브라더스의 파산을 신호탄으로 전 세계 금융위기가 본격화되었다.",
    domain: "economy",
    region: "KR",
  },
  {
    year: 2009,
    month: 5,
    title: "노무현 전 대통령 서거",
    description:
      "2009년 5월 23일 노무현 전 대통령이 봉하마을 사저 인근에서 서거했다.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 2010,
    month: 3,
    title: "천안함 사건",
    description:
      "2010년 3월 26일 백령도 인근 해상에서 해군 초계함 천안함이 침몰해 승조원 46명이 숨졌다.",
    domain: "kr_society",
    region: "KR",
  },
  {
    year: 2011,
    month: 3,
    title: "동일본 대지진·후쿠시마",
    description:
      "2011년 3월 11일 일본 동북부에서 규모 9.0의 지진과 쓰나미가 발생해 후쿠시마 원전 사고로 이어졌다.",
    domain: "world",
    region: "GLOBAL",
  },
  {
    year: 2011,
    month: 10,
    title: "스티브 잡스 사망",
    description:
      "2011년 10월 5일 애플 공동창업자 스티브 잡스가 췌장암으로 별세했다.",
    domain: "tech",
    region: "KR",
  },
  {
    year: 2014,
    month: 4,
    title: "세월호 참사",
    description:
      "2014년 4월 16일 인천에서 제주로 향하던 여객선 세월호가 진도 해상에서 침몰해 304명이 숨지거나 실종되었다.",
    domain: "disaster",
    region: "KR",
  },
  {
    year: 2015,
    month: 6,
    title: "메르스(MERS) 사태",
    description:
      "2015년 5월 20일 첫 환자 발생 이후 6월 한 달간 병원 내 감염이 확산되며 38명이 사망했다.",
    domain: "kr_society",
    region: "KR",
  },
  {
    year: 2016,
    month: 3,
    title: "알파고 vs 이세돌 대국",
    description:
      "2016년 3월 9일부터 15일까지 구글 딥마인드의 알파고와 이세돌 9단이 바둑 대국을 펼쳤다. 알파고가 4승 1패로 승리.",
    domain: "tech",
    region: "KR",
  },
  {
    year: 2016,
    month: 12,
    title: "박근혜 대통령 탄핵소추 (2017.3 파면)",
    description:
      "2016년 12월 9일 국회가 박근혜 대통령 탄핵소추안을 가결했고, 2017년 3월 10일 헌법재판소가 파면을 결정했다.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 2017,
    month: 5,
    title: "제19대 대선 (문재인 당선)",
    description:
      "2017년 5월 9일 박근혜 전 대통령 파면에 따른 조기 대선에서 더불어민주당 문재인 후보가 당선되었다.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 2018,
    month: 2,
    title: "평창 동계올림픽",
    description:
      "2018년 2월 9일부터 25일까지 강원도 평창에서 열린 제23회 동계 올림픽. 남북 단일팀이 처음으로 결성되었다.",
    domain: "sports",
    region: "KR",
  },
  {
    year: 2020,
    month: 1,
    title: "코로나19 국내 첫 확진",
    description:
      "2020년 1월 20일 국내 첫 코로나19 확진자가 발생했고, 3월 11일 WHO가 팬데믹을 선언했다.",
    domain: "kr_society",
    region: "KR",
  },
  {
    year: 2022,
    month: 3,
    title: "제20대 대선 (윤석열 당선)",
    description:
      "2022년 3월 9일 치러진 대통령 선거에서 국민의힘 윤석열 후보가 당선되었다.",
    domain: "kr_politics",
    region: "KR",
  },
  {
    year: 2022,
    month: 10,
    title: "이태원 참사",
    description:
      "2022년 10월 29일 서울 이태원 좁은 골목에서 핼러윈 인파 압사 사고로 159명이 숨졌다.",
    domain: "disaster",
    region: "KR",
  },
  {
    year: 2024,
    month: 12,
    title: "윤석열 비상계엄 선포 및 탄핵소추 가결",
    description:
      "2024년 12월 3일 윤석열 대통령이 비상계엄을 선포했다가 약 6시간 만에 해제했고, 12월 14일 국회가 탄핵소추안을 가결했다.",
    domain: "kr_politics",
    region: "KR",
    sourceName: "헌법재판소 2024헌나8",
  },
  {
    year: 2025,
    month: 4,
    title: "헌법재판소, 윤석열 대통령 파면",
    description:
      "2025년 4월 4일 헌법재판소가 재판관 8인 만장일치로 윤석열 대통령에 대한 파면을 결정했다.",
    domain: "kr_politics",
    region: "KR",
    sourceName: "헌법재판소 2025.4.4. 선고 2024헌나8 결정",
  },
];
