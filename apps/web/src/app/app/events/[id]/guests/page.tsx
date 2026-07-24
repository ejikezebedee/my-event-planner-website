"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
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
import { RSVP_STATUSES, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import type { Guest, GuestGroup } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";

interface GuestListResponse {
  guests: Guest[];
  groups: GuestGroup[];
  stats: {
    total: number;
    accepted: number;
    declined: number;
    pending: number;
    totalAttending: number;
  };
}

interface ImportResult {
  imported: number;
  duplicates: number;
  errors: { row: number; message: string }[];
}

export default function GuestsPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [rsvpFilter, setRsvpFilter] = useState("all");
  const data = useQuery({
    queryKey: ["guests", eventId, q, rsvpFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (q) p.set("q", q);
      if (rsvpFilter !== "all") p.set("rsvpStatus", rsvpFilter);
      const qs = p.toString();
      return api.get<GuestListResponse>(`/events/${eventId}/guests${qs ? `?${qs}` : ""}`);
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    groupId: "",
    accompanyingCount: "0",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ csv: string; result: ImportResult } | null>(null);
  const [importing, setImporting] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["guests", eventId] });
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Action failed");

  const create = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/guests`, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || null,
        groupId: form.groupId ? Number(form.groupId) : null,
        accompanyingCount: Number(form.accompanyingCount) || 0,
      }),
    onSuccess: () => {
      toast.success("Guest added");
      setOpen(false);
      setForm({ firstName: "", lastName: "", email: "", groupId: "", accompanyingCount: "0" });
      invalidate();
    },
    onError,
  });

  const setRsvp = useMutation({
    mutationFn: ({ guest, rsvpStatus }: { guest: Guest; rsvpStatus: string }) =>
      api.patch(`/events/${eventId}/guests/${guest.id}`, {
        firstName: guest.firstName,
        lastName: guest.lastName,
        email: guest.email,
        groupId: guest.groupId,
        accompanyingCount: guest.accompanyingCount,
        rsvpStatus,
      }),
    onSuccess: invalidate,
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/events/${eventId}/guests/${id}`),
    onSuccess: invalidate,
    onError,
  });

  /** Two-step import: validate + preview first, write only on confirm. */
  const previewCsv = async (file: File) => {
    const csv = await file.text();
    try {
      const result = await api.post<ImportResult>(`/events/${eventId}/guests/import`, {
        csv,
        dryRun: true,
      });
      setPreview({ csv, result });
    } catch (err) {
      onError(err);
    }
  };

  const confirmImport = async () => {
    if (!preview) return;
    setImporting(true);
    try {
      const result = await api.post<ImportResult>(`/events/${eventId}/guests/import`, {
        csv: preview.csv,
      });
      toast.success(
        `Imported ${result.imported} guest(s), ${result.duplicates} duplicate(s) skipped`,
      );
      if (result.errors.length > 0) {
        toast.warning(
          `${result.errors.length} row(s) had errors (e.g. row ${result.errors[0]?.row}: ${result.errors[0]?.message})`,
        );
      }
      setPreview(null);
      invalidate();
    } catch (err) {
      onError(err);
    } finally {
      setImporting(false);
    }
  };

  if (data.isPending || !data.data) return <Skeleton className="h-96" />;
  const { guests, groups, stats } = data.data;

  return (
    <div>
      <PageHeader
        title="Guests"
        description={`${stats.total} invited · ${stats.accepted} accepted · ${stats.declined} declined · ${stats.totalAttending} expected attendees`}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void previewCsv(file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() =>
                api.download(
                  `/events/${eventId}/guests/import/template`,
                  "guest-import-template.csv",
                )
              }
            >
              Template
            </Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => api.download(`/events/${eventId}/guests/export`, "guests.csv")}
            >
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add guest
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="w-56"
          placeholder="Search name, email, household…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search guests"
        />
        <Select value={rsvpFilter} onValueChange={setRsvpFilter}>
          <SelectTrigger className="w-44" aria-label="Filter by RSVP">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All RSVPs</SelectItem>
            {RSVP_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {labelize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">+N</TableHead>
                <TableHead>Invitation</TableHead>
                <TableHead>RSVP</TableHead>
                <TableHead className="w-40" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No guests yet — add one or import a CSV.
                  </TableCell>
                </TableRow>
              )}
              {guests.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">
                    {g.firstName} {g.lastName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{g.group?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{g.email ?? "—"}</TableCell>
                  <TableCell className="text-right">{g.accompanyingCount}</TableCell>
                  <TableCell>
                    <StatusBadge status={g.invitationStatus} />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={g.rsvpStatus}
                      onValueChange={(v) => setRsvp.mutate({ guest: g, rsvpStatus: v })}
                    >
                      <SelectTrigger className="h-8 w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RSVP_STATUSES.map((s) => (
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
                      aria-label={`Remove ${g.firstName} ${g.lastName}`}
                      onClick={() => remove.mutate(g.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add guest</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First name</Label>
                <Input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last name</Label>
                <Input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Group</Label>
                <Select
                  value={form.groupId}
                  onValueChange={(v) => setForm({ ...form, groupId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Accompanying guests</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.accompanyingCount}
                  onChange={(e) => setForm({ ...form, accompanyingCount: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={create.isPending}>
              Add guest
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import preview</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md border p-3">
                  <p className="text-2xl font-semibold">{preview.result.imported}</p>
                  <p className="text-xs text-muted-foreground">will import</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-2xl font-semibold">{preview.result.duplicates}</p>
                  <p className="text-xs text-muted-foreground">duplicates</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-2xl font-semibold">{preview.result.errors.length}</p>
                  <p className="text-xs text-muted-foreground">row errors</p>
                </div>
              </div>
              {preview.result.errors.length > 0 && (
                <ul className="max-h-32 space-y-1 overflow-y-auto rounded-md border p-2 text-xs text-destructive">
                  {preview.result.errors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                Nothing has been written yet. Confirm to import.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPreview(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  disabled={importing || preview.result.imported === 0}
                  onClick={confirmImport}
                >
                  {importing ? "Importing…" : "Confirm import"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
