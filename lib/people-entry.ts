// 인물록 통합(2026-11-06 성민 — A안): 앱의 인물록 = My Life 지도 안 인물록·장소록 영역 하나.
// V3 사용자가 옛 /people 화면에 들어오면 My Life 의 맞는 자리로 보낸다. V2 사용자는 /people 그대로(null = 보내지 않음).
//   /people(?tab=)            → /my-life?area=people (장소 탭 = area=places)
//   /people/new(?type=)       → 같은 영역(장소 = places) — 만들기는 영역의 [+ 사람]·[+ 장소]
//   /people/[id]·/link        → /my-life?focus=pe:<id> (확정 인물 — 종류 사람 · 내 사람만, 아니면 인물록 영역)
//   /people/[id]/edit         → /my-life?focus=pe:<id>&edit=1 (그 사람 패널의 [이름·정보 고치기])
// 옛 "장소형 인물"(Person 종류 location)·"물건"(thing)은 My Life 에 안 나온다 — 그 사람 주소는 장소록·인물록 영역으로.
import { prisma } from "./db";
import { MY_LIFE_PEOPLE, MY_LIFE_PLACES } from "./my-life-paths";
import { getOnboardingTrack } from "./onboarding-track";

export type PeopleEntry = { page: "list" | "new" | "detail" | "edit" | "link"; personId?: string; tab?: string };

export { MY_LIFE_PEOPLE, MY_LIFE_PLACES };

export async function peopleEntryRedirect(userId: string, at: PeopleEntry): Promise<string | null> {
  if ((await getOnboardingTrack(userId)) !== "V3") return null;
  if (at.page === "list" || at.page === "new") return at.tab === "location" ? MY_LIFE_PLACES : MY_LIFE_PEOPLE;
  const p = at.personId
    ? await prisma.person.findFirst({ where: { id: at.personId, userId }, select: { id: true, isDraft: true, subjectType: true } })
    : null;
  if (!p || p.isDraft || p.subjectType !== "person") return p?.subjectType === "location" ? MY_LIFE_PLACES : MY_LIFE_PEOPLE;
  const focus = `/my-life?focus=${encodeURIComponent(`pe:${p.id}`)}`;
  return at.page === "edit" ? `${focus}&edit=1` : focus;
}
