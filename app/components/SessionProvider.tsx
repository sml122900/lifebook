"use client";

// next-auth/react 의 SessionProvider 를 감싼 클라이언트 래퍼.
// RSC 루트 레이아웃에서 client 컴포넌트를 직접 못 쓰므로 한 겹 감싸,
// 하위 client 컴포넌트들이 useSession 등을 쓸 수 있게 한다.
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
