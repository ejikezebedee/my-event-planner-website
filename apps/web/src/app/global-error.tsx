"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            display: "flex",
            minHeight: "100vh",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
            padding: "1.5rem",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ maxWidth: "28rem", color: "#666" }}>
            An unexpected error occurred. Please try again — if the problem persists, contact
            support.
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#999" }}>Reference: {error.digest}</p>
          ) : null}
          <button
            onClick={reset}
            style={{
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
