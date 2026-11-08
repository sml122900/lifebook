import Link from "next/link";
import { notFound } from "next/navigation";

import { AssistantFabMode } from "@/app/components/AssistantFabMode";
import { Paper } from "@/components/ui/Paper";
import { ButtonLink } from "@/components/ui/Button";
import { getMyLifeData } from "@/lib/my-life";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { yearText } from "@/lib/my-life-layout";
import { getEpisodeBody } from "@/lib/node-body";
import { displayTitle } from "@/lib/story-title";

import { BodyPhoto, BodyView } from "../../_body/BodyView";
import { requireV3UserId } from "../../_body/guard";
import { photoMapOf } from "../../_body/photo-urls";

// 이야기 상세(2b-3c, 2026-11-03 — docs/phase/my-life-restructure.md §19). 진입 = My Life 이야기 패널 [본문 보기].
// 본문 = 블로그 문서(평문과 맞을 때) 아니면 평문 문단(lib/node-body shownDoc). 본문에 안 넣은 이 이야기의 사진은 아래 묶음.
// 머리 정보(시기·제목·함께 나온 분·나온 곳)는 지도와 같은 데이터(getMyLifeData) — 지도에 없는 이야기(확정 안 된 시기)는 없음.

const C = MY_LIFE_COPY;

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireV3UserId();
  const [body, data] = await Promise.all([getEpisodeBody(userId, id), getMyLifeData(userId)]);
  const ev = data.events.find((e) => e.stories.some((s) => s.id === id && s.primaryEventId === e.id));
  const story = ev?.stories.find((s) => s.id === id);
  if (!body || !ev || !story) notFound();

  const photos = await photoMapOf(body.photos);
  const inBody = new Set(body.doc.blocks.flatMap((b) => (b.type === "photo" ? [b.photoId] : [])));
  const extra = body.photos.filter((p) => !inBody.has(p.id));
  const people = story.chips.filter((c) => c.kind !== "place");
  const places = story.chips.filter((c) => c.kind === "place");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      {/* 둥근 비서 버튼 숨김 — 화면 끝 [글 고치기]를 가렸다(2026-11-08 #14) */}
      <AssistantFabMode mode="hide" />
      <Link href={`/my-life?focus=st:${ev.id}:${id}`} className="self-start text-lg text-action underline underline-offset-4">
        ← {C.body.backToMap}
      </Link>
      <Paper as="article" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="m-0 text-lg text-ink-soft">
          {story.kind === "SELF" ? `${C.selfTag} · ` : ""}
          {yearText(ev)} {ev.label}
        </p>
        <h1 className="m-0 text-[28px]">{displayTitle(body)}</h1>
      </header>

      <BodyView doc={body.doc} photos={photos} />

      {extra.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-xl">{C.body.photosTitle}</h2>
          {extra.map((p) => (
            <BodyPhoto key={p.id} photo={photos[p.id]} />
          ))}
        </section>
      )}

      {people.length > 0 && (
        <p className="m-0 text-lg text-ink">
          {C.body.peopleTitle}: {people.map((c) => c.name).join(", ")}
        </p>
      )}
      {places.length > 0 && (
        <p className="m-0 text-lg text-ink">
          {C.body.placesTitle}: {places.map((c) => c.name).join(", ")}
        </p>
      )}

      </Paper>

      <div className="flex flex-col gap-2">
        <ButtonLink href={`/my-life/story/${id}/edit`} variant="primary" size="lg">
          {C.body.edit}
        </ButtonLink>
        {body.revisions > 0 && (
          <ButtonLink href={`/my-life/story/${id}/history`} variant="secondary" size="lg">
            {C.body.history(body.revisions)}
          </ButtonLink>
        )}
      </div>
    </main>
  );
}
