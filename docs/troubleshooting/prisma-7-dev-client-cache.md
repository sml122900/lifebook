# 트러블슈팅 — Prisma 7 dev 클라이언트가 schema 변경을 못 따라감

## 문제 상황

출석체크 작업 — Prisma schema 에 `UserAttendance` 모델 추가 + migration
적용 + `prisma generate` 까지 완료. 검증 스크립트 (`db/test-attendance.ts`)
는 모든 시나리오 통과. 그런데 dev 서버에서 `/timemachine` 접속하면 친화
에러 페이지:

```
잠깐, 문제가 생겼어요
일시적인 오류일 수 있어요.
문의 시 알려주세요: 1980056835
```

dev 서버 background 로그:
```
⨯ TypeError: Cannot read properties of undefined (reading 'findUnique')
    at getAttendanceStatus (lib\attendance.ts:162:27)
> 162 |     prisma.userAttendance.findUnique({
      |                           ^
  digest: '1980056835'
```

`prisma.userAttendance` 가 `undefined`. 새 모델인데 클라이언트 객체에 없음.

## 시도한 것들

### 1. 검증 스크립트 vs dev 서버 비교

- `npx tsx db/test-attendance.ts` → 정상. 모든 시나리오 통과.
- `/timemachine` dev 서버 → undefined.

같은 schema, 같은 클라이언트 모듈. 차이 = **프로세스 라이프타임**:
- 검증 스크립트 = 매번 새 node 프로세스 → 새 require → 새 PrismaClient
- dev 서버 = `npm run dev` 띄운 후 살아있는 프로세스 → schema 변경 전에
  이미 import 된 모듈 캐시 사용

### 2. `next build` 로 caches 확인

`next build` 는 정상 완료. typed routes 검증도 OK (`/timemachine` 라우트
인식). 즉 production 빌드는 새로 컴파일하면 정상. dev runtime 만 문제.

### 3. Turbopack hot reload 동작 확인

코드 파일 (`.ts`) 변경은 Turbopack 이 잘 reload. 하지만 `lib/generated/
prisma/client.ts` 같은 생성된 파일을 import 한 모듈의 singleton 인스턴스
는 hot reload 가 안 잡음 — Node 의 require/import cache 가 살아있고,
이미 instantiate 된 PrismaClient 객체에 새 model 이 추가될 방법 없음.

## 최종 해결법

**dev 서버 재시작**.

단순한데 Windows 에서 한 가지 빠진다: TaskStop (또는 Ctrl+C) 으로 `npm
run dev` 죽여도 자식 `next dev` 프로세스가 살아남아 포트 3000 점유:

```
⚠ Port 3000 is in use by process 24500, using available port 3001 instead.
⨯ Another next dev server is already running.
- Local:        http://localhost:3000
- PID:          24500
Run taskkill /PID 24500 /F to stop it.
```

2단계 종료 필요:
1. `TaskStop` (또는 셸 Ctrl+C) — npm 죽임
2. `taskkill //PID 24500 //F` — 살아남은 자식 next dev 강제 종료

이후 `npm run dev` 재시작 → 새 PrismaClient 인스턴스가 `userAttendance`
포함된 채로 생성됨. `/timemachine` 정상 동작.

## 핵심 학습

1. **Prisma generate 후 dev runtime 무효화 = 재시작 필요**. 코드 hot
   reload 와 다름 — singleton 객체는 새 schema 를 자동 인식 못 함.

2. **Windows 의 npm 자식 프로세스는 분리됨**. `npm run dev` 죽임 ≠ `next
   dev` 죽임. POSIX 의 process group 시그널 전파가 Windows 에선 다름.
   포트 점유 메시지의 PID 가 단서.

3. **Claude Code 의 `!` 명령도 background bash task**. 사용자가 직접
   띄운 dev 서버도 TaskStop 으로 죽일 수 있음. 단 자식 분리 케이스는
   PID 직접 종료 (`taskkill /PID xxx /F`) 가 보조.

4. **production 빌드는 영향 없음**. `next build` 는 매번 새 컴파일 →
   새 클라이언트 인스턴스 → 운영 배포에선 자연스레 해결. dev 만의 문제.

## 회피 패턴

향후 schema 변경 후 같은 증상 보면:
- 표준 처리: `prisma generate` → dev 서버 재시작 (npm + PID 2단계)
- 안 풀리면: `.next/` 캐시 삭제 후 재시작 (`rm -rf .next`)

dev 서버 재시작이 무거운 작업이라 schema 변경 작업은 모아서 하는 게
효율. 검증은 tsx 스크립트가 우선 (재시작 부담 없음).

## 이력서 소재 한 줄

Prisma 7 schema 변경 후 Next.js dev 서버의 client singleton 캐시 미반영
이슈를 진단 — 검증 스크립트 vs runtime 비교로 프로세스 라이프타임 차이
확인, Windows npm 자식 프로세스 분리까지 추적해 표준 재시작 절차 정립.
