# 제안 프롬프트 재생 세트

자유 대화 제안 카드(`lib/prompts/free-chat.ts` `PROPOSAL_SYSTEM_PROMPT`) 입력을 그대로 담은 실패·회귀 사례. 프롬프트를 바꾸면 변경 전·후를 각 10회 돌려 비교한 뒤 커밋한다(CLAUDE.md 작업 규칙 9).

```
npx tsx db/replay-proposals.ts --prompt work,HEAD --n 10
```

- 파일 하나 = 사례 하나: `name` · `source`(어디서 왔나 — 실제 입력 그대로 / 재구성) · `expectCenter`(기대 시기 이름) · `fallbackCenter`(주제 시기, 없으면 null) · `birthYear` · `input`(제안 호출 사용자 메시지 그대로).
- 실명·실고객 데이터 금지 — 회귀 픽스처 계정(`fixture-*@lifebook.invalid`)의 입력만. id 는 지운 픽스처 행의 것.
- 새 실패 사례(`db/test-logs/live-failures/`)가 나오면 그 입력을 여기에 더한다. 입력에 새 낱말이 생기면 `db/test-chat-proposal.ts` `FIXTURE_WORDS` 에도 넣는다(작업 규칙 8).
