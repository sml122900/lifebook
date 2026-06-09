// Phase Place — 서버 측 장소 검증(순수 함수). life_event(life-timeline/actions)
// 와 photo(photos/actions·api) 양쪽에서 재사용. "use server" 파일 안에 두면
// 비-async export 가 막혀 import 할 수 없어 순수 모듈로 분리했다.
//
// 정책:
//   - placeName 없으면 전체 null (장소 미선택)
//   - placeSource 가 naver/google 외면 전체 null (H7 — 어중간한 상태 회피)
//   - lat/lng 는 유효 범위(WGS84) 안일 때만 채움
//   - 이름/주소 길이 cap

import type { PlaceInfo } from "./place-types";

export type RawPlace =
  | {
      placeName: string | null;
      placeAddress: string | null;
      lat: number | null;
      lng: number | null;
      placeSource: string | null;
    }
  | undefined;

const PLACE_NAME_MAX = 200;
const PLACE_ADDR_MAX = 300;

const EMPTY: PlaceInfo = {
  placeName: null,
  placeAddress: null,
  lat: null,
  lng: null,
  placeSource: null,
};

export function validatePlace(
  raw: RawPlace,
): { ok: true; place: PlaceInfo } | { ok: false; error: string } {
  if (!raw || !raw.placeName) {
    return { ok: true, place: EMPTY };
  }
  const name = typeof raw.placeName === "string" ? raw.placeName.trim() : "";
  if (name === "") {
    return { ok: true, place: EMPTY };
  }
  if (name.length > PLACE_NAME_MAX) {
    return { ok: false, error: "장소 이름이 너무 길어요." };
  }
  const addr =
    typeof raw.placeAddress === "string" && raw.placeAddress.trim() !== ""
      ? raw.placeAddress.trim()
      : null;
  if (addr && addr.length > PLACE_ADDR_MAX) {
    return { ok: false, error: "장소 주소가 너무 길어요." };
  }
  // H7 — placeSource 가 알 수 없는 값이면 전체 거부(모두 null). lat/lng 만
  // 남고 source 가 null 인 어중간한 상태 회피.
  if (raw.placeSource !== "naver" && raw.placeSource !== "google") {
    return { ok: true, place: EMPTY };
  }
  const source = raw.placeSource;
  let lat: number | null = null;
  let lng: number | null = null;
  if (
    typeof raw.lat === "number" &&
    typeof raw.lng === "number" &&
    Number.isFinite(raw.lat) &&
    Number.isFinite(raw.lng) &&
    raw.lat >= -90 &&
    raw.lat <= 90 &&
    raw.lng >= -180 &&
    raw.lng <= 180
  ) {
    lat = raw.lat;
    lng = raw.lng;
  }
  return {
    ok: true,
    place: { placeName: name, placeAddress: addr, lat, lng, placeSource: source },
  };
}
