# 결정 — 소셜 로그인 확장: 카카오·네이버 추가 (provider-무관 게이트 재사용)

## Problem

어르신(부모님)은 구글 계정보다 **카카오·네이버**가 익숙하다. 6/19 부모님 폰 테스트 배포 전에 두 소셜 로그인을 붙여야 했다. 제약·요구:

1. **마이그·회귀 최소** — 인증은 모든 동선의 입구라 잘못 건드리면 전체가 막힌다.
2. **카카오 = 이메일 미수집** — 닉네임 + 프로필만. 비즈앱 검수 없는 기본 동의항목 경로.
3. **동의(개인정보·국외이전·약관) 게이트와 온보딩이 새 provider 도 그대로 타야** 한다.

핵심 질문: 인증 스키마/흐름을 얼마나 손대야 하는가? 카카오가 이메일을 안 주는데 가입이 되는가?

## Action

**스키마 0 변경 + provider-무관 게이트 재사용**으로 결정. 코드는 `auth.config.ts`(providers 배열) + `login/page.tsx`(버튼)만 손댔다.

### 카카오가 이메일 없이 가입 가능한 이유 (마이그 불필요 근거)
| 검증 항목 | 현재 상태 | 결론 |
|-----------|-----------|------|
| `User.email` | `String? @unique` — nullable + unique | Postgres 는 unique 컬럼에 NULL 다중 허용 → 무이메일 사용자 여럿 OK |
| 계정 식별 | `Account @@unique([provider, providerAccountId])` | email 아닌 **provider 고유 id** 로 식별 → 카카오는 자기 id 로 별도 Account 행 |
| PrismaAdapter `createUser` | provider 가 준 필드로 insert | email=null 그대로 들어감 + 신규 50토큰 지급(provider 무관) |

### 게이트가 이미 provider-무관 (구글 분기 0)
- `proxy.ts` 는 `session.consentComplete`(JWT) 하나만 본다 → 이 값은 `auth.ts` jwt 콜백이 **DB 의 3종 동의 타임스탬프**로 채운다. provider 이름을 어디서도 안 본다.
- `/enter` 는 인생 이벤트 유무로만 분기. 카카오/네이버 신규도 `/consent → /enter → /life-record?new=1` 동일 동선.
- grep 으로 `provider === "google"` 분기 없음 확인.

### 별도 계정 정책 (이메일 자동 병합 안 함)
- Auth.js v5 + DB 어댑터는 기본적으로 서로 다른 provider 를 같은 email 로 자동 병합하지 **않는다**(`allowDangerousEmailAccountLinking` 미설정 = 계정 탈취 방지). 카카오는 이메일 자체를 안 주므로 충돌 가능성 0. 의도("별도 계정")와 일치.

### 네이버 키 — 검색 API 와 로그인 공유
- 기존 `NAVER_MAP_CLIENT_ID/SECRET`(이름과 달리 NCP 지도가 **아니라** developers.naver.com **지역 검색** API 키, place-search 검색창에서 사용)을 `AUTH_NAVER_ID/SECRET` 로 rename.
- developers.naver.com 한 앱의 Client ID/Secret 으로 "검색" + "네이버 로그인" 둘 다 활성화 가능 → 한 키 공유. `place-search/route.ts` 가 새 이름을 읽도록 1줄 수정.
- ⚠️ `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`(NCP Maps Dynamic Map 타일 SDK)는 **완전히 다른 시스템** — 안 건드림.

### 브랜드색 = 디자인 토큰 예외
- 카카오 `#FEE500`+검정, 네이버 `#03C75A`+흰색은 각 사 로그인 브랜드 가이드가 강제 → 라이트 온리 토큰 시스템의 의도된 예외. 단 시니어 규격(min-h 56px, 18px)은 유지. 버튼 순서 = 카카오(어르신 요청 우선) → 네이버 → 구글.

## Result

- 스키마 0, 마이그 0, 패키지 0(둘 다 next-auth 내장 provider). 변경 = `auth.config.ts` + `login/page.tsx` + 네이버 rename(`place-search/route.ts`·`.env`·`.env.example`).
- tsc + build 통과. /login 버튼 3개. 동의·온보딩 자동 적용.
- 사용자 작업(키·콜백)만 남음:
  - 카카오: 디벨로퍼스 앱 → REST API 키(`AUTH_KAKAO_ID`) + Client Secret(`AUTH_KAKAO_SECRET`) + Redirect URI `…/api/auth/callback/kakao` + 동의항목 닉네임/프로필.
  - 네이버: 개발자센터 사용 API 에 "네이버 로그인" 추가 + Callback URL `…/api/auth/callback/naver`. 키는 검색용과 동일.

## 대안

- **이메일 강제(NOT NULL) 후 카카오에 이메일 동의항목 요구**: 비즈앱 검수 필요 + 어르신 동의 단계 증가 → 기각.
- **provider별 온보딩 분기**: 게이트가 이미 무관해 불필요(YAGNI).

## 후속

- 동일인 다중 provider 가입 시 계정 통합(`allowDangerousEmailAccountLinking` 또는 수동 링크 UI) — 단일 로그인 수단 가정상 보류.
- 네이버 제공 정보 최소화(이름/별명) — 이메일 받을 수 있으나 최소 수집 원칙.
- 로그인 화면 진입·법적 문구 톤 패스(기존 후속)와 함께 소셜 버튼 안내 문구 점검.
