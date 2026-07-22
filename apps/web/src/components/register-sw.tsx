"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the PWA service worker (production only) with safe update
 * handling: when a new version is ready, the user is asked before it
 * activates — updates never replace a running session unasked.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            // A new worker is installed and waiting while an old one controls
            // the page — offer the update instead of forcing it.
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              toast.info("A new version of My Event Planner is available.", {
                duration: Infinity,
                action: {
                  label: "Reload to update",
                  onClick: () => worker.postMessage({ type: "SKIP_WAITING" }),
                },
              });
            }
          });
        });
      })
      .catch(() => undefined);
  }, []);
  return null;
}
