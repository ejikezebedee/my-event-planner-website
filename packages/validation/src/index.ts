// Shared Zod schemas — used by the NestJS API (DTO validation pipes) and
// optionally by the web client for client-side validation.
import { z } from "zod";
import {
  ATTENDANCE_STATUSES,
  EVENT_TYPES,
  INVITATION_STATUSES,
  PAYMENT_METHODS,
  RSVP_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TIMELINE_TYPES,
  VENDOR_STATUSES,
} from "@mep/types";

export const emailSchema = z.string().trim().toLowerCase().email().max(320);
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);
/** Integer minor units — money is never a float. */
export const moneySchema = z.number().int().min(0);
export const idSchema = z.number().int().positive();

// Auth
export const registerSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: emailSchema,
  password: passwordSchema,
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
});
export const loginSchema = z.object({ email: emailSchema, password: z.string().max(128) });
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  timezone: z.string().max(64).optional(),
  dateFormat: z.string().max(16).optional(),
  currency: z.string().length(3).optional(),
  weekStart: z.number().int().min(0).max(6).optional(),
});
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(128),
  newPassword: passwordSchema,
});
export const requestPasswordResetSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: passwordSchema,
});
// Email change requires the current password + verification of the NEW address.
export const changeEmailSchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(1).max(128),
});
export const confirmEmailChangeSchema = z.object({ token: z.string().min(16) });
// Account deletion requires the password and an explicit typed confirmation.
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal("DELETE"),
});

// Events
export const eventObjectSchema = z
  .object({
    workspaceId: idSchema.optional(),
    name: z.string().trim().min(1).max(255),
    type: z.enum(EVENT_TYPES).default("other"),
    description: z.string().max(5000).nullish(),
    startAt: z.coerce.date().nullish(),
    endAt: z.coerce.date().nullish(),
    timezone: z.string().max(64).optional(),
    venueName: z.string().max(255).nullish(),
    street: z.string().max(255).nullish(),
    city: z.string().max(128).nullish(),
    state: z.string().max(128).nullish(),
    postalCode: z.string().max(32).nullish(),
    country: z.string().max(128).nullish(),
    expectedGuests: z.number().int().min(0).nullish(),
    currency: z.string().length(3).default("EUR"),
    budgetAmount: moneySchema.default(0),
    notes: z.string().max(5000).nullish(),
    status: z
      .enum(["draft", "planning", "confirmed", "in_progress", "completed", "cancelled"])
      .default("draft"),
  })
;
export const eventUpsertSchema = eventObjectSchema.refine(
  (v) => !(v.startAt && v.endAt && v.endAt < v.startAt),
  {
    message: "The end time must not be before the start time.",
    path: ["endAt"],
  },
);

// Budget
export const budgetItemSchema = z.object({
  categoryId: idSchema,
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2000).nullish(),
  plannedAmount: moneySchema,
  vendorId: idSchema.nullish(),
  dueDate: z.coerce.date().nullish(),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  notes: z.string().max(2000).nullish(),
});

// Expenses & payments
export const expenseUpsertSchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    description: z.string().max(5000).nullish(),
    categoryId: idSchema.nullish(),
    budgetItemId: idSchema.nullish(),
    vendorId: idSchema.nullish(),
    expenseDate: z.coerce.date(),
    serviceDate: z.coerce.date().nullish(),
    subtotal: moneySchema,
    taxAmount: moneySchema.default(0),
    totalAmount: moneySchema,
    grossOnly: z.boolean().default(false),
    dueDate: z.coerce.date().nullish(),
    paymentMethodSummary: z.string().max(128).nullish(),
    invoiceNumber: z.string().max(128).nullish(),
    referenceNumber: z.string().max(128).nullish(),
    notes: z.string().max(5000).nullish(),
    version: z.number().int().optional(),
  })
  .refine((v) => v.grossOnly || v.totalAmount === v.subtotal + v.taxAmount, {
    message: "The total must equal the subtotal plus tax.",
    path: ["totalAmount"],
  });

