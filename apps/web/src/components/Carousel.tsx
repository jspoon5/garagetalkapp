import type { ReactNode } from "react";

export function Carousel({
  ariaLabel,
  className,
  contentClassName,
  children,
}: {
  ariaLabel: string;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}) {
  return (
    <div className={className} role="region" aria-label={ariaLabel}>
      <div className={`gt-carousel-track ${contentClassName ?? ""}`}>{children}</div>
    </div>
  );
}
