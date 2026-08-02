"use client";

import { useEffect } from "react";

// turns the offline worker on in production and off everywhere else.
//
// dev does the opposite on purpose: a worker left behind by a production build
// tested on localhost would keep serving that build's code, and the developer
// would spend an hour wondering why their edits do nothing.
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister()),
        );

        const names = await caches.keys();
        await Promise.all(
          names
            .filter((name) => name.startsWith("seven-degree-"))
            .map((name) => caches.delete(name)),
        );
      })();

      return;
    }

    void navigator.serviceWorker
      // updateViaCache none: the browser must always ask the server whether
      // the worker itself changed, or a bad one could never be replaced.
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // no offline copy this session. the app still works with internet,
        // so there is nothing to tell the cashier about.
      });
  }, []);

  return null;
}
