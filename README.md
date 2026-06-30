# Lifebook (라이프북)

> AI와 함께 인생 이야기를 기록하고, 그 연혁으로 **인생 나무 포스터**를 만드는 회고 서비스.
> 시대의 큰 사건을 단서 삼아 흐릿한 개인 기억을 되살리고, 가족과 함께 떠들 수 있게 한다.
> **30대 이상 전 연령, 특히 고령층**을 핵심 타깃으로 하여 시니어 접근성(큰 글씨·고대비·단순한 동선)을 UX 기본 원칙으로 삼는다.

---

## 주요 기능

- **AI 대화로 이야기 기록** — 음성/텍스트로 풀어놓으면 AI 동반자가 인생 연혁에 자동 정리(Claude API).
- **인생 연혁 (가로/세로 시간축)** — 출생·학창·군대·결혼 등 큰 줄기를 시간축에 배치. 앵커(정확)·사이(대략) 구분.
- **그 시절 둘러보기** — 1980~2010년대 시대 사건·음악 카탈로그에서 내 연혁에 담기.
- **인생 포스터** — 연혁을 3계층 나무 포스터로 렌더(맞춤 AI 배경·시대 대사건 포함) → 인쇄/실물 주문.
- **가족 공유 룸** — 배우자·가족과 추억을 함께 보고 감정 스탬프·댓글.
- **인물·장소·사진** — 등장 인물록, 네이버/구글 장소 매칭, 사진 첨부(EXIF·GPS strip).
- **토큰 결제** — AI 사용량을 토큰으로 환산, 토스페이먼츠 충전 + 매일 출석 적립.

화면·이동 동선 전체는 [`docs/navigation-map.md`](docs/navigation-map.md) 참고.

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| 풀스택 | Next.js 16 (App Router · RSC · Turbopack) + TypeScript |
| 스타일 | Tailwind CSS v4 (라이트 온리 디자인 토큰) |
| DB / ORM | Supabase PostgreSQL + pgvector · Prisma 7 (driver adapter) |
| 인증 | Auth.js v5 — 소셜(구글·카카오·네이버) + 이메일/비밀번호 |
| AI | Anthropic Claude API (대화·다듬기·추출) · 포스터 배경 이미지 생성 |
| 결제 | 토스페이먼츠 (테스트 모드 기본) |
| 저장소 | Supabase Storage (사진·녹음·포스터 배경) |
| 음성 | CLOVA Voice(TTS) · CLOVA Speech(STT) |
| 배포 | Vercel |

---

## 시작하기

### 요구사항
- **Node.js 20.9 이상** (Next.js 16 요구사항)
- npm (레포에 `package-lock.json` 포함)
- PostgreSQL (운영은 Supabase, 로컬은 `docker-compose.yml`의 pgvector 이미지 사용 가능)

### 설치
```bash
npm install
```
> `postinstall`에서 `prisma generate`가 자동 실행됩니다 (생성물 `lib/generated/prisma`는 gitignore).

### 환경변수
루트에 `.env`를 만들고 채웁니다. **키 이름·용도만 아래에 정리** — 실제 값은 각 콘솔에서 발급하고, 전체 목록·발급 안내는 [`.env.example`](.env.example)를 참고하세요. (⚠️ 비밀키는 절대 커밋 금지)

| 키 | 용도 |
|---|---|
| `DATABASE_URL` | Prisma 런타임 연결 — Supabase **pooling(6543)** |
| `DIRECT_URL` | Prisma CLI(migrate) 연결 — Supabase **direct(5432)**. ★ migrate에 필수 |
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `AUTH_SECRET` | Auth.js v5 세션 시크릿 (`npx auth secret`로 생성) |
| `SUPABASE_URL` · `SUPABASE_SERVICE_ROLE_KEY` | Supabase Storage (서버 전용, NEXT_PUBLIC 금지) |
| `AUTH_GOOGLE_ID` · `AUTH_GOOGLE_SECRET` | 구글 OAuth |
| `AUTH_KAKAO_ID` · `AUTH_KAKAO_SECRET` | 카카오 로그인 |
| `AUTH_NAVER_ID` · `AUTH_NAVER_SECRET` | 네이버 로그인 + 장소 검색 API(한 앱 키 공용) |
| `TOSS_CLIENT_KEY` · `TOSS_SECRET_KEY` | 토스페이먼츠 (테스트 키 `test_` 접두사 확인) |
| `GOOGLE_MAPS_API_KEY` · `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 구글 장소 검색(서버) / 지도 SDK(클라) — **다른 키로 발급** |
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 네이버 지도 SDK (NCP Maps, 클라) |
| `NCP_TTS_KEY_ID` · `NCP_TTS_KEY_SECRET` | CLOVA Voice (TTS) |
| `CLOVA_SPEECH_INVOKE_URL` · `CLOVA_SPEECH_SECRET` | CLOVA Speech (STT) |
| `VOYAGE_API_KEY` | 음악 추천 임베딩(레거시 RAG 경로) |
| `OPENAI_API_KEY` | 포스터 맞춤 배경 이미지 생성 |
| `ADMIN_EMAILS` | 관리자 페이지(`/admin/orders`) 접근 이메일 화이트리스트(쉼표 구분) |
| `POSTER_PAYMENT_LIVE_ENABLED` | 포스터 실결제 플래그(기본 OFF=테스트) |

> 이 외 모델 오버라이드·기능 플래그(`COMPANION_EXTRACT_MODEL`, `STT_TOKEN_CHARGING_ENABLED` 등)는 기본값이 있어 선택입니다. 자세한 키 분리 정책(서버용/클라용 지도 키 등)은 `.env.example` 주석 참고.

### DB 설정
```bash
# 마이그레이션 적용 — ★ migrate dev 가 아니라 deploy (DIRECT_URL 사용)
npx prisma migrate deploy

