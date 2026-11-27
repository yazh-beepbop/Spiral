/**
 * Client-side PWA service worker registrar (`src/components/ServiceWorkerRegistrar.tsx`).
 *
 * Feature overview & use cases:
 * - Registers `/sw.js` once after hydration when running in a browser that supports
 *   Service Workers, enabling mobile "Add to Home Screen" / standalone PWA mode.
 * - Renders nothing visibly (`null`) so it can sit quietly inside the root layout.
 */

"use client";

import { useEffect } from "react";
import { logError, logInfo } from "@/lib/log";

/**
 * Registers the Spiral PWA service worker on client mount and logs registration outcome.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    logInfo("ServiceWorkerRegistrar.mount");
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const registerWorker = async (): Promise<void> => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        logInfo("ServiceWorkerRegistrar.registered", {
          scope: registration.scope,
        });
      } catch (error: unknown) {
        logError("ServiceWorkerRegistrar.registerFailed", error);
      }
    };

    void registerWorker();
  }, []);

  return null;
}
