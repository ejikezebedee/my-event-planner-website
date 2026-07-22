import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-6xl font-bold tracking-tight text-primary">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="max-w-md text-muted-foreground">
        The page you are looking for does not exist or may have been moved.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Go home
        </Link>
        <Link
          href="/app"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
