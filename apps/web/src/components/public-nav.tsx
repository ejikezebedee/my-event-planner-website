import Link from "next/link";
import { Button } from "@mep/ui";

export function PublicNav() {
  return (
    <header className="container flex items-center justify-between py-6">
      <Link href="/" className="text-lg font-semibold">
        My Event Planner
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" asChild className="hidden sm:inline-flex">
          <Link href="/features">Features</Link>
        </Button>
        <Button variant="ghost" asChild className="hidden sm:inline-flex">
          <Link href="/use-cases">Use cases</Link>
        </Button>
        <Button variant="ghost" asChild className="hidden sm:inline-flex">
          <Link href="/faq">FAQ</Link>
        </Button>
        <Button variant="ghost" asChild><Link href="/contact">Contact</Link></Button>
        <Button variant="ghost" asChild><Link href="/login">Log in</Link></Button>
        <Button asChild><Link href="/register">Get started</Link></Button>
      </nav>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t py-8 text-center text-sm text-muted-foreground">
      <p>My Event Planner — plan events, control budgets.</p>
      <nav className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/features" className="hover:underline">Features</Link>
        <Link href="/use-cases" className="hover:underline">Use cases</Link>
        <Link href="/about" className="hover:underline">About</Link>
        <Link href="/faq" className="hover:underline">FAQ</Link>
        <Link href="/contact" className="hover:underline">Contact</Link>
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/impressum" className="hover:underline">Impressum</Link>
      </nav>
      <p className="mt-3 text-xs">© 2026 My Event Planner. All rights reserved.</p>
    </footer>
  );
}
