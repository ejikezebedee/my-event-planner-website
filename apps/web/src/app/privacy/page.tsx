import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — My Event Planner" };

const SECTIONS: [string, string][] = [
  ["Data we store", "Account details (name, email, password hash), your workspaces, events, guests, vendors, expenses, payments, tasks, documents and audit logs. We never store plain-text passwords."],
  ["How we use it", "Only to provide the service: authentication, planning features, reports and transactional emails (verification, password reset, invitations). We do not sell or share your data with advertisers."],
  ["Cookies", "A single HTTP-only session cookie (mep_session) keeps you signed in. No tracking or analytics cookies are set."],
  ["Document storage", "Uploaded files are stored privately in object storage and are only accessible to members of the event they belong to."],
  ["Your rights", "You may download a structured account-data export, export event reports, correct your profile in the app, and delete your account in Settings → Account (password confirmation required). Deleting financial records follows the archive-first policy of the platform."],
  ["Retention", "Your planning data is kept while your account is active. Expired sessions are purged after 7 days, used or expired security tokens after 24 hours, read notifications after 90 days, and contact-form submissions after 12 months. Audit logs are retained as the integrity trail of financial changes."],
  ["Security", "Passwords are hashed (scrypt), sessions are database-backed HTTP-only tokens, email addresses must be verified, and uploaded documents pass malware scanning before they are served."],
  ["Contact", "Questions about privacy? Reach us through the contact page."],
];

export default function PrivacyPage() {
  return (
    <main className="container max-w-3xl py-16">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: July 2026</p>
      {SECTIONS.map(([title, text]) => (
        <section key={title} className="mt-8">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        </section>
      ))}
      <p className="mt-12 text-sm"><Link href="/" className="text-primary hover:underline">← Back home</Link></p>
    </main>
  );
}
