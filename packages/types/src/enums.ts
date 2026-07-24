// Shared enums used by both apps/api and apps/web.

export const EVENT_TYPES = [
  "wedding",
  "birthday",
  "child_dedication",
  "funeral",
  "conference",
  "corporate",
  "church",
  "association",
  "ngo",
  "cultural",
  "community",
  "private_party",
  "other",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = [
  "draft",
  "planning",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const WORKSPACE_ROLES = ["owner", "admin", "planner", "viewer"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const EXPENSE_STATUSES = [
  "draft",
  "unpaid",
  "partially_paid",
  "paid",
  "overpaid",
  "refunded",
  "cancelled",
  "disputed",
] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const PAYMENT_TYPES = ["payment", "refund"] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "debit_card",
  "credit_card",
  "paypal",
  "mobile_payment",
  "cheque",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const VENDOR_STATUSES = [
  "potential",
  "contacted",
  "quotation_requested",
  "quotation_received",
  "shortlisted",
  "selected",
  "contracted",
  "deposit_paid",
  "fully_paid",
  "service_completed",
  "cancelled",
] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const INVITATION_STATUSES = [
  "not_invited",
  "prepared",
  "invited",
  "delivered",
  "failed",
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const RSVP_STATUSES = ["pending", "accepted", "declined", "maybe", "no_response"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const ATTENDANCE_STATUSES = ["expected", "checked_in", "absent", "cancelled"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const DOCUMENT_CATEGORIES = [
  "quotation",
  "contract",
  "invoice",
  "receipt",
  "payment_proof",
  "venue",
  "image",
  "permit",
  "insurance",
  "guest_list",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const TIMELINE_TYPES = [
  "task",
  "vendor_meeting",
  "payment_deadline",
  "milestone",
  "guest_deadline",
  "rehearsal",
  "delivery",
  "setup",
  "event_start",
  "event_end",
  "cleanup",
  "custom",
] as const;
export type TimelineType = (typeof TIMELINE_TYPES)[number];

export const REPORT_TYPES = ["budget", "expense", "payment", "vendor", "guest", "task"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const DEFAULT_BUDGET_CATEGORIES = [
  "Venue",
  "Catering",
  "Decoration",
  "Clothing",
  "Transportation",
  "Entertainment",
  "Photography",
  "Videography",
  "Printing",
  "Security",
  "Accommodation",
  "Gifts",
  "Equipment",
  "Staffing",
  "Insurance",
  "Permits",
  "Miscellaneous",
] as const;

export const CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "GHS",
  "NGN",
  "KES",
  "ZAR",
  "CHF",
  "CAD",
  "AUD",
] as const;

export function labelize(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const NOTIFICATION_TYPES = [
  "event_approaching",
  "event_starts_today",
  "task_due_soon",
  "task_overdue",
  "critical_task_overdue",
  "payment_due_soon",
  "payment_overdue",
  "budget_threshold",
  "budget_exceeded",
  "vendor_contract_deadline",
  "missing_event_info",
  "workspace_invitation",
  "event_assignment",
  "file_processing_failure",
  "report_ready",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
