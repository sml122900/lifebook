"use client";

// STAGE4 — 에피소드 심화 대화 UI. STAGE2 채팅 톤(말풍선·로딩 점) 재사용.
//
// 대화 종료(사용자 종료 의사 또는 AI 판단 또는 서버 하드캡) → 요약 저장
// (finishEpisodeChat) → "사진이나 장소도 남기시겠어요?" → 예: 기존
// EventPhotos/PlacesEditor 재사용(memoryId) / 아니오: STAGE3 로 복귀.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

import {
  continueEpisodeChat,
  finishEpisodeChat,
  saveEpisodePlaces,
  type EpisodeTurn,
} from "@/app/actions/episode";
import type { ConfirmedEpisodeItem } from "@/app/actions/life-event";
import { PlacesEditor } from "@/app/components/PlacesEditor";
import {
  EventPhotos,
  type AttachedPhoto,
} from "@/app/life-timeline/[eventId]/edit/EventPhotos";
import type { PlaceInfo } from "@/lib/place-types";

type Msg = { role: "assistant" | "user"; text: string };
type Phase =
  | "idle"
  | "thinking"
  | "finishing"
  | "attach-ask"
  | "attach"
  | "error";

function formatOpening(item: ConfirmedEpisodeItem): string {
  const yearPart = item.year ? `${item.year}년 ` : "";
  return `${yearPart}${item.label}, 이때 기억나는 거 있으세요? 편하게 말씀해주세요.`;
}

export function EpisodeChatClient({ item }: { item: ConfirmedEpisodeItem }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(() => [
    { role: "assistant", text: formatOpening(item) },
  ]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [inputVal, setInputVal] = useState("");
  const [followUpCount, setFollowUpCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [memoryId, setMemoryId] = useState<string | null>(null);
  const [places, setPlaces] = useState<PlaceInfo[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

  function addBot(text: string) {
    setMessages((prev) => [...prev, { role: "assistant", text }]);
  }
  function addUser(text: string) {
    setMessages((prev) => [...prev, { role: "user", text }]);
  }

  async function runFinish(fullTranscript: Msg[]) {
    setPhase("finishing");
    try {
      const result = await finishEpisodeChat(
        item.id,
        fullTranscript.map((m): EpisodeTurn => ({ role: m.role, text: m.text })),
      );
      if (!result.ok) {
        setErrorMsg(result.error);
        setPhase("error");
        return;
      }
      setMemoryId(result.memoryId);
      setPhase("attach-ask");
    } catch (e) {
      console.error("[episode-chat-finish]", e);
      setErrorMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      setPhase("error");
    }
  }

  async function handleSend() {
    const text = inputVal.trim();
    if (!text || phase !== "idle") return;

    setInputVal("");
    addUser(text);
    setPhase("thinking");

    // 오프닝(템플릿, messages[0])은 실제 API 턴이 아니라서 제외.
    const priorApiTurns = messages
      .slice(1)
      .map((m): EpisodeTurn => ({ role: m.role, text: m.text }));
    const apiHistory: EpisodeTurn[] = [...priorApiTurns, { role: "user", text }];

    try {
      const result = await continueEpisodeChat(item.id, apiHistory, followUpCount);
      if (!result.ok) {
        setErrorMsg(result.error);
        setPhase("error");
        return;
      }
      addBot(result.reply);
      const nextFollowUpCount = followUpCount + 1;
      setFollowUpCount(nextFollowUpCount);

      if (result.end) {
        const full = [...messages, { role: "user" as const, text }, { role: "assistant" as const, text: result.reply }];
        await runFinish(full);
        return;
      }
      setPhase("idle");
    } catch (e) {
      console.error("[episode-chat-send]", e);
      setErrorMsg("잠시 문제가 생겼어요. 다시 시도해 주세요.");
      setPhase("error");
    }
  }

  function handleRetry() {
    setErrorMsg(null);
    setPhase("idle");
  }

  async function handleSavePlacesAndFinish() {
    if (!memoryId) return;
    setPhase("finishing");
    try {
      await saveEpisodePlaces(memoryId, places);
    } catch (e) {
      console.error("[episode-chat-places]", e);
      // 장소 저장 실패해도 이야기 자체는 이미 저장됐으니 흐름은 계속 진행.
    }
    router.push(`/onboarding-episode?after=${item.id}`);
  }

  function handleSkipAttach() {
    router.push(`/onboarding-episode?after=${item.id}`);
  }

  const isIdle = phase === "idle";

  if (phase === "attach-ask") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex justify-start">
          <div className="max-w-[82%] rounded-2xl rounded-bl-sm border border-line bg-surface px-5 py-4 text-lg leading-relaxed text-ink">
            소중한 이야기 들려주셔서 고마워요. 사진이나 장소도 남기시겠어요?
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="primary" size="lg" onClick={() => setPhase("attach")}>
            네, 남길게요
          </Button>
          <Button variant="tertiary" size="lg" onClick={handleSkipAttach}>
            다음에 할게요
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "attach" && memoryId) {
    const emptyPhotos: AttachedPhoto[] = [];
    return (
      <div className="flex flex-col gap-6">
        <EventPhotos memoryId={memoryId} isPeriod={false} photos={emptyPhotos} />

        <section className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-5">
          <h2 className="text-2xl font-bold text-ink">장소</h2>
          <p className="text-base text-ink-soft">
            이 이야기와 어울리는 장소가 있다면 남겨보세요.
          </p>
          <PlacesEditor value={places} onChange={setPlaces} />
        </section>

        <Button variant="primary" size="lg" onClick={() => void handleSavePlacesAndFinish()}>
          이야기 마치기
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-4 pb-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={["flex", msg.role === "user" ? "justify-end" : "justify-start"].join(" ")}
          >
            <div
              className={[
                "max-w-[82%] rounded-2xl px-5 py-4 text-lg leading-relaxed whitespace-pre-wrap",
                msg.role === "user"
                  ? "bg-action text-white rounded-br-sm"
                  : "bg-surface border border-line text-ink rounded-bl-sm",
              ].join(" ")}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {(phase === "thinking" || phase === "finishing") && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-line bg-surface px-5 py-4">
              <div className="flex h-4 items-center gap-1">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="h-2 w-2 animate-bounce rounded-full bg-ink-soft"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {phase === "error" && (
        <div className="py-2 text-center">
          <p className="mb-2 text-base text-danger">{errorMsg}</p>
          <Button variant="secondary" onClick={handleRetry}>
            다시 시도할게요
          </Button>
        </div>
      )}

      {phase !== "error" && (
        <div className="border-t border-line pt-3">
          <div className="flex items-end gap-2">
            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!isIdle}
              placeholder="편하게 답해 주세요 (Shift+Enter 줄바꿈)"
              rows={2}
              className="flex-1 resize-none rounded-2xl border-2 border-line bg-canvas px-4 py-3 text-lg text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "9rem" }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!isIdle || !inputVal.trim()}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-action text-white text-2xl font-bold transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="전송"
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
