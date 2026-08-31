"use client";

// v3 P5 — /account/settings 캐릭터 선택 + 애니메이션 끄기. AiModelChips.tsx
// 와 동일한 옵티미스틱 useTransition 패턴.

import { useState, useTransition } from "react";

import { updateCharacter, updateCharacterMotion } from "@/app/account/character-actions";
import { CHARACTERS } from "@/lib/characters";

export function CharacterChips({
  current,
  motionEnabled,
}: {
  current: string;
  motionEnabled: boolean;
}) {
  const [characterId, setCharacterId] = useState(current);
  const [motion, setMotion] = useState(motionEnabled);
  const [pending, startTransition] = useTransition();

  function pick(id: string) {
    if (id === characterId || pending) return;
    const prev = characterId;
    setCharacterId(id); // 옵티미스틱
    startTransition(async () => {
      const res = await updateCharacter(id);
      if (!res.ok) setCharacterId(prev);
    });
  }

  function toggleMotion() {
    const next = !motion;
    const prev = motion;
    setMotion(next);
    startTransition(async () => {
      const res = await updateCharacterMotion(next);
      if (!res.ok) setMotion(prev);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {CHARACTERS.map((c) => {
          const selected = c.id === characterId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              aria-pressed={selected}
              disabled={pending}
              className={
                "flex flex-col items-center gap-2 rounded-md border-2 px-3 py-4 disabled:opacity-60 " +
                (selected
                  ? "border-action bg-banner"
                  : "border-line bg-surface hover:bg-banner")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.thumbnailUrl} alt="" className="h-14 w-14" />
              <span className="text-base font-semibold text-ink">{c.name}</span>
            </button>
          );
        })}
      </div>

      <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-md border-2 border-line bg-surface px-4 py-3">
        <span className="text-lg text-ink">캐릭터 움직임</span>
        <input
          type="checkbox"
          checked={motion}
          disabled={pending}
          onChange={toggleMotion}
          className="h-6 w-6 shrink-0 accent-action"
        />
      </label>
      <p className="text-sm text-ink-faint">
        움직임을 끄면 캐릭터가 멈춘 그림으로만 보여요.
      </p>
    </div>
  );
}
