import type { MouseEventHandler, ReactNode } from "react";

export type BadgeTone = "neutral" | "amber" | "wine" | "green" | "green-strong" | "danger";

export type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  ariaLabel?: string;
};

export function Badge({ children, tone = "neutral", className, onClick, ariaLabel }: BadgeProps) {
  const classNames = ["ui-badge", `ui-badge--${tone}`, className].filter(Boolean).join(" ");
  if (onClick) {
    return <button type="button" className={`${classNames} ui-badge--action`} onClick={onClick} aria-label={ariaLabel}>{children}</button>;
  }
  return <span className={classNames}>{children}</span>;
}
