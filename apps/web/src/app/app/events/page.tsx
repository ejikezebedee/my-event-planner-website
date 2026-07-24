"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@mep/ui";
import { EVENT_TYPES, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import { useCurrentWorkspace, useEvents } from "@/lib/hooks";
import { formatDate } from "@/lib/money";
import { MoneyInput } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

function NewEventDialog({ workspaceId }: { workspaceId: number }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "other",
    startAt: "",
    venueName: "",
    expectedGuests: "",
  });
  const [budget, setBudget] = useState(0);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      api.post("/events", {
        workspaceId,
        name: form.name,
        type: form.type,
        startAt: form.startAt ? new Date(form.startAt).toISOString() : null,
        venueName: form.venueName || null,
        expectedGuests: form.expectedGuests ? Number(form.expectedGuests) : null,
        budgetAmount: budget,
      }),
    onSuccess: () => {
      toast.success("Event created");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["events", workspaceId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not create event"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create event</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {labelize(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startAt">Date</Label>
              <Input
                id="startAt"
                type="date"
                value={form.startAt}
                onChange={(e) => setForm({ ...form, startAt: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="venue">Venue</Label>
              <Input
                id="venue"
                value={form.venueName}
                onChange={(e) => setForm({ ...form, venueName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guests">Expected guests</Label>
              <Input
                id="guests"
                type="number"
                min={0}
                value={form.expectedGuests}
                onChange={(e) => setForm({ ...form, expectedGuests: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Total budget</Label>
            <MoneyInput value={budget} onChange={setBudget} />
          </div>
          <Button type="submit" className="w-full" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create event"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function EventsPage() {
  const { current } = useCurrentWorkspace();
  const events = useEvents(current?.id);

  return (
    <div>
      <PageHeader
        title="Events"
        description={current ? `Workspace: ${current.name}` : undefined}
        actions={current ? <NewEventDialog workspaceId={current.id} /> : undefined}
      />
      {events.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}
      {events.data && events.data.length === 0 && (
        <EmptyState title="No events yet" hint="Create your first event to start planning." />
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {events.data?.map((event) => (
          <Link key={event.id} href={`/app/events/${event.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{event.name}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {labelize(event.type)} · {formatDate(event.startAt)}
                    {event.venueName ? ` · ${event.venueName}` : ""}
                  </p>
                </div>
                <StatusBadge status={event.status} />
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {event._count?.expenses ?? 0} expenses · {event._count?.guests ?? 0} guests ·{" "}
                {event._count?.tasks ?? 0} tasks
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
