"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  Checkbox,
} from "@mep/ui";
import { api } from "@/lib/api";

export default function ContactPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
    consent: false,
  });
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.consent) {
      toast.error("Please confirm your consent.");
      return;
    }
    setSending(true);
    try {
      await api.post("/contact", form);
      toast.success("Message sent — we will get back to you shortly.");
      setForm({ name: "", email: "", subject: "", message: "", consent: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send your message");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="container flex min-h-screen items-center justify-center py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Contact us</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use this secure form to contact the service team.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                required
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea
                id="message"
                required
                minLength={10}
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={form.consent}
                onCheckedChange={(v) => setForm({ ...form, consent: v === true })}
              />
              <span>I consent to my message being stored so the team can respond.</span>
            </label>
            <div className="flex items-center justify-between">
              <Button type="submit" disabled={sending}>
                {sending ? "Sending…" : "Send message"}
              </Button>
              <Link href="/" className="text-sm text-muted-foreground hover:underline">
                Back home
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
