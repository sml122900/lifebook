"use client";

import { useEffect } from "react";

// Last-resort boundary. Fires only when the root layout itself fails
// (so route-segment error.tsx couldn't render). Because the layout is
// gone we must render our own <html> and <body> here; no shared chrome
// is available.
//
// Same rule as error.tsx: raw error.message stays out of the UI.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          padding: "3rem 1.5rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', sans-serif",
          background: "white",
          color: "#18181b",
          fontSize: "1.125rem",
          lineHeight: 1.7,
        }}
      >
        <main style={{ maxWidth: "640px", margin: "0 auto" }}>
          <h1
            style={{
              fontSize: "1.875rem",
              fontWeight: 700,
              marginTop: 0,
              marginBottom: "1rem",
            }}
          >
            화면을 열 수 없어요
          </h1>
          <p style={{ marginBottom: "1.5rem" }}>
            잠시 후 새로고침 해주세요. 당신 잘못이 아니에요.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "1rem 1.5rem",
              fontSize: "1.125rem",
              fontWeight: 600,
              color: "white",
              background: "#18181b",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: "1.5rem",
                fontSize: "0.875rem",
                color: "#71717a",
              }}
            >
              문의 시 알려주세요: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
