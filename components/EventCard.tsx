type Domain =
  | "kr_politics"
  | "kr_society"
  | "disaster"
  | "sports"
  | "tech"
  | "economy"
  | "world";

const DOMAIN_LABEL: Record<Domain, string> = {
  kr_politics: "국내정치",
  kr_society: "사회",
  disaster: "참사",
  sports: "스포츠",
  tech: "기술",
  economy: "경제",
  world: "세계",
};

// Solid swatches for high contrast (4.5:1+ against white).
const DOMAIN_BADGE: Record<Domain, string> = {
  kr_politics: "bg-rose-700 text-white",
  kr_society: "bg-purple-700 text-white",
  disaster: "bg-red-800 text-white",
  sports: "bg-emerald-700 text-white",
  tech: "bg-indigo-700 text-white",
  economy: "bg-orange-700 text-white",
  world: "bg-blue-700 text-white",
};

function badgeClass(domain: string) {
  return DOMAIN_BADGE[domain as Domain] ?? "bg-zinc-700 text-white";
}

function badgeLabel(domain: string) {
  return DOMAIN_LABEL[domain as Domain] ?? domain;
}

import Link from "next/link";

export type EventCardProps = {
  id: string;
  year: number;
  month: number | null;
  title: string;
  description: string | null;
  domain: string;
};

export function EventCard({
  id,
  month,
  title,
  description,
  domain,
}: EventCardProps) {
  return (
    <Link
      href={`/memory/${id}`}
      className="group block min-h-[88px] w-full rounded-md border-2 border-sky-200 bg-white p-5 text-left transition-colors hover:border-sky-500 hover:bg-sky-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold text-zinc-800">
          {month ? `${String(month).padStart(2, "0")}월` : "연중"}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${badgeClass(domain)}`}
        >
          {badgeLabel(domain)}
        </span>
      </div>
      <div className="mt-2 text-xl font-semibold text-zinc-900">{title}</div>
      {description && <p className="mt-2 text-zinc-800">{description}</p>}
      <p className="mt-3 text-base font-medium text-sky-700 group-hover:text-sky-900">
        추억 남기기 →
      </p>
    </Link>
  );
}
