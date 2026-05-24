// seed-timemachine.ts
// Lifebook 타임머신 시드 데이터 (2025.6 ~ 2026.5 검증용)
// 생성: 아카이빙 엑셀(타임머신_데이터_아카이빙_초안.xlsx) → 변환
//
// [사용법] prisma/schema.prisma 에 아래 모델이 있어야 함 (Phase T1):
//
//   enum EventSection { POLITICS_SOCIETY CULTURE SPORTS TREND }
//   enum EventTag { LIFESTYLE YOUTH }
//   enum Confidence { VERIFIED APPROX }
//   enum SongOrigin { DOMESTIC INTERNATIONAL }
//
//   model MonthEvent {
//     id          String   @id @default(cuid())
//     year        Int?
//     month       Int?
//     section     EventSection
//     tag         EventTag?
//     title       String
//     description String   @default("")
//     eventDate   String?
//     isPeriod    Boolean  @default(false)
//     startYear   Int?  startMonth Int?  endYear Int?  endMonth Int?
//     confidence  Confidence @default(APPROX)
//     source      String?
//   }
//
//   model ChartSong {
//     id           String   @id @default(cuid())
//     origin       SongOrigin
//     rank         Int?
//     title        String
//     artist       String   @default("")
//     year         Int?  month Int?
//     isPeriod     Boolean  @default(false)
//     startYear    Int?  startMonth Int?  endYear Int?  endMonth Int?
//     youtubeQuery String   @default("")
//     eraColor     String   @default("2020s")
//     confidence   Confidence @default(APPROX)
//   }
//
// [노출 규칙] 특정 (targetYear,targetMonth) 화면에 표시할 항목:
//   - 일반(isPeriod=false): year==target && month==target
//   - 기간(isPeriod=true):  start*12+startM <= target*12+targetM <= end*12+endM
//   국내음악은 일반, 유행/해외음악은 기간.
//   국내음악 2026년 5월은 데이터 없음 → 화면에선 직전달(4월) 사용(앱 로직).

// Phase T2 — 타임머신 시드 적재. 2025.6 ~ 2026.5 검증용.
// 실행: npm run db:seed:timemachine  (또는 npx tsx db/seed-timemachine.ts)
//
// 멱등 정책 (H1 보강):
//   - MonthEvent: 자연키(section|year|month|title) 해시로 deterministic
//     id 생성 → per-row upsert(by id). 시드 재실행해도 같은 사건은 같은
//     id 유지 → UserMemory.monthEventId 끊김 없음. 다른 필드(description/
//     source)는 시드 변경 시 update 로 반영.
//   - ChartSong: UserMemory 와 직접 연결 없음 → 기존 deleteMany +
//     createMany 유지(빠름).
//   - 시드에서 row 가 사라져도 DB 의 옛 MonthEvent 는 자동 삭제하지
//     않음 — 사용자가 남긴 추억(UserMemory) 보호.
import "dotenv/config";
import { createHash } from "node:crypto";
import { prisma } from "../lib/db";
import type {
  MonthEventCreateManyInput,
  ChartSongCreateManyInput,
} from "../lib/generated/prisma/models";

