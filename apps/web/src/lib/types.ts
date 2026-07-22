/** API payload types (mirror NestJS responses; ids are numbers after serialization). */

export interface Profile {
  id: number;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  timezone: string;
  dateFormat: string;
  currency: string;
  weekStart: number;
}

export interface Workspace {
  id: number;
  name: string;
  currency: string;
  timezone: string;
  ownerId: number;
  members?: { role: "owner" | "admin" | "planner" | "viewer" }[];
  _count?: { events: number };
}

export interface EventSummary {
  id: number;
  workspaceId: number;
  name: string;
  type: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  currency: string;
  budgetAmount: number;
  expectedGuests: number | null;
  venueName: string | null;
  city: string | null;
  _count?: { expenses: number; guests: number; tasks: number };
  totals?: { actual: number; paid: number };
}

export interface Expense {
  id: number;
  eventId: number;
  title: string;
  description: string | null;
  categoryId: number | null;
  budgetItemId: number | null;
  vendorId: number | null;
  expenseDate: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  grossOnly: boolean;
  currency: string;
  dueDate: string | null;
  status: string;
  invoiceNumber: string | null;
  notes: string | null;
  version: number;
  paid?: number;
  refunded?: number;
  outstanding?: number;
  payments?: Payment[];
}

export interface Payment {
  id: number;
  expenseId: number;
  eventId: number;
  type: "payment" | "refund";
  refundOfPaymentId: number | null;
  amount: number;
  currency: string;
  paidAt: string;
  method: string;
  reference: string | null;
  recipient: string | null;
  notes: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
  expense?: { id: number; title: string };
}

export interface BudgetCategory {
  id: number;
  eventId: number;
  name: string;
  sortOrder: number;
  items: BudgetItem[];
  planned: number;
  actual: number;
  paid: number;
  remaining: number;
  variance?: number;
  utilisationPercent?: number | null;
}

export interface BudgetItem {
  id: number;
  categoryId: number;
  name: string;
  plannedAmount: number;
  priority: string;
  dueDate: string | null;
  notes: string | null;
  actual?: number;
  paid?: number;
  variance?: number;
  utilisationPercent?: number | null;
}

export interface Guest {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  groupId: number | null;
  household: string | null;
  accompanyingCount: number;
  invitationStatus: string;
  rsvpStatus: string;
  attendanceStatus: string;
  tableName: string | null;
  dietary: string | null;
  allergies: string | null;
  notes: string | null;
  group?: { id: number; name: string } | null;
}

export interface GuestGroup {
  id: number;
  name: string;
}

export interface Vendor {
  id: number;
  businessName: string;
  contactPerson: string | null;
  serviceCategory: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
}

export interface EventVendor {
  id: number;
  vendorId: number;
  status: string;
  quotedAmount: number | null;
  agreedAmount: number | null;
  paid: number;
  serviceDescription: string | null;
  paymentDueDate: string | null;
  vendor: Vendor;
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  category: string | null;
  priority: string;
  status: string;
  startAt: string | null;
  dueAt: string | null;
  completedAt: string | null;
  dependencyIds: number[];
  blockedBy: { id: number; title: string }[];
  overdue: boolean;
}

export interface TimelineEntry {
  /** Manual entries: numeric id. Auto items: stable source key like "task:5". */
  id: number | string;
  title: string;
  type: string;
  startAt: string;
  endAt: string | null;
  notes: string | null;
  source: "manual" | "auto";
  meta?: Record<string, string | number | boolean | null> | null;
}

export interface DocumentItem {
  id: number;
  originalName: string;
  category: string;
  mimeType: string;
  sizeBytes: number;
  description: string | null;
  expenseId: number | null;
  paymentId: number | null;
  linkedType: string | null;
  linkedId: number | null;
  createdAt: string;
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPrefs {
  types: Record<string, boolean>;
  email: boolean;
}

export interface DashboardData {
  events: { total: number; upcoming: EventSummary[] };
  finances: { budget: number; actual: number; paid: number };
  tasks: { open: number; upcoming: { id: number; title: string; dueAt: string; eventId: number; priority: string }[] };
  guests: { total: number };
  alerts: { overdueExpenses: number };
}
