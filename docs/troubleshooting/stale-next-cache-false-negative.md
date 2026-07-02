# 소스는 고쳤는데 브라우저엔 여전히 옛 화면 — stale `.next` 빌드가 "픽스 실패"로 오인됨

## 문제 상황

- 2026-07-03, "삭제·탈퇴 확인 버튼 빨간 필 제거" 픽스(`5b4d294`)를 커밋·푸시 완료.
- 성민이 실제 화면에서 재확인 — 인물 삭제 버튼과 EmptyState 는 정상 반영됐는데,
  `/account/delete` 탈퇴 확인 버튼만 **여전히 `bg-rose-700 text-white` 필 빨강**으로
  보인다고 보고.
- `WithdrawForm.tsx:60` 을 분명히 고쳤는데(`git show` 로 diff 재확인해도 destructive
  아웃라인 스타일이 커밋에 들어가 있음), 렌더된 화면만 옛날 그대로.

## 시도한 것들

1. **소스 재확인** — `WithdrawForm.tsx` 를 다시 읽어 className 이 정말
   `border border-line bg-transparent ... text-danger` 인지 확인. 100% 정확했음 →
   "코드가 틀렸다"는 가설은 바로 배제.
2. **동일 흐름에 버튼이 하나 더 있나 확인** — `/account/delete/page.tsx` 전체를
   읽어 `WithdrawForm` 외에 다른 확인 버튼(예: 2단계 트리거 버튼)이 있는지 확인.
   없음 — 이 화면엔 `WithdrawForm` 의 submit 버튼이 유일한 확인 버튼.
3. **전체 grep** — `bg-rose-[4-9]00|bg-red-[4-9]00` 로 저장소 전체를 재검색해
   "혹시 다른 파일이 같은 라벨의 버튼을 렌더하나" 확인. 몇 개 나왔지만 전부
   무관한 맥락(녹음 중 상태 토글 등) — 아래 "관련 발견" 참조.
4. **로컬 빌드 산출물 mtime 확인** — `ls -la .next` 로 확인하니 디렉토리 mtime 이
   수정 커밋 시각(`00:30`)보다 **앞선 `23:20`**. 이 프로젝트는 과거에도 `.next`
   stale 캐시로 여러 번 데인 이력이 있어(Auth.js dev cache stale, Prisma stale
   client — `dev-server-build-next-conflict.md`) 곧바로 유력 용의자로 지목.

## 최종 해결법

```bash
# 소스가 맞다는 가정 위에서, 컴파일된 산출물이 실제로 소스를 반영하는지
# "직접" 증명한다 — grep 으로 소스를 다시 읽는 게 아니라 빌드 결과물을 읽는다.
rm -rf .next
npm run build

# 구 클래스 문자열이 컴파일 결과에 전혀 없는지 확인 (exit 1 = 매치 없음 = 안전)
grep -rl "bg-rose-700 px-6 py-4 text-xl font-bold text-white hover:bg-rose-800" .next/

# 새 클래스 문자열이 실제로 들어있는지 확인 (파일 경로가 나오면 성공)
grep -rl "border border-line bg-transparent px-6 py-4 text-xl font-bold text-danger" .next/
```

깨끗한 빌드의 컴파일 산출물에서 구 문자열은 완전히 사라지고 신 문자열만 존재함을
확인 — 소스 수정이 100% 정확했고, 성민이 본 화면은 그 수정 **이전** 시점의 빌드
아티팩트였다는 게 확정됐다.

## 관련 발견 — 같은 감사 에이전트가 놓친 진짜 잔존 위반

stale 캐시 가설을 검증하는 김에 "남은 필 빨강 버튼 전부"를 다시 grep 했다.
`app/life-timeline/manage/DeleteButton.tsx` 가 `DeletePersonButton.tsx` 와
**구조가 완전히 동일한**(같은 confirm 모달 패턴, 같은 `buttonClasses` import)
필 빨강 확인 버튼을 가지고 있는데, 원래 UI 감사(백그라운드 서브에이전트)가 이걸
놓쳤다. 같은 패턴으로 동일하게 교정(`buttonClasses("destructive", "md")`,
커밋 `7abf8cb`).

나머지 필 빨강 매치(`FreeRecorder.tsx`·`VoiceTextarea.tsx`·`AnswerForm.tsx`)는
전부 "녹음 중" 상태 토글 — 빨강=녹음이라는 별개의 정당한 관례라 범위 밖으로 판단,
손대지 않음.

## 재발 방지 (작업 수칙)

- **"소스를 고쳤다" ≠ "사용자가 보는 화면이 고쳐졌다"** — 사용자가 실제 재현을
  보고하면, 소스 diff 재확인에서 멈추지 말고 빌드 아티팩트(`.next/`)까지 내려가서
  증명한다. `grep -rl <구문자열> .next/` 로 exit code 확인이 가장 빠르고 확실.
- UI 수정 커밋 직후 로컬에서 재검증할 땐 `.next` mtime 을 먼저 확인하는 습관 —
  `ls -la .next` 한 줄로 stale 여부를 즉시 배제/확정할 수 있다.
- "감사에서 못 찾은 위반"은 항상 있을 수 있다 — 같은 패턴을 쓰는 자매 컴포넌트가
  있으면 grep 으로 형제를 찾아보는 습관(`DeletePersonButton` → 구조 동일한
  `manage/DeleteButton` 발견 사례).

## 이력서 소재 한 줄

사용자가 재현한 "수정이 반영 안 됨" 보고를 소스 diff 확인에서 끝내지 않고 컴파일된
빌드 산출물을 직접 grep 해 stale `.next` 캐시임을 증명 — 같은 조사 과정에서 원래
감사가 놓친 구조적으로 동일한 위반 사례를 찾아 함께 교정.
