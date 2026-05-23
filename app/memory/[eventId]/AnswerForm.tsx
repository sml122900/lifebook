"use client";

import { useState } from "react";

import { submitMemoryAnswer } from "./actions";

export function AnswerForm({
  eventId,
  conversationId,
}: {
  eventId: string;
  conversationId: string;
}) {
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action={async (formData) => {
        setSubmitting(true);
        try {
          await submitMemoryAnswer(formData);
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <label htmlFor="answer" className="text-lg font-semibold text-zinc-900">
        떠오르는 대로 적어주세요
      </label>
      <textarea
        id="answer"
        name="answer"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={6}
        placeholder="기억나는 장면이나 느낌을 짧게 적어도 좋아요."
        className="w-full rounded-md border-2 border-zinc-300 px-4 py-3 text-lg focus:border-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      />
      <button
        type="submit"
        disabled={submitting || answer.trim() === ""}
        className="self-end rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        {submitting ? "저장 중..." : "추억 남기기"}
      </button>
    </form>
  );
}
