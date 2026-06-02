import { useEffect, useState } from "react";

import { localDateKey } from "../lib/localDate";

function msUntilTomorrow() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 1, 0);
  return Math.max(1_000, tomorrow.getTime() - now.getTime());
}

export function useCurrentDateKey() {
  const [todayKey, setTodayKey] = useState(() => localDateKey());

  useEffect(() => {
    const sync = () => setTodayKey(localDateKey());
    const timeout = window.setTimeout(sync, msUntilTomorrow());
    const interval = window.setInterval(sync, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") sync();
    };

    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [todayKey]);

  return todayKey;
}
