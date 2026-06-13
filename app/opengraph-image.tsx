import { ImageResponse } from "next/og";

// 카카오톡·문자 링크 미리보기 썸네일 (1200×630). Next.js 파일 컨벤션 —
// 이 파일이 존재하면 자동으로 og:image / twitter:image 태그가 생성된다.
// 실제 대표 이미지가 나오면 이 파일을 app/opengraph-image.png 로 교체 가능.

export const alt = "라이프북 — 부모님의 인생을 한 권으로";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "라이프북";
const SUBTITLE = "부모님의 인생을 한 권으로";

// ImageResponse(satori)는 woff2 미지원 → Google Fonts CSS 에서 truetype/
// opentype URL 만 골라 받는다. text= 로 필요한 글자만 subset(파일 수 KB).
async function loadKoreanFont(text: string): Promise<ArrayBuffer | null> {
  const url = `https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700&text=${encodeURIComponent(text)}`;
  try {
    const css = await (await fetch(url)).text();
    const match = css.match(
      /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/,
    );
    if (!match) return null;
    const res = await fetch(match[1]);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const font = await loadKoreanFont(TITLE + SUBTITLE);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FAF7F0",
        }}
      >
        <div
          style={{
            fontSize: 150,
            fontWeight: 700,
            color: "#2A2520",
            letterSpacing: "0.04em",
          }}
        >
          {TITLE}
        </div>
        <div
          style={{
            fontSize: 52,
            color: "#5C534A",
            marginTop: 28,
          }}
        >
          {SUBTITLE}
        </div>
        {/* 브랜드 포인트 — amber 라인 */}
        <div
          style={{
            width: 140,
            height: 10,
            marginTop: 48,
            borderRadius: 9999,
            backgroundColor: "#C8923D",
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "Noto Serif KR", data: font, weight: 700, style: "normal" }]
        : [],
    },
  );
}
