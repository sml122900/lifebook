// Phase Place — 장소 검색 API.
//
// POST /api/place-search
//   { query: string, source: "naver" | "google" }          -- 기존 text search
//   { action: "autocomplete", query: string }              -- 구글 자동완성 후보
//   { action: "detail", placeId: string }                  -- 구글 장소 상세 조회
//
// 사용자가 UI 에서 네이버/구글 중 직접 선택. 자동 분기는 사용자 의도와
// 어긋날 수 있어 (예: 한글로 "Tokyo Tower" 검색) 제거함(2026-06-03).
//
// 응답: { ok: true, source, results: [...] }               -- search
//        { ok: true, action:"autocomplete", suggestions: [{text, placeId}] }
//        { ok: true, action:"detail", result: PlaceResult }
//        { ok: false, error: string }
//
// 인증: auth() 세션 필수. 비로그인은 401. (지도 API 키 보호 + 남용 차단.)
// 검증: query 1~100 자 trim 후. placeId 는 alphanumeric+_- 로 path injection 차단.

import { NextResponse } from "next/server";

import { auth } from "@/auth";

const RESULT_LIMIT = 5;
const NETWORK_TIMEOUT_MS = 5000;
const GOOGLE_TIMEOUT_MS = 8000; // autocomplete/detail 은 여유 있게

// Google Place ID 는 base64url 계열 — 경로 주입 방지
const PLACE_ID_RE = /^[A-Za-z0-9_-]{5,200}$/;

export type PlaceResult = {
  name: string;        // "강원도 춘천시 근화동" (UI 표시용)
  address: string;     // 더 자세한 주소 (있으면)
  lat: number | null;  // 위도 (없을 수 있음)
  lng: number | null;  // 경도
};

export type AutocompleteSuggestion = {
  text: string;     // 표시용 전체 텍스트 (예: "서울특별시 강남역사거리")
  placeId: string;  // 상세 조회용 ID
};

type ParsedBody =
  | { ok: true; action: "search"; query: string; source: "naver" | "google" }
  | { ok: true; action: "autocomplete"; query: string }
  | { ok: true; action: "detail"; placeId: string }
  | { ok: false; error: string };

function parseBody(raw: unknown): ParsedBody {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "요청 본문이 비어있어요." };
  }
  const o = raw as Record<string, unknown>;
  const action = typeof o.action === "string" ? o.action : "search";

  if (action === "autocomplete") {
    const q = typeof o.query === "string" ? o.query.trim() : "";
    if (!q) return { ok: false, error: "검색어를 적어주세요." };
    if (q.length > 100) return { ok: false, error: "검색어는 100자 이하로 적어주세요." };
    return { ok: true, action: "autocomplete", query: q };
  }

  if (action === "detail") {
    const id = typeof o.placeId === "string" ? o.placeId.trim() : "";
    if (!id || !PLACE_ID_RE.test(id)) return { ok: false, error: "잘못된 장소 ID에요." };
    return { ok: true, action: "detail", placeId: id };
  }

  // action === "search" (기존 호환)
  const q = typeof o.query === "string" ? o.query.trim() : "";
  if (!q) return { ok: false, error: "검색어를 적어주세요." };
  if (q.length > 100) return { ok: false, error: "검색어는 100자 이하로 적어주세요." };
  const s = o.source;
  if (s !== "naver" && s !== "google") {
    return { ok: false, error: "잘못된 검색 엔진이에요." };
  }
  return { ok: true, action: "search", query: q, source: s };
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
  // developers.naver.com 한 앱의 Client ID/Secret 으로 네이버 로그인과 검색
  // API 를 함께 쓴다 → Auth.js 규약(AUTH_NAVER_*)으로 통일해 키를 공유.
  const id = process.env.AUTH_NAVER_ID;
  const secret = process.env.AUTH_NAVER_SECRET;
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
// 구글 — Places API (New) Text Search (기존 검색 경로).
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
// 구글 — Places API (New) Autocomplete. 타이핑 중 후보 목록 반환.
// 좌표 없음 — 선택 후 places:get 으로 상세 조회.
// ────────────────────────────────────────────────────────────────────

type GoogleAutocompleteSuggestion = {
  placePrediction?: {
    text?: { text?: string };
    placeId?: string;
  };
};

