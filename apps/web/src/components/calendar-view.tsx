"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, Button, Skeleton, cn } from "@mep/ui";
import type { CalendarItem } from "@mep/types";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/money";

type View = "month" | "week" | "agenda";

const KIND_STYLES: Record<string, string> = {
  timeline: "bg-violet-100 text-violet-800 border-violet-200",
  task: "bg-blue-100 text-blue-800 border-blue-200",
  expense_due: "bg-amber-100 text-amber-800 border-amber-200",
  payment_due: "bg-orange-100 text-orange-800 border-orange-200",
  event: "bg-emerald-100 text-emerald-800 border-emerald-200",
  vendor_service: "bg-pink-100 text-pink-800 border-pink-200",
};

const KIND_LABELS: Record<string, string> = {
  timeline: "Timeline",
  task: "Task",
  expense_due: "Payment due",
  payment_due: "Vendor payment",
  event: "Event",
  vendor_service: "Vendor service",
};

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function itemDay(item: CalendarItem) {
  return dayKey(new Date(item.startAt));
}

export function CalendarView({
  endpoint,
  eventStartAt,
}: {
  /** API path returning CalendarItem[]; must accept ?from&to. */
  endpoint: string;
  /** When set (event scope), offers a jump to the day-of-event schedule. */
  eventStartAt?: string | null;
}) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));

  const range = useMemo(() => {
    if (view === "month") {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      return { from: dayKey(addDays(first, -7)), to: dayKey(addDays(last, 7)) };
    }
    if (view === "week") {
      const monday = addDays(cursor, -((cursor.getDay() + 6) % 7));
      return { from: dayKey(monday), to: dayKey(addDays(monday, 6)) };
    }
    return { from: dayKey(addDays(cursor, -30)), to: dayKey(addDays(cursor, 90)) };
  }, [cursor, view]);

  const items = useQuery({
    queryKey: ["calendar", endpoint, range.from, range.to],
    queryFn: () => api.get<CalendarItem[]>(`${endpoint}?from=${range.from}&to=${range.to}`),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items.data ?? []) {
      const key = itemDay(item);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items.data]);

  const shift = (dir: -1 | 1) => {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + dir);
    else if (view === "week") next.setDate(next.getDate() + 7 * dir);
    else next.setDate(next.getDate() + 30 * dir);
    setCursor(startOfDay(next));
  };

  const title =
    view === "month"
      ? cursor.toLocaleDateString("de-DE", { month: "long", year: "numeric" })
      : view === "week"
        ? `Week of ${formatDate(range.from)}`
        : "Agenda";

  const eventDay = eventStartAt ? dayKey(new Date(eventStartAt)) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous period" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next period" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(startOfDay(new Date()))}>
            Today
          </Button>
          {eventDay && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setView("agenda");
                setCursor(startOfDay(new Date(eventStartAt!)));
              }}
            >
              Event day
            </Button>
          )}
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="ml-auto flex gap-1">
          {(["month", "week", "agenda"] as const).map((v) => (
            <Button key={v} size="sm" variant={view === v ? "default" : "outline"} onClick={() => setView(v)}>
              {v === "month" ? "Month" : v === "week" ? "Week" : "Agenda"}
            </Button>
          ))}
        </div>
      </div>

      {items.isPending ? (
        <Skeleton className="h-96" />
      ) : view === "agenda" ? (
        <AgendaList items={items.data ?? []} eventDay={eventDay} />
      ) : (
        <DayGrid cursor={cursor} view={view} byDay={byDay} eventDay={eventDay} />
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(KIND_LABELS).map(([kind, label]) => (
          <span key={kind} className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs", KIND_STYLES[kind])}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function DayGrid({
  cursor,
  view,
  byDay,
  eventDay,
}: {
  cursor: Date;
  view: "month" | "week";
  byDay: Map<string, CalendarItem[]>;
  eventDay: string | null;
}) {
  const days: Date[] = [];
  if (view === "month") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = addDays(first, -((first.getDay() + 6) % 7)); // Monday-first grid
    for (let i = 0; i < 42; i++) days.push(addDays(start, i));
  } else {
    const monday = addDays(cursor, -((cursor.getDay() + 6) % 7));
    for (let i = 0; i < 7; i++) days.push(addDays(monday, i));
  }
  const todayKey = dayKey(new Date());

  return (
    <div className="rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2">{d}</div>
        ))}
      </div>
      <div className={cn("grid grid-cols-7", view === "month" && "grid-rows-6")}>
        {days.map((day) => {
          const key = dayKey(day);
          const dayItems = byDay.get(key) ?? [];
          const outside = view === "month" && day.getMonth() !== cursor.getMonth();
          return (
            <div
              key={key}
              className={cn(
                "min-h-24 border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0",
                view === "week" && "min-h-64",
                outside && "bg-muted/30 text-muted-foreground",
              )}
            >
              <div className="mb-1 flex items-center gap-1">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs",
                    key === todayKey && "bg-primary font-semibold text-primary-foreground",
                  )}
                >
                  {day.getDate()}
                </span>
                {key === eventDay && <Badge variant="secondary" className="text-[10px]">Event day</Badge>}
              </div>
              <div className="space-y-1">
                {dayItems.slice(0, view === "week" ? 20 : 3).map((item) => (
                  <div
                    key={item.key}
                    title={item.title}
                    className={cn("truncate rounded border px-1 py-0.5 text-[11px]", KIND_STYLES[item.kind])}
                  >
                    {item.title}
                  </div>
                ))}
                {view === "month" && dayItems.length > 3 && (
                  <div className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaList({ items, eventDay }: { items: CalendarItem[]; eventDay: string | null }) {
  if (items.length === 0) {
    return <p className="rounded-lg border py-12 text-center text-muted-foreground">Nothing scheduled in this period.</p>;
  }
  let lastDay = "";
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const day = itemDay(item);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={item.key}>
            {showDay && (
              <div className="mt-4 flex items-center gap-2 text-sm font-semibold">
                {formatDate(item.startAt)}
                {day === eventDay && <Badge variant="secondary">Event day</Badge>}
              </div>
            )}
            <div className="ml-2 flex items-center gap-3 rounded-md border px-3 py-2">
              <span className="w-14 text-xs text-muted-foreground">
                {new Date(item.startAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", KIND_STYLES[item.kind])}>
                {KIND_LABELS[item.kind] ?? item.kind}
              </span>
              <span className="text-sm">{item.title}</span>
              {item.source === "auto" && (
                <span className="ml-auto text-[10px] text-muted-foreground">auto</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
