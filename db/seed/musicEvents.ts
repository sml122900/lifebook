// Phase 6.3 — curated music trigger seed.
// Source: phase/음악시드_초안.md (~64 songs) + 6 songs added here to
// thicken 70s/80s/90s coverage for senior reminiscence (트로트, 통기타,
// 김광석 라인). MusicBrainz enrichment in Phase 6.4 will normalize
// release years and add MBIDs.
//
// description must stay short (one line). No lyrics — title, artist,
// year, and a brief context cue only.

export type MusicEventSeed = {
  year: number;
  title: string;
  artist: string;
  region: "KR" | "GLOBAL";
  description: string;
};

export const musicEvents: MusicEventSeed[] = [
  // 1970s
  { year: 1971, title: "Imagine", artist: "John Lennon", region: "GLOBAL", description: "시대의 상징곡" },
  { year: 1973, title: "님과 함께", artist: "남진", region: "KR", description: "7080 트로트 대표" },
  { year: 1975, title: "고래사냥", artist: "송창식", region: "KR", description: "7080 통기타 세대" },
  { year: 1975, title: "Bohemian Rhapsody", artist: "Queen", region: "GLOBAL", description: "록 오페라" },
  { year: 1976, title: "Dancing Queen", artist: "ABBA", region: "GLOBAL", description: "디스코 황금기" },
  { year: 1976, title: "긴 머리 소녀", artist: "둘다섯", region: "KR", description: "포크 듀오 대표곡" },
  { year: 1977, title: "Stayin' Alive", artist: "Bee Gees", region: "GLOBAL", description: "디스코" },
  { year: 1978, title: "당신은 모르실거야", artist: "혜은이", region: "KR", description: "" },
  { year: 1979, title: "아니 벌써", artist: "산울림", region: "KR", description: "한국 록의 시작" },

  // 1980s
  { year: 1983, title: "Billie Jean", artist: "Michael Jackson", region: "GLOBAL", description: "Thriller 시대" },
  { year: 1984, title: "J에게", artist: "이선희", region: "KR", description: "강변가요제 데뷔" },
  { year: 1984, title: "Last Christmas", artist: "Wham!", region: "GLOBAL", description: "연말 단골" },
  { year: 1985, title: "그것만이 내 세상", artist: "들국화", region: "KR", description: "" },
  { year: 1986, title: "비처럼 음악처럼", artist: "김현식", region: "KR", description: "발라드 명곡" },
  { year: 1987, title: "광화문 연가", artist: "이문세", region: "KR", description: "이영훈 작곡 발라드" },
  { year: 1987, title: "사랑하기 때문에", artist: "유재하", region: "KR", description: "유작 1집" },
  { year: 1987, title: "Bad", artist: "Michael Jackson", region: "GLOBAL", description: "" },
  { year: 1988, title: "홀로 된다는 것", artist: "변진섭", region: "KR", description: "발라드 황태자" },
  { year: 1988, title: "신사동 그 사람", artist: "주현미", region: "KR", description: "트로트" },
  { year: 1989, title: "Like a Prayer", artist: "Madonna", region: "GLOBAL", description: "" },

  // 1990s
  { year: 1990, title: "이등병의 편지", artist: "김광석", region: "KR", description: "1집 수록, 군 입대 송별곡" },
  { year: 1991, title: "보이지 않는 사랑", artist: "신승훈", region: "KR", description: "발라드 데뷔작" },
  { year: 1991, title: "Smells Like Teen Spirit", artist: "Nirvana", region: "GLOBAL", description: "그런지 폭발" },
  { year: 1992, title: "난 알아요", artist: "서태지와 아이들", region: "KR", description: "가요 패러다임 전환" },
  { year: 1992, title: "I Will Always Love You", artist: "Whitney Houston", region: "GLOBAL", description: "영화 '보디가드'" },
  { year: 1993, title: "핑계", artist: "김건모", region: "KR", description: "" },
  { year: 1994, title: "서른 즈음에", artist: "김광석", region: "KR", description: "4집 타이틀" },
  { year: 1995, title: "잘못된 만남", artist: "김건모", region: "KR", description: "역대 최다 판매" },
  { year: 1995, title: "날개 잃은 천사", artist: "룰라", region: "KR", description: "" },
  { year: 1996, title: "캔디", artist: "H.O.T", region: "KR", description: "1세대 아이돌" },
  { year: 1996, title: "Wannabe", artist: "Spice Girls", region: "GLOBAL", description: "" },
  { year: 1997, title: "학원별곡", artist: "젝스키스", region: "KR", description: "" },
  { year: 1998, title: "내 남자친구에게", artist: "핑클", region: "KR", description: "" },
  { year: 1998, title: "...Baby One More Time", artist: "Britney Spears", region: "GLOBAL", description: "" },
  { year: 1999, title: "어머님께", artist: "god", region: "KR", description: "" },
  { year: 1999, title: "I Want It That Way", artist: "Backstreet Boys", region: "GLOBAL", description: "" },

  // 2000s
  { year: 2000, title: "The Real Slim Shady", artist: "Eminem", region: "GLOBAL", description: "" },
  { year: 2002, title: "No.1", artist: "보아", region: "KR", description: "한류 초기" },
  { year: 2003, title: "10 Minutes", artist: "이효리", region: "KR", description: "" },
  { year: 2003, title: "Crazy in Love", artist: "Beyoncé", region: "GLOBAL", description: "" },
  { year: 2004, title: "Hug", artist: "동방신기", region: "KR", description: "2세대 아이돌" },
  { year: 2007, title: "Tell Me", artist: "원더걸스", region: "KR", description: "후크송 열풍" },
  { year: 2007, title: "Umbrella", artist: "Rihanna", region: "GLOBAL", description: "" },
  { year: 2008, title: "Nobody", artist: "원더걸스", region: "KR", description: "" },
  { year: 2008, title: "하루하루", artist: "빅뱅", region: "KR", description: "" },
  { year: 2008, title: "Poker Face", artist: "Lady Gaga", region: "GLOBAL", description: "" },
  { year: 2009, title: "Gee", artist: "소녀시대", region: "KR", description: "" },
  { year: 2009, title: "I Don't Care", artist: "2NE1", region: "KR", description: "" },
  { year: 2009, title: "I Gotta Feeling", artist: "Black Eyed Peas", region: "GLOBAL", description: "" },

  // 2010s
  { year: 2010, title: "좋은 날", artist: "아이유", region: "KR", description: "3단 고음" },
  { year: 2011, title: "Rolling in the Deep", artist: "Adele", region: "GLOBAL", description: "" },
  { year: 2012, title: "강남스타일", artist: "싸이", region: "KR", description: "글로벌 신드롬" },
  { year: 2013, title: "으르렁", artist: "EXO", region: "KR", description: "" },
  { year: 2013, title: "Get Lucky", artist: "Daft Punk", region: "GLOBAL", description: "" },
  { year: 2014, title: "Happy", artist: "Pharrell Williams", region: "GLOBAL", description: "" },
  { year: 2016, title: "Cheer Up", artist: "TWICE", region: "KR", description: "" },
  { year: 2016, title: "피 땀 눈물", artist: "BTS", region: "KR", description: "" },
  { year: 2017, title: "DNA", artist: "BTS", region: "KR", description: "글로벌 확장" },
  { year: 2017, title: "Despacito", artist: "Luis Fonsi", region: "GLOBAL", description: "" },
  { year: 2019, title: "작은 것들을 위한 시", artist: "BTS", region: "KR", description: "" },
  { year: 2019, title: "Old Town Road", artist: "Lil Nas X", region: "GLOBAL", description: "" },

  // 2020s
  { year: 2020, title: "Dynamite", artist: "BTS", region: "KR", description: "빌보드 1위" },
  { year: 2020, title: "Blinding Lights", artist: "The Weeknd", region: "GLOBAL", description: "" },
  { year: 2021, title: "Celebrity", artist: "아이유", region: "KR", description: "" },
  { year: 2021, title: "drivers license", artist: "Olivia Rodrigo", region: "GLOBAL", description: "" },
  { year: 2022, title: "Attention", artist: "뉴진스", region: "KR", description: "4세대" },
  { year: 2022, title: "As It Was", artist: "Harry Styles", region: "GLOBAL", description: "" },
  { year: 2023, title: "Ditto", artist: "뉴진스", region: "KR", description: "" },
  { year: 2023, title: "Flowers", artist: "Miley Cyrus", region: "GLOBAL", description: "" },
];

// Build the text we'll feed into the embedding model for each song.
// Keep it stable so re-runs of the seed produce deterministic vectors.
export function embeddingTextFor(s: MusicEventSeed): string {
  return s.description
    ? `${s.title} - ${s.artist} (${s.year}) ${s.description}`
    : `${s.title} - ${s.artist} (${s.year})`;
}
