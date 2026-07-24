import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — My Event Planner" };

const SECTIONS: [string, string][] = [
  [
    "The service",
    "My Event Planner provides event planning and budget control tools: budgets, expenses, payments, guests, vendors, tasks, documents and reports.",
  ],
  [
    "Your account",
    "You are responsible for keeping your credentials confidential and for all activity under your account. You must provide a valid email address.",
  ],
  [
    "Your data",
    "You retain all rights to the content you enter. You grant the service the right to store and process it solely to operate the platform.",
  ],
  [
    "Acceptable use",
    "Do not upload unlawful content, malware, or files designed to harm the service. Executable file types are rejected by the upload filter.",
  ],
  [
    "Availability",
    "The service is provided 'as is'. We aim for high availability but do not guarantee uninterrupted operation.",
  ],
  [
    "Liability",
    "To the maximum extent permitted by law, liability is limited to the amount paid for the service in the 12 months preceding a claim.",
  ],
  ["Changes", "We may update these terms; continued use after notice constitutes acceptance."],
];

export default function TermsPage() {
  return (
    <main className="container max-w-3xl py-16">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: January 2025</p>
      {SECTIONS.map(([title, text]) => (
        <section key={title} className="mt-8">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        </section>
      ))}
      <p className="mt-12 text-sm">
        <Link href="/" className="text-primary hover:underline">
          ← Back home
        </Link>
      </p>
    </main>
  );
}
