"use client";

import { GoogleMap } from "./GoogleMap";
import { NaverMap } from "./NaverMap";
import type { MapProps } from "./types";

// Phase Place — source 로 NaverMap / GoogleMap 분기.
// 호출자 코드 단순화 + 두 SDK 가 같은 인터페이스로 보이게.

export function PlaceMap({
  source,
  ...rest
}: MapProps & { source: "naver" | "google" }) {
  if (source === "naver") return <NaverMap {...rest} />;
  return <GoogleMap {...rest} />;
}
