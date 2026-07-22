import { Badge } from "@mep/ui";
import { labelize } from "@mep/types";

const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default",
  completed: "default",
  accepted: "default",
  checked_in: "default",
  unpaid: "destructive",
  overdue: "destructive",
  declined: "destructive",
  cancelled: "destructive",
  disputed: "destructive",
  overpaid: "destructive",
  partially_paid: "secondary",
  in_progress: "secondary",
  pending: "secondary",
  maybe: "secondary",
  draft: "outline",
  not_started: "outline",
  not_invited: "outline",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={TONE[status] ?? "outline"}>{labelize(status)}</Badge>;
}
