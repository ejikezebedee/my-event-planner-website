"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "./api";
import type { EventSummary, Profile, Workspace } from "./types";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<Profile>("/auth/me"),
    retry: false,
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api.get<Workspace[]>("/workspaces"),
  });
}

/** Current workspace selection persisted client-side. */
const WS_KEY = "mep_workspace_id";

export function getSelectedWorkspaceId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(WS_KEY);
  return raw ? Number(raw) : null;
}

export function setSelectedWorkspaceId(id: number) {
  window.localStorage.setItem(WS_KEY, String(id));
}

export function useCurrentWorkspace() {
  const query = useWorkspaces();
  const selectedId = typeof window !== "undefined" ? getSelectedWorkspaceId() : null;
  const current = query.data?.find((w) => w.id === selectedId) ?? query.data?.[0] ?? null;
  return { ...query, current };
}

export function useEvents(workspaceId: number | undefined) {
  return useQuery({
    queryKey: ["events", workspaceId],
    queryFn: () => api.get<EventSummary[]>(`/events?workspaceId=${workspaceId}`),
    enabled: !!workspaceId,
  });
}

export function useEvent(eventId: number) {
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => api.get<EventSummary>(`/events/${eventId}`),
    enabled: eventId > 0,
  });
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      router.push("/login");
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count"),
    refetchInterval: 60_000,
  });
}
