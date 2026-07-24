"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  LogOut,
  MailWarning,
  Menu,
  Settings,
} from "lucide-react";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetTrigger,
  Skeleton,
} from "@mep/ui";
import {
  setSelectedWorkspaceId,
  useCurrentWorkspace,
  useLogout,
  useMe,
  useUnreadCount,
} from "@/lib/hooks";
import { api, ApiError } from "@/lib/api";

/** Persistent banner while the account's email address is unverified (C4). */
function VerifyEmailBanner() {
  const me = useMe();
  const resend = useMutation({
    mutationFn: () => api.post("/auth/resend-verification"),
    onSuccess: () => toast.success("Verification email sent — check your inbox"),
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : "Could not send verification email"),
  });
  if (!me.data || me.data.emailVerifiedAt) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <MailWarning className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        Your email address is not verified yet. Please confirm it via the link we sent you.
      </span>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        disabled={resend.isPending}
        onClick={() => resend.mutate()}
      >
        Resend verification email
      </Button>
    </div>
  );
}

const NAV = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/events", label: "Events", icon: CalendarDays },
  { href: "/app/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/app/notifications", label: "Notifications", icon: Bell },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const unread = useUnreadCount();
  return (
    <nav className="flex-1 space-y-1 px-3">
      {NAV.map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.href === "/app/notifications" && unread.data && unread.data.count > 0 && (
              <Badge variant="destructive" className="ml-auto">
                {unread.data.count}
              </Badge>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function WorkspacePicker() {
  const { current, data: workspaces } = useCurrentWorkspace();
  return (
    <div className="p-3">
      {workspaces && workspaces.length > 1 ? (
        <Select
          value={current ? String(current.id) : undefined}
          onValueChange={(v) => {
            setSelectedWorkspaceId(Number(v));
            window.location.reload();
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Workspace" />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={String(w.id)}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="px-2 text-sm font-medium text-muted-foreground">
          {current?.name ?? <Skeleton className="h-4 w-28" />}
        </div>
      )}
    </div>
  );
}

function UserFooter() {
  const me = useMe();
  const logout = useLogout();
  return (
    <div className="border-t p-3">
      <div className="mb-2 px-2">
        <p className="truncate text-sm font-medium">{me.data?.name ?? "…"}</p>
        <p className="truncate text-xs text-muted-foreground">{me.data?.email}</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start"
        onClick={() => logout.mutate()}
      >
        <LogOut className="mr-2 h-4 w-4" /> Log out
      </Button>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 flex-col border-r bg-card md:flex">
        <div className="border-b p-4">
          <Link href="/app" className="font-semibold">
            My Event Planner
          </Link>
        </div>
        <WorkspacePicker />
        <NavLinks />
        <UserFooter />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center gap-2 border-b bg-card px-4 py-3 md:hidden">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-64 flex-col p-0 pt-4">
              <div className="border-b px-4 pb-3 font-semibold">My Event Planner</div>
              <WorkspacePicker />
              <NavLinks onNavigate={() => setMenuOpen(false)} />
              <UserFooter />
            </SheetContent>
          </Sheet>
          <Link href="/app" className="font-semibold">
            My Event Planner
          </Link>
        </header>
        <VerifyEmailBanner />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
