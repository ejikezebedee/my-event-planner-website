import Link from "next/link";
import { Briefcase, Cake, GraduationCap, HandHeart, Heart, Music } from "lucide-react";
import { Button, Card, CardContent } from "@mep/ui";
import { PublicFooter, PublicNav } from "@/components/public-nav";

const CASES = [
  {
    icon: Heart,
    title: "Weddings",
    text: "Hundreds of guests, a dozen vendors and one budget that must survive reality. Track RSVPs by household, keep deposits and instalments straight, and walk into the day knowing every cent is accounted for.",
    highlights: [
      "Guest groups & seating prep",
      "Vendor quotes vs. agreed prices",
      "Payment schedules per vendor",
    ],
  },
  {
    icon: Briefcase,
    title: "Corporate events",
    text: "Conferences, offsites and kickoffs with stakeholders who want numbers. Role-based access lets the whole team plan while finance sees exactly what was committed, paid and refunded.",
    highlights: [
      "Team roles & audit log",
      "PDF reports for finance",
      "Budget variance at a glance",
    ],
  },
  {
    icon: Cake,
    title: "Private celebrations",
    text: "Birthdays, anniversaries and reunions without spreadsheet chaos. Start from a template workflow, invite family as viewers, and keep the surprise intact with private internal notes.",
    highlights: ["Quick setup", "Simple guest CSV import", "Timeline for the day"],
  },
  {
    icon: Music,
    title: "Festivals & shows",
    text: "Multi-act schedules, many vendors and hard deadlines. The merged calendar keeps services, payments and tasks visible in one place while the audit trail keeps contractors honest.",
    highlights: ["Vendor service calendar", "Contract deadlines", "Task dependencies"],
  },
  {
    icon: GraduationCap,
    title: "School & club events",
    text: "Galas, fundraisers and graduation parties run by volunteers. Share read-only access broadly, let coordinators edit, and export everything to CSV for the committee.",
    highlights: ["Viewer roles for volunteers", "CSV exports", "Budget thresholds with alerts"],
  },
  {
    icon: HandHeart,
    title: "Non-profit & community",
    text: "Charity dinners and community festivals where every euro is scrutinised. Refund-aware ledgers and immutable history make the post-event report a formality, not a project.",
    highlights: [
      "Transparent financial history",
      "Refund tracking",
      "Self-hostable for data control",
    ],
  },
];

export default function UseCasesPage() {
  return (
    <main className="min-h-screen">
      <PublicNav />
      <section className="container py-16 text-center">
        <h1 className="text-4xl font-bold">Use cases</h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          One platform, any event — the budget discipline scales with you.
        </p>
      </section>
      <section className="container grid gap-6 pb-16 md:grid-cols-2 lg:grid-cols-3">
        {CASES.map((c) => (
          <Card key={c.title} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col pt-6">
              <c.icon className="h-7 w-7 text-primary" />
              <h2 className="mt-3 font-semibold">{c.title}</h2>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{c.text}</p>
              <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                {c.highlights.map((h) => (
                  <li key={h} className="flex gap-2">
                    <span className="text-primary">•</span> {h}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="container pb-16 text-center">
        <Button size="lg" asChild>
          <Link href="/register">Plan your event</Link>
        </Button>
      </section>
      <PublicFooter />
    </main>
  );
}
