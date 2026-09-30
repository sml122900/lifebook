"use server";

import { requireLabSubject } from "@/lib/lab/access";
import {
  diffSources,
  summarizeDiff,
  type SourceDiffSummary,
} from "@/lib/lab/diff";
import { syncSubject, type SyncReport } from "@/lib/lab/sync";

// 기억 연구실 서버 액션. 모든 액션의 첫 문장은 requireLabUser()/requireLabSubject()
// — db/test-lab-gate.ts 가 정적 검사로 강제한다(서버 액션은 어느 주소에서나
// 호출될 수 있어 화면 게이트만으로는 부족).

// 서버 액션 1회당 LLM 추출 원본 상한 — Vercel 함수 시간 초과 대비. 남은 원본은
// 다시 누르면 이어서 처리한다(대량은 로컬 db/lab-sync.ts).
const SYNC_MAX_LLM_UNITS = 20;

// 대상의 원본을 다시 읽어 색인 원장과 비교(LLM 0, 쓰기 0).
export async function getSourceDiffAction(
  subjectId: string,
): Promise<SourceDiffSummary> {
  await requireLabSubject(subjectId);
  return summarizeDiff(await diffSources(subjectId));
}

// 신규·변경 원본 추출 + 소멸 반영 + 임베딩(쓰기는 lab 테이블만).
export async function syncSubjectAction(
  subjectId: string,
): Promise<SyncReport> {
  await requireLabSubject(subjectId);
  return syncSubject(subjectId, { maxLlmUnits: SYNC_MAX_LLM_UNITS });
}
