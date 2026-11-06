import Link from "next/link";
import { notFound } from "next/navigation";

import { Paper } from "@/components/ui/Paper";
import { ButtonLink } from "@/components/ui/Button";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { getItemBody } from "@/lib/node-body";

import { BodyEditor } from "../../../_body/BodyEditor";
import { requireV3UserId } from "../../../_body/guard";
import { photoMapOf } from "../../../_body/photo-urls";

// 사용자 항목 글 쓰기·고치기(custom-graph 2단계 — Q78: 항목 = 이름 + 본문). 인물 글 화면과 같은 편집 부품·이전 판.
// 글은 NodeBody(CUSTOM) 한 곳, 사진은 node_body 메모리(lib/node-body). 비워 두고 저장해도 됨.
const C = MY_LIFE_COPY.body;
const X = MY_LIFE_COPY.custom;

export default async function ItemBodyEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireV3UserId();
  const body = await getItemBody(userId, id);
  if (!body) notFound();
  const map = await photoMapOf(body.photos);
  const back = `/my-life?focus=cn:${id}`;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <Link href={back} className="self-start text-lg text-action underline underline-offset-4">
        ← {C.backToMap}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px]">{X.itemTitle(body.name)}</h1>
        <p className="m-0 text-lg text-ink-soft">{X.itemIntro}</p>
      </header>
      {body.revisions > 0 && (
        <ButtonLink href={`/my-life/item/${id}/history`} variant="secondary" size="lg">
          {C.history(body.revisions)}
        </ButtonLink>
      )}
      <Paper>
        <BodyEditor
          kind="item"
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