export const createPaymentSchema = z.object({
  amount: z.number().int().positive("Payment amount must be greater than zero"),
  paidAt: z.coerce.date(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(128).nullish(),
  recipient: z.string().max(255).nullish(),
  notes: z.string().max(2000).nullish(),
  confirmOverpayment: z.boolean().default(false),
  idempotencyKey: z.string().max(64).optional(),
});

// A refund returns money against a specific payment. The refund amount may
// never exceed what remains refundable on that payment (amount minus active
// refunds already recorded against it).
export const createRefundSchema = z.object({
  amount: z.number().int().positive("Refund amount must be greater than zero"),
  paidAt: z.coerce.date(),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().max(128).nullish(),
  recipient: z.string().max(255).nullish(),
  notes: z.string().max(2000).nullish(),
  idempotencyKey: z.string().max(64).optional(),
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

// Vendors
export const vendorUpsertSchema = z.object({
  businessName: z.string().trim().min(1).max(255),
  contactPerson: z.string().max(255).nullish(),
  serviceCategory: z.string().max(128).nullish(),
  phone: z.string().max(64).nullish(),
  email: z.string().max(320).nullish(),
  website: z.string().max(512).nullish(),
  street: z.string().max(255).nullish(),
  city: z.string().max(128).nullish(),
  state: z.string().max(128).nullish(),
  postalCode: z.string().max(32).nullish(),
  country: z.string().max(128).nullish(),
  taxNumber: z.string().max(128).nullish(),
  notes: z.string().max(5000).nullish(),
});

export const eventVendorSchema = z.object({
  vendorId: idSchema,
  serviceDescription: z.string().max(5000).nullish(),
  quotedAmount: moneySchema.nullish(),
  agreedAmount: moneySchema.nullish(),
  depositRequired: moneySchema.nullish(),
  contractDate: z.coerce.date().nullish(),
  serviceDate: z.coerce.date().nullish(),
  paymentDueDate: z.coerce.date().nullish(),
  status: z.enum(VENDOR_STATUSES).default("potential"),
  rating: z.number().int().min(1).max(5).nullish(),
  notes: z.string().max(5000).nullish(),
});

// Guests
export const guestUpsertSchema = z.object({
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  email: z.string().max(320).nullish(),
  phone: z.string().max(64).nullish(),
  groupId: idSchema.nullish(),
  household: z.string().max(255).nullish(),
  accompanyingCount: z.number().int().min(0).max(50).default(0),
  invitationStatus: z.enum(INVITATION_STATUSES).default("not_invited"),
  rsvpStatus: z.enum(RSVP_STATUSES).default("pending"),
  attendanceStatus: z.enum(ATTENDANCE_STATUSES).default("expected"),
  tableName: z.string().max(128).nullish(),
  dietary: z.string().max(2000).nullish(),
  allergies: z.string().max(2000).nullish(),
  accessibility: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
});

export const guestImportSchema = z.object({
  csv: z.string().max(2_000_000),
  /** Validate and preview only — nothing is written. */
  dryRun: z.boolean().default(false),
});

// Tasks
export const taskUpsertSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).nullish(),
  category: z.string().max(128).nullish(),
  assigneeId: idSchema.nullish(),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  startAt: z.coerce.date().nullish(),
  dueAt: z.coerce.date().nullish(),
  status: z.enum(TASK_STATUSES).default("not_started"),
  notes: z.string().max(5000).nullish(),
  dependencyIds: z.array(idSchema).default([]),
});

// Timeline
export const timelineEntrySchema = z.object({
  title: z.string().trim().min(1).max(255),
  type: z.enum(TIMELINE_TYPES).default("custom"),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().nullish(),
  notes: z.string().max(2000).nullish(),
});

// Workspaces
export const workspaceUpsertSchema = z.object({
  name: z.string().trim().min(1).max(255),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(64).optional(),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "planner", "viewer"]),
});

// Ownership transfer: the current owner confirms with their password.
export const transferOwnershipSchema = z.object({
  memberId: idSchema,
  password: z.string().min(1).max(128),
});

// Contact
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: emailSchema,
  subject: z.string().trim().min(1).max(255),
  message: z.string().trim().min(10).max(5000),
  consent: z.boolean().refine((v) => v === true, "Consent is required."),
  // Honeypot: invisible to humans, filled by spam bots. Must stay empty.
  website: z.string().max(255).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type EventUpsertInput = z.infer<typeof eventUpsertSchema>;
export type ExpenseUpsertInput = z.infer<typeof expenseUpsertSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type GuestUpsertInput = z.infer<typeof guestUpsertSchema>;
export type TaskUpsertInput = z.infer<typeof taskUpsertSchema>;
