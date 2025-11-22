import type {
  Service,
  ContainerInfo,
  LogEntry,
  ServiceMetrics,
  SystemMetrics,
  FilteredLogsResponse,
  ProcessInfo,
} from "@/types";

const API_BASE = "/api";
const DEFAULT_TIMEOUT = 30000; // 30 seconds

// Helper function to create a timeout promise
function createTimeoutPromise(timeout: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);
  });
}

// Helper function to handle network errors
function handleNetworkError(error: unknown): Error {
  if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
    // Check for specific network errors
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes("err_insufficient_resources") || 
        errorMessage.includes("insufficient resources")) {
      return new Error("Too many requests. Please wait a moment and try again.");
    }
    return new Error("Network error: Unable to connect to server. Please check your connection.");
  }
  // Check if error is a DOMException with ERR_INSUFFICIENT_RESOURCES
  if (error instanceof DOMException && error.name === "NetworkError") {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes("err_insufficient_resources") || 
        errorMessage.includes("insufficient resources")) {
      return new Error("Too many requests. Please wait a moment and try again.");
    }
  }
  // Check error message for ERR_INSUFFICIENT_RESOURCES (may appear in console logs)
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    if (errorMessage.includes("err_insufficient_resources") || 
        errorMessage.includes("insufficient resources")) {
      return new Error("Too many requests. Please wait a moment and try again.");
    }
    return error;
  }
  return new Error("Unknown error occurred");
}

async function fetchWithTimeout(
  url: string,
  options?: RequestInit,
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await Promise.race([
      fetch(url, { ...options, signal: controller.signal }),
      createTimeoutPromise(timeout),
    ]);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw handleNetworkError(error);
  }
}

async function fetchJson<T>(url: string, options?: RequestInit, timeout?: number): Promise<T> {
  try {
    const response = await fetchWithTimeout(url, options, timeout);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    throw handleNetworkError(error);
  }
}

async function fetchText(url: string, options?: RequestInit, timeout?: number): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(url, options, timeout);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    throw handleNetworkError(error);
  }
}

// Services
export async function listServices(): Promise<Service[]> {
  return fetchJson<Service[]>(`${API_BASE}/services`);
}

export async function getService(id: string): Promise<Service> {
  return fetchJson<Service>(`${API_BASE}/services/${id}`);
}

export async function startService(id: string): Promise<void> {
  await fetch(`${API_BASE}/services/${id}/start`, { method: "POST" });
}

export async function stopService(id: string): Promise<void> {
  await fetch(`${API_BASE}/services/${id}/stop`, { method: "POST" });
}

export async function restartService(id: string): Promise<void> {
  await fetch(`${API_BASE}/services/${id}/restart`, { method: "POST" });
}

export async function getServiceStatus(id: string): Promise<ProcessInfo> {
  return fetchJson<ProcessInfo>(`${API_BASE}/services/${id}/status`);
}

export async function getServiceMetrics(id: string): Promise<ServiceMetrics> {
  return fetchJson<ServiceMetrics>(`${API_BASE}/services/${id}/metrics`);
}

export interface GetServiceLogsParams {
  level?: string;
  from?: string;
  to?: string;
  search?: string;
  operator?: "and" | "or";
  limit?: number;
  lines?: number;
}

export async function getServiceLogs(
  id: string,
  params?: GetServiceLogsParams,
  signal?: AbortSignal
): Promise<FilteredLogsResponse | string[]> {
  const searchParams = new URLSearchParams();
  if (params?.level) searchParams.append("level", params.level);
  if (params?.from) searchParams.append("from", params.from);
  if (params?.to) searchParams.append("to", params.to);
  if (params?.search) searchParams.append("search", params.search);
  if (params?.operator) searchParams.append("operator", params.operator);
  if (params?.limit) searchParams.append("limit", params.limit.toString());
  if (params?.lines) searchParams.append("lines", params.lines.toString());

  const url = `${API_BASE}/services/${id}/logs${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  
  const options: RequestInit = {};
  if (signal) {
    options.signal = signal;
  }
  
  // If we have filter params, expect FilteredLogsResponse, otherwise string[]
  if (params && (params.level || params.from || params.to || params.search)) {
    return fetchJson<FilteredLogsResponse>(url, options);
  }
  return fetchText(url, options);
}

export function streamServiceLogs(
  id: string,
  onMessage: (log: LogEntry) => void,
  onError?: (error: Event) => void
): EventSource {
  const eventSource = new EventSource(`${API_BASE}/services/${id}/logs/stream`);
  
  eventSource.onmessage = (event) => {
    try {
      const logEntry: LogEntry = JSON.parse(event.data);
      onMessage(logEntry);
    } catch (e) {
      console.error("Error parsing log entry:", e);
    }
  };
  
  if (onError) {
    eventSource.onerror = onError;
  }
  
  return eventSource;
}

// Containers
export async function listContainers(): Promise<ContainerInfo[]> {
  return fetchJson<ContainerInfo[]>(`${API_BASE}/containers`);
}

export async function startContainer(id: string): Promise<void> {
  await fetch(`${API_BASE}/containers/${id}/start`, { method: "POST" });
}

export async function stopContainer(id: string): Promise<void> {
  await fetch(`${API_BASE}/containers/${id}/stop`, { method: "POST" });
}

export async function restartContainer(id: string): Promise<void> {
  await fetch(`${API_BASE}/containers/${id}/restart`, { method: "POST" });
}

export async function getContainerLogs(id: string, tail?: number): Promise<string[]> {
  const url = tail
    ? `${API_BASE}/containers/${id}/logs?tail=${tail}`
    : `${API_BASE}/containers/${id}/logs`;
  return fetchText(url);
}

// System
export async function getSystemMetrics(): Promise<SystemMetrics> {
  return fetchJson<SystemMetrics>(`${API_BASE}/system/metrics`);
}

// Combined Logs
export interface GetCombinedLogsParams {
  level?: string;
  search?: string;
  lines?: number;
}

export async function getCombinedLogs(
  params?: GetCombinedLogsParams,
  signal?: AbortSignal
): Promise<LogEntry[]> {
  const searchParams = new URLSearchParams();
  if (params?.level) searchParams.append("level", params.level);
  if (params?.search) searchParams.append("search", params.search);
  if (params?.lines) searchParams.append("lines", params.lines.toString());

  const url = `${API_BASE}/logs/combined${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  
  try {
    const response = await fetchWithTimeout(url, { signal }, DEFAULT_TIMEOUT);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.logs || [];
  } catch (error) {
    // Re-throw abort errors as-is (for cancellation)
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    throw handleNetworkError(error);
  }
}

export function streamCombinedLogs(
  onMessage: (log: LogEntry) => void,
  onError?: (error: Event) => void
): EventSource {
  const eventSource = new EventSource(`${API_BASE}/logs/combined/stream`);
  
  eventSource.onmessage = (event) => {
    try {
      const logEntry: LogEntry = JSON.parse(event.data);
      onMessage(logEntry);
    } catch (e) {
      console.error("Error parsing combined log entry:", e);
    }
  };
  
  if (onError) {
    eventSource.onerror = onError;
  }
  
  return eventSource;
}

// Logs Management
export async function cleanupLogs(days: number = 30): Promise<void> {
  await fetch(`${API_BASE}/logs/cleanup?days=${days}`, { method: "POST" });
}

export async function getLogStats(): Promise<any> {
  return fetchJson(`${API_BASE}/logs/stats`);
}

