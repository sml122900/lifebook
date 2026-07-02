import type { LucideIcon } from "lucide-react";

import { ButtonLink } from "./Button";

export function EmptyState({
  icon: Icon,
  message,
  buttonLabel,
  href,
}: {
  icon: LucideIcon;
  message: string;
  buttonLabel: string;
  href: string;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <Icon aria-hidden strokeWidth={1.75} className="h-12 w-12 text-brand" />
      <p className="text-lg text-ink-soft">{message}</p>
      <ButtonLink href={href} variant="primary" size="lg">
        {buttonLabel}
      </ButtonLink>
    </div>
  );
}
