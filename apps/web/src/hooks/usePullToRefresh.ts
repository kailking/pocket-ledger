import { useEffect, useRef, useState, type RefObject } from "react";

type PullStatus = "idle" | "pulling" | "ready" | "refreshing";

type UsePullToRefreshOptions = {
  containerRef: RefObject<HTMLElement | null>;
  onRefresh: () => Promise<unknown> | unknown;
  disabled?: boolean;
  threshold?: number;
  maxPull?: number;
};

export function usePullToRefresh({
  containerRef,
  onRefresh,
  disabled = false,
  threshold = 72,
  maxPull = 104
}: UsePullToRefreshOptions) {
  const [distance, setDistance] = useState(0);
  const [status, setStatus] = useState<PullStatus>("idle");
  const distanceRef = useRef(0);
  const statusRef = useRef<PullStatus>("idle");
  const startYRef = useRef(0);
  const activeRef = useRef(false);
  const refreshRef = useRef(onRefresh);

  function updateDistance(nextDistance: number) {
    distanceRef.current = nextDistance;
    setDistance(nextDistance);
  }

  function updateStatus(nextStatus: PullStatus) {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || disabled) return undefined;
    const scrollElement: HTMLElement = element;

    function reset() {
      activeRef.current = false;
      startYRef.current = 0;
      updateDistance(0);
      updateStatus("idle");
    }

    function handleTouchStart(event: TouchEvent) {
      if (scrollElement.scrollTop > 0 || statusRef.current === "refreshing") return;
      const touch = event.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      activeRef.current = true;
    }

    function handleTouchMove(event: TouchEvent) {
      if (!activeRef.current || statusRef.current === "refreshing") return;
      const touch = event.touches[0];
      if (!touch) return;
      const delta = touch.clientY - startYRef.current;
      if (delta <= 0 || scrollElement.scrollTop > 0) return;

      event.preventDefault();
      const nextDistance = Math.min(maxPull, delta * 0.55);
      updateDistance(nextDistance);
      updateStatus(nextDistance >= threshold ? "ready" : "pulling");
    }

    function handleTouchEnd() {
      if (!activeRef.current) return;
      const shouldRefresh = distanceRef.current >= threshold;
      activeRef.current = false;
      startYRef.current = 0;

      if (!shouldRefresh) {
        reset();
        return;
      }

      updateDistance(48);
      updateStatus("refreshing");
      void Promise.resolve(refreshRef.current()).finally(() => {
        updateDistance(0);
        updateStatus("idle");
      });
    }

    scrollElement.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollElement.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollElement.addEventListener("touchend", handleTouchEnd);
    scrollElement.addEventListener("touchcancel", reset);

    return () => {
      scrollElement.removeEventListener("touchstart", handleTouchStart);
      scrollElement.removeEventListener("touchmove", handleTouchMove);
      scrollElement.removeEventListener("touchend", handleTouchEnd);
      scrollElement.removeEventListener("touchcancel", reset);
    };
  }, [containerRef, disabled, maxPull, threshold]);

  return { distance, status, isRefreshing: status === "refreshing" };
}
