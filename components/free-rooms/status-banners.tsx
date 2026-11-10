import { Alert, AlertDescription } from "@/components/ui/alert";
import type { Campus } from "@/lib/data/schema";
import { dayContext, isStale, type ScheduleIndex } from "@/lib/free-rooms";
import { daysSince, formatShortDate, formatTermRanges } from "./format";

type Props = { index: ScheduleIndex; campus: Campus; date: string; now: Date };

/** Every banner whose FR-5 condition holds. Informational, so role="status", never "alert". */
export function bannerMessages({ index, campus, date, now }: Props): string[] {
  const { data } = index;
  const context = dayContext(index, campus.code, date);
  const messages: string[] = [];

  if (isStale(data.generatedAt, now)) {
    const days = daysSince(data.generatedAt, now);
    messages.push(`This data was last updated ${days} days ago and may be out of date.`);
  }
  if (context.noClass !== null) {
    messages.push(
      `No classes at ${campus.name} on ${formatShortDate(date)} (${context.noClass.label}). ` +
        "Rooms show as free, but buildings may be closed.",
    );
  }
  for (const period of context.examPeriods) {
    messages.push(`${period.label}: exams aren't in this data, so free rooms may be in use.`);
  }
  if (!context.inCoverage) {
    messages.push(
      `No classes are scheduled on this date in the data we have (covers ${formatTermRanges(data.terms)}).`,
    );
  } else if (!context.calendarKnown) {
    messages.push(
      "Holidays and exam dates for this term aren't loaded yet, so results may be wrong on those days.",
    );
  }
  for (const { term, percentRoomed } of context.incompleteTerms) {
    messages.push(
      `Room assignments for ${term.description} are incomplete (${percentRoomed}% assigned), ` +
        "so some rooms shown free may not be.",
    );
  }
  return messages;
}

export function StatusBanners(props: Props) {
  const messages = bannerMessages(props);
  if (messages.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {messages.map((message) => (
        <Alert key={message} role="status">
          <AlertDescription className="text-foreground">{message}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
