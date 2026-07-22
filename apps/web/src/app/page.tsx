import Link from "next/link";
import {
  ArrowRight, CalendarRange, CheckCircle2, CreditCard, ListTodo, Lock,
  Receipt, ShieldCheck, Users, Wallet,
} from "lucide-react";
import { Button, Card, CardContent } from "@mep/ui";
import { PublicFooter, PublicNav } from "@/components/public-nav";

const FEATURES = [
  { icon: Wallet, title: "Budget control", text: "Categories and line items with planned vs. actual, variance and utilisation — always current." },
  { icon: Receipt, title: "Expenses & refunds", text: "Integer-exact amounts, partial payments, refunds, receipts and a full audit trail." },
  { icon: Users, title: "Guests & RSVPs", text: "Groups, households, dietary needs, CSV import with duplicate detection." },
  { icon: CalendarRange, title: "Tasks, timeline & calendar", text: "Dependencies, deadlines and one merged calendar — nothing falls through the cracks." },
];

const STEPS = [
  { n: 1, title: "Create your event", text: "Set the date, venue, budget and currency — invite your team." },
  { n: 2, title: "Plan everything", text: "Budget items, vendors, guests, tasks and the timeline in one workspace." },
  { n: 3, title: "Stay in control", text: "Payments, refunds and reports keep every cent accounted for until event day." },
];

const USE_CASES = [
  { title: "Weddings", text: "Guests, seating, vendors and a budget that survives reality." },
  { title: "Corporate events", text: "Conferences, offsites and kickoffs with team collaboration and reports." },
  { title: "Private celebrations", text: "Birthdays, anniversaries and reunions without spreadsheet chaos." },
];

const FAQS: { q: string; a: string }[] = [
  { q: "How does budget control work?", a: "Every expense is stored as exact integer cents and linked to a budget item. You always see planned vs. actual, variance and utilisation per category and item — computed server-side, never estimated." },
  { q: "Can I record partial payments and refunds?", a: "Yes. Expenses move through unpaid → partially paid → paid automatically. Refunds are first-class records linked to their payment, and the history is never deleted." },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <PublicNav />

      {/* Hero */}
      <section className="container py-16 text-center sm:py-24">
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Plan events. <span className="text-primary">Control budgets.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          The event planning platform with financial discipline built in — every cent
          tracked from first quote to final refund.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" asChild><Link href="/register">Get started <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          <Button size="lg" variant="outline" asChild><Link href="/features">Explore features</Link></Button>
        </div>
      </section>

      {/* Product preview */}
      <section className="container pb-16">
        <div className="overflow-hidden rounded-xl border shadow-lg">
          {/* Real screenshot of the running product, not a mockup. */}
          <img src="/preview.png" alt="My Event Planner budget view with planned, actual and variance per item" className="w-full" />
        </div>
        <p className="mt-3 text-center text-sm text-muted-foreground">
          The actual budget view — planned, actual, variance and utilisation per item.
        </p>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container">
          <h2 className="text-center text-3xl font-bold">Everything an event needs</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardContent className="pt-6">
                  <f.icon className="h-8 w-8 text-primary" />
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Expense control highlight */}
      <section className="container grid items-center gap-10 py-16 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold">Financial discipline, not vibes</h2>
          <p className="mt-4 text-muted-foreground">
            Most tools track tasks. We track money with the same rigor as an accounting
            system — because event budgets die by a thousand small cuts.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              "Exact integer-cent math — no floating-point surprises",
              "Overpayments blocked unless you explicitly confirm",
              "Refunds, reversals and cancellations preserve full history",
              "PDF and CSV reports for every stakeholder",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {item}
              </li>
            ))}
          </ul>
        </div>
        <Card className="bg-muted/40">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center gap-3">
              <CreditCard className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm font-medium">Catering — first instalment</p>
                <p className="text-xs text-muted-foreground">€2.000,00 of €4.000,00 paid · partially paid</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Receipt className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm font-medium">Photography package</p>
                <p className="text-xs text-muted-foreground">€500,00 net after €100,00 refund</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ListTodo className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm font-medium">Send invitations</p>
                <p className="text-xs text-muted-foreground">Blocked by “Choose catering menu”</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* How it works */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container">
          <h2 className="text-center text-3xl font-bold">How it works</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  {s.n}
                </div>
                <h3 className="mt-4 font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section className="container py-16">
        <h2 className="text-center text-3xl font-bold">Built for every kind of event</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {USE_CASES.map((u) => (
            <Card key={u.title}>
              <CardContent className="pt-6">
                <h3 className="font-semibold">{u.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{u.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/use-cases" className="text-primary hover:underline">See all use cases →</Link>
        </p>
      </section>

      {/* Security summary */}
      <section className="border-t bg-muted/30 py-16">
        <div className="container grid items-center gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold">Your data, your event</h2>
            <p className="mt-4 text-muted-foreground">
              Workspaces isolate every event. Roles decide who can view or change what.
              Sessions are HTTP-only cookies, passwords are scrypt-hashed, and every
              mutation lands in an audit log.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Lock, text: "Workspace isolation & role-based access" },
              { icon: ShieldCheck, text: "Audit log for every change" },
              { icon: CheckCircle2, text: "Validated uploads, no executables" },
              { icon: Users, text: "Self-hostable — your data stays yours" },
            ].map((s) => (
              <div key={s.text} className="flex items-start gap-2 text-sm">
                <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {s.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container max-w-3xl py-16">
        <h2 className="text-center text-3xl font-bold">Frequently asked questions</h2>
        <div className="mt-10 space-y-6">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm">
          <Link href="/faq" className="text-primary hover:underline">More questions →</Link>
        </p>
      </section>

      {/* Final CTA */}
      <section className="border-t bg-primary py-16 text-center text-primary-foreground">
        <h2 className="text-3xl font-bold">Start planning with confidence</h2>
        <p className="mx-auto mt-4 max-w-xl opacity-90">
          Create your first event in minutes — budget, guests, vendors and tasks included.
        </p>
        <Button size="lg" variant="secondary" className="mt-8" asChild>
          <Link href="/register">Create free account</Link>
        </Button>
      </section>

      <PublicFooter />
    </main>
  );
}
