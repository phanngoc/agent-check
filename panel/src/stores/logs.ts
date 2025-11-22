import { createSignal, onCleanup } from "solid-js";
import type { LogEntry } from "@/types";
import * as api from "@/api/client";

export function useServiceLogs(serviceId: () => string | null) {
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [eventSource, setEventSource] = createSignal<EventSource | null>(null);

  const loadLogs = async (params?: api.GetServiceLogsParams) => {
    const id = serviceId();
    if (!id) return;
    
    try {
      setLoading(true);
      setError(null);
      const data = await api.getServiceLogs(id, params);
      
      if (Array.isArray(data)) {
        // Old format - string array
        setLogs([]);
      } else {
        // New format - FilteredLogsResponse
        setLogs(data.logs);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load logs");
      console.error("Error loading logs:", e);
    } finally {
      setLoading(false);
    }
  };

  const startStreaming = () => {
    const id = serviceId();
    if (!id) return;
    
    // Close existing stream
    const existing = eventSource();
    if (existing) {
      existing.close();
    }

    const es = api.streamServiceLogs(
      id,
      (logEntry) => {
        setLogs(prev => [...prev, logEntry]);
        // Keep only last 1000 logs
        setLogs(prev => prev.length > 1000 ? prev.slice(-1000) : prev);
      },
      (error) => {
        console.error("Log stream error:", error);
        // Reconnect after 3 seconds
        setTimeout(() => {
          if (serviceId()) {
            startStreaming();
          }
        }, 3000);
      }
    );

    setEventSource(es);
  };

  const stopStreaming = () => {
    const es = eventSource();
    if (es) {
      es.close();
      setEventSource(null);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  onCleanup(() => {
    stopStreaming();
  });

  return {
    logs,
    loading,
    error,
    loadLogs,
    startStreaming,
    stopStreaming,
    clearLogs,
  };
}

export function useCombinedLogs() {
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [eventSource, setEventSource] = createSignal<EventSource | null>(null);

  const loadLogs = async (params?: api.GetCombinedLogsParams) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getCombinedLogs(params);
      setLogs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load combined logs");
      console.error("Error loading combined logs:", e);
    } finally {
      setLoading(false);
    }
  };

  const startStreaming = () => {
    // Close existing stream
    const existing = eventSource();
    if (existing) {
      existing.close();
    }

    const es = api.streamCombinedLogs(
      (logEntry) => {
        setLogs(prev => [...prev, logEntry]);
        // Keep only last 1000 logs
        setLogs(prev => prev.length > 1000 ? prev.slice(-1000) : prev);
      },
      (error) => {
        console.error("Combined log stream error:", error);
        // Reconnect after 3 seconds
        setTimeout(() => {
          startStreaming();
        }, 3000);
      }
    );

    setEventSource(es);
  };

  const stopStreaming = () => {
    const es = eventSource();
    if (es) {
      es.close();
      setEventSource(null);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  onCleanup(() => {
    stopStreaming();
  });

  return {
    logs,
    loading,
    error,
    loadLogs,
    startStreaming,
    stopStreaming,
    clearLogs,
  };
}

