import { createSignal, createEffect, onCleanup } from "solid-js";
import type { ContainerInfo } from "@/types";
import * as api from "@/api/client";

const [containers, setContainers] = createSignal<ContainerInfo[]>([]);
const [loading, setLoading] = createSignal(false);
const [error, setError] = createSignal<string | null>(null);

let refreshInterval: number | null = null;

export function useContainers() {
  const loadContainers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listContainers();
      setContainers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load containers");
      console.error("Error loading containers:", e);
    } finally {
      setLoading(false);
    }
  };

  const startContainer = async (id: string) => {
    try {
      await api.startContainer(id);
      setTimeout(loadContainers, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start container");
      throw e;
    }
  };

  const stopContainer = async (id: string) => {
    try {
      await api.stopContainer(id);
      setTimeout(loadContainers, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to stop container");
      throw e;
    }
  };

  const restartContainer = async (id: string) => {
    try {
      await api.restartContainer(id);
      setTimeout(loadContainers, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to restart container");
      throw e;
    }
  };

  const startAutoRefresh = (intervalMs: number = 5000) => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(() => {
      loadContainers();
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
    loadContainers();
    startAutoRefresh(5000);
    
    onCleanup(() => {
      stopAutoRefresh();
    });
  });

  return {
    containers,
    loading,
    error,
    loadContainers,
    startContainer,
    stopContainer,
    restartContainer,
    startAutoRefresh,
    stopAutoRefresh,
  };
}

