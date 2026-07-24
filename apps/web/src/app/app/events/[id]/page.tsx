"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from "@mep/ui";
import { api, ApiError } from "@/lib/api";
import { useEvent } from "@/lib/hooks";
import type { EventSummary } from "@/lib/types";
import { formatDate } from "@/lib/money";
import { MoneyText } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";

export default function EventOverviewPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const event = useEvent(eventId);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<EventSummary>>({});

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/events/${eventId}`, {
        name: draft.name,
        venueName: draft.venueName,
        city: draft.city,
        startAt: draft.startAt,
        endAt: draft.endAt,
        expectedGuests: draft.expectedGuests,
        notes: (draft as { notes?: string }).notes ?? null,
      }),
    onSuccess: () => {
      toast.success("Event updated");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Update failed"),
  });

  const remove = useMutation({
    mutationFn: () => api.delete<{ archived: boolean }>(`/events/${eventId}`),
    onSuccess: (res) => {
      toast.success(
        res.archived
          ? "Event has financial records — it was archived, not deleted"
          : "Event deleted",
      );
      queryClient.invalidateQueries({ queryKey: ["events"] });
      if (!res.archived) window.location.href = "/app/events";
      else queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    },
  });

  const restore = useMutation({
    mutationFn: () => api.post<{ archived: boolean }>(`/events/${eventId}/restore`, {}),
    onSuccess: () => {
      toast.success("Event restored to planning");
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Restore failed"),
  });

  if (event.isPending || !event.data) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44" />
        ))}
      </div>
    );
  }
  const e = event.data;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Details</CardTitle>
          <div className="flex gap-2">
            {e.status === "archived" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => restore.mutate()}
                disabled={restore.isPending}
              >
                Restore event
              </Button>
            ) : (
              <>
                {!editing && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDraft(e);
                      setEditing(true);
                    }}
                  >
                    Edit
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (
                      confirm(
                        "Delete this event? Events with financial records are archived instead.",
                      )
                    )
                      remove.mutate();
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form
              className="grid grid-cols-2 gap-4"
              onSubmit={(ev) => {
                ev.preventDefault();
                save.mutate();
              }}
            >
              <div className="col-span-2 space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={draft.name ?? ""}
                  onChange={(ev2) => setDraft({ ...draft, name: ev2.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Venue</Label>
                <Input
                  value={draft.venueName ?? ""}
                  onChange={(ev2) => setDraft({ ...draft, venueName: ev2.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input
                  value={draft.city ?? ""}
                  onChange={(ev2) => setDraft({ ...draft, city: ev2.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input
                  type="date"
                  value={(draft.startAt ?? "").slice(0, 10)}
                  onChange={(ev2) =>
                    setDraft({
                      ...draft,
                      startAt: ev2.target.value ? new Date(ev2.target.value).toISOString() : null,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expected guests</Label>
                <Input
                  type="number"
                  min={0}
                  value={draft.expectedGuests ?? ""}
                  onChange={(ev2) =>
                    setDraft({
                      ...draft,
                      expectedGuests: ev2.target.value ? Number(ev2.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="col-span-2 flex gap-2">
                <Button type="submit" size="sm" disabled={save.isPending}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={e.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Date</dt>
                <dd className="mt-0.5">
                  {formatDate(e.startAt)}
                  {e.endAt ? ` – ${formatDate(e.endAt)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Venue</dt>
                <dd className="mt-0.5">
                  {e.venueName ?? "—"}
                  {e.city ? `, ${e.city}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Expected guests</dt>
                <dd className="mt-0.5">{e.expectedGuests ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Currency</dt>
                <dd className="mt-0.5">{e.currency}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Finances</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Budget</span>
            <MoneyText minor={e.budgetAmount} currency={e.currency} className="font-medium" />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Actual expenses</span>
            <MoneyText
              minor={e.totals?.actual ?? 0}
              currency={e.currency}
              className="font-medium"
            />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Paid</span>
            <MoneyText minor={e.totals?.paid ?? 0} currency={e.currency} className="font-medium" />
          </div>
          <div className="flex justify-between border-t pt-3">
            <span className="text-muted-foreground">Budget remaining</span>
            <MoneyText
              minor={e.budgetAmount - (e.totals?.actual ?? 0)}
              currency={e.currency}
              className="font-semibold"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
