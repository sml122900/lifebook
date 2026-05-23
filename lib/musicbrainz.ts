// MusicBrainz API wrapper used by Phase 6.4 to normalize seed song years
// and capture MBIDs.
//
// Etiquette (https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting):
// - User-Agent MUST identify the app and a contact (we use the repo URL).
// - At most one request per second per IP.
//
// We serialize via a simple in-process queue so concurrent callers can't
// burst past the limit. Per-second is conservative — bumping the floor
// to 1100ms leaves headroom for clock drift.

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Lifebook/0.1 ( https://github.com/sml122900/lifebook )";
const MIN_INTERVAL_MS = 1100;

let lastCallAt = 0;
let chain: Promise<unknown> = Promise.resolve();

function nextSlot(): Promise<void> {
  // Chain onto the previous request so two callers can't both pass the
  // throttle in the same tick.
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

function quoteLucene(s: string): string {
  // MusicBrainz search uses Lucene syntax — escape quotes and backslashes
  // so song titles with apostrophes / parens don't break the query.
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

// Policy: the seed year is canonical. MusicBrainz often returns
// re-release / cover / compilation dates as the "first-release-date" of
// the recording, which is later than the original. So we only adopt the
// MB year when it's earlier than the seed (which would mean the seed
// itself was off, not that MB found a later cover).
export function reconcileYear(seedYear: number, mbYear: number | null): number {
  if (mbYear === null) return seedYear;
  return mbYear < seedYear ? mbYear : seedYear;
}

export function mbidUrl(mbid: string): string {
  return `https://musicbrainz.org/recording/${mbid}`;
}
