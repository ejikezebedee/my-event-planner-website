"use client";

import { Skeleton } from "@mep/ui";
import { useCurrentWorkspace } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { CalendarView } from "@/components/calendar-view";

export default function WorkspaceCalendarPage() {
  const { current } = useCurrentWorkspace();

  if (!current) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Everything scheduled across all your events in this workspace."
      />
      <CalendarView endpoint={`/calendar?workspaceId=${current.id}`} />
    </div>
  );
}
