"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, RotateCcw, Trash2 } from "lucide-react";
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
import { EXPENSE_STATUSES, PAYMENT_METHODS, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import { useEvent } from "@/lib/hooks";
import type { BudgetCategory, BudgetItem, Expense } from "@/lib/types";
import { formatDate } from "@/lib/money";
import { MoneyInput, MoneyText } from "@/components/money";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";

const SORTS = [
  { value: "-expenseDate", label: "Newest first" },
  { value: "expenseDate", label: "Oldest first" },
  { value: "-totalAmount", label: "Highest total" },
  { value: "totalAmount", label: "Lowest total" },
  { value: "title", label: "Title A–Z" },
  { value: "dueDate", label: "Due date" },
];

export default function ExpensesPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const event = useEvent(eventId);
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("-expenseDate");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set("q", debouncedQ);
    if (status !== "all") p.set("status", status);
    if (categoryFilter !== "all") p.set("categoryId", categoryFilter);
    if (sort) p.set("sort", sort);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [debouncedQ, status, categoryFilter, sort]);

  const expenses = useQuery({
    queryKey: ["expenses", eventId, queryString],
    queryFn: () => api.get<Expense[]>(`/events/${eventId}/expenses${queryString}`),
  });
  const budget = useQuery({
    queryKey: ["budget", eventId],
    queryFn: () => api.get<{ categories: BudgetCategory[] }>(`/events/${eventId}/budget`),
  });

  const [open, setOpen] = useState(false);
  const [payFor, setPayFor] = useState<Expense | null>(null);
  const [form, setForm] = useState({
    title: "",
    categoryId: "",
    budgetItemId: "",
    expenseDate: "",
    dueDate: "",
    invoiceNumber: "",
  });
  const [grossOnly, setGrossOnly] = useState(false);
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [grossTotal, setGrossTotal] = useState(0);
  const [pay, setPay] = useState({
    amount: 0,
    method: "bank_transfer",
    paidAt: "",
    reference: "",
    confirm: false,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["expenses", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    queryClient.invalidateQueries({ queryKey: ["budget", eventId] });
  };
  const onError = (err: unknown) =>
    toast.error(err instanceof ApiError ? err.message : "Action failed");

  const create = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/expenses`, {
        title: form.title,
        categoryId: form.categoryId ? Number(form.categoryId) : null,
        budgetItemId: form.budgetItemId ? Number(form.budgetItemId) : null,
        expenseDate: form.expenseDate
          ? new Date(form.expenseDate).toISOString()
          : new Date().toISOString(),
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        invoiceNumber: form.invoiceNumber || null,
        grossOnly,
        subtotal: grossOnly ? 0 : subtotal,
        taxAmount: grossOnly ? 0 : tax,
        totalAmount: grossOnly ? grossTotal : subtotal + tax,
      }),
    onSuccess: () => {
      toast.success("Expense added");
      setOpen(false);
      setForm({
        title: "",
        categoryId: "",
        budgetItemId: "",
        expenseDate: "",
        dueDate: "",
        invoiceNumber: "",
      });
      setGrossOnly(false);
      setSubtotal(0);
      setTax(0);
      setGrossTotal(0);
      invalidate();
    },
    onError,
  });

  const addPayment = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/expenses/${payFor!.id}/payments`, {
        amount: pay.amount,
        method: pay.method,
        paidAt: pay.paidAt ? new Date(pay.paidAt).toISOString() : new Date().toISOString(),
        reference: pay.reference || null,
        confirmOverpayment: pay.confirm,
        idempotencyKey: `ui-${Date.now()}-${payFor!.id}`,
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      setPayFor(null);
      setPay({ amount: 0, method: "bank_transfer", paidAt: "", reference: "", confirm: false });
      invalidate();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(
          "Amount exceeds the outstanding balance — tick 'confirm overpayment' to record it anyway.",
        );
      } else onError(err);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      api.delete<{ cancelled: boolean }>(`/events/${eventId}/expenses/${id}`),
    onSuccess: (res) => {
      toast.success(
        res.cancelled
          ? "Expense has payments — it was cancelled, history preserved"
          : "Expense deleted",
      );
      invalidate();
    },
    onError,
  });

  const restore = useMutation({
    mutationFn: (id: number) => api.post(`/events/${eventId}/expenses/${id}/restore`, {}),
    onSuccess: () => {
      toast.success("Expense restored");
      invalidate();
    },
    onError,
  });

  const categories = useMemo(() => budget.data?.categories ?? [], [budget.data]);
  const allItems = useMemo(
    () => categories.flatMap((c) => c.items.map((i) => ({ ...i, categoryName: c.name }))),
    [categories],
  );
  const formItems: (BudgetItem & { categoryName?: string })[] = useMemo(
    () =>
      form.categoryId ? allItems.filter((i) => String(i.categoryId) === form.categoryId) : allItems,
    [allItems, form.categoryId],
  );

  if (expenses.isPending || !expenses.data || !event.data) return <Skeleton className="h-96" />;
  const currency = event.data.currency;
  const totalActual = expenses.data
    .filter((e) => e.status !== "cancelled")
    .reduce((s, e) => s + e.totalAmount, 0);
  const anyRefunds = expenses.data.some((e) => (e.refunded ?? 0) > 0);

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={
          <>
            Total actual:{" "}
            <MoneyText minor={totalActual} currency={currency} className="font-medium" />
          </>
        }
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() =>
                api.download(`/events/${eventId}/expenses/export${queryString}`, "expenses.csv")
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add expense
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="w-56"
          placeholder="Search title, invoice no…"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          aria-label="Search expenses"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EXPENSE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {labelize(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-40" aria-label="Sort expenses">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: full table. Mobile: per-expense cards (H7). */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              {anyRefunds && <TableHead className="text-right">Refunded</TableHead>}
              <TableHead className="text-right">Outstanding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.data.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={anyRefunds ? 10 : 9}
                  className="py-8 text-center text-muted-foreground"
                >
                  No expenses match.
                </TableCell>
              </TableRow>
            )}
            {expenses.data.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">
                  {e.title}
                  {e.grossOnly && (
                    <span className="ml-2 text-xs text-muted-foreground">(gross)</span>
                  )}
                </TableCell>
                <TableCell>{formatDate(e.expenseDate)}</TableCell>
                <TableCell className="text-right">
                  <MoneyText minor={e.subtotal} currency={currency} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyText minor={e.taxAmount} currency={currency} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyText minor={e.totalAmount} currency={currency} />
                </TableCell>
                <TableCell className="text-right">
                  <MoneyText minor={e.paid ?? 0} currency={currency} />
                </TableCell>
                {anyRefunds && (
                  <TableCell className="text-right text-destructive">
                    {(e.refunded ?? 0) > 0 ? (
                      <MoneyText minor={e.refunded!} currency={currency} />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <MoneyText minor={e.outstanding ?? 0} currency={currency} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={e.status} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {e.status === "cancelled" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restore.mutate(e.id)}
                        disabled={restore.isPending}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Restore
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setPayFor(e)}>
                        Pay
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete expense ${e.title}`}
                      onClick={() => {
                        if (
                          confirm(
                            "Delete this expense? Expenses with payments are cancelled instead.",
                          )
                        )
                          remove.mutate(e.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards: one card per expense with the key figures. */}
      <div className="space-y-3 md:hidden">
        {expenses.data.length === 0 && (
          <p className="rounded-lg border py-8 text-center text-sm text-muted-foreground">
            No expenses match.
          </p>
        )}
        {expenses.data.map((e) => (
          <div key={e.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {e.title}
                  {e.grossOnly && (
                    <span className="ml-2 text-xs text-muted-foreground">(gross)</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(e.expenseDate)}</p>
              </div>
              <StatusBadge status={e.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-right font-medium">
                <MoneyText minor={e.totalAmount} currency={currency} />
              </dd>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="text-right">
                <MoneyText minor={e.paid ?? 0} currency={currency} />
              </dd>
              {(e.refunded ?? 0) > 0 && (
                <>
                  <dt className="text-muted-foreground">Refunded</dt>
                  <dd className="text-right text-destructive">
                    <MoneyText minor={e.refunded!} currency={currency} />
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Outstanding</dt>
              <dd className="text-right">
                <MoneyText minor={e.outstanding ?? 0} currency={currency} />
              </dd>
            </dl>
            <div className="mt-3 flex gap-2">
              {e.status === "cancelled" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => restore.mutate(e.id)}
                  disabled={restore.isPending}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Restore
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setPayFor(e)}>
                  Pay
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Delete expense ${e.title}`}
                onClick={() => {
                  if (confirm("Delete this expense? Expenses with payments are cancelled instead."))
                    remove.mutate(e.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add expense</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input
                required
                value={form.title}
                onChange={(ev) => setForm({ ...form, title: ev.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) =>
                    setForm({ ...form, categoryId: v === "none" ? "" : v, budgetItemId: "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Budget item</Label>
                <Select
                  value={form.budgetItemId}
                  onValueChange={(v) => setForm({ ...form, budgetItemId: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {formItems.map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Invoice no.</Label>
                <Input
                  value={form.invoiceNumber}
                  onChange={(ev) => setForm({ ...form, invoiceNumber: ev.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Expense date</Label>
                <Input
                  type="date"
                  value={form.expenseDate}
                  onChange={(ev) => setForm({ ...form, expenseDate: ev.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(ev) => setForm({ ...form, dueDate: ev.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={grossOnly}
                onChange={(ev) => setGrossOnly(ev.target.checked)}
              />
              Gross amount only (no subtotal/tax split)
            </label>
            {grossOnly ? (
              <div className="space-y-1.5">
                <Label>Total amount</Label>
                <MoneyInput value={grossTotal} onChange={setGrossTotal} currency={currency} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Subtotal</Label>
                    <MoneyInput value={subtotal} onChange={setSubtotal} currency={currency} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Tax</Label>
                    <MoneyInput value={tax} onChange={setTax} currency={currency} />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Total:{" "}
                  <MoneyText minor={subtotal + tax} currency={currency} className="font-medium" />
                </p>
              </>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={create.isPending || (grossOnly && grossTotal <= 0)}
            >
              Add expense
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={payFor !== null} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment — {payFor?.title}</DialogTitle>
          </DialogHeader>
          {payFor && (
            <form
              className="space-y-4"
              onSubmit={(ev) => {
                ev.preventDefault();
                addPayment.mutate();
              }}
            >
              <p className="text-sm text-muted-foreground">
                Outstanding:{" "}
                <MoneyText
                  minor={payFor.outstanding ?? 0}
                  currency={currency}
                  className="font-medium"
                />
              </p>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <MoneyInput
                  value={pay.amount}
                  onChange={(v) => setPay({ ...pay, amount: v })}
                  currency={currency}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {labelize(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Paid at</Label>
                  <Input
                    type="date"
                    value={pay.paidAt}
                    onChange={(ev) => setPay({ ...pay, paidAt: ev.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input
                  value={pay.reference}
                  onChange={(ev) => setPay({ ...pay, reference: ev.target.value })}
                />
              </div>
              {payFor.outstanding !== undefined && pay.amount > payFor.outstanding && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={pay.confirm}
                    onChange={(ev) => setPay({ ...pay, confirm: ev.target.checked })}
                  />
                  Confirm overpayment (exceeds the outstanding amount)
                </label>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={addPayment.isPending || pay.amount <= 0}
              >
                Record payment
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
