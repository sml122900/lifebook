# dev 서버 실행 중 `next build` → `.next` 캐시 충돌 (Jest worker 에러)

## 문제 상황

- 2026-06-11, 환영 카드 작업 검증으로 `npx next build` 실행. 이때 사용자의 `npm run dev` 서버가 같은 프로젝트에서 떠 있었음
- prod 빌드와 dev 서버가 **같은 `.next` 폴더를 공유** → 빌드가 dev 의 캐시·매니페스트를 덮어씀
- 브라우저 런타임 에러: `Jest worker encountered 2 child process exceptions, exceeding retry limit`
- 에러 화면 헤더에 `Next.js 16.2.6 (stale)` — dev 서버가 자기 빌드 상태가 낡았음을 자각하는 표시

## 시도한 것들

1. 에러 메시지의 "Jest" 는 테스트 러너가 아니라 Next.js 내부 워커 풀(jest-worker 패키지) — 테스트 설정 문제가 아님을 먼저 확인
2. 이 레포의 기존 패턴 매칭: Auth.js dev cache stale → catch-all 404 (2026-06-08), Prisma stale client `Unknown field` — 모두 "`.next` 정리 + 프로세스 정리"가 해법이었음

## 최종 해결법

```powershell
# 1) 포트 3000 점유 프로세스 확인 (node 전체 kill 금지 — 다른 도구도 node)
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique

# 2) 그 PID 만 종료
Stop-Process -Id <PID> -Force

# 3) .next 삭제 — 1차 시도가 잔존하면(자식 프로세스 파일 잠금) 2초 후 재시도
Remove-Item -Recurse -Force .next

# 4) dev 재시작
npm run dev
```

주의: 1차 `Remove-Item` 직후 `Test-Path .next` 가 True 로 남을 수 있다 — 방금 죽인 프로세스의 자식 워커가 핸들을 놓는 데 시간이 걸림. 짧게 기다렸다 재시도하면 됨.

## 재발 방지 (작업 수칙)

- **dev 서버 떠 있는 동안 `next build` 실행 금지.** 빌드 검증 필요 시: dev 정지 → build → dev 재시작
- 타입 검증만 필요하면 `npx tsc --noEmit` 으로 충분 — `.next` 를 건드리지 않아 dev 와 공존 가능
- dev 시작 시 `.next` 자동 정리 정책 후보 (Auth.js stale·Prisma stale 패턴과 같은 영역 — CLAUDE.md 후속)

## 이력서 소재 한 줄

Next.js dev/prod 빌드의 `.next` 캐시 공유 충돌을 포트 기반 프로세스 식별로 안전 복구하고, "dev 중 build 금지 / 타입 검증은 tsc 로 분리" 작업 수칙으로 재발을 차단.
