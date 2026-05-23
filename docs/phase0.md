# Phase 0 — 프로젝트 셋업

> **목표**: 코드를 본격적으로 쓰기 전, "Next.js 앱이 뜨고 + Postgres(pgvector)에 연결되는" 빈 기반을 완성한다.
> **선행 조건**: Node.js 20.9+ , Docker Desktop 설치됨, Git 설정됨.
> **작업 방식**: 아래 태스크를 **0.1부터 순서대로 하나씩**. 각 태스크의 "완료 기준"을 만족하면 커밋하고 다음으로.

---

## 0.1 — Next.js 프로젝트 생성

**목적**: TypeScript·Tailwind·ESLint·App Router가 모두 깔린 베이스를 만든다.

**작업**

- 프로젝트 루트에서 실행:
  ```bash
  npx create-next-app@latest .
  ```
- 프롬프트에서 **"recommended defaults"** 선택.
  (현재 create-next-app은 기본으로 TypeScript + Tailwind CSS + ESLint + App Router + Turbopack + import alias `@/*` 를 설정하고, `AGENTS.md`와 이를 참조하는 `CLAUDE.md`를 자동 생성한다.)
- ⚠️ create-next-app이 생성한 `CLAUDE.md`는 **Next.js 에이전트 가이드용**이다. 우리가 작성한 프로젝트 컨텍스트 `CLAUDE.md`(루트)는 그대로 두고, 자동 생성본의 내용이 유용하면 `AGENTS.md` 쪽으로 합치거나 우리 `CLAUDE.md` 하단에 참조 링크만 남긴다. (둘이 충돌하지 않게 정리)

**완료 기준**: `npm run dev` 실행 시 `http://localhost:3000`에서 기본 페이지가 뜬다.

---

## 0.2 — 폴더 구조 + 기본 레이아웃

**목적**: 이후 phase들이 들어갈 자리를 미리 만든다.

**작업**

- 다음 폴더를 생성 (비어 있어도 `.gitkeep`):
  ```
  components/
  lib/
  db/
  docs/
  ```
- `app/layout.tsx`: 한국어 기준 `<html lang="ko">`, 기본 폰트/배경 설정.
- `app/page.tsx`: 임시 홈 — 서비스명과 "타임라인 보기" 링크(`/timeline`, 아직 빈 페이지) 정도만.
- **시니어 접근성 기본값**을 글로벌 CSS에 반영: 기본 본문 글자 크기를 키우고(예: 18px 이상), 고대비 색 토큰을 변수로 정의.

**완료 기준**: 홈 화면에 서비스명이 보이고, 폴더 구조가 잡혀 있다.

---

## 0.3 — 문서 배치

**목적**: 기획·작업지시 문서를 레포 안에 둬서 Claude Code가 참조하게 한다.

**작업**

- `docs/` 에 다음을 넣는다:
  - `docs/PRD.md` (전체 기획서)
  - `docs/phase0.md` (이 파일)
- 루트 `CLAUDE.md` (프로젝트 컨텍스트)는 이미 루트에 있다. 없으면 추가.

**완료 기준**: `docs/PRD.md`, `docs/phase0.md`, 루트 `CLAUDE.md`가 레포에 존재한다.

---

## 0.4 — Postgres + pgvector (Docker)

**목적**: 로컬 개발용 DB를 띄운다. 이후 RAG를 위해 pgvector 확장을 미리 활성화한다.

**작업**

- 루트에 `docker-compose.yml`:
  ```yaml
  services:
    db:
      image: pgvector/pgvector:pg17
      restart: unless-stopped
      environment:
        POSTGRES_USER: app
        POSTGRES_PASSWORD: app
        POSTGRES_DB: lifelog
      ports:
        - "5432:5432"
      volumes:
        - pgdata:/var/lib/postgresql/data
        - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql
  volumes:
    pgdata:
  ```
