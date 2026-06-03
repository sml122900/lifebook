// Phase Place — 장소 매칭 순수 타입/상수.
//
// life-events.ts 는 prisma(node-only pg 의존) 를 import 하므로 클라 컴포넌트
// 가 같은 파일에서 PlaceInfo/EMPTY_PLACE 를 가져오면 pg → dns 까지 끌어와
// 브라우저 번들이 깨진다. 그래서 클라/서버 공용 순수 모듈로 분리.
//
// life-events.ts 는 호환을 위해 여기서 re-export. 서버 코드는 어디서 import
// 하든 같음. 클라 코드는 반드시 이 파일에서.

export type PlaceInfo = {
  placeName: string | null;
  placeAddress: string | null;
  lat: number | null;
  lng: number | null;
  placeSource: string | null;
};

export const EMPTY_PLACE: PlaceInfo = {
  placeName: null,
  placeAddress: null,
  lat: null,
  lng: null,
  placeSource: null,
};
