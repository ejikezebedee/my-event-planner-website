"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Button, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@mep/ui";
import { DOCUMENT_CATEGORIES, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import type { DocumentItem, EventVendor, Expense, Payment, Task } from "@/lib/types";
import { formatDateTime } from "@/lib/money";
import { PageHeader } from "@/components/page-header";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: ["documents", eventId],
    queryFn: () => api.get<DocumentItem[]>(`/events/${eventId}/documents`),
  });
  const expenses = useQuery({
    queryKey: ["expenses", eventId, ""],
    queryFn: () => api.get<Expense[]>(`/events/${eventId}/expenses`),
  });
  const payments = useQuery({
    queryKey: ["payments", eventId],
    queryFn: () => api.get<Payment[]>(`/events/${eventId}/payments`),
  });
  const vendors = useQuery({
    queryKey: ["eventVendors", eventId],
    queryFn: () => api.get<EventVendor[]>(`/events/${eventId}/vendors`),
  });
  const tasks = useQuery({
    queryKey: ["tasks", eventId],
    queryFn: () => api.get<Task[]>(`/events/${eventId}/tasks`),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("other");
  const [expenseId, setExpenseId] = useState("none");
  const [paymentId, setPaymentId] = useState("none");
  const [vendorId, setVendorId] = useState("none");
  const [taskId, setTaskId] = useState("none");
  const [uploading, setUploading] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["documents", eventId] });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      toast.success("Document deleted");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Delete failed"),
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("category", category);
      if (expenseId !== "none") form.append("expenseId", expenseId);
      if (paymentId !== "none") form.append("paymentId", paymentId);
      if (vendorId !== "none") {
        form.append("linkedType", "vendor");
        form.append("linkedId", vendorId);
      } else if (taskId !== "none") {
        form.append("linkedType", "task");
        form.append("linkedId", taskId);
      }
      await api.upload(`/events/${eventId}/documents`, form);
      toast.success("Document uploaded");
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (documents.isPending || !documents.data) return <Skeleton className="h-96" />;

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Private storage — files are only accessible to event members."
        actions={
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{DOCUMENT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Receipt for</Label>
              <Select value={expenseId} onValueChange={setExpenseId}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No expense</SelectItem>
                  {(expenses.data ?? []).map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proof of</Label>
              <Select value={paymentId} onValueChange={setPaymentId}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No payment</SelectItem>
                  {(payments.data ?? []).filter((p) => !p.reversedAt).map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.expense?.title ?? `#${p.expenseId}`} · {p.type === "refund" ? "refund " : ""}{(p.amount / 100).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendor</Label>
              <Select value={vendorId} onValueChange={(v) => { setVendorId(v); if (v !== "none") setTaskId("none"); }}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No vendor</SelectItem>
                  {(vendors.data ?? []).map((l) => (
                    <SelectItem key={l.vendorId} value={String(l.vendorId)}>{l.vendor.businessName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Task</Label>
              <Select value={taskId} onValueChange={(v) => { setTaskId(v); if (v !== "none") setVendorId("none"); }}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No task</SelectItem>
                  {(tasks.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" /> {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
        }
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Linked to</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.data.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No documents yet.</TableCell></TableRow>
            )}
            {documents.data.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell className="font-medium">{doc.originalName}</TableCell>
                <TableCell>{labelize(doc.category)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {[
                    doc.expenseId != null
                      ? `Expense: ${expenses.data?.find((e) => e.id === doc.expenseId)?.title ?? `#${doc.expenseId}`}`
                      : null,
                    doc.paymentId != null ? `Payment #${doc.paymentId}` : null,
                    doc.linkedType === "vendor" && doc.linkedId != null
                      ? `Vendor: ${vendors.data?.find((l) => l.vendorId === doc.linkedId)?.vendor.businessName ?? `#${doc.linkedId}`}`
                      : null,
                    doc.linkedType === "task" && doc.linkedId != null
                      ? `Task: ${tasks.data?.find((t) => t.id === doc.linkedId)?.title ?? `#${doc.linkedId}`}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </TableCell>
                <TableCell className="text-right">{formatSize(doc.sizeBytes)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(doc.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label={`Download ${doc.originalName}`} onClick={() => api.download(`/documents/${doc.id}/download`, doc.originalName)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={`Delete ${doc.originalName}`} onClick={() => { if (confirm("Delete this document?")) remove.mutate(doc.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
