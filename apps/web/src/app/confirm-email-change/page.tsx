"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@mep/ui";
import { api } from "@/lib/api";

function Confirm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    api
      .post("/auth/confirm-email-change", { token })
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, [token]);

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <CardTitle>
          {state === "pending" ? "Confirming…" : state === "ok" ? "Email address changed" : "Confirmation failed"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {state === "pending"
            ? "Please wait while we confirm your new email address."
            : state === "ok"
              ? "Your email address has been changed. For your security, all sessions were signed out — please log in with your new address."
              : "This confirmation link is invalid or has expired."}
        </p>
        <Button className="w-full" asChild>
          <Link href="/login">{state === "ok" ? "Log in with new email" : "Back to login"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function ConfirmEmailChangePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <Confirm />
      </Suspense>
    </main>
  );
}
