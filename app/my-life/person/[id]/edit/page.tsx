import Link from "next/link";
import { notFound } from "next/navigation";

import { Paper } from "@/components/ui/Paper";
import { ButtonLink } from "@/components/ui/Button";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { getPersonBody } from "@/lib/node-body";

import { BodyEditor } from "../../../_body/BodyEditor";
import { requireV3UserId } from "../../../_body/guard";
import { photoMapOf } from "../../../_body/photo-urls";

// 인물 글 쓰기·고치기(D2 — 2026-11-03 성민 결정: My Life 사람 패널 → 이 화면, 이야기와 같은 편집 부품).
// 글은 NodeBody(PERSON) 한 곳(Person.memo 와 무관), 사진은 node_body 메모리(lib/node-body). 비워 두고 저장해도 됨.
const C = MY_LIFE_COPY.body;

export default async function PersonBodyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireV3UserId();
  const body = await getPersonBody(userId, id);
  if (!body) notFound();
  const map = await photoMapOf(body.photos);
  const back = `/my-life?focus=pe:${id}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <Link href={back} className="self-start text-lg text-action underline underline-offset-4">
        ← {C.backToMap}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px]">{C.personTitle(body.name)}</h1>
        <p className="m-0 text-lg text-ink-soft">{C.personIntro}</p>
      </header>
      {body.revisions > 0 && (
        <ButtonLink href={`/my-life/person/${id}/history`} variant="secondary" size="lg">
          {C.history(body.revisions)}
        </ButtonLink>
      )}
      <Paper>
      <BodyEditor
        kind="person"
        nodeId={id}
        memoryId={body.memoryId}
        initialDoc={body.doc}
        version={body.version}
        photos={body.photos.map((p) => ({ id: p.id, url: map[p.id]?.url ?? null, caption: p.caption }))}
        doneHref={back}
      />
      </Paper>
    </main>
  );
}
