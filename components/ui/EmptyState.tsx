import type { LucideIcon } from "lucide-react";

import { ButtonLink } from "./Button";

export function EmptyState({
  icon: Icon,
  message,
  buttonLabel,
  href,
  variant = "primary",
}: {
  icon: LucideIcon;
  message: string;
  buttonLabel: string;
  href: string;
  // 화면에 다른 주요 버튼이 있으면 secondary(한 화면 주요 버튼 1개 — 밤 2단계)
  variant?: "primary" | "secondary";
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <Icon aria-hidden strokeWidth={1.75} className="h-12 w-12 text-brand" />
      <p className="text-lg text-ink-soft">{message}</p>
      <ButtonLink href={href} variant={variant} size="lg">
        {buttonLabel}
      </ButtonLink>
    </div>
  );
}
