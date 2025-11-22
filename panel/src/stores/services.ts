import { createSignal, createEffect, onCleanup } from "solid-js";
import type { Service, ServiceMetrics } from "@/types";
import * as api from "@/api/client";

const [services, setServices] = createSignal<Service[]>([]);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
const [metrics, setMetrics] = createSignal<Record<string, ServiceMetrics>>({});

let refreshInterval: number | null = null;
// Track service IDs that are currently loading metrics to prevent duplicate requests
const pendingMetricsRequests = new Set<string>();

export function useServices() {
  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listServices();
      setServices(data);
      
      // Load metrics for running services (using deduplication)
      const runningServices = data.filter(s => s.status === "running");
      for (const service of runningServices) {
        // Skip if already loading metrics for this service
        if (pendingMetricsRequests.has(service.id)) {
          continue;
        }
        
        pendingMetricsRequests.add(service.id);
        try {
          const serviceMetrics = await api.getServiceMetrics(service.id);
          setMetrics(prev => ({ ...prev, [service.id]: serviceMetrics }));
        } catch (e) {
          console.error(`Failed to load metrics for ${service.id}:`, e);
        } finally {
          pendingMetricsRequests.delete(service.id);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load services");
      console.error("Error loading services:", e);
    } finally {
      setLoading(false);
    }
  };

  const startService = async (id: string) => {
    try {
      await api.startService(id);
      setTimeout(loadServices, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start service");
      throw e;
    }
  };

  const stopService = async (id: string) => {
    try {
      await api.stopService(id);
      setTimeout(loadServices, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop service");
      throw e;
    }
  };

  const restartService = async (id: string) => {
    try {
      await api.restartService(id);
      setTimeout(loadServices, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restart service");
      throw e;
    }
  };

  const loadServiceMetrics = async (id: string) => {
    // Prevent duplicate requests for the same service
    if (pendingMetricsRequests.has(id)) {
      return;
    }

    // Check if service is running before loading metrics
    const serviceList = services();
    const service = serviceList.find(s => s.id === id);
    if (!service || service.status !== "running") {
      return;
    }

    pendingMetricsRequests.add(id);
    try {
      const serviceMetrics = await api.getServiceMetrics(id);
      setMetrics(prev => ({ ...prev, [id]: serviceMetrics }));
    } catch (e) {
      console.error(`Failed to load metrics for ${id}:`, e);
    } finally {
      pendingMetricsRequests.delete(id);
    }
  };

  const startAutoRefresh = (intervalMs: number = 5000) => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
      loadServices();
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
    loadServices();
    startAutoRefresh(5000);
    
    onCleanup(() => {
      stopAutoRefresh();
    });
  });

  return {
    services,
    loading,
    error,
    metrics,
    loadServices,
    startService,
    stopService,
    restartService,
    loadServiceMetrics,
    startAutoRefresh,
    stopAutoRefresh,
  };
}