async function autocompleteGoogle(input: string): Promise<AutocompleteSuggestion[]> {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key || key.startsWith("여기에_")) {
      console.error("[google-autocomplete] missing key env (GOOGLE_MAPS_API_KEY)");
      return [];
    }

    // body 는 JSON.stringify → Node.js 기본 UTF-8. Content-Type 에 charset=utf-8
    // 명시로 서버가 별도 인코딩 재해석하지 않도록 한다 (mojibake 방지).
    const res = await fetchWithTimeout(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "X-Goog-Api-Key": key,
        },
        body: JSON.stringify({
          input,
          languageCode: "ko",
          regionCode: "KR",
          locationBias: {
            circle: {
              center: { latitude: 37.5665, longitude: 126.9780 },
              radius: 100000.0,
            },
          },
        }),
        cache: "no-store",
      },
      GOOGLE_TIMEOUT_MS,
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[google-autocomplete] status", res.status, body.slice(0, 300));
      return [];
    }

    const data = (await res.json()) as { suggestions?: GoogleAutocompleteSuggestion[] };
    const items = Array.isArray(data?.suggestions) ? data.suggestions : [];
    return items
      .slice(0, RESULT_LIMIT)
      .flatMap((s) => {
        const pp = s.placePrediction;
        const text = pp?.text?.text;
        const placeId = pp?.placeId;
        if (!text || !placeId) return [];
        return [{ text, placeId }];
      });
  } catch (e) {
    console.error("[google-autocomplete] threw", e instanceof Error ? e.message : e);
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────
// 구글 — Places API (New) 장소 상세 조회. Autocomplete 선택 후 좌표 확보용.
// ────────────────────────────────────────────────────────────────────

async function getGooglePlaceDetail(placeId: string): Promise<PlaceResult | null> {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key || key.startsWith("여기에_")) {
      console.error("[google-detail] missing key env (GOOGLE_MAPS_API_KEY)");
      return null;
    }

    const res = await fetchWithTimeout(
      `https://places.googleapis.com/v1/places/${placeId}?languageCode=ko`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
        },
        cache: "no-store",
      },
      GOOGLE_TIMEOUT_MS,
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[google-detail] status", res.status, body.slice(0, 300));
      return null;
    }

    const p = (await res.json()) as GooglePlace;
    return {
      name: p.displayName?.text ?? p.formattedAddress ?? "",
      address: p.formattedAddress ?? "",
      lat: typeof p.location?.latitude === "number" ? p.location.latitude : null,
      lng: typeof p.location?.longitude === "number" ? p.location.longitude : null,
    };
  } catch (e) {
    console.error("[google-detail] threw", e instanceof Error ? e.message : e);
    return null;
  }
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
    if (parsed.action === "autocomplete") {
      const suggestions = await autocompleteGoogle(parsed.query);
      return NextResponse.json({ ok: true, action: "autocomplete", suggestions });
    }

    if (parsed.action === "detail") {
      const result = await getGooglePlaceDetail(parsed.placeId);
      if (!result) {
        return NextResponse.json({ ok: false, error: "장소를 찾지 못했어요." }, { status: 502 });
      }
      return NextResponse.json({ ok: true, action: "detail", result });
    }

    // action === "search"
    const results =
      parsed.source === "naver"
        ? await searchNaver(parsed.query)
        : await searchGoogle(parsed.query);
    return NextResponse.json({ ok: true, source: parsed.source, results });
  } catch (e) {
    // H1 — 외부 API 오류(403/키 미설정/네트워크 등) 의 원본 메시지는
    // 서버 로그에만. 사용자에겐 친화 메시지 한 가지로 통일 — "구글 검색
    // 실패 (403)" 같은 운영자용 디테일이 어르신 화면에 흐르지 않게.
    // 입력 검증 오류(parseBody 400) 는 위에서 그대로 통과시킴.
    const action = (parsed as { action?: string }).action ?? "search";
    console.error("[place-search] external API failed", {
      action,
      message: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      {
        ok: false,
        error: "장소를 찾지 못했어요. 다른 이름으로 찾아보시겠어요?",
      },
      { status: 502 },
    );
  }
}
