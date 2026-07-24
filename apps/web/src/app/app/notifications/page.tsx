"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCheck, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@mep/ui";
import { NOTIFICATION_TYPES, labelize } from "@mep/types";
import { api } from "@/lib/api";
import type { NotificationItem, NotificationPrefs } from "@/lib/types";
import { formatDateTime } from "@/lib/money";
import { PageHeader } from "@/components/page-header";

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationItem[]>("/notifications"),
  });
  const prefs = useQuery({
    queryKey: ["notificationPrefs"],
    queryFn: () => api.get<NotificationPrefs>("/notifications/preferences"),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["notificationPrefs"] });
    queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
  };

  const markRead = useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/notifications/${id}`),
    onSuccess: invalidate,
  });
  const savePrefs = useMutation({
    mutationFn: (next: NotificationPrefs) => api.put("/notifications/preferences", next),
    onSuccess: () => {
      toast.success("Notification preferences saved");
      invalidate();
    },
    onError: () => toast.error("Could not save preferences"),
  });

  if (notifications.isPending || !notifications.data || !prefs.data)
    return <Skeleton className="h-96" />;

  const toggleType = (type: string, enabled: boolean) => {
    savePrefs.mutate({ ...prefs.data!, types: { ...prefs.data!.types, [type]: enabled } });
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        actions={
          <Button variant="outline" onClick={() => markAll.mutate()}>
            <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        }
      />
      <div className="space-y-2">
        {notifications.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No notifications.</p>
        )}
        {notifications.data.map((n) => (
          <div
            key={n.id}
            className={`flex items-start justify-between rounded-lg border p-4 ${n.readAt ? "opacity-60" : "bg-card"}`}
          >
            <div>
              <p className="font-medium">
                {n.title}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {labelize(n.type)}
                </span>
              </p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.createdAt)}</p>
              {n.link && (
                <Link href={n.link} className="text-xs text-primary hover:underline">
                  Open →
                </Link>
              )}
            </div>
            <div className="flex gap-1">
              {!n.readAt && (
                <Button
                  size="icon"
                  variant="ghost"
                  title="Mark as read"
                  aria-label={`Mark "${n.title}" as read`}
                  onClick={() => markRead.mutate(n.id)}
                >
                  <Check className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                title="Delete"
                aria-label={`Delete "${n.title}"`}
                onClick={() => remove.mutate(n.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" /> Notification preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={prefs.data.email}
              onChange={(e) => savePrefs.mutate({ ...prefs.data!, email: e.target.checked })}
            />
            Also send notifications by email
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {NOTIFICATION_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={prefs.data.types[type] !== false}
                  onChange={(e) => toggleType(type, e.target.checked)}
                />
                {labelize(type)}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
