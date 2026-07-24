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
import { api, ApiError } from "@/lib/api";
import { useCurrentWorkspace } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";

interface EventMember {
  id: number;
  role: "planner" | "viewer";
  user: { id: number; name: string; email: string };
}
interface WorkspaceMember {
  id: number;
  role: string;
  user: { id: number; name: string; email: string };
}

export default function MembersPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const { current } = useCurrentWorkspace();
  const queryClient = useQueryClient();

  const members = useQuery({
    queryKey: ["eventMembers", eventId],
    queryFn: () => api.get<EventMember[]>(`/events/${eventId}/members`),
  });
  const wsMembers = useQuery({
    queryKey: ["wsMembers", current?.id],
    queryFn: () => api.get<WorkspaceMember[]>(`/workspaces/${current!.id}/members`),
    enabled: !!current,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ userId: "", role: "viewer" });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["eventMembers", eventId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Action failed");

  const add = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/members`, { userId: Number(form.userId), role: form.role }),
    onSuccess: () => {
      toast.success("Member added");
      setOpen(false);
      invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (memberId: number) => api.delete(`/events/${eventId}/members/${memberId}`),
    onSuccess: invalidate,
    onError,
  });

  if (members.isPending || !members.data) return <Skeleton className="h-64" />;
  const memberIds = new Set(members.data.map((m) => m.user.id));
  const candidates = (wsMembers.data ?? []).filter((m) => !memberIds.has(m.user.id));

  return (
    <div>
      <PageHeader
        title="Event members"
        description="Workspace planners and viewers only see events they are a member of."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add member
          </Button>
        }
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.data.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.user.name}</TableCell>
                <TableCell className="text-muted-foreground">{m.user.email}</TableCell>
                <TableCell>
                  <Badge variant={m.role === "planner" ? "default" : "secondary"}>{m.role}</Badge>
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${m.user.name}`}
                    onClick={() => remove.mutate(m.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add event member</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Workspace member</Label>
              <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select person" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((m) => (
                    <SelectItem key={m.user.id} value={String(m.user.id)}>
                      {m.user.name} ({m.user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planner">Planner (read & write)</SelectItem>
                  <SelectItem value="viewer">Viewer (read only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={add.isPending || !form.userId}>
              Add member
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
