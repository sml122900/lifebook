import Link from "next/link";
import type { ComponentProps } from "react";

// 디자인 토큰 2차 (토큰 가이드 v1.0 §3.2) — 버튼 위계 3종 + 파괴적 옵션.
//
// - primary:   bg-action 흰 글자. 화면당 1개 원칙 (주요 CTA).
// - secondary: surface 표면 + brand 보더 + action 글자.
// - tertiary:  배경 없음 + ink-soft 글자 + line 1px 보더.
// - plain:     보더도 없는 텍스트형 (ink-soft + 밑줄) — 카드 안 최하 위계.
// - destructive: tertiary 형태에 danger 글자색만 (빨강 필 금지).
//
// size: md=48px(터치 최소) / lg=56px(주요 CTA). 라운딩 10px 고정.
// <button> 은 Button, 링크는 ButtonLink — 같은 클래스 생성기를 공유한다.

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "plain"
  | "destructive";
export type ButtonSize = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold " +
  "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-action text-white hover:bg-action-hover",
  secondary: "border-2 border-brand bg-surface text-action hover:bg-banner",
  tertiary: "border border-line bg-transparent text-ink-soft hover:bg-canvas",
  plain:
    "bg-transparent text-ink-soft underline underline-offset-4 hover:text-ink",
  destructive: "border border-line bg-transparent text-danger hover:bg-canvas",
};

const SIZE: Record<ButtonSize, string> = {
  md: "min-h-[48px] px-5 py-2 text-base",
  lg: "min-h-[56px] px-6 py-3 text-lg",
};

export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra?: string,
) {
  return [BASE, VARIANT[variant], SIZE[size], extra].filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      {...rest}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClasses(
        variant,
        size,
        typeof className === "string" ? className : undefined,
      )}
      {...rest}
    />
  );
}
