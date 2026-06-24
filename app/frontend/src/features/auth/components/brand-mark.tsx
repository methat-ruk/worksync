import { Layers3 } from "lucide-react";
import Link from "next/link";

export function BrandMark({
  compact = false,
  linked = false
}: {
  compact?: boolean;
  linked?: boolean;
}) {
  const content = (
    <span className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
        <Layers3 aria-hidden="true" />
      </span>
      {!compact && (
        <span className="text-base font-semibold tracking-tight">WorkSync</span>
      )}
    </span>
  );

  return linked ? (
    <Link
      aria-label="WorkSync home"
      className="inline-flex rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href="/"
    >
      {content}
    </Link>
  ) : (
    content
  );
}
