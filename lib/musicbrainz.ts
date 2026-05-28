// Phase 6.4 가 시드 곡의 연도를 정규화하고 MBID 를 얻으려고 쓰는
// MusicBrainz API 래퍼.
//
// 예의(https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting):
// - User-Agent 에 앱과 연락처를 반드시 밝힌다(여기선 repo URL).
// - IP 당 초당 최대 1요청.
//
// 동시 호출이 한도를 넘지 못하게 간단한 인프로세스 큐로 직렬화한다.
// 초당 1회는 보수적 — 1100ms 로 잡아 시계 오차 여유를 둔다.

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Lifebook/0.1 ( https://github.com/sml122900/lifebook )";
const MIN_INTERVAL_MS = 1100;

let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();

// 직전 요청에 이어 붙여, 두 호출자가 같은 tick 에 스로틀을 함께 통과하지
// 못하게 한다(초당 1회 보장).
function nextSlot(): Promise<void> {
  const slot = chain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastCallAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastCallAt = Date.now();
  });
  chain = slot.catch(() => undefined);
  return slot;
}

export type MusicBrainzMatch = {
  mbid: string;
  firstReleaseYear: number | null;
  title: string;
  artist: string;
};

type RecordingResult = {
  id: string;
  title?: string;
  "first-release-date"?: string;
  "artist-credit"?: Array<{ name?: string; artist?: { name?: string } }>;
};

type RecordingResponse = {
  recordings?: RecordingResult[];
};

function parseYear(date: string | undefined): number | null {
  if (!date) return null;
  const m = date.match(/^(\d{4})/);
  return m ? Number(m[1]) : null;
}

// MusicBrainz 검색은 Lucene 문법 — 따옴표·역슬래시를 이스케이프해
// 아포스트로피/괄호가 든 곡 제목이 쿼리를 깨뜨리지 않게 한다.
function quoteLucene(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function searchRecording(
  title: string,
  artist: string,
): Promise<MusicBrainzMatch | null> {
  await nextSlot();

  const query = `recording:"${quoteLucene(title)}" AND artist:"${quoteLucene(artist)}"`;
  const url = `${MB_BASE}/recording?query=${encodeURIComponent(query)}&fmt=json&limit=1`;

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MusicBrainz ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as RecordingResponse;
  const rec = json.recordings?.[0];
  if (!rec) return null;

  const artistName =
    rec["artist-credit"]?.[0]?.name ??
    rec["artist-credit"]?.[0]?.artist?.name ??
    artist;

  return {
    mbid: rec.id,
    firstReleaseYear: parseYear(rec["first-release-date"]),
    title: rec.title ?? title,
    artist: artistName,
  };
}

// 정책: 시드 연도가 기준이다. MusicBrainz 는 종종 재발매/커버/컴필레이션
// 날짜를 그 recording 의 "first-release-date" 로 돌려주는데 이는 원곡보다
// 늦다. 그래서 MB 연도가 시드보다 "이를 때만" 채택한다(이 경우 시드가
// 틀렸다는 뜻이지, MB 가 나중 커버를 찾은 게 아님).
export function reconcileYear(seedYear: number, mbYear: number | null): number {
  if (mbYear === null) return seedYear;
  return mbYear < seedYear ? mbYear : seedYear;
}

export function mbidUrl(mbid: string): string {
  return `https://musicbrainz.org/recording/${mbid}`;
}
