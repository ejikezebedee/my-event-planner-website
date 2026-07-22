import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Impressum — My Event Planner" };

export default function ImpressumPage() {
  return (
    <main className="container max-w-3xl py-16">
      <h1 className="text-3xl font-bold">Impressum</h1>
      <p className="mt-2 text-sm text-muted-foreground">Legal notice pursuant to § 5 DDG (Germany)</p>
      <div className="mt-8 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
        This deployment must not be launched publicly until the operator replaces the fields below with verified legal details.
      </div>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Service provider</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          [FULL LEGAL NAME OR COMPANY]<br />[FULL SERVICEABLE STREET ADDRESS]<br />[POSTCODE, CITY, COUNTRY]
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Contact</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Email: [LEGAL CONTACT EMAIL]<br />Telephone: [TELEPHONE, IF REQUIRED]<br />
          Or via the <Link href="/contact" className="text-primary hover:underline">contact form</Link>.
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Registration and tax details</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          [REGISTER, REGISTRATION NUMBER AND VAT ID, WHERE APPLICABLE]
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Consumer dispute resolution</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          [INSERT LEGALLY REVIEWED STATEMENT ON WILLINGNESS OR OBLIGATION TO PARTICIPATE IN CONSUMER ARBITRATION.]
        </p>
      </section>
      <p className="mt-12 text-sm"><Link href="/" className="text-primary hover:underline">← Back home</Link></p>
    </main>
  );
}
