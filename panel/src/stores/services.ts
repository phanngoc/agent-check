import { createSignal, createEffect, onCleanup } from "solid-js";
import type { Service, ServiceMetrics } from "@/types";
import * as api from "@/api/client";

const [services, setServices] = createSignal<Service[]>([]);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);
const [metrics, setMetrics] = createSignal<Record<string, ServiceMetrics>>({});

let refreshInterval: number | null = null;

export function useServices() {
  const loadServices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listServices();
      setServices(data);
      
      // Load metrics for running services
      const runningServices = data.filter(s => s.status === "running");
      for (const service of runningServices) {
        try {
          const serviceMetrics = await api.getServiceMetrics(service.id);
          setMetrics(prev => ({ ...prev, [service.id]: serviceMetrics }));
        } catch (e) {
          console.error(`Failed to load metrics for ${service.id}:`, e);
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
    try {
      const serviceMetrics = await api.getServiceMetrics(id);
      setMetrics(prev => ({ ...prev, [id]: serviceMetrics }));
    } catch (e) {
      console.error(`Failed to load metrics for ${id}:`, e);
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

