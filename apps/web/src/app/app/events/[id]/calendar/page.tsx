"use client";

import { useParams } from "next/navigation";
import { Skeleton } from "@mep/ui";
import { useEvent } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { CalendarView } from "@/components/calendar-view";

export default function EventCalendarPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const event = useEvent(eventId);

  if (!event.data) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Timeline entries, tasks, payment deadlines and vendor services — auto items update with their records."
      />
      <CalendarView endpoint={`/events/${eventId}/calendar`} eventStartAt={event.data.startAt} />
    </div>
  );
}
