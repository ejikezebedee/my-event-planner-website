"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@mep/ui";
import { TIMELINE_TYPES, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import type { TimelineEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/money";
import { PageHeader } from "@/components/page-header";

export default function TimelinePage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const queryClient = useQueryClient();
  const entries = useQuery({
    queryKey: ["timeline", eventId],
    queryFn: () => api.get<TimelineEntry[]>(`/events/${eventId}/timeline`),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", type: "custom", startAt: "", notes: "" });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["timeline", eventId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Action failed");

  const create = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/timeline`, {
        title: form.title,
        type: form.type,
        startAt: new Date(form.startAt).toISOString(),
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success("Entry added");
      setOpen(false);
      setForm({ title: "", type: "custom", startAt: "", notes: "" });
      invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/events/${eventId}/timeline/${id}`),
    onSuccess: invalidate,
    onError,
  });

  if (entries.isPending || !entries.data) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader
        title="Timeline"
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add entry
          </Button>
        }
      />
      {entries.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
      ) : (
        <ol className="relative ml-3 space-y-6 border-l pl-6">
          {entries.data.map((entry) => {
            const isAuto = entry.source === "auto";
            return (
              <li key={String(entry.id)} className="relative">
                <span
                  className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ${isAuto ? "bg-muted-foreground/50" : "bg-primary"}`}
                />
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">
                      {entry.title}
                      {isAuto && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          auto
                        </Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {labelize(entry.type)} · {formatDateTime(entry.startAt)}
                    </p>
                    {entry.notes && (
                      <p className="mt-1 text-sm text-muted-foreground">{entry.notes}</p>
                    )}
                  </div>
                  {!isAuto && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${entry.title}`}
                      onClick={() => remove.mutate(Number(entry.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add timeline entry</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
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
                    {TIMELINE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {labelize(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input
                  required
                  type="datetime-local"
                  value={form.startAt}
                  onChange={(e) => setForm({ ...form, startAt: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending || !form.startAt}>
              Add entry
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
