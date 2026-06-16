# 트러블슈팅 — NUL 바이트 1개로 git이 .tsx를 바이너리로 오인

## 문제 상황

포스터 빈 슬롯 토큰 누수(C10) fix를 커밋했는데, 멀쩡한 코드 추가인데도 커밋 통계가 이상했다.

```
git commit -m "fix(poster): ..."
 1 file changed, 0 insertions(+), 0 deletions(-)
```

`PosterInteractive.tsx`에 ~15줄(스윕 로직)을 더했는데 **0 insertions / 0 deletions**. `git show --stat`을 보니:

```
app/poster/PosterInteractive.tsx | Bin 15851 -> 16736 bytes
```

`Bin` — git이 소스 파일을 **바이너리로 분류**하고 있었다. 내용·스윕 자체는 정상 커밋됐지만(885바이트 증가, `grep`이 "Binary file matches"로 찾음), 바이너리로 분류되면 diff·blame·머지가 전부 깨진다.

## 시도한 것들

1. **커밋 내용 확인** — `git show HEAD:...PosterInteractive.tsx | grep '스윕'` → "Binary file (standard input) matches". 내용은 들어갔다. 문제는 diff 표시가 아니라 git의 파일 분류.
2. **NUL 바이트 탐색** — git의 바이너리 휴리스틱은 앞부분에 NUL(`\x00`)이 있으면 트리거. `grep -naP '\x00' app/poster/PosterInteractive.tsx`:
   ```
   42:const noteKeyOf = (s: PosterSlot) => `${s.title} ${s.yearLabel}`;
   ```
   line 42 — 메모 키 separator로 넣은 "공백"이 사실 **NUL(U+0000)**이었다. 키 구분자를 넣을 때(`${s.title}\0${s.yearLabel}` 의도였거나 편집 중 혼입) 보이지 않는 NUL이 박혔다.
3. **인코딩 확인** — `file`이 `data`로 보고(텍스트가 아님), `head -c 3 | xxd`로 BOM은 없음 확인 → 원인은 오직 NUL 1개.

## 최종 해결법

NUL을 일반 공백으로 치환(키 동작은 동일 — 제목+연도 dedup):

```bash
perl -i -pe 's/\x00/ /g' app/poster/PosterInteractive.tsx
grep -naP '\x00' app/poster/PosterInteractive.tsx   # exit 1 = clean
```

검증: `git cat-file blob HEAD:....tsx | grep -caP '\x00'` → 0, 다음 변경부터 `1 insertion(+)` 텍스트 diff 정상 복귀. (커밋 직후 `git show`가 여전히 `Bin->Bin`으로 보이는 건 **부모 커밋 쪽이 아직 바이너리 블롭**이라 비교 상대가 바이너리이기 때문 — 현재 HEAD 블롭 자체는 text.)

이후 포스터 작업 커밋마다 `grep -caP '\x00'`를 검증 루틴에 추가(tsc/build/경계 diff와 함께).

## 이력서 소재 한 줄

소스 파일의 diff가 `Bin`으로 표시되는 현상을 git 바이너리 휴리스틱(앞부분 NUL 검출)에서 출발해 추적, 코드에 혼입된 U+0000 단 1바이트를 `grep -P '\x00'`로 특정·제거하고 "커밋된 HEAD 블롭은 text인데 부모가 바이너리라 diff만 Bin으로 보인다"는 표시 vs 실체를 분리해 진단 — 이후 NUL 점검을 커밋 검증 루틴에 편입.
