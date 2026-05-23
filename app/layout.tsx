import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lifebook",
  description: "AI와 함께 채워나가는 나의 인생 연혁표",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-white text-black text-lg leading-relaxed">
        {children}
      </body>
    </html>
  );
}
