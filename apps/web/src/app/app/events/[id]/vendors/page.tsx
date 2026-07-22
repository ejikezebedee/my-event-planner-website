"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label, Select,
  SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Table, TableBody,
  TableCell, TableHead, TableHeader, TableRow,
} from "@mep/ui";
import { VENDOR_STATUSES, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import { useCurrentWorkspace, useEvent } from "@/lib/hooks";
import type { EventVendor, Vendor } from "@/lib/types";
import { MoneyInput, MoneyText } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";

export default function VendorsPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const event = useEvent(eventId);
  const { current } = useCurrentWorkspace();
  const queryClient = useQueryClient();

  const links = useQuery({
    queryKey: ["eventVendors", eventId],
    queryFn: () => api.get<EventVendor[]>(`/events/${eventId}/vendors`),
  });
  const workspaceVendors = useQuery({
    queryKey: ["vendors", current?.id],
    queryFn: () => api.get<Vendor[]>(`/vendors?workspaceId=${current!.id}`),
    enabled: !!current,
  });

  const [vendorDialog, setVendorDialog] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [vendorForm, setVendorForm] = useState({ businessName: "", serviceCategory: "", email: "", phone: "" });
  const [assignForm, setAssignForm] = useState({ vendorId: "", status: "potential" });
  const [agreed, setAgreed] = useState(0);
  const [vendorSearch, setVendorSearch] = useState("");
  const [summaryFor, setSummaryFor] = useState<number | null>(null);

  const filteredVendors = useQuery({
    queryKey: ["vendors", current?.id, vendorSearch],
    queryFn: () => api.get<Vendor[]>(`/vendors?workspaceId=${current!.id}${vendorSearch ? `&q=${encodeURIComponent(vendorSearch)}` : ""}`),
    enabled: !!current && assignDialog,
  });
  const summary = useQuery({
    queryKey: ["vendorSummary", summaryFor],
    queryFn: () =>
      api.get<Vendor & { summary: { events: number; quoted: number; agreed: number; paid: number }; links: { id: number; status: string; agreedAmount: number | null; rating: number | null; event: { id: number; name: string } }[] }>(
        `/vendors/${summaryFor}?workspaceId=${current!.id}`,
      ),
    enabled: !!current && summaryFor != null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["eventVendors", eventId] });
    queryClient.invalidateQueries({ queryKey: ["vendors", current?.id] });
  };
  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Action failed");

  const createVendor = useMutation({
    mutationFn: () =>
      api.post(`/vendors?workspaceId=${current!.id}`, {
        businessName: vendorForm.businessName,
        serviceCategory: vendorForm.serviceCategory || null,
        email: vendorForm.email || null,
        phone: vendorForm.phone || null,
      }),
    onSuccess: () => {
      toast.success("Vendor created");
      setVendorDialog(false);
      setVendorForm({ businessName: "", serviceCategory: "", email: "", phone: "" });
      invalidate();
    },
    onError,
  });

  const assign = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/vendors`, {
        vendorId: Number(assignForm.vendorId),
        status: assignForm.status,
        agreedAmount: agreed > 0 ? agreed : null,
      }),
    onSuccess: () => {
      toast.success("Vendor assigned to event");
      setAssignDialog(false);
      setAssignForm({ vendorId: "", status: "potential" });
      setAgreed(0);
      invalidate();
    },
    onError,
  });

  const setStatus = useMutation({
    mutationFn: ({ link, status }: { link: EventVendor; status: string }) =>
      api.patch(`/events/${eventId}/vendors/${link.id}`, {
        vendorId: link.vendorId,
        status,
        agreedAmount: link.agreedAmount,
        quotedAmount: link.quotedAmount,
      }),
    onSuccess: invalidate,
    onError,
  });

  const removeLink = useMutation({
    mutationFn: (linkId: number) => api.delete(`/events/${eventId}/vendors/${linkId}`),
    onSuccess: invalidate,
    onError,
  });

  if (links.isPending || !links.data || !event.data) return <Skeleton className="h-96" />;
  const currency = event.data.currency;

  return (
    <div>
      <PageHeader
        title="Vendors"
        actions={
          <>
            <Button variant="outline" onClick={() => setVendorDialog(true)}><Plus className="mr-2 h-4 w-4" /> New vendor</Button>
            <Button onClick={() => setAssignDialog(true)}>Assign vendor</Button>
          </>
        }
      />
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendor</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Quoted</TableHead>
              <TableHead className="text-right">Agreed</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {links.data.length === 0 && (
              <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No vendors assigned yet.</TableCell></TableRow>
            )}
            {links.data.map((link) => (
              <TableRow key={link.id}>
                <TableCell className="font-medium">
                  <button className="hover:underline" onClick={() => setSummaryFor(link.vendorId)}>
                    {link.vendor.businessName}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground">{link.vendor.serviceCategory ?? "—"}</TableCell>
                <TableCell className="text-right">{link.quotedAmount != null ? <MoneyText minor={link.quotedAmount} currency={currency} /> : "—"}</TableCell>
                <TableCell className="text-right">{link.agreedAmount != null ? <MoneyText minor={link.agreedAmount} currency={currency} /> : "—"}</TableCell>
                <TableCell className="text-right"><MoneyText minor={link.paid} currency={currency} /></TableCell>
                <TableCell>
                  <Select value={link.status} onValueChange={(v) => setStatus.mutate({ link, status: v })}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>{VENDOR_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" aria-label={`Remove ${link.vendor.businessName}`} onClick={() => removeLink.mutate(link.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={vendorDialog} onOpenChange={setVendorDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>New vendor</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); createVendor.mutate(); }}>
            <div className="space-y-1.5">
              <Label>Business name</Label>
              <Input required value={vendorForm.businessName} onChange={(e) => setVendorForm({ ...vendorForm, businessName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Service category</Label>
              <Input value={vendorForm.serviceCategory} onChange={(e) => setVendorForm({ ...vendorForm, serviceCategory: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={createVendor.isPending}>Create vendor</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialog} onOpenChange={setAssignDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign vendor to event</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); assign.mutate(); }}>
            <div className="space-y-1.5">
              <Label>Search vendors</Label>
              <Input placeholder="Name, contact, email, city…" value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Select value={assignForm.vendorId} onValueChange={(v) => setAssignForm({ ...assignForm, vendorId: v })}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {(filteredVendors.data ?? workspaceVendors.data)?.map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.businessName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Agreed amount (optional)</Label>
              <MoneyInput value={agreed} onChange={setAgreed} currency={currency} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={assignForm.status} onValueChange={(v) => setAssignForm({ ...assignForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{VENDOR_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={assign.isPending || !assignForm.vendorId}>Assign</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={summaryFor != null} onOpenChange={(o) => !o && setSummaryFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{summary.data?.businessName ?? "Vendor"}</DialogTitle></DialogHeader>
          {!summary.data ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Quoted</p>
                  <MoneyText minor={summary.data.summary.quoted} currency={currency} className="font-medium" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Agreed</p>
                  <MoneyText minor={summary.data.summary.agreed} currency={currency} className="font-medium" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid (net)</p>
                  <MoneyText minor={summary.data.summary.paid} currency={currency} className="font-medium" />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Linked events ({summary.data.summary.events})</p>
                <ul className="space-y-1">
                  {summary.data.links.map((l) => (
                    <li key={l.id} className="flex items-center justify-between rounded border px-2 py-1">
                      <span>{l.event.name}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {l.rating != null && <span title="Internal rating — not publicly visible">★ {l.rating}/5</span>}
                        {l.agreedAmount != null && <MoneyText minor={l.agreedAmount} currency={currency} />}
                        <StatusBadge status={l.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">Internal ratings are never publicly visible.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
