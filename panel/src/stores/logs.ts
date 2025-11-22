import { createSignal, onCleanup } from "solid-js";
import type { LogEntry } from "@/types";
import * as api from "@/api/client";

export function useServiceLogs(serviceId: () => string | null) {
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [eventSource, setEventSource] = createSignal<EventSource | null>(null);
  let abortController: AbortController | null = null;

  const loadLogs = async (params?: api.GetServiceLogsParams) => {
    const id = serviceId();
    if (!id) return;
    
    // Cancel previous request if it exists
    if (abortController) {
      abortController.abort();
    }

    // Create new AbortController for this request
    abortController = new AbortController();
    const currentController = abortController;
    
    try {
      setLoading(true);
      setError(null);
      const data = await api.getServiceLogs(id, params, currentController.signal);
      
      // Only update state if this request wasn't cancelled
      if (!currentController.signal.aborted) {
        if (Array.isArray(data)) {
          // Old format - string array
          setLogs([]);
        } else {
          // New format - FilteredLogsResponse
          setLogs(data.logs);
        }
      }
    } catch (e) {
      // Don't set error for aborted requests
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      
      // Only update error state if this is still the current request
      if (currentController === abortController) {
        setError(e instanceof Error ? e.message : "Failed to load logs");
        console.error("Error loading logs:", e);
      }
    } finally {
      // Only update loading state if this is still the current request
      if (currentController === abortController) {
        setLoading(false);
        abortController = null;
      }
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
    // Cancel any pending request on cleanup
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
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
  let abortController: AbortController | null = null;

  const loadLogs = async (params?: api.GetCombinedLogsParams) => {
    // Cancel previous request if it exists
    if (abortController) {
      abortController.abort();
    }

    // Create new AbortController for this request
    abortController = new AbortController();
    const currentController = abortController;

    try {
      setLoading(true);
      setError(null);
      const data = await api.getCombinedLogs(params, currentController.signal);
      
      // Only update state if this request wasn't cancelled
      if (!currentController.signal.aborted) {
        setLogs(data);
      }
    } catch (e) {
      // Don't set error for aborted requests
      if (e instanceof Error && e.name === "AbortError") {
        return;
      }
      
      const errorMessage = e instanceof Error 
        ? e.message 
        : "Failed to load combined logs";
      setError(errorMessage);
      console.error("Error loading combined logs:", e);
    } finally {
      // Only update loading state if this is still the current request
      if (currentController === abortController) {
        setLoading(false);
        abortController = null;
      }
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
    // Cancel any pending request on cleanup
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
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

