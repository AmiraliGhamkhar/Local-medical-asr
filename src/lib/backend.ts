import { useCallback, useEffect, useState } from "react";

const PROBE_INTERVAL_MS = 10_000;

export interface BackendStatus {
  online: boolean;
  checked: boolean;
  retry: () => void;
}

/**
 * The terminology engine, the number rules and the audit view all run in the
 * browser and work with no backend at all. Accounts, the shared audit trail
 * and custom terms do not. Rather than let a dead backend blank the page, the
 * studio probes for it and says plainly which features are paused.
 */
export function useBackendStatus(): BackendStatus {
  const [online, setOnline] = useState(false);
  const [checked, setChecked] = useState(false);

  const probe = useCallback(async () => {
    const endpoint = `${window.location.origin}/convex/version`;
    try {
      const response = await fetch(`${endpoint}?t=${Date.now()}`, { cache: "no-store" });
      setOnline(response.ok);
    } catch {
      setOnline(false);
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void probe();
    const timer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [probe]);

  return { online, checked, retry: () => void probe() };
}
