"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// DB 로는 이미 최신 동의를 했는데 proxy 가 /consent 로 보낸 경우(쿠키의 동의 값이
// 오래됨 — 다른 기기에서 동의, 제출 직후 update() 실패 등). 서버 redirect("/enter")
// 만 하면 쿠키가 그대로라 proxy 가 다시 /consent 로 돌려 루프가 된다. 세션을
// 다시 받아(Node jwt 콜백이 DB 값으로 쿠키를 새로 씀) 쿠키를 고친 뒤 이동한다.
//
// update() 는 SessionProvider 가 첫 세션을 받는 중(loading)이면 아무것도 안 하고
// 돌아오므로, 그 첫 요청이 끝난 뒤에 한 번만 부른다.
export function ConsentSessionSync() {
  const { status, update } = useSession();
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (status === "loading" || started.current) return;
    started.current = true;
    void update().finally(() => router.replace("/enter"));
  }, [status, update, router]);

  return null;
}
