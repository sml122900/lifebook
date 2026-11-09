"use client";

// 룸 나가기(멤버)·룸 닫기(주인) — 2026-11-09 성민. 한 번 누르면 확인 줄이 펼쳐지고, [나가기]·[닫기]를 눌러야 실행(브라우저 확인창 안 씀).
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { ROOM_COPY as C } from "@/lib/room-copy";

import { closeRoomAction, leaveRoomAction } from "../actions";

export function LeaveRoom({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const title = isOwner ? C.closeTitle : C.leaveTitle;
  return (
    <section aria-labelledby="leave-room" className="rounded-md border-2 border-line bg-surface p-6">
      <h2 id="leave-room" className="text-xl font-bold text-ink">
        {title}
      </h2>
      <p className="mt-2 text-lg text-ink-soft">{isOwner ? C.closeHint : C.leaveHint}</p>
      {!asking ? (
        <Button variant="destructive" size="lg" className="mt-4" onClick={() => setAsking(true)}>
          {title}
        </Button>
      ) : (
        <form
          action={async (fd) => {
            setBusy(true);
            try {
              await (isOwner ? closeRoomAction(fd) : leaveRoomAction(fd));
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 flex flex-col gap-3"
        >
          <input type="hidden" name="roomId" value={roomId} />
          <p role="alert" className="text-lg font-semibold text-ink">
            {isOwner ? C.closeAsk : C.leaveAsk}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" variant="destructive" size="lg" disabled={busy}>
              {busy ? C.busy : isOwner ? C.closeDo : C.leaveDo}
            </Button>
            <Button type="button" variant="tertiary" size="lg" disabled={busy} onClick={() => setAsking(false)}>
              {C.cancel}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
