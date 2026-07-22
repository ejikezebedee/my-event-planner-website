import Link from "next/link";
import {
  Bell, CalendarRange, FileText, Receipt, ShieldCheck, Users, Wallet,
} from "lucide-react";
import { Button, Card, CardContent } from "@mep/ui";
import { PublicFooter, PublicNav } from "@/components/public-nav";

const GROUPS = [
  {
    icon: Wallet,
    title: "Budget & finance",
    points: [
      "Budget categories and line items with planned vs. actual",
      "Variance and utilisation % computed server-side",
      "Expenses with subtotal/tax or gross-only totals",
      "Partial payments, refunds, reversals — history always preserved",
      "Receipts and proofs of payment linked to records",
      "PDF and CSV reports for every module",
    ],
  },
  {
    icon: Users,
    title: "Guests & vendors",
    points: [
      "Guest groups, households, plus-ones and dietary needs",
      "RSVP and invitation tracking with live attendance stats",
      "CSV import with duplicate detection and row-level validation",
      "Vendor database with internal ratings and notes",
      "Quoted vs. agreed vs. paid per vendor",
    ],
  },
  {
    icon: CalendarRange,
    title: "Planning operations",
    points: [
      "Tasks with priorities, dependencies and blocking visibility",
      "Timeline with manual and auto-generated entries",
      "One merged calendar — month, week and agenda views",
      "Documents with categories and record links",
      "Audit log of every change",
    ],
  },
  {
    icon: Bell,
    title: "Notifications & automation",
    points: [
      "Hourly scheduled checks — deadlines never slip silently",
      "Payments due/overdue, tasks due/overdue, budget thresholds",
      "Per-type preferences and optional email copies",
      "Idempotent APIs — safe to retry, safe to refresh",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Security & access",
    points: [
      "Workspace isolation with owner/admin/planner/viewer roles",
      "Event-level membership on top of workspace roles",
      "HTTP-only sessions, scrypt passwords, generic reset flows",
      "Validated uploads (type + size), no executable content",
    ],
  },
  {
    icon: FileText,
    title: "Platform",
    points: [
      "Installable PWA with offline fallback",
      "Self-hostable: Docker Compose, one command",
      "REST API with OpenAPI/Swagger documentation",
      "Real PostgreSQL, Redis-optional (degrades gracefully)",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <main className="min-h-screen">
      <PublicNav />
      <section className="container py-16 text-center">
        <h1 className="text-4xl font-bold">Features</h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          A complete event planning platform with financial discipline at its core.
        </p>
      </section>
      <section className="container grid gap-6 pb-16 md:grid-cols-2 lg:grid-cols-3">
        {GROUPS.map((g) => (
          <Card key={g.title}>
            <CardContent className="pt-6">
              <g.icon className="h-7 w-7 text-primary" />
              <h2 className="mt-3 font-semibold">{g.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {g.points.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="text-primary">•</span> {p}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="container pb-16 text-center">
        <Button size="lg" asChild><Link href="/register">Try it now</Link></Button>
      </section>
      <PublicFooter />
    </main>
  );
}
