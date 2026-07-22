/**
 * Development seed: demo workspace with one wedding event and realistic
 * financial data (all money in minor units; actual = 1,250,000 / net paid = 750,000 (760,000 gross − 10,000 refund)).
 * Idempotent: truncates all tables first. NEVER run in production.
 *
 * Demo logins:
 *   demo@eventplanner.dev    / Demo1234!  (workspace owner)
 *   planner@eventplanner.dev / Demo1234!  (event planner)
 *   viewer@eventplanner.dev  / Demo1234!  (event viewer, read-only)
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_BUDGET_CATEGORIES } from "@mep/types";
import { hashPassword } from "../src/common/utils/password";

const prisma = new PrismaClient();

async function truncateAll() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs, notifications, contact_submissions, documents, timeline_entries,
      task_dependencies, tasks, guests, guest_groups, event_vendors, vendors,
      payments, expenses, budget_items, budget_categories, event_members, events,
      workspace_invitations, workspace_members, workspaces,
      email_verification_tokens, email_change_tokens, password_reset_tokens, sessions, users
    RESTART IDENTITY CASCADE
  `);
}

async function main() {
  console.log("Seeding My Event Planner demo data…");
  await truncateAll();

  const passwordHash = await hashPassword("Demo1234!");
  const demo = await prisma.user.create({
    data: { email: "demo@eventplanner.dev", name: "Demo Owner", passwordHash, emailVerifiedAt: new Date() },
  });
  const planner = await prisma.user.create({
    data: { email: "planner@eventplanner.dev", name: "Paula Planner", passwordHash, emailVerifiedAt: new Date() },
  });
  const viewer = await prisma.user.create({
    data: { email: "viewer@eventplanner.dev", name: "Victor Viewer", passwordHash, emailVerifiedAt: new Date() },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Demo Workspace",
      ownerId: demo.id,
      members: {
        create: [
          { userId: demo.id, role: "owner" },
          { userId: planner.id, role: "planner" },
          { userId: viewer.id, role: "viewer" },
        ],
      },
    },
  });

  const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  const agoDays = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const event = await prisma.event.create({
    data: {
      workspaceId: workspace.id,
      name: "Anna & Ben's Wedding",
      type: "wedding",
      description: "Summer wedding with 80 guests.",
      startAt: inDays(120),
      endAt: inDays(121),
      venueName: "Lakeside Manor",
      city: "Berlin",
      country: "Germany",
      expectedGuests: 80,
      currency: "EUR",
      budgetAmount: 1_500_000, // €15,000.00
      status: "planning",
      ownerId: demo.id,
      createdById: demo.id,
      members: {
        create: [
          { userId: demo.id, role: "planner" },
          { userId: planner.id, role: "planner" },
          { userId: viewer.id, role: "viewer" },
        ],
      },
      budgetCategories: {
        create: DEFAULT_BUDGET_CATEGORIES.map((name, i) => ({ name, sortOrder: i })),
      },
    },
    include: { budgetCategories: true },
  });

  const cat = (name: string) => event.budgetCategories.find((c) => c.name === name)!;

  // Budget items (planned, minor units)
  const budgetItems = await prisma.$transaction([
    prisma.budgetItem.create({ data: { eventId: event.id, categoryId: cat("Venue").id, name: "Venue rental", plannedAmount: 500_000, priority: "high", createdById: demo.id } }),
    prisma.budgetItem.create({ data: { eventId: event.id, categoryId: cat("Catering").id, name: "Catering 80 guests", plannedAmount: 400_000, priority: "high", createdById: demo.id } }),
    prisma.budgetItem.create({ data: { eventId: event.id, categoryId: cat("Photography").id, name: "Photographer", plannedAmount: 220_000, priority: "medium", createdById: demo.id } }),
    prisma.budgetItem.create({ data: { eventId: event.id, categoryId: cat("Decoration").id, name: "Flowers", plannedAmount: 120_000, priority: "medium", createdById: demo.id } }),
    prisma.budgetItem.create({ data: { eventId: event.id, categoryId: cat("Entertainment").id, name: "Live band", plannedAmount: 60_000, priority: "low", createdById: demo.id } }),
  ]);
  const [venueItem, cateringItem, photoItem, flowersItem, bandItem] = budgetItems as [
    { id: bigint }, { id: bigint }, { id: bigint }, { id: bigint }, { id: bigint },
  ];

  // Vendors
  const [venueVendor, cateringVendor, photoVendor] = await Promise.all([
    prisma.vendor.create({
      data: { workspaceId: workspace.id, businessName: "Lakeside Manor GmbH", serviceCategory: "Venue", email: "events@lakeside.example", city: "Berlin", createdById: demo.id },
    }),
    prisma.vendor.create({
      data: { workspaceId: workspace.id, businessName: "Fine Catering Co.", serviceCategory: "Catering", email: "hello@finecatering.example", createdById: demo.id },
    }),
    prisma.vendor.create({
      data: { workspaceId: workspace.id, businessName: "Moments Photography", serviceCategory: "Photography", contactPerson: "Mia Lens", createdById: demo.id },
    }),
  ]);
  await prisma.eventVendor.createMany({
    data: [
      { eventId: event.id, vendorId: venueVendor.id, agreedAmount: 500_000, status: "contracted", paymentDueDate: inDays(90) },
      { eventId: event.id, vendorId: cateringVendor.id, quotedAmount: 410_000, agreedAmount: 400_000, status: "deposit_paid", paymentDueDate: inDays(60) },
      { eventId: event.id, vendorId: photoVendor.id, quotedAmount: 220_000, status: "quotation_received" },
    ],
  });

  // Expenses (subtotal + 19% tax = total; totals sum to 1,250,000 minor)
  const venue = await prisma.expense.create({
    data: {
      eventId: event.id, title: "Venue rental", categoryId: cat("Venue").id, budgetItemId: venueItem.id, vendorId: venueVendor.id,
      expenseDate: agoDays(30), subtotal: 420_169, taxAmount: 79_831, totalAmount: 500_000,
      dueDate: agoDays(10), status: "paid", invoiceNumber: "LM-2025-041", createdById: demo.id,
    },
  });
  const catering = await prisma.expense.create({
    data: {
      eventId: event.id, title: "Catering — first instalment", categoryId: cat("Catering").id, budgetItemId: cateringItem.id, vendorId: cateringVendor.id,
      expenseDate: agoDays(20), subtotal: 336_134, taxAmount: 63_866, totalAmount: 400_000,
      dueDate: inDays(30), status: "partially_paid", createdById: demo.id,
    },
  });
  const photo = await prisma.expense.create({
    data: {
      eventId: event.id, title: "Photography package", categoryId: cat("Photography").id, budgetItemId: photoItem.id, vendorId: photoVendor.id,
      expenseDate: agoDays(12), subtotal: 168_067, taxAmount: 31_933, totalAmount: 200_000,
      dueDate: inDays(45), status: "partially_paid", createdById: demo.id,
    },
  });
  await prisma.expense.createMany({
    data: [
      {
        eventId: event.id, title: "Bridal flowers & table decor", categoryId: cat("Decoration").id, budgetItemId: flowersItem.id,
        expenseDate: agoDays(5), subtotal: 84_034, taxAmount: 15_966, totalAmount: 100_000,
        dueDate: agoDays(2), status: "unpaid", createdById: demo.id,
      },
      {
        eventId: event.id, title: "Live band", categoryId: cat("Entertainment").id, budgetItemId: bandItem.id,
        expenseDate: agoDays(3), subtotal: 42_017, taxAmount: 7_983, totalAmount: 50_000,
        dueDate: inDays(80), status: "unpaid", createdById: demo.id,
      },
    ],
  });

  // Payments (gross 760,000 minor; one partial refund of 10,000 → net 750,000)
  const photoPayment = await prisma.payment.create({
    data: { expenseId: photo.id, eventId: event.id, vendorId: photoVendor.id, amount: 60_000, paidAt: agoDays(6), method: "credit_card", createdById: demo.id },
  });
  await prisma.payment.createMany({
    data: [
      { expenseId: venue.id, eventId: event.id, vendorId: venueVendor.id, amount: 500_000, paidAt: agoDays(12), method: "bank_transfer", reference: "TRX-8841", createdById: demo.id },
      { expenseId: catering.id, eventId: event.id, vendorId: cateringVendor.id, amount: 200_000, paidAt: agoDays(15), method: "bank_transfer", reference: "TRX-8720", createdById: demo.id },
      // Partial refund: the photographer returned the overcharged travel fee.
      {
        expenseId: photo.id, eventId: event.id, vendorId: photoVendor.id,
        type: "refund", refundOfPaymentId: photoPayment.id, amount: 10_000,
        paidAt: agoDays(2), method: "credit_card", reference: "RF-101", notes: "Travel fee returned", createdById: demo.id,
      },
    ],
  });

  // Guests
  const family = await prisma.guestGroup.create({ data: { eventId: event.id, name: "Family" } });
  const friends = await prisma.guestGroup.create({ data: { eventId: event.id, name: "Friends" } });
  await prisma.guest.createMany({
    data: [
      { eventId: event.id, firstName: "Clara", lastName: "Schmidt", email: "clara@example.com", groupId: family.id, invitationStatus: "invited", rsvpStatus: "accepted", accompanyingCount: 1, createdById: demo.id },
      { eventId: event.id, firstName: "Jonas", lastName: "Weber", groupId: family.id, invitationStatus: "invited", rsvpStatus: "accepted", createdById: demo.id },
      { eventId: event.id, firstName: "Maria", lastName: "Rossi", email: "maria@example.com", groupId: friends.id, invitationStatus: "invited", rsvpStatus: "maybe", dietary: "Vegetarian", createdById: demo.id },
      { eventId: event.id, firstName: "Tom", lastName: "Baker", groupId: friends.id, invitationStatus: "prepared", rsvpStatus: "pending", createdById: demo.id },
      { eventId: event.id, firstName: "Lena", lastName: "Fischer", email: "lena@example.com", groupId: friends.id, invitationStatus: "invited", rsvpStatus: "declined", createdById: demo.id },
      { eventId: event.id, firstName: "Otto", lastName: "Schmidt", groupId: family.id, invitationStatus: "invited", rsvpStatus: "accepted", allergies: "Nuts", createdById: demo.id },
    ],
  });

  // Tasks with a dependency chain
  const t1 = await prisma.task.create({
    data: { eventId: event.id, title: "Book venue", status: "completed", priority: "critical", completedAt: agoDays(25), completedById: demo.id, dueAt: agoDays(25), createdById: demo.id },
  });
  const t2 = await prisma.task.create({
    data: { eventId: event.id, title: "Choose catering menu", status: "in_progress", priority: "high", dueAt: inDays(14), createdById: demo.id },
  });
  const t3 = await prisma.task.create({
    data: { eventId: event.id, title: "Send invitations", status: "not_started", priority: "high", dueAt: inDays(30), createdById: demo.id },
  });
  await prisma.task.create({
    data: { eventId: event.id, title: "Finalize seating plan", status: "not_started", priority: "medium", dueAt: inDays(90), createdById: demo.id },
  });
  await prisma.taskDependency.createMany({
    data: [
      { taskId: t2.id, dependsOnTaskId: t1.id },
      { taskId: t3.id, dependsOnTaskId: t2.id },
    ],
  });

  // Timeline
  await prisma.timelineEntry.createMany({
    data: [
      { eventId: event.id, title: "Ceremony", type: "ceremony", startAt: inDays(120), notes: "Lakeside terrace", createdById: demo.id },
      { eventId: event.id, title: "Reception & dinner", type: "reception", startAt: inDays(120), createdById: demo.id },
      { eventId: event.id, title: "First dance", type: "custom", startAt: inDays(120), createdById: demo.id },
    ],
  });

  console.log("Seed complete.");
  console.log("  Logins: demo@ / planner@ / viewer@eventplanner.dev — password Demo1234!");
  console.log("  Event totals: actual €12,500.00 | net paid €7,500.00");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
