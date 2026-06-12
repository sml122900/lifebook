import Link from "next/link";
import type { LucideIcon } from "lucide-react";

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
      <Link
        href={href}
        className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-action px-6 py-3 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {buttonLabel}
      </Link>
    </div>
  );
}
