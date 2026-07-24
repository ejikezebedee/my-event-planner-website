"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@mep/ui";
import { api } from "@/lib/api";

function InviteAccept() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "error" | "unauthenticated">("pending");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This invitation link is invalid or has expired.");
      return;
    }
    api
      .post<{ workspaceId: number }>("/workspaces/invitations/accept", { token })
      .then(() => setState("ok"))
      .catch((err) => {
        if (err instanceof Error && "status" in err && (err as { status: number }).status === 401) {
          setState("unauthenticated");
        } else {
          setState("error");
          setMessage(err instanceof Error ? err.message : "Could not accept the invitation");
        }
      });
  }, [token]);

  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader>
        <CardTitle>Workspace invitation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === "pending" && (
          <p className="text-sm text-muted-foreground">Accepting your invitation…</p>
        )}
        {state === "ok" && (
          <>
            <p className="text-sm">You have joined the workspace.</p>
            <Button className="w-full" onClick={() => router.push("/app")}>
              Open app
            </Button>
          </>
        )}
        {state === "unauthenticated" && (
          <>
            <p className="text-sm">
              Please log in (or register with the invited email address) to accept this invitation.
            </p>
            <Button className="w-full" asChild>
              <Link href={`/login?next=/invite?token=${encodeURIComponent(token)}`}>Log in</Link>
            </Button>
          </>
        )}
        {state === "error" && <p className="text-sm text-destructive">{message}</p>}
      </CardContent>
    </Card>
  );
}

export default function InvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <InviteAccept />
      </Suspense>
    </main>
  );
}
