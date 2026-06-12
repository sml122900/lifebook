// Phase T5 — 음악 카드 (이미지 0, 저작권 0).
//
// 디자인 원칙 (phase/타임머신_리디자인_기획.md 3.5):
//   - 앨범 커버·가수 사진 절대 사용 금지
//   - 순위 원형 배지 + 타이포 위계 + 시대의 색
//   - 재생은 유튜브 검색 링크만 (임베드 금지)
//
// 시대의 색 → 팔레트 매핑. 지금은 2020s 하나만 정의. 시드가 과거로
// 확장될 때 1980s 세피아 / 1990s 네온 / 2000s 메탈릭 / 2010s 미니멀 등을
// 추가만 하면 된다 — Tailwind 정적 분석 때문에 클래스 문자열은 반드시
// 리터럴로 두고 (동적 보간 금지) 여기서 한 번에 enumerate.

import { youtubeSearchUrl } from "@/lib/music/youtube";

type EraPalette = {
  cardBg: string;       // 카드 배경
  cardBorder: string;   // 카드 보더
  badgeFirst: string;   // 1위 배지 배경
  badgeFirstText: string;
  badgeRest: string;    // 2~10위 / 무순위 배지 배경
  badgeRestText: string;
  titleText: string;    // 곡명
  artistText: string;   // 아티스트
  playBorder: string;   // 재생 버튼 보더
  playText: string;     // 재생 아이콘 색
};

const ERA_PALETTES: Record<string, EraPalette> = {
  // 2020s — 따뜻한 톤. amber 계열을 기반으로 카드에 온기를 준다.
  "2020s": {
    cardBg: "bg-amber-50",
    cardBorder: "border-amber-200",
    badgeFirst: "bg-amber-700",
    badgeFirstText: "text-white",
    badgeRest: "bg-amber-100",
    badgeRestText: "text-amber-900",
    titleText: "text-ink",
    artistText: "text-ink-soft",
    playBorder: "border-amber-500",
    playText: "text-amber-800",
  },
  // 향후 추가될 시대들 (시드가 과거로 확장될 때):
  //   "2010s": 미니멀 (zinc/white 톤)
  //   "2000s": Y2K 메탈릭 (slate 톤)
  //   "1990s": 청록·핫핑크 네온 (teal/pink 톤, 살짝만)
  //   "1980s": 빛바랜 세피아 (yellow-stone 톤)
  // 각 팔레트는 모든 클래스를 리터럴 문자열로 적어야 Tailwind 가 인식.
};

function paletteFor(eraColor: string | null | undefined): EraPalette {
  return ERA_PALETTES[eraColor ?? ""] ?? ERA_PALETTES["2020s"];
}

export type SongCardProps = {
  rank: number | null;   // null = 순위 없음 (해외)
  title: string;
  artist: string;
  eraColor: string | null;
};

export function SongCard({ rank, title, artist, eraColor }: SongCardProps) {
  const p = paletteFor(eraColor);
  const url = youtubeSearchUrl(title, artist);

  const isFirst = rank === 1;
  const isTopThree = rank !== null && rank >= 1 && rank <= 3;
  // 타이포 위계: 1위 가장 크게 → 2-3위 중간 → 그 외 / 무순위 기본.
  // 시니어 가독성 위해 최소 text-lg 유지.
  const titleSize = isFirst
    ? "text-2xl sm:text-3xl"
    : isTopThree
      ? "text-xl"
      : "text-lg";
  const titleWeight = isFirst ? "font-bold" : "font-semibold";

  return (
    <li
      className={`flex items-center gap-4 rounded-md border-2 ${p.cardBorder} ${p.cardBg} p-4 sm:p-5`}
    >
      <Badge rank={rank} palette={p} />

      <div className="min-w-0 flex-1">
        <p className={`${titleSize} ${titleWeight} ${p.titleText}`}>
          {title}
        </p>
        <p className="mt-1 text-base text-ink-soft sm:text-lg">{artist}</p>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${title} 유튜브에서 검색 (새 탭 열림)`}
        className={`flex shrink-0 items-center justify-center rounded-full border-2 bg-surface ${p.playBorder} ${p.playText} hover:bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2`}
        style={{ width: 56, height: 56 }}
      >
        <span aria-hidden className="ml-1 text-2xl">▶</span>
      </a>
    </li>
  );
}

function Badge({
  rank,
  palette,
}: {
  rank: number | null;
  palette: EraPalette;
}) {
  // 해외 (rank=null) — 숫자 대신 음표. 1위/일반 배지와 시각적 무게는
  // 같게 유지해 정렬 라인이 흔들리지 않게.
  if (rank === null) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full ${palette.badgeRest}`}
        style={{ width: 48, height: 48 }}
        aria-hidden
      >
        <span className={`text-2xl ${palette.badgeRestText}`}>♪</span>
      </div>
    );
  }

  const isFirst = rank === 1;
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${
        isFirst ? palette.badgeFirst : palette.badgeRest
      }`}
      style={{ width: 48, height: 48 }}
      aria-label={`${rank}위`}
    >
      <span
        className={`text-xl font-bold tabular-nums ${
          isFirst ? palette.badgeFirstText : palette.badgeRestText
        }`}
      >
        {rank}
      </span>
    </div>
  );
}
