// Phase Place — 지도 타일 렌더 컴포넌트의 공통 props.
//
// 동일 인터페이스를 NaverMap / GoogleMap 둘 다 구현 → 호출자(PlaceSearchInput)
// 가 source 만 보고 컴포넌트만 바꿔 끼우면 됨. focusedIdx 는 hover/클릭으로
// 강조할 마커 인덱스 (null 이면 강조 없음).

export type MapMarker = {
  lat: number;
  lng: number;
  name: string;
  address: string;
};

export type MapProps = {
  markers: MapMarker[];
  focusedIdx: number | null;
  // 지도 컨테이너의 sizing 클래스. Tailwind 반응형 사용 가능
  // (예: "h-[200px] sm:h-[300px]"). 비우면 h-[200px] 기본.
  className?: string;
  onMarkerClick?: (idx: number) => void;
};

// 서울 시청 — markers 가 비어있을 때 지도 초기 중심.
export const SEOUL_CITY_HALL = { lat: 37.5665, lng: 126.978 };
