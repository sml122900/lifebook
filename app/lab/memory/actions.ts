"use server";

import { requireLabSubject } from "@/lib/lab/access";
import {
  diffSources,
  summarizeDiff,
  type SourceDiffSummary,
} from "@/lib/lab/diff";

// 기억 연구실 서버 액션. 모든 액션의 첫 문장은 requireLabUser()/requireLabSubject()
// — db/test-lab-gate.ts 가 정적 검사로 강제한다(서버 액션은 어느 주소에서나
// 호출될 수 있어 화면 게이트만으로는 부족).

// 대상의 원본을 다시 읽어 색인 원장과 비교(LLM 0, 쓰기 0).
export async function getSourceDiffAction(
  subjectId: string,
): Promise<SourceDiffSummary> {
  await requireLabSubject(subjectId);
  return summarizeDiff(await diffSources(subjectId));
}
