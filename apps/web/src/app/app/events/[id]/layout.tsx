"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Skeleton } from "@mep/ui";
import { useEvent } from "@/lib/hooks";
import { cn } from "@mep/ui";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "budget", label: "Budget" },
  { slug: "expenses", label: "Expenses" },
  { slug: "payments", label: "Payments" },
  { slug: "guests", label: "Guests" },
  { slug: "vendors", label: "Vendors" },
  { slug: "tasks", label: "Tasks" },
  { slug: "timeline", label: "Timeline" },
  { slug: "calendar", label: "Calendar" },
  { slug: "documents", label: "Documents" },
  { slug: "reports", label: "Reports" },
  { slug: "members", label: "Members" },
];

export default function EventLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const eventId = Number(params.id);
  const event = useEvent(eventId);
  const base = `/app/events/${eventId}`;

  if (event.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h1 className="text-2xl font-semibold">Event not found</h1>
        <p className="max-w-md text-muted-foreground">
          This event does not exist, was deleted, or you do not have access to it.
        </p>
        <Link
          href="/app/events"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to events
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/app/events" className="text-sm text-muted-foreground hover:underline">← All events</Link>
        {event.data ? (
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{event.data.name}</h1>
        ) : (
          <Skeleton className="mt-1 h-8 w-64" />
        )}
      </div>
      {/* Mobile: single-row horizontally scrollable tab strip (edge-to-edge);
          desktop: natural wrapping row. Prevents the 12-tab bar from
          collapsing into ragged stacked rows on small screens. */}
      <div className="-mx-4 mb-6 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div className="flex min-w-max gap-1 border-b">
          {TABS.map((tab) => {
            const href = tab.slug ? `${base}/${tab.slug}` : base;
            const active = tab.slug === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={tab.slug}
                href={href}
                className={cn(
                  "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
