"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@mep/ui";
import { TASK_PRIORITIES, TASK_STATUSES, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import type { Task } from "@/lib/types";
import { formatDate } from "@/lib/money";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";

export default function TasksPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const queryClient = useQueryClient();
  const tasks = useQuery({
    queryKey: ["tasks", eventId],
    queryFn: () => api.get<Task[]>(`/events/${eventId}/tasks`),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    priority: "medium",
    dueAt: "",
    dependencyIds: [] as number[],
  });
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["tasks", eventId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Action failed");

  const create = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/tasks`, {
        title: form.title,
        priority: form.priority,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        dependencyIds: form.dependencyIds,
      }),
    onSuccess: () => {
      toast.success("Task created");
      setOpen(false);
      setForm({ title: "", priority: "medium", dueAt: "", dependencyIds: [] });
      invalidate();
    },
    onError,
  });

  const setStatus = useMutation({
    mutationFn: ({ task, status }: { task: Task; status: string }) =>
      api.patch(`/events/${eventId}/tasks/${task.id}`, {
        title: task.title,
        priority: task.priority,
        dueAt: task.dueAt,
        status,
        dependencyIds: task.dependencyIds,
      }),
    onSuccess: invalidate,
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/events/${eventId}/tasks/${id}`),
    onSuccess: invalidate,
    onError,
  });

  if (tasks.isPending || !tasks.data) return <Skeleton className="h-96" />;
  const byId = new Map(tasks.data.map((t) => [t.id, t]));
  const visible = tasks.data.filter((t) => {
    if (
      q &&
      !`${t.title} ${t.description ?? ""} ${t.category ?? ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
      return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (overdueOnly && !t.overdue) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Tasks"
        description={`${tasks.data.filter((t) => t.status !== "completed" && t.status !== "cancelled").length} open of ${tasks.data.length} · ${tasks.data.filter((t) => t.overdue).length} overdue`}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add task
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          placeholder="Search tasks…"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          aria-label="Search tasks"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {labelize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(ev) => setOverdueOnly(ev.target.checked)}
          />
          Overdue only
        </label>
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Depends on</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No tasks match.
                </TableCell>
              </TableRow>
            )}
            {visible.map((t) => {
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.title}
                    {t.blockedBy.length > 0 && t.status !== "completed" && (
                      <span
                        className="ml-2 text-xs text-amber-600"
                        title={`Blocked by: ${t.blockedBy.map((b) => b.title).join(", ")}`}
                      >
                        (blocked by {t.blockedBy.map((b) => b.title).join(", ")})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{labelize(t.priority)}</TableCell>
                  <TableCell className={t.overdue ? "font-medium text-destructive" : ""}>
                    {formatDate(t.dueAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.dependencyIds.map((id) => byId.get(id)?.title ?? `#${id}`).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.status}
                      onValueChange={(v) => setStatus.mutate({ task: t, status: v })}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {labelize(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete task ${t.title}`}
                      onClick={() => remove.mutate(t.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
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
                <Label>Priority</Label>
                <Select
                  value={form.priority}
                  onValueChange={(v) => setForm({ ...form, priority: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {labelize(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={form.dueAt}
                  onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Depends on (optional)</Label>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {tasks.data
                  .filter((t) => t.status !== "completed")
                  .map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.dependencyIds.includes(t.id)}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            dependencyIds: e.target.checked
                              ? [...form.dependencyIds, t.id]
                              : form.dependencyIds.filter((id) => id !== t.id),
                          })
                        }
                      />
                      {t.title}
                    </label>
                  ))}
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>
              Add task
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
