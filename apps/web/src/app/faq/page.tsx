import Link from "next/link";
import { Button } from "@mep/ui";
import { PublicFooter, PublicNav } from "@/components/public-nav";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How does budget control work?",
    a: "Every expense is stored as exact integer cents and linked to a budget item. Planned vs. actual, variance and utilisation are computed server-side per category and item — never estimated in the browser.",
  },
  {
    q: "Can I record partial payments and refunds?",
    a: "Yes. Expenses move automatically through unpaid → partially paid → paid (and overpaid, if you explicitly confirm it). Refunds are first-class records linked to their original payment, capped at what remains refundable.",
  },
  {
    q: "What happens if I delete something with financial history?",
    a: "Nothing is ever truly deleted. Expenses with payments are cancelled, payments are reversed with a reason, and events are archived — the full history and audit trail stay intact.",
  },
  {
    q: "Can I import my guest list?",
    a: "Yes — CSV import with flexible column mapping, duplicate detection, row-level validation and a dry-run preview before anything is written. A template is provided in the app.",
  },
  {
    q: "Who can see my event?",
    a: "Only members of your workspace. Within it, owners and admins see everything; planners and viewers only see events they are members of, and viewers are read-only. Internal vendor ratings are never publicly visible.",
  },
  {
    q: "Does it work offline?",
    a: "The app is an installable PWA. Static assets are cached and a dedicated offline page appears when you lose connectivity; your data syncs when you are back.",
  },
  {
    q: "Can I host it myself?",
    a: "Yes — one Docker Compose file starts the web app, API, PostgreSQL and optional Redis. All data stays on your infrastructure.",
  },
  {
    q: "Is there an API?",
    a: "A versioned REST API (/api/v1) documented with OpenAPI/Swagger at /api/docs covers every feature — the web app is built entirely on it.",
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen">
      <PublicNav />
      <section className="container max-w-3xl py-16">
        <h1 className="text-center text-4xl font-bold">Frequently asked questions</h1>
        <div className="mt-12 space-y-8">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h2 className="font-semibold">{f.q}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 text-center">
          <p className="text-sm text-muted-foreground">Still curious?</p>
          <Button variant="outline" className="mt-3" asChild><Link href="/contact">Contact us</Link></Button>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
