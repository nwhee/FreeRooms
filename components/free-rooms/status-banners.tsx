import { Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Campus } from "@/lib/data/schema";
import { dayContext, isStale, type ScheduleIndex } from "@/lib/free-rooms";
import { cn } from "@/lib/utils";
import { daysSince, formatShortDate, formatTermRanges } from "./format";

type Props = { index: ScheduleIndex; campus: Campus; date: string; now: Date };

/** "info": the calendar says the schedule may not apply. "warning": the data itself may be wrong. */
export type Banner = { tone: "info" | "warning"; text: string };

/** Every banner whose FR-5 condition holds, in display order. */
export function banners({ index, campus, date, now }: Props): Banner[] {
  const { data } = index;
  const context = dayContext(index, campus.code, date);
  const out: Banner[] = [];

  if (isStale(data.generatedAt, now)) {
    const days = daysSince(data.generatedAt, now);
    out.push({ tone: "warning", text: `This data was last updated ${days} days ago and may be out of date.` });
  }
  if (context.noClass !== null) {
    out.push({
      tone: "info",
      text:
        `No classes at ${campus.name} on ${formatShortDate(date)} (${context.noClass.label}). ` +
        "Rooms show as free, but buildings may be closed.",
    });
  }
  for (const period of context.examPeriods) {
    out.push({ tone: "info", text: `${period.label}: exams aren't in this data, so free rooms may be in use.` });
  }
  if (!context.inCoverage) {
    out.push({
      tone: "info",
      text: `No classes are scheduled on this date in the data we have (covers ${formatTermRanges(data.terms)}).`,
    });
  } else if (!context.calendarKnown) {
    out.push({
      tone: "warning",
      text: "Holidays and exam dates for this term aren't loaded yet, so results may be wrong on those days.",
    });
  }
  for (const { term, percentRoomed } of context.incompleteTerms) {
    out.push({
      tone: "warning",
      text:
        `Room assignments for ${term.description} are incomplete (${percentRoomed}% assigned), ` +
        "so some rooms shown free may not be.",
    });
  }
  return out;
}

/**
 * Trust banners. Informational, so role="status", never "alert". The tint and
 * icon set them apart from room cards; text stays text-foreground on a near-white
 * tint, well above 4.5:1.
 */
export function StatusBanners(props: Props) {
  const list = banners(props);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {list.map(({ tone, text }) => {
        const Icon = tone === "warning" ? TriangleAlert : Info;
        return (
          <Alert
            key={text}
            role="status"
            data-tone={tone}
            className={cn(
              "px-3 py-2.5",
              // The icon follows the Alert's text colour (*:[svg]:text-current); the description overrides it.
              tone === "warning"
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : "border-border bg-muted text-foreground",
            )}
          >
            <Icon aria-hidden="true" />
            <AlertDescription className="text-pretty text-foreground">{text}</AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}
