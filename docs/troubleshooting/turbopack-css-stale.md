# 트러블슈팅 — Turbopack 이 globals.css 변경을 HMR 로 안 잡음

## 문제 상황

다크모드 구현 중 `app/globals.css` 에 의미색 토큰 swap 을 추가:

```css
.dark {
  --color-rose-50: oklch(0.271 0.105 12.094);  /* 새로 추가 */
  --color-amber-50: oklch(0.279 0.077 46);
  /* ... */
}
```

저장 후 브라우저 새로고침해도 의미색 카드가 다크 톤으로 안 바뀜. dev 서버
로그에 `✓ Compiled in Nms` 표시 없음. 컴파일된 CSS 검사:

```bash
curl -s http://localhost:3000/_next/static/chunks/app_globals_0jn8.0u.css | awk '/^.dark \{/,/^\}/'
# .dark {
#   --color-zinc-200: #292929;
#   --color-zinc-900: #f5f5f5;
# }  ← rose/amber 등 새로 추가한 의미색 변수가 없음
```

소스 파일 `app/globals.css` 에는 분명히 들어가 있음. CSS asset 해시
(`0jn8.0u.css`) 도 그대로. Turbopack 이 파일 변경을 감지 못함 또는 cache 가
이전 산출물을 계속 서빙.

## 시도한 것들

1. **브라우저 강력 새로고침 (Ctrl+Shift+R)** — CSS asset URL 이 동일해서 의미
   없음. 서버 산출물 자체가 그대로.

2. **파일 touch** — PowerShell 로 LastWriteTime 갱신:
   ```ps1
   (Get-Item app/globals.css).LastWriteTime = Get-Date
   ```
   여전히 새 CSS 안 나옴. Turbopack 의 watcher 가 이 변경을 못 봄.

3. **다른 페이지 요청으로 컴파일 트리거 시도** — `/timeline` `/billing` 모두
   200 응답하지만 globals.css chunk 는 그대로.

4. **`.next` 캐시 삭제 + 재시작** — 작동.

## 최종 해결법

```bash
# dev 서버 죽이고
.next 삭제 + npm run dev 재시작
```

PowerShell:
```ps1
Get-NetTCPConnection -LocalPort 3000 |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Remove-Item -Recurse -Force .next
npm run dev
```

검증:
```bash
curl -s http://localhost:3000/_next/static/chunks/app_globals_0jn8.0u.css |
  awk '/^.dark \{/,/^\}/'
# .dark {
#   --color-rose-50: #4d0218;     ← 새로 추가한 변수 들어옴
#   --color-amber-50: #461901;
#   ...
# }
```

## 핵심 학습

Turbopack (Next.js 16) 의 알려진 한계:

- **`@theme`/`@custom-variant` 변경은 HMR 로 잘 안 잡힘**. JS/TS 변경은 잘
  반응하는데 글로벌 CSS 의 토큰 추가는 cold start 가 안전.
- **dev 로그에 `✓ Compiled` 가 안 보이면 의심**. 그 시점 변경은 무시된 것.
- **CSS asset 해시 (`...0u.css`) 가 그대로면 100% stale**. content hash 가
  변경을 정확히 반영해야 정상.

회피 패턴:

1. `globals.css` 큰 변경 후엔 dev 재시작이 가장 안전 (1초 비용 vs 디버깅 30분)
2. CSS asset 검증을 컬 명령으로: `curl ...css | grep "내가 추가한 변수"`
3. `.next` 의 dev cache 가 자주 깨지므로 의심스러우면 삭제 후 재시작

## 이력서 소재 한 줄

Tailwind v4 + Turbopack 에서 글로벌 CSS 변수 추가가 HMR 에 무시되는 케이스를
컴파일 산출물 검증 (`curl` + `awk`) 으로 진단 → `.next` 캐시 삭제 + 재시작
패턴으로 회피. 디자인 토큰 변경 시 안전한 워크플로 정립.
