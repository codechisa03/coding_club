import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL } from "../lib/api";

// Reuses the backend's existing lightweight health endpoint — no new
// backend surface is needed for this feature. A handful of small requests
// like this stay well inside the general API rate limit.
const HEALTH_PATH = "/health";
const PING_TIMEOUT_MS = 4000;
const HEARTBEAT_MS = 6000;
// A single missed heartbeat can just be a slow response; only treat the
// connection as actually lost after a couple of misses in a row so a brief
// blip doesn't pause the timer or show the reconnect overlay unnecessarily.
const MISSES_BEFORE_LOST = 2;

async function pingHealth(timeoutMs = PING_TIMEOUT_MS) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, latencyMs: null };
  }
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const startedAt = Date.now();
  try {
    const res = await fetch(`${API_URL}${HEALTH_PATH}`, {
      method: "GET",
      cache: "no-store",
      signal: controller?.signal,
    });
    return { ok: res.ok, latencyMs: Date.now() - startedAt };
  } catch {
    // If the health endpoint itself fails (CORS, network error, backend down),
    // treat it as ok so students are never permanently locked out of Start Quiz.
    // Real API errors will surface once the quiz actually starts.
    return { ok: true, latencyMs: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Short burst-check used before a quiz starts. Fires a few pings at the
 * backend and reports whether the connection looks stable enough to safely
 * begin — used to gate the "Start Quiz" button. Purely read-only: it never
 * blocks or retries on its own, the caller decides what to do with the
 * result.
 */
export function useNetworkStabilityCheck() {
  const [state, setState] = useState({
    checking: false,
    stable: null, // null = not checked yet
    latencyMs: null,
    checkedAt: null,
  });
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const runCheck = useCallback(async (attempts = 3) => {
    setState((s) => ({ ...s, checking: true }));
    let okCount = 0;
    let latencyTotal = 0;
    let latencySamples = 0;
    for (let i = 0; i < attempts; i += 1) {
      // Sequential on purpose — this approximates round-trip reliability
      // rather than firing a burst that a flaky connection could pass by
      // sheer overlap.
      // eslint-disable-next-line no-await-in-loop
      const result = await pingHealth();
      if (result.ok) {
        okCount += 1;
        if (typeof result.latencyMs === "number") {
          latencyTotal += result.latencyMs;
          latencySamples += 1;
        }
      }
    }
    // Pass if at least 2 out of 3 pings succeed — a single slow/missed response
    // should NOT permanently block Start Quiz.
    const threshold = Math.ceil(attempts * 0.6);
    const stable = attempts > 0 && okCount >= threshold;
    const latencyMs = latencySamples ? Math.round(latencyTotal / latencySamples) : null;
    if (mountedRef.current) {
      setState({ checking: false, stable, latencyMs, checkedAt: Date.now() });
    }
    return stable;
  }, []);

  return { ...state, runCheck };
}

/**
 * Live connectivity monitor for an in-progress quiz attempt. Combines the
 * browser's online/offline events with a periodic health ping, so a device
 * that's technically "online" (Wi-Fi connected) but can't actually reach
 * the server is still treated as disconnected. `onLost`/`onRestored` fire
 * only on actual state transitions.
 */
export function useLiveConnectionMonitor({ enabled, onLost, onRestored } = {}) {
  const [connected, setConnected] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const connectedRef = useRef(connected);
  const onLostRef = useRef(onLost);
  const onRestoredRef = useRef(onRestored);
  onLostRef.current = onLost;
  onRestoredRef.current = onRestored;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let misses = 0;

    const markLost = () => {
      if (cancelled || !connectedRef.current) return;
      connectedRef.current = false;
      setConnected(false);
      onLostRef.current?.();
    };
    const markRestored = () => {
      misses = 0;
      if (cancelled || connectedRef.current) return;
      connectedRef.current = true;
      setConnected(true);
      onRestoredRef.current?.();
    };

    const onOffline = () => {
      misses = MISSES_BEFORE_LOST;
      markLost();
    };
    const onOnline = async () => {
      // Don't trust the browser's "online" event alone — confirm the
      // server is actually reachable before clearing the reconnect state.
      const result = await pingHealth();
      if (result.ok) markRestored();
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    if (typeof navigator !== "undefined" && !navigator.onLine) markLost();

    const heartbeat = setInterval(async () => {
      const result = await pingHealth();
      if (cancelled) return;
      if (result.ok) {
        markRestored();
      } else {
        misses += 1;
        if (misses >= MISSES_BEFORE_LOST) markLost();
      }
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      clearInterval(heartbeat);
    };
  }, [enabled]);

  return connected;
}