- `db/init.sql`:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```
- 실행: `docker compose up -d`

**완료 기준**: `docker compose ps`에서 db 컨테이너가 healthy/running. 컨테이너 안에서 `SELECT extname FROM pg_extension;` 했을 때 `vector`가 보인다.

---

## 0.5 — 환경변수 + .gitignore

**목적**: 비밀값을 코드에서 분리하고, 실수로 커밋되지 않게 한다.

**작업**

- `.env` (gitignore 대상):
  ```
  DATABASE_URL="postgresql://app:app@localhost:5432/lifelog"
  ANTHROPIC_API_KEY=""        # Phase 7에서 사용
  ```
- `.env.example`: 위와 동일하되 값은 빈 문자열 (커밋용 템플릿).
- `.gitignore`에 `.env`, `node_modules`, `.next` 포함 확인 (create-next-app이 대부분 처리함).

**완료 기준**: `.env`는 git에 추적되지 않고, `.env.example`은 추적된다.

---

## 0.6 — Prisma 설치 + DB 연결 확인

**목적**: ORM을 붙이고 "앱 ↔ DB"가 실제로 통하는지 확인한다. (모델 정의는 Phase 1)

**작업**

- 설치:
  ```bash
  npm i -D prisma
  npm i @prisma/client
  npx prisma init --datasource-provider postgresql
  ```
- `prisma/schema.prisma`의 `datasource db` 가 `env("DATABASE_URL")`을 쓰는지 확인. (모델은 아직 비워둠)
- `npx prisma generate`
- `lib/db.ts`에 Prisma 클라이언트 싱글톤 작성.
- 연결 확인용 임시 스크립트 `db/ping.ts` 작성:
  ```ts
  import { prisma } from "../lib/db";
  async function main() {
    const r = await prisma.$queryRaw`SELECT 1 as ok`;
    console.log("DB OK:", r);
  }
  main().finally(() => process.exit(0));
  ```
  실행: `npx tsx db/ping.ts` (필요 시 `npm i -D tsx`)

**완료 기준**: `db/ping.ts` 실행 시 `DB OK: [ { ok: 1 } ]`가 출력된다.
**완료 후**: 확인용 `db/ping.ts`는 지워도 되고, `db/`에 남겨둬도 된다.

---

## 0.7 — 코드 품질 도구 (Prettier)

**목적**: 포맷을 통일한다. (ESLint는 create-next-app이 이미 설정)

**작업**

- `npm i -D prettier`
- `.prettierrc` 기본 설정 작성, `package.json`에 `"format": "prettier --write ."` 스크립트 추가.
- 한 번 `npm run format` 실행.

**완료 기준**: `npm run lint`와 `npm run format`이 에러 없이 돈다.

---

## ✅ Phase 0 체크포인트 (완료 기준)

아래가 모두 참이면 Phase 0 종료, Phase 1로 넘어간다.

- [ ] `npm run dev` → 홈 화면이 뜬다 (서비스명 + /timeline 링크)
- [ ] `docker compose up -d` → Postgres 컨테이너 실행 + `vector` 확장 활성
- [ ] `db/ping.ts`(또는 동등 확인) → 앱이 DB에 SELECT 1 성공
- [ ] `.env`는 추적 제외, `.env.example` 존재
- [ ] `npm run lint` / `npm run format` 통과
- [ ] 여기까지 의미 단위로 커밋되어 있음

---

## 커밋 가이드 (예시)

- `chore: init next.js app with ts/tailwind/eslint`
- `chore: add folder structure and base layout`
- `docs: add PRD and phase0`
- `feat: add postgres+pgvector docker compose`
- `chore: env files and gitignore`
- `feat: add prisma and verify db connection`
- `chore: add prettier`

---

## 다음 단계

Phase 0가 끝나면 알려달라. `docs/phase1.md`(데이터 모델 정의 + 앵커 이벤트 시드)를 만들어 이어서 진행한다.
