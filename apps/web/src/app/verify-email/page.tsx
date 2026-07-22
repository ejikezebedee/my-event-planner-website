"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@mep/ui";
import { api } from "@/lib/api";

function Verify() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    api
      .post("/auth/verify-email", { token })
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, [token]);

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <CardTitle>
          {state === "pending" ? "Verifying…" : state === "ok" ? "Email verified" : "Verification failed"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {state === "pending"
            ? "Please wait while we confirm your email address."
            : state === "ok"
              ? "Your email address has been confirmed."
              : "This verification link is invalid or has expired."}
        </p>
        <Button className="w-full" asChild>
          <Link href={state === "ok" ? "/app" : "/login"}>{state === "ok" ? "Open app" : "Back to login"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <Verify />
      </Suspense>
    </main>
  );
}
