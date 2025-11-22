import { Component } from "solid-js";
import type { ServiceMetrics } from "@/types";

export interface MetricsDisplayProps {
  metrics?: ServiceMetrics | null;
  showPid?: boolean;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

export const MetricsDisplay: Component<MetricsDisplayProps> = (props) => {
  return (
    <div class="grid grid-cols-3 gap-2">
      <div class="rounded-md border bg-card p-3 text-center">
        <div class="text-xs text-muted-foreground mb-1">CPU</div>
        <div class="text-lg font-semibold">
          {props.metrics ? `${props.metrics.cpu_usage.toFixed(1)}%` : "-"}
        </div>
      </div>
      <div class="rounded-md border bg-card p-3 text-center">
        <div class="text-xs text-muted-foreground mb-1">Memory</div>
        <div class="text-lg font-semibold">
          {props.metrics ? formatBytes(props.metrics.memory_usage) : "-"}
        </div>
      </div>
      <div class="rounded-md border bg-card p-3 text-center">
        <div class="text-xs text-muted-foreground mb-1">Uptime</div>
        <div class="text-lg font-semibold">
          {props.metrics ? formatUptime(props.metrics.uptime) : "-"}
        </div>
      </div>
      {props.showPid && props.metrics?.pid && (
        <div class="rounded-md border bg-card p-3 text-center col-span-3">
          <div class="text-xs text-muted-foreground mb-1">PID</div>
          <div class="text-lg font-semibold">{props.metrics.pid}</div>
        </div>
      )}
    </div>
  );
};

