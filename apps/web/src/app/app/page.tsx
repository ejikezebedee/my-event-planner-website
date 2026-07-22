"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CalendarDays, ListChecks, PiggyBank, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from "@mep/ui";
import { api } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/hooks";
import type { DashboardData } from "@/lib/types";
import { formatDateTime } from "@/lib/money";
import { MoneyText } from "@/components/money";
import { PageHeader } from "@/components/page-header";

export default function DashboardPage() {
  const { current } = useCurrentWorkspace();
  const dashboard = useQuery({
    queryKey: ["dashboard", current?.id],
    queryFn: () => api.get<DashboardData>(`/dashboard?workspaceId=${current!.id}`),
    enabled: !!current,
  });

  if (!current || dashboard.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }
  const d = dashboard.data!;

  return (
    <div>
      <PageHeader title="Dashboard" description={`Overview of ${current.name}`} />

      {d.alerts.overdueExpenses > 0 && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          {d.alerts.overdueExpenses} expense{d.alerts.overdueExpenses > 1 ? "s are" : " is"} overdue for payment.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Events</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{d.events.total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Budget vs actual</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold"><MoneyText minor={d.finances.actual} currency={current.currency} /></p>
            <p className="text-xs text-muted-foreground">of <MoneyText minor={d.finances.budget} currency={current.currency} /> budgeted</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid so far</CardTitle>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold"><MoneyText minor={d.finances.paid} currency={current.currency} /></p></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Guests</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><p className="text-2xl font-bold">{d.guests.total}</p></CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Upcoming events</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {d.events.upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming events.</p>}
            {d.events.upcoming.map((e) => (
              <Link key={e.id} href={`/app/events/${e.id}`} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(e.startAt)}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Next tasks</CardTitle>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2">
            {d.tasks.upcoming.length === 0 && <p className="text-sm text-muted-foreground">No open tasks with due dates.</p>}
            {d.tasks.upcoming.map((t) => (
              <Link key={t.id} href={`/app/events/${t.eventId}/tasks`} className="flex items-center justify-between rounded-md border p-3 hover:bg-accent">
                <p className="font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(t.dueAt)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
