"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogHeader,
  DialogTitle, Input, Label, Progress, Select, SelectContent, SelectItem, SelectTrigger,
  SelectValue, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@mep/ui";
import { TASK_PRIORITIES, labelize } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import { useEvent } from "@/lib/hooks";
import type { BudgetCategory } from "@/lib/types";
import { MoneyInput, MoneyText } from "@/components/money";

interface BudgetView {
  categories: BudgetCategory[];
  uncategorized: { actual: number; paid: number };
}

export default function BudgetPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const event = useEvent(eventId);
  const queryClient = useQueryClient();
  const budget = useQuery({
    queryKey: ["budget", eventId],
    queryFn: () => api.get<BudgetView>(`/events/${eventId}/budget`),
  });

  const [itemDialog, setItemDialog] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", priority: "medium" });
  const [amount, setAmount] = useState(0);
  const [newCategory, setNewCategory] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["budget", eventId] });
  const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Action failed");

  const addCategory = useMutation({
    mutationFn: () => api.post(`/events/${eventId}/budget/categories`, { name: newCategory }),
    onSuccess: () => { setNewCategory(""); invalidate(); },
    onError,
  });
  const addItem = useMutation({
    mutationFn: () =>
      api.post(`/events/${eventId}/budget/items`, {
        categoryId: itemDialog,
        name: form.name,
        plannedAmount: amount,
        priority: form.priority,
      }),
    onSuccess: () => { setItemDialog(null); setForm({ name: "", priority: "medium" }); setAmount(0); invalidate(); },
    onError,
  });
  const deleteItem = useMutation({
    mutationFn: (itemId: number) => api.delete(`/events/${eventId}/budget/items/${itemId}`),
    onSuccess: invalidate,
    onError,
  });

  if (budget.isPending || !budget.data || !event.data) return <Skeleton className="h-96" />;
  const currency = event.data.currency;
  const totals = budget.data.categories.reduce(
    (acc, c) => ({ planned: acc.planned + c.planned, actual: acc.actual + c.actual, paid: acc.paid + c.paid }),
    { planned: 0, actual: 0, paid: 0 },
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span>Planned <MoneyText minor={totals.planned} currency={currency} className="font-medium" /> ·
              Actual <MoneyText minor={totals.actual} currency={currency} className="font-medium" /> ·
              Budget <MoneyText minor={event.data.budgetAmount} currency={currency} className="font-medium" /></span>
          </div>
          <Progress value={event.data.budgetAmount > 0 ? Math.min(100, (totals.actual / event.data.budgetAmount) * 100) : 0} />
          {totals.actual > event.data.budgetAmount && event.data.budgetAmount > 0 && (
            <p className="text-sm font-medium text-destructive">Over budget by <MoneyText minor={totals.actual - event.data.budgetAmount} currency={currency} /></p>
          )}
        </CardContent>
      </Card>

      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); if (newCategory.trim()) addCategory.mutate(); }}
      >
        <Input placeholder="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="max-w-xs" />
        <Button type="submit" variant="outline"><Plus className="mr-2 h-4 w-4" /> Category</Button>
      </form>

      {budget.data.categories.map((category) => (
        <Card key={category.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{category.name}</CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Planned <MoneyText minor={category.planned} currency={currency} /></span>
              <span>Actual <MoneyText minor={category.actual} currency={currency} className={category.actual > category.planned && category.planned > 0 ? "text-destructive" : ""} /></span>
              {category.utilisationPercent != null && (
                <span className={category.utilisationPercent > 100 ? "font-medium text-destructive" : ""}>
                  {category.utilisationPercent}% used
                </span>
              )}
              <Button size="sm" variant="outline" onClick={() => setItemDialog(category.id)}><Plus className="mr-1 h-3 w-3" /> Item</Button>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {category.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No budget items yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Planned</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead className="text-right">Used</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {category.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="text-muted-foreground">{labelize(item.priority)}</TableCell>
                      <TableCell className="text-right"><MoneyText minor={item.plannedAmount} currency={currency} /></TableCell>
                      <TableCell className="text-right"><MoneyText minor={item.actual ?? 0} currency={currency} /></TableCell>
                      <TableCell className={`text-right ${(item.variance ?? 0) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                        {(item.variance ?? 0) < 0 ? "−" : "+"}
                        <MoneyText minor={Math.abs(item.variance ?? 0)} currency={currency} />
                      </TableCell>
                      <TableCell className={`text-right ${(item.utilisationPercent ?? 0) > 100 ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                        {item.utilisationPercent != null ? `${item.utilisationPercent}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" aria-label={`Delete budget item ${item.name}`} onClick={() => deleteItem.mutate(item.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={itemDialog !== null} onOpenChange={(open) => !open && setItemDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add budget item</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); addItem.mutate(); }}>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Planned amount</Label>
              <MoneyInput value={amount} onChange={setAmount} currency={currency} />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p}>{labelize(p)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={addItem.isPending}>Add item</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
