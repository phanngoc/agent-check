import { Component } from "solid-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ContainerInfo } from "@/types";

export interface ContainerCardProps {
  container: ContainerInfo;
  onStart: (id: string) => void;
  onStop: (id: string) => void;
  onRestart: (id: string) => void;
  onViewLogs: (id: string, name: string) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};

const isRunning = (status: string): boolean => {
  return status.toLowerCase().includes("up") || status.toLowerCase().includes("running");
};

export const ContainerCard: Component<ContainerCardProps> = (props) => {
  const running = () => isRunning(props.container.status);

  return (
    <Card class="hover:border-primary transition-all">
      <CardHeader>
        <div class="flex justify-between items-center">
          <CardTitle class="text-xl">{props.container.name}</CardTitle>
          <Badge variant={running() ? "default" : "destructive"}>
            {running() ? "Running" : "Stopped"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted-foreground">Image:</span>
            <span class="truncate ml-2">{props.container.image}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Ports:</span>
            <span>{props.container.ports.join(", ") || "N/A"}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">CPU:</span>
            <span>{props.container.cpu_usage.toFixed(1)}%</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Memory:</span>
            <span>{formatBytes(props.container.memory_usage)}</span>
          </div>
        </div>

        <div class="flex gap-2 flex-wrap">
          {running() ? (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => props.onStop(props.container.id)}
              >
                Stop
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onRestart(props.container.id)}
              >
                Restart
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => props.onStart(props.container.id)}
            >
              Start
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => props.onViewLogs(props.container.id, props.container.name)}
          >
            Logs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

