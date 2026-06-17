# 인앱 브라우저 구글 로그인 차단 (disallowed_useragent)

## 문제 상황

카카오톡·인스타그램·네이버 앱 등의 인앱 WebView에서 구글 OAuth 로그인 시도 →
Google이 `403 Error: disallowed_useragent` 반환.

- 증상: 구글 버튼 클릭 → 구글 페이지에서 "이 브라우저 또는 앱은 지원하지 않습니다."
- 재현: 카카오톡 → 라이프북 링크 → 로그인 → 구글로 시작하기
- 정상 환경: 크롬·Safari 등 독립 브라우저, PC 웹

## 원인

코드 버그 X. **Google OAuth 정책** 문제.

- Google은 2019년부터 커스텀 UA(WebView) 기반 OAuth를 차단
- 인앱 WebView의 UA에 `KAKAOTALK` / `Instagram` / `NAVER` / `FBAN` 등 포함
- OAuth 설정(GCP Console), next-auth 설정으로는 해결 불가
- 카카오·네이버 로그인은 인앱에서도 정상 (자사 앱은 자체 SDK 처리)

## 시도한 것들

1. OAuth Consent Screen 설정 확인 → 영향 없음 (정책은 Google 서버 측)
2. next-auth `authorization.params` 커스텀 → 영향 없음
3. 정책 우회 불가 결론 → 브라우저 전환 유도 방향으로 전환

## 최종 해결법

`app/login/InAppBrowserGuard.tsx` 클라이언트 컴포넌트 3개로 분리 대응:

### 1. UA 감지
```ts
/KAKAOTALK|Instagram|NAVER|FBAN|FBAV|FB_IAB/i.test(navigator.userAgent)
```

### 2. Android — 자동 외부 열기
```ts
// KakaoTalk 전용
window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;

// 기타 앱 (Chrome intent)
window.location.href = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
```
Chrome 미설치 시 intent 무시 → 페이지 그대로 (카카오 로그인 대체 가능)

### 3. iOS — 안내 배너
```
화면 하단 ··· 메뉴 → Safari로 열기 유도
+ URL 복사 버튼 (clipboard API + execCommand 폴백)
```

### 4. 공통 — 구글 버튼 안내
```tsx
<InAppGoogleNote /> // "구글 로그인은 외부 브라우저에서만 동작해요"
```

### 변경 파일
| 파일 | 변경 |
|------|------|
| `app/login/InAppBrowserGuard.tsx` | 신규 (3 export) |
| `app/login/page.tsx` | +18줄 import·주입 |

서버 액션(카카오·네이버·구글 signIn), 포스터·편집기·결제 전혀 무수정.

## 이력서 소재 한 줄

> Google OAuth 정책상 WebView 차단을 코드로 우회 불가 → UA 감지 후 Android(intent scheme)/iOS(가이드 배너) 플랫폼별 대응으로 차단 표면 최소화. 카카오 인앱 전용 API(`kakaotalk://web/openExternal`)와 범용 Chrome intent를 분기 조합.
