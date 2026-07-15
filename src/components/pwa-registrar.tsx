"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .catch((error: unknown) => {
        if (process.env.NODE_ENV === "development") {
          console.error("Service worker kaydedilemedi.", error);
        }
      });
  }, []);

  return null;
}
