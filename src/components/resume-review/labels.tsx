import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OverallLabel } from "@/lib/resume-review/report-schema";
import type { CheckLabel } from "@/lib/resume-review/types";

// Same colors as the match report: green is good, yellow worth a look, red a problem.
export const CHECK_LABELS: Record<CheckLabel, { label: string; className: string }> = {
  good: { label: "Good", className: "bg-green-500/15 text-green-700 dark:text-green-400" },
  could_improve: { label: "Could improve", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  fix: { label: "Fix this", className: "bg-red-500/15 text-red-700 dark:text-red-400" },
  info: { label: "Information", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
};

export const OVERALL_LABELS: Record<OverallLabel, { label: string; className: string; meaning: string }> = {
  ready: {
    label: "Ready to send",
    className: "bg-green-500/15 text-green-700 dark:text-green-400",
    meaning: "Nothing serious to fix. The suggestions below are polish.",
  },
  few_fixes: {
    label: "A few fixes",
    className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    meaning: "A few changes would make this resume noticeably stronger.",
  },
  needs_work: {
    label: "Needs work",
    className: "bg-red-500/15 text-red-700 dark:text-red-400",
    meaning: "Several problems could cost you interviews. Start with the fixes at the top.",
  },
};

export function LabelBadge({ label, className }: { label: CheckLabel; className?: string }) {
  const style = CHECK_LABELS[label];
  return (
    <Badge variant="outline" className={cn("border-none", style.className, className)}>
      {style.label}
    </Badge>
  );
}

export function OverallBadge({ label, size = "sm" }: { label: OverallLabel; size?: "sm" | "lg" }) {
  const style = OVERALL_LABELS[label];
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full font-semibold",
        size === "lg" ? "px-3 py-1 text-base" : "px-2 py-0.5 text-xs",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}
