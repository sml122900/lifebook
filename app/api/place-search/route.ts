// Phase Place — 장소 검색 API.
//
// POST /api/place-search
//   { query: string, source: "naver" | "google" }
//
// 사용자가 UI 에서 네이버/구글 중 직접 선택. 자동 분기는 사용자 의도와
// 어긋날 수 있어 (예: 한글로 "Tokyo Tower" 검색) 제거함(2026-06-03).
//
// 응답: { ok: true, source, results: [{name, address, lat, lng}] } (최대 5)
//        { ok: false, error: string }
//
// 인증: auth() 세션 필수. 비로그인은 401. (지도 API 키 보호 + 남용 차단.)
// 검증: query 1~100 자 trim 후.

import { NextResponse } from "next/server";

import { auth } from "@/auth";

const RESULT_LIMIT = 5;
const NETWORK_TIMEOUT_MS = 5000;

export type PlaceResult = {
  name: string;        // "강원도 춘천시 근화동" (UI 표시용)
  address: string;     // 더 자세한 주소 (있으면)
  lat: number | null;  // 위도 (없을 수 있음)
  lng: number | null;  // 경도
};

type ParsedBody =
  | { ok: true; query: string; source: "naver" | "google" }
  | { ok: false; error: string };

function parseBody(raw: unknown): ParsedBody {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "요청 본문이 비어있어요." };
  }
  const o = raw as { query?: unknown; source?: unknown };
  const q = typeof o.query === "string" ? o.query.trim() : "";
  if (q.length === 0) return { ok: false, error: "검색어를 적어주세요." };
  if (q.length > 100) return { ok: false, error: "검색어는 100자 이하로 적어주세요." };
  const s = o.source;
  if (s !== "naver" && s !== "google") {
    return { ok: false, error: "잘못된 검색 엔진이에요." };
  }
  return { ok: true, query: q, source: s };
}

// M12 — AbortController 로 실제 fetch cancel. Promise.race 만 쓰면 timeout
// 후에도 underlying fetch 가 계속 돌아 소켓/메모리 누수. signal 로 끊으면
// 네트워크 레벨에서 정리.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    // AbortError 를 우리 메시지로 통일.
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("지도 검색 요청이 너무 오래 걸려 끊었어요.");
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

// ────────────────────────────────────────────────────────────────────
// 네이버 — 검색 API (지역). 응답 좌표는 WGS84*10^7 (mapx=경도, mapy=위도).
// ────────────────────────────────────────────────────────────────────

type NaverRow = {
  title: string;       // <b> 태그 포함 가능 — 제거 필요
  address: string;
  roadAddress?: string;
  mapx?: string;       // 경도 * 10^7
  mapy?: string;       // 위도 * 10^7
};

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function parseNaverCoord(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  // WGS84 * 10^7 → 일반 도(°). 위도 정상 범위 [-90, 90], 경도 [-180, 180].
  return n / 1e7;
}

async function searchNaver(query: string): Promise<PlaceResult[]> {
  const id = process.env.NAVER_MAP_CLIENT_ID;
  const secret = process.env.NAVER_MAP_CLIENT_SECRET;
  if (!id || !secret || id.startsWith("여기에_")) {
    throw new Error("네이버 키가 설정 안 돼있어요.");
  }
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(
    query,
  )}&display=${RESULT_LIMIT}`;
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "X-Naver-Client-Id": id,
        "X-Naver-Client-Secret": secret,
      },
      cache: "no-store",
    },
    NETWORK_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`네이버 검색 실패 (${res.status})`);
  }
  const data = (await res.json()) as { items?: NaverRow[] };
  const items = Array.isArray(data.items) ? data.items : [];
  return items.slice(0, RESULT_LIMIT).map((r) => ({
    name: stripHtml(r.title),
    address: r.roadAddress || r.address || "",
    lat: parseNaverCoord(r.mapy),
    lng: parseNaverCoord(r.mapx),
  }));
}

// ────────────────────────────────────────────────────────────────────
// 구글 — Places API (New) Text Search.
// ────────────────────────────────────────────────────────────────────

type GooglePlace = {
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

async function searchGoogle(query: string): Promise<PlaceResult[]> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key.startsWith("여기에_")) {
    throw new Error("구글 키가 설정 안 돼있어요.");
  }
  const res = await fetchWithTimeout(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // 필요한 필드만 — Places API 가 fieldMask 요구.
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: RESULT_LIMIT,
        languageCode: "ko",
      }),
      cache: "no-store",
    },
    NETWORK_TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new Error(`구글 검색 실패 (${res.status})`);
  }
  const data = (await res.json()) as { places?: GooglePlace[] };
  const places = Array.isArray(data.places) ? data.places : [];
  return places.slice(0, RESULT_LIMIT).map((p) => ({
    name: p.displayName?.text ?? p.formattedAddress ?? "",
    address: p.formattedAddress ?? "",
    lat: typeof p.location?.latitude === "number" ? p.location.latitude : null,
    lng: typeof p.location?.longitude === "number" ? p.location.longitude : null,
  }));
}

// ────────────────────────────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청이에요." },
      { status: 400 },
    );
  }

  const parsed = parseBody(raw);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  try {
    const results =
      parsed.source === "naver"
        ? await searchNaver(parsed.query)
        : await searchGoogle(parsed.query);
    return NextResponse.json({ ok: true, source: parsed.source, results });
  } catch (e) {
    const msg =
      e instanceof Error && e.message
        ? e.message
        : "장소 검색에 실패했어요.";
    return NextResponse.json(
      { ok: false, error: msg, source: parsed.source },
      { status: 502 },
    );
  }
}
