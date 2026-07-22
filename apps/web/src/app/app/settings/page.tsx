"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input,
  Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent,
  TabsList, TabsTrigger,
} from "@mep/ui";
import { CURRENCIES } from "@mep/types";
import { api, ApiError } from "@/lib/api";
import { useCurrentWorkspace, useMe } from "@/lib/hooks";
import { formatDateTime } from "@/lib/money";
import { PageHeader } from "@/components/page-header";

interface SessionInfo {
  id: number;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
  current: boolean;
}
interface Member {
  id: number;
  role: string;
  user: { id: number; name: string; email: string };
}

const onError = (err: unknown) => toast.error(err instanceof ApiError ? err.message : "Action failed");

function ProfileSection() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", currency: "EUR", timezone: "" });
  const [loaded, setLoaded] = useState(false);
  if (me.data && !loaded) {
    setForm({ name: me.data.name, currency: me.data.currency, timezone: me.data.timezone });
    setLoaded(true);
  }
  const save = useMutation({
    mutationFn: () => api.patch("/auth/me", form),
    onSuccess: () => {
      toast.success("Profile updated");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError,
  });
  if (!me.data) return <Skeleton className="h-48" />;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>
          {me.data.email} {me.data.emailVerifiedAt ? <Badge variant="secondary">verified</Badge> : <Badge variant="destructive">unverified</Badge>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Default currency</Label>
            <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          </div>
          <Button type="submit" className="w-fit" disabled={save.isPending}>Save profile</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangeEmailSection() {
  const me = useMe();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ newEmail: "", password: "" });
  const changeEmail = useMutation({
    mutationFn: () => api.post("/auth/change-email", form),
    onSuccess: () => {
      toast.success("Confirmation link sent to the new address — your email changes once confirmed");
      setForm({ newEmail: "", password: "" });
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Change email address</CardTitle>
        <CardDescription>
          Current: {me.data?.email}. The new address must be confirmed via a link we send to it;
          all sessions are then signed out.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-4" onSubmit={(e) => { e.preventDefault(); changeEmail.mutate(); }}>
          <div className="space-y-1.5">
            <Label>New email address</Label>
            <Input type="email" required autoComplete="email" value={form.newEmail} onChange={(e) => setForm({ ...form, newEmail: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Confirm with password</Label>
            <Input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <Button type="submit" className="w-fit" disabled={changeEmail.isPending}>Send confirmation link</Button>
        </form>
      </CardContent>
    </Card>
  );
}


function DataExportSection() {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      await api.download("/auth/account-export", `my-event-planner-data-${new Date().toISOString().slice(0, 10)}.json`);
      toast.success("Your account data export has been downloaded");
    } catch (err) {
      onError(err);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Export account data</CardTitle>
        <CardDescription>Download a structured JSON copy of your profile, memberships, events, financial records, guests, vendors, tasks, notifications, document metadata and relevant audit history.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={download} disabled={downloading}>
          <Download className="mr-2 h-4 w-4" />{downloading ? "Preparing…" : "Download my data"}
        </Button>
      </CardContent>
    </Card>
  );
}

function DeleteAccountSection() {
  const router = useRouter();
  const [form, setForm] = useState({ password: "", confirmation: "" });
  const deleteAccount = useMutation({
    mutationFn: () => api.delete("/auth/account", { ...form }),
    onSuccess: () => {
      toast.success("Your account has been deleted");
      router.push("/");
    },
    onError,
  });
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Delete account</CardTitle>
        <CardDescription>
          Permanently deletes your account, your sessions, and workspaces you own alone (including
          their events, expenses and documents). Workspaces shared with others must be transferred
          or vacated first. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-4" onSubmit={(e) => { e.preventDefault(); deleteAccount.mutate(); }}>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Type DELETE to confirm</Label>
            <Input required pattern="DELETE" value={form.confirmation} onChange={(e) => setForm({ ...form, confirmation: e.target.value })} />
          </div>
          <Button type="submit" variant="destructive" className="w-fit" disabled={deleteAccount.isPending || form.confirmation !== "DELETE"}>
            Delete my account
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SecuritySection() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "" });
  const sessions = useQuery({
    queryKey: ["sessions"],
    queryFn: () => api.get<SessionInfo[]>("/auth/sessions"),
  });
  const queryClient = useQueryClient();
  const changePassword = useMutation({
    mutationFn: () => api.post("/auth/change-password", form),
    onSuccess: () => {
      toast.success("Password changed — other sessions were signed out");
      setForm({ currentPassword: "", newPassword: "" });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (id: number) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sessions"] }),
    onError,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
        <CardContent>
          <form className="grid max-w-md gap-4" onSubmit={(e) => { e.preventDefault(); changePassword.mutate(); }}>
            <div className="space-y-1.5">
              <Label>Current password</Label>
              <Input type="password" required autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>New password</Label>
              <Input type="password" required minLength={8} autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
            </div>
            <Button type="submit" className="w-fit" disabled={changePassword.isPending}>Change password</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Active sessions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Device</TableHead><TableHead>IP</TableHead><TableHead>Created</TableHead><TableHead className="w-12" /></TableRow>
            </TableHeader>
            <TableBody>
              {sessions.data?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="block max-w-xs truncate">{s.userAgent ?? "Unknown device"}</span>
                    {s.current && <Badge variant="secondary" className="mt-1">This session</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.ip ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
                  <TableCell>
                    {!s.current && (
                      <Button size="icon" variant="ghost" aria-label="Revoke session" onClick={() => revoke.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ChangeEmailSection />
      <DataExportSection />
          <DeleteAccountSection />
    </div>
  );
}

function TransferOwnershipSection({ current, members }: { current: { id: number }; members: Member[] | undefined }) {
  const me = useMe();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ memberId: "", password: "" });
  const transfer = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${current.id}/transfer-ownership`, {
        memberId: Number(form.memberId),
        password: form.password,
      }),
    onSuccess: () => {
      toast.success("Ownership transferred — you are now an admin of this workspace");
      setForm({ memberId: "", password: "" });
      queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      queryClient.invalidateQueries({ queryKey: ["wsMembers", current.id] });
    },
    onError,
  });
  const candidates = (members ?? []).filter((m) => m.role !== "owner" && m.user.id !== me.data?.id);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Transfer ownership</CardTitle>
        <CardDescription>
          Hand this workspace to another member. You stay on as an admin. Confirmed with your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex max-w-lg items-end gap-2" onSubmit={(e) => { e.preventDefault(); transfer.mutate(); }}>
          <div className="flex-1 space-y-1.5">
            <Label>New owner</Label>
            <Select value={form.memberId} onValueChange={(v) => setForm({ ...form, memberId: v })}>
              <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
              <SelectContent>
                {candidates.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.user.name} ({m.user.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Your password</Label>
            <Input type="password" required autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <Button type="submit" variant="secondary" disabled={transfer.isPending || !form.memberId}>Transfer</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function WorkspaceSection() {
  const { current } = useCurrentWorkspace();
  const queryClient = useQueryClient();
  const [invite, setInvite] = useState({ email: "", role: "viewer" });
  const members = useQuery({
    queryKey: ["wsMembers", current?.id],
    queryFn: () => api.get<Member[]>(`/workspaces/${current!.id}/members`),
    enabled: !!current,
  });

  const sendInvite = useMutation({
    mutationFn: () => api.post(`/workspaces/${current!.id}/invitations`, invite),
    onSuccess: () => {
      toast.success("Invitation sent");
      setInvite({ email: "", role: "viewer" });
    },
    onError,
  });
  const removeMember = useMutation({
    mutationFn: (memberId: number) => api.delete(`/workspaces/${current!.id}/members/${memberId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wsMembers", current?.id] }),
    onError,
  });
  const setRole = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: string }) =>
      api.patch(`/workspaces/${current!.id}/members/${memberId}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wsMembers", current?.id] }),
    onError,
  });

  if (!current) return <Skeleton className="h-48" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{current.name}</CardTitle>
          <CardDescription>Invite people and manage workspace roles.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex max-w-lg items-end gap-2" onSubmit={(e) => { e.preventDefault(); sendInvite.mutate(); }}>
            <div className="flex-1 space-y-1.5">
              <Label>Email</Label>
              <Input type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="planner">Planner</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={sendInvite.isPending}>Invite</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Members</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead className="w-12" /></TableRow>
            </TableHeader>
            <TableBody>
              {members.data?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.user.email}</TableCell>
                  <TableCell>
                    {m.role === "owner" ? (
                      <Badge>Owner</Badge>
                    ) : (
                      <Select value={m.role} onValueChange={(v) => setRole.mutate({ memberId: m.id, role: v })}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="planner">Planner</SelectItem>
                          <SelectItem value="viewer">Viewer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {m.role !== "owner" && (
                      <Button size="icon" variant="ghost" aria-label={`Remove ${m.user.name} from workspace`} onClick={() => { if (confirm(`Remove ${m.user.name}?`)) removeMember.mutate(m.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {current.members?.[0]?.role === "owner" && (
        <TransferOwnershipSection current={current} members={members.data} />
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6"><ProfileSection /></TabsContent>
        <TabsContent value="security" className="mt-6"><SecuritySection /></TabsContent>
        <TabsContent value="workspace" className="mt-6"><WorkspaceSection /></TabsContent>
      </Tabs>
    </div>
  );
}
