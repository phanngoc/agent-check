import { createSignal, createEffect, onCleanup } from "solid-js";
import type { SystemMetrics } from "@/types";
import * as api from "@/api/client";

const [metrics, setMetrics] = createSignal<SystemMetrics | null>(null);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);

let refreshInterval: number | null = null;

export function useSystemMetrics() {
  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSystemMetrics();
      setMetrics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load system metrics");
      console.error("Error loading system metrics:", e);
    } finally {
      setLoading(false);
    }
  };

  const startAutoRefresh = (intervalMs: number = 5000) => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
      loadMetrics();
    }, intervalMs) as unknown as number;
  };

  const stopAutoRefresh = () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };

  // Auto-refresh on mount
  createEffect(() => {
    loadMetrics();
    startAutoRefresh(5000);
    
    onCleanup(() => {
      stopAutoRefresh();
    });
  });

  return {
    metrics,
    loading,
    error,
    loadMetrics,
    startAutoRefresh,
    stopAutoRefresh,
  };
}

