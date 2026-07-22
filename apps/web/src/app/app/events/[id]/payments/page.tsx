"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, Input, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea,
} from "@mep/ui";
import { PAYMENT_METHODS, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import { useEvent } from "@/lib/hooks";
import type { Payment } from "@/lib/types";
import { formatDate } from "@/lib/money";
import { MoneyInput, MoneyText } from "@/components/money";
import { PageHeader } from "@/components/page-header";

export default function PaymentsPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const event = useEvent(eventId);
  const queryClient = useQueryClient();
  const payments = useQuery({
    queryKey: ["payments", eventId],
    queryFn: () => api.get<Payment[]>(`/events/${eventId}/payments`),
  });
  const [reversing, setReversing] = useState<Payment | null>(null);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState<Payment | null>(null);
  const [refund, setRefund] = useState({ amount: 0, method: "bank_transfer", paidAt: "", reference: "" });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["payments", eventId] });
    queryClient.invalidateQueries({ queryKey: ["expenses", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event", eventId] });
  };

  const reverse = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/payments/${reversing!.id}/reverse`, { reason }),
    onSuccess: () => {
      toast.success("Payment reversed — history preserved");
      setReversing(null);
      setReason("");
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Reversal failed"),
  });

  const refundMutation = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/payments/${refunding!.id}/refund`, {
        amount: refund.amount,
        method: refund.method,
        paidAt: refund.paidAt ? new Date(refund.paidAt).toISOString() : new Date().toISOString(),
        reference: refund.reference || null,
        idempotencyKey: `ui-refund-${Date.now()}-${refunding!.id}`,
      }),
    onSuccess: () => {
      toast.success("Refund recorded");
      setRefunding(null);
      setRefund({ amount: 0, method: "bank_transfer", paidAt: "", reference: "" });
      invalidate();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Refund failed"),
  });

  if (payments.isPending || !payments.data || !event.data) return <Skeleton className="h-96" />;
  const currency = event.data.currency;
  const active = payments.data.filter((p) => !p.reversedAt);
  const netTotal = active.reduce((s, p) => (p.type === "refund" ? s - p.amount : s + p.amount), 0);
  const refundedTotal = active.filter((p) => p.type === "refund").reduce((s, p) => s + p.amount, 0);

  /** How much of a payment can still be refunded. */
  const refundableFor = (payment: Payment) =>
    payment.amount -
    active
      .filter((r) => r.type === "refund" && r.refundOfPaymentId === payment.id)
      .reduce((s, r) => s + r.amount, 0);

  return (
    <div>
      <PageHeader
        title="Payments"
        description={
          <>
            Net paid: <MoneyText minor={netTotal} currency={currency} className="font-medium" />
            {refundedTotal > 0 && (
              <> · Refunded: <MoneyText minor={refundedTotal} currency={currency} className="font-medium text-destructive" /></>
            )}
          </>
        }
      />
      {/* Desktop: full table. Mobile: per-payment cards (H7). */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expense</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Paid at</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.data.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No payments recorded yet.</TableCell></TableRow>
            )}
            {payments.data.map((p) => (
              <TableRow key={p.id} className={p.reversedAt ? "opacity-60" : ""}>
                <TableCell className="font-medium">{p.expense?.title ?? `#${p.expenseId}`}</TableCell>
                <TableCell>
                  {p.type === "refund" ? (
                    <Badge variant="outline" className="text-destructive">Refund</Badge>
                  ) : (
                    <Badge variant="outline">Payment</Badge>
                  )}
                </TableCell>
                <TableCell>{formatDate(p.paidAt)}</TableCell>
                <TableCell>{labelize(p.method)}</TableCell>
                <TableCell className="text-muted-foreground">{p.reference ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {p.type === "refund" ? (
                    <span className="text-destructive">−<MoneyText minor={p.amount} currency={currency} /></span>
                  ) : (
                    <MoneyText minor={p.amount} currency={currency} />
                  )}
                </TableCell>
                <TableCell>
                  {p.reversedAt ? (
                    <Badge variant="destructive" title={p.reversalReason ?? ""}>Reversed</Badge>
                  ) : (
                    <Badge variant="secondary">Active</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {!p.reversedAt && (
                    <div className="flex gap-1">
                      {p.type === "payment" && refundableFor(p) > 0 && (
                        <Button size="sm" variant="outline" onClick={() => { setRefunding(p); setRefund({ ...refund, amount: refundableFor(p) }); }}>
                          Refund
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" title="Reverse record" aria-label={`Reverse ${p.type} of ${p.amount} for ${p.expense?.title ?? "expense"}`} onClick={() => setReversing(p)}>
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards: one card per payment with the key figures. */}
      <div className="space-y-3 md:hidden">
        {payments.data.length === 0 && (
          <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        )}
        {payments.data.map((p) => (
          <div key={p.id} className={`rounded-lg border p-4 ${p.reversedAt ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.expense?.title ?? `#${p.expenseId}`}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(p.paidAt)} · {labelize(p.method)}
                  {p.reference ? ` · ${p.reference}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {p.type === "refund" ? (
                  <Badge variant="outline" className="text-destructive">Refund</Badge>
                ) : (
                  <Badge variant="outline">Payment</Badge>
                )}
                {p.reversedAt && <Badge variant="destructive" title={p.reversalReason ?? ""}>Reversed</Badge>}
              </div>
            </div>
            <p className="mt-2 text-right text-lg font-semibold">
              {p.type === "refund" ? (
                <span className="text-destructive">−<MoneyText minor={p.amount} currency={currency} /></span>
              ) : (
                <MoneyText minor={p.amount} currency={currency} />
              )}
            </p>
            {!p.reversedAt && (
              <div className="mt-2 flex gap-2">
                {p.type === "payment" && refundableFor(p) > 0 && (
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setRefunding(p); setRefund({ ...refund, amount: refundableFor(p) }); }}>
                    Refund
                  </Button>
                )}
                <Button size="icon" variant="ghost" title="Reverse record" aria-label={`Reverse ${p.type} of ${p.amount} for ${p.expense?.title ?? "expense"}`} onClick={() => setReversing(p)}>
                  <Undo2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <AlertDialog open={reversing !== null} onOpenChange={(o) => !o && setReversing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this {reversing?.type ?? "payment"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The record of <MoneyText minor={reversing?.amount ?? 0} currency={currency} /> will be marked as
              reversed. The record stays in the history — nothing is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea placeholder="Reason for the reversal (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!reason.trim() || reverse.isPending} onClick={() => reverse.mutate()}>
              Reverse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={refunding !== null} onOpenChange={(o) => !o && setRefunding(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Refund payment — {refunding?.expense?.title}</DialogTitle></DialogHeader>
          {refunding && (
            <form className="space-y-4" onSubmit={(ev) => { ev.preventDefault(); refundMutation.mutate(); }}>
              <p className="text-sm text-muted-foreground">
                Refundable remainder: <MoneyText minor={refundableFor(refunding)} currency={currency} className="font-medium" />
              </p>
              <div className="space-y-1.5">
                <Label>Refund amount</Label>
                <MoneyInput value={refund.amount} onChange={(v) => setRefund({ ...refund, amount: v })} currency={currency} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={refund.method} onValueChange={(v) => setRefund({ ...refund, method: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{labelize(m)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={refund.paidAt} onChange={(ev) => setRefund({ ...refund, paidAt: ev.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={refund.reference} onChange={(ev) => setRefund({ ...refund, reference: ev.target.value })} />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={refundMutation.isPending || refund.amount <= 0 || refund.amount > refundableFor(refunding)}
              >
                Record refund
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
