# 빌드가 Google 글꼴 받기에서 실패

## 증상

`next build` 가 코드 변경 없이 가끔 실패했다. 다시 돌리면 통과.

```
Error: Turbopack build failed with 248 errors:
Error while looking up import map: next/font/google queries have exactly one entry
[next]/internal/font/google/noto_serif_kr_….module.css — Module not found
```

## 원인

`app/layout.tsx` 의 `next/font/google`(Noto Serif KR)은 빌드 때 Google 에서 글꼴 정의와 파일을 받는다. 실패는 전부 그 글꼴 조각들에서 났다. 왜 그 단계가 실패하는지(네트워크인지 Turbopack 인지)는 가르지 못했다 — 받는 단계를 없애는 쪽으로 해결해서 더 조사하지 않았다.

## 해결(2026-11-07)

`next/font/local` + 저장소 파일 `app/fonts/noto-serif-kr/`(SIL OFL 1.1, 만든 방법은 그 폴더 `README.md`).

- 빌드 5번 연속 통과.
- 굵기 400·700 × 글자 범위 2조각. 파일 하나로 합치면 굵기당 3.2MB 를 모든 첫 화면에서 받게 된다. `core`(라틴 + 자주 쓰는 한글 2,350, 굵기당 약 380KB)를 먼저 쓰고, 거기 없는 글자가 나올 때만 `rest`(굵기당 약 2.9MB)를 받는다. `unicode-range` 없이 `--font-serif` 의 순서만으로 된다(앞 글꼴에 글자가 있으면 뒤 글꼴을 안 받는다).
- 화면 비교(390·1280, 12경로 — 이 중 `/settings` 는 없는 주소라 404 화면): 화면 크기·제목 상자 차이 0. 달라진 픽셀은 글자 가장자리 몇 점과 거래 시각(찍은 시각 차이)뿐.
- 첫 화면 제목 글꼴: 조각 8개 287KB → 1개 380KB. 그다음 화면은 추가로 받을 것 없음(전에는 화면마다 조각을 더 받았다).
- 받는 동안의 표시: 전에는 라틴 조각만 미리 받았는데 이제 미리 받기 없음. 첫 방문에 영문 제목이 잠깐 대체 글꼴로 보일 수 있다(한글 제목은 전에도 같았다).

## 남겨 둔 것

런타임에 Google 글꼴을 쓰는 곳은 빌드와 무관해서 그대로다: `app/opengraph-image.tsx`(공유 그림), `app/poster/PosterCompose.tsx`(포스터 — 글꼴 이름 `"Noto Serif KR"` 을 직접 쓰고 Google 스타일시트를 따로 넣는다).
