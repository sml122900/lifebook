"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import type { SourceDiffSummary } from "@/lib/lab/diff";

import { getSourceDiffAction } from "./actions";

const TYPE_LABEL: Record<string, string> = {
  SKELETON_EVENT: "골격 사건(v3)",
  EPISODE: "에피소드(v3)",
  LIFE_EVENT_MEMORY: "인생 사건(v2)",
  ERA_MEMORY: "시대 사건 회상",
  PHOTO_MEMORY: "사진 캡션",
  PERSON_MEMO: "인물 메모",
  PROFILE: "프로필·취향",
};

// 대상 1명의 "원본 변경 확인" — 원본과 색인 원장을 비교한 개수만 보여준다.
export function SourceDiffPanel({
  subjectId,
  label,
}: {
  subjectId: string;
  label: string;
}) {
  const [summary, setSummary] = useState<SourceDiffSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const check = () =>
    startTransition(async () => {
      setError(null);
      try {
        setSummary(await getSourceDiffAction(subjectId));
      } catch {
        setError("확인하지 못했어요.");
      }
    });

  return (
    <section className="rounded-md border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-mono text-ink">{label}</h3>
        <Button onClick={check} disabled={pending}>
          {pending ? "확인 중…" : "원본 변경 확인"}
        </Button>
      </div>

      {error && <p className="mt-3 text-danger">{error}</p>}

      {summary && (
        <div className="mt-4">
          <p className="text-ink-soft">
            원본 {summary.total}건
            {summary.contextChanged
              ? " · 시기 컨텍스트 바뀜(파생 연도 재계산 필요)"
              : ""}
          </p>
          <table className="mt-2 w-full text-left text-base">
            <thead className="text-ink">
              <tr>
                <th className="py-1 pr-3 font-semibold">원본</th>
                <th className="py-1 pr-3 font-semibold">신규</th>
                <th className="py-1 pr-3 font-semibold">변경</th>
                <th className="py-1 pr-3 font-semibold">그대로</th>
                <th className="py-1 font-semibold">소멸</th>
              </tr>
            </thead>
            <tbody className="text-ink-soft">
              {summary.byType.map((r) => (
                <tr key={r.sourceType} className="border-t border-line">
                  <td className="py-1 pr-3">
                    {TYPE_LABEL[r.sourceType] ?? r.sourceType}
                  </td>
                  <td className="py-1 pr-3">{r.new}</td>
                  <td className="py-1 pr-3">{r.changed}</td>
                  <td className="py-1 pr-3">{r.unchanged}</td>
                  <td className="py-1">{r.gone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
