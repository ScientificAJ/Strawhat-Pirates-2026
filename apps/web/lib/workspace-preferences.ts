"use client";

import { useEffect, useState } from "react";
import { defaultPreferences, readPreferences } from "./workspace-backup";

export function useWorkspacePreferences() {
  const [preferences, setPreferences] = useState(defaultPreferences);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readPreferences()
        .then((value) => {
          if (active) setPreferences(value);
        })
        .catch(() => {
          /* The shell exposes storage failures; defaults stay usable. */
        });
    };
    refresh();
    window.addEventListener("nova-ember-preferences-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("nova-ember-preferences-changed", refresh);
    };
  }, []);
  return preferences;
}
