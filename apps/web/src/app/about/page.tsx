import Link from "next/link";
import { Button } from "@mep/ui";
import { PublicFooter, PublicNav } from "@/components/public-nav";

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <PublicNav />
      <section className="container max-w-3xl py-16">
        <h1 className="text-4xl font-bold">About My Event Planner</h1>
        <div className="mt-6 space-y-4 text-muted-foreground">
          <p>
            My Event Planner exists because event budgets fail quietly. A deposit here, an upgrade
            there, a refund nobody recorded — and suddenly the spreadsheet and the bank account tell
            different stories.
          </p>
          <p>
            We built a planning tool that treats money with the same rigor as an accounting system:
            exact integer-cent math, payments that can be partial, refunds that stay linked to their
            payment, and a history that is never deleted — only reversed, cancelled or archived,
            always with an audit trail.
          </p>
          <p>
            Around that financial core sits everything an event needs: guests and RSVPs, vendors and
            contracts, tasks with dependencies, a timeline and calendar that update themselves,
            documents, reports and notifications that catch deadlines before they catch you.
          </p>
          <p>
            It is self-hostable with a single Docker Compose file, because your event data belongs
            to you — not to us.
          </p>
        </div>
        <div className="mt-10 flex gap-3">
          <Button asChild>
            <Link href="/register">Get started</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/contact">Talk to us</Link>
          </Button>
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
