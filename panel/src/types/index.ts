export type ServiceType = "go" | "nodejs" | "typescript" | "php" | "docker";

export type ServiceStatus = "running" | "stopped" | "error" | "starting" | "stopping";

export interface Service {
  id: string;
  name: string;
  service_type: ServiceType;
  status: ServiceStatus;
  command: string;
  working_dir: string;
  port: number | null;
  auto_restart: boolean;
  restart_count: number;
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
  environment: Record<string, string>;
}

export interface ProcessInfo {
  pid: number | null;
  cpu_usage: number;
  memory_usage: number; // bytes
  uptime: number; // seconds
  status: ServiceStatus;
}

export interface ContainerInfo {
  id: string;
  name: string;
  status: string;
  image: string;
  ports: string[];
  cpu_usage: number;
  memory_usage: number;
  created: string; // ISO 8601 datetime
}

export interface LogEntry {
  timestamp: string; // ISO 8601 datetime
  service_id: string;
  level: string;
  message: string;
}

export interface Metrics {
  service_id: string;
  cpu_usage: number;
  memory_usage: number;
  uptime: number;
  timestamp: string; // ISO 8601 datetime
}

export interface FilteredLogsResponse {
  logs: LogEntry[];
  total: number;
  filtered: number;
}

export interface SystemMetrics {
  cpu_usage: number;
  memory_usage_percent: number;
  process_count: number;
}

export interface ServiceMetrics {
  cpu_usage: number;
  memory_usage: number;
  uptime: number;
  pid?: number | null;
}

