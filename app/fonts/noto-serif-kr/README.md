# Noto Serif KR (제목용 명조)

- 라이선스: SIL Open Font License 1.1 — 같은 폴더 `OFL.txt`. Reserved Font Name 없음(이름 그대로 써도 됨). 글꼴 안 이름표(name 표)의 저작권·라이선스 문구를 그대로 남겼다.
- 원본: `google/fonts` `ofl/notoserifkr/NotoSerifKR[wght].ttf` (받은 날 2026-11-07, 원 저장소 `notofonts/noto-cjk` 커밋 `985fa52c`).
- 만든 방법(fontTools 4.68 · brotli): 가변 글꼴을 굵기 400·700 으로 고정(`varLib.instancer`) → 글자 범위 2조각으로 나눠(`subset`, 조판 기능 전부 유지) woff2.

| 조각 | 글자 | 400 | 700 |
|---|---|---|---|
| `core` | 라틴·문장 부호 + KS X 1001 한글 2,350 + 기호 줄 + 호환 자모 + CJK 기호 | 370KB | 380KB |
| `rest` | 원본의 나머지 전부(드문 한글·한자 등) | 2.84MB | 2.96MB |

`app/layout.tsx` 가 두 조각을 따로 불러 `--font-serif` 에 `core`, `rest` 차례로 둔다. 브라우저는 앞 글꼴에 없는 글자가 나올 때만 `rest` 를 받는다.