# (선택) 시드 데이터
npm run db:seed              # 앵커 이벤트 등 기본 시드
npm run db:seed:timemachine  # 타임머신 사건·음악 시드
```
> **★ 중요한 워크플로우:** 마이그레이션은 항상 **`prisma migrate deploy`**를 씁니다(`migrate dev` 아님). Prisma 7은 `url`/`directUrl`을 `prisma.config.ts`에서 분리해, 런타임은 `DATABASE_URL`(pooling)을, CLI(migrate/studio)는 `DIRECT_URL`(direct 5432)을 사용합니다. pgbouncer transaction 모드에서 advisory lock이 깨져 migrate가 hang하므로 direct 연결이 필수입니다.

### 개발 / 빌드
```bash
npm run dev     # 개발 서버 (http://localhost:3000)
npm run build   # 프로덕션 빌드
npm run start   # 빌드 결과 실행
npm run lint    # ESLint
```
> ⚠️ dev 서버가 떠 있는 동안 `next build`를 돌리면 `.next` 충돌이 납니다. 타입 검증은 `npx tsc --noEmit`로 분리하세요.

---

## 프로젝트 구조

```
app/            Next.js App Router — 라우트(page/layout)·서버 액션(actions.ts)·API(api/)
components/     루트 공용 UI (Button·EventCard·EmptyState 등)
lib/            공용 로직 — db·ai·tokens·poster·people·photos·storage·life-events 등
  lib/generated/prisma/   Prisma 생성 클라이언트 (gitignore, postinstall 생성)
db/             시드(seed*.ts) + 검증/회귀 스크립트(test-*.ts, tsx로 실행)
scripts/        일회성 스크립트 (샘플 포스터·배경 생성 등)
prisma/         schema.prisma + migrations/
public/         정적 자산
docs/           daily/ · decisions/ · troubleshooting/ + navigation-map.md · par-materials.md
phase/          단계별 작업 지시 문서
auth.config.ts  Auth.js Edge 설정 (Prisma 없음 — 미들웨어용)
auth.ts         Auth.js Node 설정 (Prisma·bcrypt — Credentials 포함)
proxy.ts        Next 16 라우트 보호 미들웨어 (동의 게이트)
```

---

## 문서

- **[CLAUDE.md](CLAUDE.md)** — 프로젝트 컨텍스트·개발 가이드·전체 phase 진행 기록·기술 결정.
- **[docs/navigation-map.md](docs/navigation-map.md)** — 모든 화면·버튼·이동 동선 지도.
- **docs/decisions/** — 기술 선택 근거(PAR 구조). **docs/troubleshooting/** — 문제 해결 기록. **docs/daily/** — 일자별 작업 로그.

---

## 배포 (Vercel)

- Vercel에 연결 후 위 환경변수를 프로젝트 설정에 등록.
- 빌드 시 `postinstall`의 `prisma generate`가 클라이언트를 생성(생성물이 미추적이므로 필수).
- 스키마 변경 시 운영 DB에 `npx prisma migrate deploy`를 별도로 적용.

---

> ⚠️ 본 서비스는 개인의 회고·가족 공유를 다룹니다. 솔로 콘텐츠는 **비공개 기본**, 해외 AI API 전송은 **국외이전 동의**를 가입 흐름에 선반영합니다. 자세한 원칙은 `CLAUDE.md`의 "법적/개인정보 원칙" 참고.