function monthEventDeterministicId(row: MonthEventCreateManyInput): string {
  // 자연키: section + year + month + title.
  // title 또는 section 이 바뀌면 새 사건으로 간주(의도된 분기).
  const key = `${row.section}|${row.year ?? ""}|${row.month ?? ""}|${row.title}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

const monthEvents: MonthEventCreateManyInput[] = [
  { year: 2025, month: 6, section: "POLITICS_SOCIETY", tag: null, title: "이재명 대통령 취임", description: "제21대 대통령 취임선서, 새 정부 출범", eventDate: "2025-06-04", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "코리아넷 10대뉴스 / 정부 발표" },
  { year: 2025, month: 6, section: "POLITICS_SOCIETY", tag: null, title: "Yes24 랜섬웨어 공격", description: "온라인 서점 5일간 마비, 약 100억 손실", eventDate: "2025-06", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "NordVPN 2025 보안결산" },
  { year: 2025, month: 6, section: "POLITICS_SOCIETY", tag: null, title: "G7 한일 정상회담", description: "캐나다 카나나스키스 G7서 이재명-이시바 회담", eventDate: "2025-06-17", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "코리아넷" },
  { year: 2025, month: 6, section: "CULTURE", tag: null, title: "드라마 '서초동' 방영", description: "이종석·문가영 주연 로펌 드라마(tvN·디즈니+)", eventDate: "2025-06", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "jjinflix 드라마정리 / 위키 드라마목록" },
  { year: 2025, month: 6, section: "TREND", tag: "LIFESTYLE", title: "'헬시플레저' 확산", description: "건강을 즐겁게 관리하는 소비 트렌드", eventDate: null, isPeriod: true, startYear: 2025, startMonth: 1, endYear: 2025, endMonth: 12, confidence: "APPROX", source: "뉴스와이어 2025 신조어" },
  { year: 2025, month: 6, section: "TREND", tag: "YOUTH", title: "'아자스' 밈", description: "'감사합니다'의 줄임/변형, 온라인서 유행", eventDate: null, isPeriod: true, startYear: 2025, startMonth: 4, endYear: 2025, endMonth: 9, confidence: "APPROX", source: "adure 밈테스트" },
  { year: 2025, month: 7, section: "CULTURE", tag: null, title: "영화 '좀비딸' 개봉", description: "인기 웹툰 원작 좀비물, 여름 흥행작", eventDate: "2025-07", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "KOFIC 하반기 라인업" },
  { year: 2025, month: 7, section: "CULTURE", tag: null, title: "박찬욱 '어쩔수가없다' 화제", description: "박찬욱 신작 촬영/개봉 이슈", eventDate: "2025-07", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "KOFIC" },
  { year: 2025, month: 7, section: "POLITICS_SOCIETY", tag: null, title: "국방기관 대상 해킹 시도", description: "'.mil.kr' 사칭 이메일 등 표적 공격 보고", eventDate: "2025-07-17", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "NordVPN 2025 보안결산" },
  { year: 2025, month: 7, section: "TREND", tag: "LIFESTYLE", title: "'키캉스' 인기", description: "아이 체험형 호캉스 — 여름 휴가 트렌드", eventDate: null, isPeriod: true, startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 8, confidence: "APPROX", source: "뉴스와이어 2025 신조어" },
  { year: 2025, month: 7, section: "TREND", tag: "YOUTH", title: "'모디슈머/내시피족'", description: "제품을 내 취향대로 재조합하는 소비", eventDate: null, isPeriod: true, startYear: 2025, startMonth: 3, endYear: 2025, endMonth: 10, confidence: "APPROX", source: "뉴스와이어" },
  { year: 2025, month: 8, section: "POLITICS_SOCIETY", tag: null, title: "한미 정상회담(워싱턴)", description: "이재명-트럼프 첫 회담, 관세·조선 협력 논의", eventDate: "2025-08-25", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "코리아넷" },
  { year: 2025, month: 8, section: "POLITICS_SOCIETY", tag: null, title: "한일 정상회담(도쿄)", description: "이재명-이시바 2차 회담", eventDate: "2025-08-23", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "코리아넷" },
  { year: 2025, month: 8, section: "CULTURE", tag: null, title: "BLACKPINK 'JUMP(뛰어)' 1위", description: "인기가요 8월 초~중순 1위, 컴백 화제", eventDate: "2025-08", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "SBS 인기가요 차트 / 언론" },
  { year: 2025, month: 8, section: "TREND", tag: "LIFESTYLE", title: "광복 80주년 분위기", description: "2025년 광복·분단 80주년, 관련 행사·캠페인", eventDate: null, isPeriod: true, startYear: 2025, startMonth: 8, endYear: 2025, endMonth: 8, confidence: "VERIFIED", source: "정부 발표 / 언론" },
  { year: 2025, month: 8, section: "TREND", tag: "YOUTH", title: "'아자스' 밈 유행", description: "'감사합니다'의 변형, 온라인서 화제(악플 뒤 붙이는 밈)", eventDate: null, isPeriod: true, startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 9, confidence: "APPROX", source: "adure 밈테스트" },
  { year: 2025, month: 9, section: "CULTURE", tag: null, title: "'케데헌' 넷플릭스 역대 1위", description: "K팝 데몬 헌터스, 오징어게임 제치고 역대 최다 시청 1위", eventDate: "2025-09-03", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "경향/헤럴드/MBC 등 다수" },
  { year: 2025, month: 9, section: "POLITICS_SOCIETY", tag: null, title: "KT 펨토셀 해킹", description: "불법 펨토셀·악성코드로 KT 고객 정보·소액결제 피해", eventDate: "2025-09", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "NordVPN / MBC" },
  { year: 2025, month: 9, section: "TREND", tag: "LIFESTYLE", title: "'케데헌' 신드롬", description: "골든 등 OST 따라부르기, 싱어롱 등 전국적 화제", eventDate: null, isPeriod: true, startYear: 2025, startMonth: 9, endYear: 2025, endMonth: 11, confidence: "VERIFIED", source: "주간경향 등" },
  { year: 2025, month: 10, section: "POLITICS_SOCIETY", tag: null, title: "LG U+ 해킹 사고", description: "3위 통신사 해킹, 은폐 의혹·국회 감사 논란", eventDate: "2025-10-23", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "NordVPN" },
  { year: 2025, month: 10, section: "POLITICS_SOCIETY", tag: null, title: "APEC 경주 / 한미 정상회담", description: "경주 APEC 계기 이재명-트럼프 회담, 관세 인하 합의", eventDate: "2025-10-29", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "코리아넷 10대뉴스" },
  { year: 2025, month: 10, section: "CULTURE", tag: null, title: "'오징어게임: 더 챌린지 S2'", description: "넷플릭스 리얼리티, 11월 4일 공개(10월 화제)", eventDate: "2025-11-04", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "JustWatch" },
  { year: 2025, month: 10, section: "TREND", tag: "LIFESTYLE", title: "주담대 금리 5%대 진입", description: "고정 주담대 최저금리 5%대, '영끌족' 부담 화제", eventDate: "2025-10", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "경향신문" },
  { year: 2025, month: 11, section: "POLITICS_SOCIETY", tag: null, title: "쿠팡 개인정보 대량 유출", description: "3,370만 계정 유출, 한국 역대 최대 이커머스 사고", eventDate: "2025-11-29", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "NordVPN / 경기일보" },
  { year: 2025, month: 11, section: "POLITICS_SOCIETY", tag: null, title: "누리호 4차 발사 성공", description: "민간 주도(한화에어로) 누리호 발사, 위성 궤도 안착", eventDate: "2025-11-27", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "코리아넷 10대뉴스" },
  { year: 2025, month: 11, section: "TREND", tag: "LIFESTYLE", title: "'새해 달라지는 것' 화제", description: "만12세이하 자녀 10시 출근제, 대중교통비 환급 등 예고", eventDate: "2025-11", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "MBC 뉴스데스크" },
  { year: 2025, month: 12, section: "POLITICS_SOCIETY", tag: null, title: "쿠팡 유출 후폭풍", description: "본사 압수수색, 한국사업부 CEO 사임, 집단소송 20만+", eventDate: "2025-12-10", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "NordVPN" },
  { year: 2025, month: 12, section: "TREND", tag: "LIFESTYLE", title: "연말 '내수 진작' 분위기", description: "임시공휴일·소비쿠폰 등 연말 경기부양 화제", eventDate: "2025-12", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "정부 발표 / 언론 보도" },
  { year: 2026, month: 1, section: "POLITICS_SOCIETY", tag: null, title: "새해 제도 변화 시행", description: "만12세이하 자녀 10시 출근제, 대중교통비 환급 등", eventDate: "2026-01-01", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "MBC 뉴스데스크" },
  { year: 2026, month: 1, section: "TREND", tag: "YOUTH", title: "'난리자베스' 유행어", description: "감정+자베스/베스 붙이는 만능 텍스트밈, 새해부터 확산", eventDate: null, isPeriod: true, startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 4, confidence: "APPROX", source: "letter.wepick 밈아카이브" },
  { year: 2026, month: 2, section: "SPORTS", tag: null, title: "2026 동계올림픽 개막", description: "밀라노-코르티나 2/6~22, 한국 금3은4동3 종합13위", eventDate: "2026-02-06", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "대한민국 정책브리핑 / 위키" },
  { year: 2026, month: 2, section: "CULTURE", tag: null, title: "올림픽 개막식 화제", description: "머라이어 캐리·보첼리 공연 등 '조화' 주제 개막식", eventDate: "2026-02-06", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "위키 2026동계올림픽" },
  { year: 2026, month: 2, section: "POLITICS_SOCIETY", tag: null, title: "신현송 한국은행 총재 취임", description: "한국은행 새 총재 취임(통화정책 수장 교체)", eventDate: "2026-02", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "한국은행" },
  { year: 2026, month: 2, section: "TREND", tag: "LIFESTYLE", title: "올림픽 '코리아하우스' 화제", description: "밀라노 코리아하우스, 외신 '가장 인기 국가관'", eventDate: "2026-02", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "정책브리핑" },
  { year: 2026, month: 3, section: "POLITICS_SOCIETY", tag: null, title: "서해수호의 날 기념식", description: "제11회 서해수호의 날, 이재명 대통령 대전현충원 참배(천안함·연평해전·채상병 묘역)", eventDate: "2026-03-27", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "MBC / 정부 발표" },
  { year: 2026, month: 3, section: "CULTURE", tag: null, title: "영화 '왕과 사는 남자' 천만 돌파", description: "2026년 첫 천만 영화(3/6 천만 돌파, 이후 1,600만+) — 범국민 흥행", eventDate: "2026-03-06", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "언론(교차) / 박스오피스" },
  { year: 2026, month: 3, section: "TREND", tag: "LIFESTYLE", title: "최저임금·구하라법 등 시행 화제", description: "2026 최저임금 10,320원, 구하라법 등 새 제도(연초~)", eventDate: null, isPeriod: true, startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3, confidence: "APPROX", source: "정부 발표 / 언론 보도" },
  { year: 2026, month: 4, section: "POLITICS_SOCIETY", tag: null, title: "한·베트남 정상회담", description: "4월 한-베 정상회담, 경제협력 성과사업", eventDate: "2026-04", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "정책브리핑" },
  { year: 2026, month: 4, section: "CULTURE", tag: null, title: "봄 드라마 시즌", description: "'미혼남녀의 효율적 만남'(JTBC, 2~4월) 등 봄 화제 드라마", eventDate: "2026-04", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "위키 드라마목록 / 언론" },
  { year: 2026, month: 4, section: "TREND", tag: "LIFESTYLE", title: "밀크티·티(tea) 유행", description: "해외 밀크티 브랜드(아운티제니·차백도·헤이티) 상륙, '커피 말고 티'", eventDate: null, isPeriod: true, startYear: 2026, startMonth: 4, endYear: 2026, endMonth: 6, confidence: "APPROX", source: "HSAD 트렌드 밈집" },
  { year: 2026, month: 5, section: "POLITICS_SOCIETY", tag: null, title: "국가정상화 프로젝트 164개 확정", description: "스쿨존 속도규제 합리화 등 규제개선 발표", eventDate: "2026-05-22", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "정책브리핑(국무조정실)" },
  { year: 2026, month: 5, section: "CULTURE", tag: null, title: "'여행가는 봄' x 부처님오신날", description: "가정의 달·연휴 국내여행 캠페인 활발", eventDate: "2026-05", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "APPROX", source: "정책브리핑" },
  { year: 2026, month: 5, section: "TREND", tag: "LIFESTYLE", title: "가정의 달 분위기", description: "어린이날·어버이날·부처님오신날, 가족 소비·나들이", eventDate: null, isPeriod: true, startYear: 2026, startMonth: 5, endYear: 2026, endMonth: 5, confidence: "VERIFIED", source: "정책브리핑" },
  { year: 2026, month: 3, section: "TREND", tag: "YOUTH", title: "'냐냐냥' 밈 재유행", description: "2023년 카톡발 밈이 3월 전 플랫폼서 재유행", eventDate: null, isPeriod: true, startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 5, confidence: "APPROX", source: "HSAD / letter.wepick" },
  { year: 2026, month: 4, section: "POLITICS_SOCIETY", tag: null, title: "4월 소비자물가 2.6% 상승", description: "전월(2.2%)보다 0.4%p↑, 한국은행 물가상황점검회의", eventDate: "2026-04", isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, confidence: "VERIFIED", source: "한국은행 보도참고" },
  { year: 2026, month: 5, section: "TREND", tag: "LIFESTYLE", title: "2026 복고(뉴트로) 열풍", description: "LG 금성사 라디오·선풍기 복각 인기, '검증된 것' 선호 트렌드", eventDate: null, isPeriod: true, startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 5, confidence: "APPROX", source: "트렌드코리아 / adure" },
];

const chartSongs: ChartSongCreateManyInput[] = [
  { origin: "DOMESTIC", rank: 1, title: "기쁨, 슬픔, 아름다운 마음", artist: "AKMU (악뮤)", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "AKMU 기쁨, 슬픔, 아름다운 마음", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "소문의 낙원", artist: "AKMU (악뮤)", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "AKMU 소문의 낙원", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "RUDE!", artist: "Hearts2Hearts (하츠투하츠)", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "Hearts2Hearts RUDE!", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "BANG BANG", artist: "IVE (아이브)", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "IVE BANG BANG", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "404 (New Era)", artist: "KiiiKiii (키키)", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "KiiiKiii 404", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "사랑하게 될 거야", artist: "한로로", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "한로로 사랑하게 될 거야", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "Drowning", artist: "WOODZ", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "SWIM", artist: "방탄소년단", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "방탄소년단 SWIM", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "Good Goodbye", artist: "화사 (HWASA)", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "화사 Good Goodbye", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "0+0", artist: "한로로", year: 2026, month: 4, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "한로로 0+0", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "BANG BANG", artist: "IVE (아이브)", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "IVE BANG BANG", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "404 (New Era)", artist: "KiiiKiii (키키)", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "KiiiKiii 404", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "RUDE!", artist: "Hearts2Hearts (하츠투하츠)", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "Hearts2Hearts RUDE!", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "Good Goodbye", artist: "화사 (HWASA)", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "화사 Good Goodbye", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "사랑하게 될 거야", artist: "한로로", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "한로로 사랑하게 될 거야", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "Drowning", artist: "WOODZ", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "0+0", artist: "한로로", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "한로로 0+0", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "그대 작은 나의 세상이 되어", artist: "카더가든", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "카더가든 그대 작은 나의 세상이 되어", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "타임캡슐", artist: "다비치", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "다비치 타임캡슐", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "BLACKHOLE", artist: "IVE (아이브)", year: 2026, month: 3, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "IVE BLACKHOLE", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "Good Goodbye", artist: "화사 (HWASA)", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "화사 Good Goodbye", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "404 (New Era)", artist: "KiiiKiii (키키)", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "KiiiKiii 404", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "그대 작은 나의 세상이 되어", artist: "카더가든", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "카더가든 그대 작은 나의 세상이 되어", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "사랑하게 될 거야", artist: "한로로", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "한로로 사랑하게 될 거야", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "Drowning", artist: "WOODZ", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "타임캡슐", artist: "다비치", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "다비치 타임캡슐", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "BANG BANG", artist: "IVE (아이브)", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "IVE BANG BANG", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "Blue Valentine", artist: "NMIXX", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "NMIXX Blue Valentine", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "0+0", artist: "한로로", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "한로로 0+0", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "멸종위기사랑", artist: "이찬혁", year: 2026, month: 2, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "이찬혁 멸종위기사랑", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "Good Goodbye", artist: "화사 (HWASA)", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "화사 Good Goodbye", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "Drowning", artist: "WOODZ", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "사랑하게 될 거야", artist: "한로로", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "한로로 사랑하게 될 거야", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "타임캡슐", artist: "다비치", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "다비치 타임캡슐", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "Blue Valentine", artist: "NMIXX", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "NMIXX Blue Valentine", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "SPAGHETTI (feat. j-hope of BTS)", artist: "LE SSERAFIM (르세라핌), j-hope", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "LE SSERAFIM SPAGHETTI", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "ONE MORE TIME", artist: "ALLDAY PROJECT", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "ALLDAY PROJECT ONE MORE TIME", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "멸종위기사랑", artist: "이찬혁", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "이찬혁 멸종위기사랑", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "어제보다 슬픈 오늘", artist: "우디 (Woody)", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "우디 어제보다 슬픈 오늘", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "0+0", artist: "한로로", year: 2026, month: 1, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "한로로 0+0", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "Good Goodbye", artist: "화사 (HWASA)", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "화사 Good Goodbye", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "타임캡슐", artist: "다비치", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "다비치 타임캡슐", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "Blue Valentine", artist: "NMIXX", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "NMIXX Blue Valentine", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "ONE MORE TIME", artist: "ALLDAY PROJECT", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "ALLDAY PROJECT ONE MORE TIME", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "Drowning", artist: "WOODZ", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "첫 눈", artist: "EXO", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "EXO 첫 눈", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "SPAGHETTI (feat. j-hope of BTS)", artist: "LE SSERAFIM (르세라핌), j-hope", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "LE SSERAFIM SPAGHETTI", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "멸종위기사랑", artist: "이찬혁", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "이찬혁 멸종위기사랑", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "어제보다 슬픈 오늘", artist: "우디 (Woody)", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "우디 어제보다 슬픈 오늘", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "달리 표현할 수 없어요", artist: "로이킴", year: 2025, month: 12, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "로이킴 달리 표현할 수 없어요", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "Blue Valentine", artist: "NMIXX", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "NMIXX Blue Valentine", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "Good Goodbye", artist: "화사 (HWASA)", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "화사 Good Goodbye", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "타임캡슐", artist: "다비치", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "다비치 타임캡슐", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "Drowning", artist: "WOODZ", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "SPAGHETTI (feat. j-hope of BTS)", artist: "LE SSERAFIM (르세라핌), j-hope", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "LE SSERAFIM SPAGHETTI", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "뛰어(JUMP)", artist: "BLACKPINK", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "BLACKPINK 뛰어", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "달리 표현할 수 없어요", artist: "로이킴", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "로이킴 달리 표현할 수 없어요", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "어제보다 슬픈 오늘", artist: "우디 (Woody)", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "우디 어제보다 슬픈 오늘", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "FAMOUS", artist: "ALLDAY PROJECT", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "ALLDAY PROJECT FAMOUS", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "시작의 아이 ❍", artist: "박다혜, 마크툽 (MAKTUB)", year: 2025, month: 11, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "박다혜 시작의 아이 ❍", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "Drowning", artist: "WOODZ", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "뛰어(JUMP)", artist: "BLACKPINK", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "BLACKPINK 뛰어", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "FAMOUS", artist: "ALLDAY PROJECT", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "ALLDAY PROJECT FAMOUS", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "어제보다 슬픈 오늘", artist: "우디 (Woody)", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "우디 어제보다 슬픈 오늘", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "Rich Man", artist: "aespa", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "aespa Rich Man", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "시작의 아이 ❍", artist: "박다혜, 마크툽 (MAKTUB)", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "박다혜 시작의 아이 ❍", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "XOXZ", artist: "IVE (아이브)", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "IVE XOXZ", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "모르시나요(PROD.로코베리)", artist: "조째즈", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "조째즈 모르시나요", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "너에게 닿기를", artist: "10CM", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "10CM 너에게 닿기를", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "운명 (2025)", artist: "먼데이 키즈, 이이경", year: 2025, month: 10, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "먼데이 키즈 운명", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "뛰어(JUMP)", artist: "BLACKPINK", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "BLACKPINK 뛰어", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "FAMOUS", artist: "ALLDAY PROJECT", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "ALLDAY PROJECT FAMOUS", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "Drowning", artist: "WOODZ", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "XOXZ", artist: "IVE (아이브)", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "IVE XOXZ", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "시작의 아이 ❍", artist: "박다혜, 마크툽 (MAKTUB)", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "박다혜 시작의 아이 ❍", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "Rich Man", artist: "aespa", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "aespa Rich Man", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "어제보다 슬픈 오늘", artist: "우디 (Woody)", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "우디 어제보다 슬픈 오늘", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "Dirty Work", artist: "aespa", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "aespa Dirty Work", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "너에게 닿기를", artist: "10CM", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "10CM 너에게 닿기를", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "시작의 아이", artist: "마크툽 (MAKTUB)", year: 2025, month: 9, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "마크툽 시작의 아이", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "뛰어(JUMP)", artist: "BLACKPINK", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "BLACKPINK 뛰어", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "FAMOUS", artist: "ALLDAY PROJECT", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "ALLDAY PROJECT FAMOUS", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "Drowning", artist: "WOODZ", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "Dirty Work", artist: "aespa", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "aespa Dirty Work", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "시작의 아이", artist: "마크툽 (MAKTUB)", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "마크툽 시작의 아이", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "너에게 닿기를", artist: "10CM", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "10CM 너에게 닿기를", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "모르시나요(PROD.로코베리)", artist: "조째즈", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "조째즈 모르시나요", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "WICKED", artist: "ALLDAY PROJECT", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "ALLDAY PROJECT WICKED", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "어제보다 슬픈 오늘", artist: "우디 (Woody)", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "우디 어제보다 슬픈 오늘", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "Whiplash", artist: "aespa", year: 2025, month: 8, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "aespa Whiplash", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "FAMOUS", artist: "ALLDAY PROJECT", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "ALLDAY PROJECT FAMOUS", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "Dirty Work", artist: "aespa", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "aespa Dirty Work", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "Drowning", artist: "WOODZ", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "너에게 닿기를", artist: "10CM", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "10CM 너에게 닿기를", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "시작의 아이", artist: "마크툽 (MAKTUB)", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "마크툽 시작의 아이", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "모르시나요(PROD.로코베리)", artist: "조째즈", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "조째즈 모르시나요", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "뛰어(JUMP)", artist: "BLACKPINK", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "BLACKPINK 뛰어", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "어제보다 슬픈 오늘", artist: "우디 (Woody)", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "우디 어제보다 슬픈 오늘", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "Whiplash", artist: "aespa", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "aespa Whiplash", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "like JENNIE", artist: "제니 (JENNIE)", year: 2025, month: 7, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "제니 like JENNIE", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 1, title: "너에게 닿기를", artist: "10CM", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "10CM 너에게 닿기를", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 2, title: "Drowning", artist: "WOODZ", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "WOODZ Drowning", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 3, title: "Never Ending Story", artist: "아이유", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "아이유 Never Ending Story", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 4, title: "모르시나요(PROD.로코베리)", artist: "조째즈", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "조째즈 모르시나요", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 5, title: "like JENNIE", artist: "제니 (JENNIE)", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "제니 like JENNIE", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 6, title: "시작의 아이", artist: "마크툽 (MAKTUB)", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "마크툽 시작의 아이", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 7, title: "어제보다 슬픈 오늘", artist: "우디 (Woody)", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "우디 어제보다 슬픈 오늘", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 8, title: "Whiplash", artist: "aespa", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "aespa Whiplash", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 9, title: "나는 반딧불", artist: "황가람", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "황가람 나는 반딧불", eraColor: "2020s", confidence: "APPROX" },
  { origin: "DOMESTIC", rank: 10, title: "TOO BAD (feat. Anderson .Paak)", artist: "G-DRAGON", year: 2025, month: 6, isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, youtubeQuery: "G-DRAGON TOO BAD", eraColor: "2020s", confidence: "APPROX" },
  { origin: "INTERNATIONAL", rank: null, title: "Die with a Smile", artist: "Lady Gaga & Bruno Mars", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 9, youtubeQuery: "Lady Gaga Die with a Smile", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "Luther", artist: "Kendrick Lamar & SZA", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 8, youtubeQuery: "Kendrick Lamar Luther", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "Ordinary", artist: "Alex Warren", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 9, youtubeQuery: "Alex Warren Ordinary", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "APT.", artist: "Rosé & Bruno Mars", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 6, endYear: 2025, endMonth: 8, youtubeQuery: "Rosé APT.", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "JUMP", artist: "BLACKPINK", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 7, endYear: 2025, endMonth: 9, youtubeQuery: "BLACKPINK JUMP", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "Golden", artist: "HUNTR/X", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 7, endYear: 2025, endMonth: 12, youtubeQuery: "HUNTR/X Golden", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "The Fate of Ophelia", artist: "Taylor Swift", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 10, endYear: 2026, endMonth: 2, youtubeQuery: "Taylor Swift The Fate of Ophelia", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "Opalite", artist: "Taylor Swift", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 10, endYear: 2025, endMonth: 12, youtubeQuery: "Taylor Swift Opalite", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "The Subway", artist: "Chappell Roan", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 9, endYear: 2025, endMonth: 11, youtubeQuery: "Chappell Roan The Subway", eraColor: "2020s", confidence: "APPROX" },
  { origin: "INTERNATIONAL", rank: null, title: "Last Christmas", artist: "Wham!", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 12, endYear: 2025, endMonth: 12, youtubeQuery: "Wham! Last Christmas", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "All I Want for Christmas Is You", artist: "Mariah Carey", year: null, month: null, isPeriod: true, startYear: 2025, startMonth: 12, endYear: 2025, endMonth: 12, youtubeQuery: "Mariah Carey All I Want for Christmas Is You", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "I Just Might", artist: "Bruno Mars", year: null, month: null, isPeriod: true, startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 3, youtubeQuery: "Bruno Mars I Just Might", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "Choosin' Texas", artist: "Ella Langley", year: null, month: null, isPeriod: true, startYear: 2026, startMonth: 1, endYear: 2026, endMonth: 4, youtubeQuery: "Ella Langley Choosin' Texas", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "Aperture", artist: "Harry Styles", year: null, month: null, isPeriod: true, startYear: 2026, startMonth: 2, endYear: 2026, endMonth: 4, youtubeQuery: "Harry Styles Aperture", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "Risk It All", artist: "Bruno Mars", year: null, month: null, isPeriod: true, startYear: 2026, startMonth: 2, endYear: 2026, endMonth: 4, youtubeQuery: "Bruno Mars Risk It All", eraColor: "2020s", confidence: "APPROX" },
  { origin: "INTERNATIONAL", rank: null, title: "Drop Dead", artist: "Olivia Rodrigo", year: null, month: null, isPeriod: true, startYear: 2026, startMonth: 4, endYear: 2026, endMonth: 5, youtubeQuery: "Olivia Rodrigo Drop Dead", eraColor: "2020s", confidence: "VERIFIED" },
  { origin: "INTERNATIONAL", rank: null, title: "American Girls", artist: "Harry Styles", year: null, month: null, isPeriod: true, startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 5, youtubeQuery: "Harry Styles American Girls", eraColor: "2020s", confidence: "APPROX" },
  { origin: "INTERNATIONAL", rank: null, title: "Opalite", artist: "Taylor Swift", year: null, month: null, isPeriod: true, startYear: 2026, startMonth: 3, endYear: 2026, endMonth: 5, youtubeQuery: "Taylor Swift Opalite", eraColor: "2020s", confidence: "APPROX" },
];

async function main() {
  console.log("타임머신 시드 시작...");

  // MonthEvent — deterministic id 로 per-row upsert. 기존 id 유지 →
  // 사용자가 남긴 추억의 monthEventId 보존.
  let created = 0;
  let updated = 0;
  for (const row of monthEvents) {
    const id = monthEventDeterministicId(row);
    const exists = await prisma.monthEvent.findUnique({
      where: { id },
      select: { id: true },
    });
    await prisma.monthEvent.upsert({
      where: { id },
      create: { id, ...row },
      update: { ...row },
    });
    if (exists) updated += 1;
    else created += 1;
  }
  console.log(
    `MonthEvent: 새로 생성 ${created}건, 갱신 ${updated}건 (총 시드 ${monthEvents.length}건)`,
  );

  // DB 에 있지만 시드에서 사라진 MonthEvent — 자동 삭제 안 함.
  // 사용자 추억(UserMemory) 보호. 필요 시 수동 cleanup.
  const seedIds = new Set(monthEvents.map(monthEventDeterministicId));
  const all = await prisma.monthEvent.findMany({ select: { id: true } });
  const orphanIds = all.filter((m) => !seedIds.has(m.id)).map((m) => m.id);
  if (orphanIds.length > 0) {
    console.log(
      `  ⚠ DB 에 ${orphanIds.length}건의 MonthEvent 가 시드 밖에 있음 (보존). 정리하려면 별도 cleanup 필요.`,
    );
  }

  // ChartSong — UserMemory link 없음. 전체 재삽입이 단순·안전.
  await prisma.chartSong.deleteMany({});
  await prisma.chartSong.createMany({ data: chartSongs });
  console.log(`ChartSong ${chartSongs.length}건 시드 완료`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
